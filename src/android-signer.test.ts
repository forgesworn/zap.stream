import "@/test/dom"
import { afterEach, expect, test } from "bun:test"
import { waitFor } from "@testing-library/dom"
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools/pure"
import { decrypt, encrypt, getConversationKey } from "nostr-tools/nip44"
import { encrypt as encrypt04, decrypt as decrypt04 } from "nostr-tools/nip04"
import { nip19 } from "nostr-tools"
import { unwrap } from "@snort/shared"
import { AndroidRequests, AndroidSigner } from "./android-signer"
import { getPublisher, getSigner, LoginStore, LoginType } from "./login"

const key = generateSecretKey()
const pubkey = getPublicKey(key)
const connection = { pubkey }

afterEach(() => {
  while (AndroidRequests.snapshot()) AndroidRequests.cancel(unwrap(AndroidRequests.snapshot()).id)
  window.localStorage.clear()
})

async function request(method: NonNullable<ReturnType<typeof AndroidRequests.snapshot>>["method"]) {
  await waitFor(() => expect(AndroidRequests.snapshot()?.method).toBe(method))
  const prompt = unwrap(AndroidRequests.snapshot())
  const uri = new URL(prompt.uri)
  expect(uri.protocol).toBe("nostrsigner:")
  expect(uri.searchParams.get("callbackUrl")).toBeNull()
  expect(uri.searchParams.get("compressionType")).toBe("none")
  expect(uri.searchParams.get("returnType")).toBe("event")
  return { prompt, uri, payload: decodeURIComponent(uri.pathname) }
}

test.each([pubkey, nip19.npubEncode(pubkey)])("connects with the NIP-55 copied public key %s", async result => {
  const pending = AndroidSigner.connect()
  const { prompt } = await request("get_public_key")
  AndroidRequests.complete(prompt.id, result)
  const signer = await pending
  try {
    expect(await signer.getPubKey()).toBe(pubkey)
  } finally {
    signer.close()
  }
})

test("signs through the app publisher and binds the complete event to the selected identity", async () => {
  const signer = AndroidSigner.restore({ ...connection })
  const store = new LoginStore()
  store.loginWithAndroidSigner(signer)
  try {
    const pending = unwrap(getPublisher(unwrap(store.takeSnapshot()))).note("hello ? + & 日本語", eb => eb.kind(1311))
    const { prompt, uri, payload } = await request("sign_event")
    expect(uri.searchParams.get("current_user")).toBe(pubkey)
    const template = JSON.parse(payload)
    expect(template.pubkey).toBe(pubkey)
    expect(template.kind).toBe(1311)
    expect(template.content).toBe("hello ? + & 日本語")
    AndroidRequests.complete(prompt.id, JSON.stringify(finalizeEvent(template, key)))
    expect(verifyEvent(await pending)).toBe(true)
    expect(AndroidRequests.snapshot()).toBeUndefined()
  } finally {
    store.logout()
  }
})

test.each(["wrong identity", "changed event", "invalid signature"])(
  "rejects %s from the Android signer",
  async failure => {
    const signer = AndroidSigner.restore({ ...connection })
    try {
      const pending = signer.sign({ kind: 27235, created_at: 1_800_000_000, tags: [], content: "original" })
      const rejected = pending.catch((error: Error) => error)
      const { prompt, payload } = await request("sign_event")
      const template = JSON.parse(payload)
      if (failure === "changed event") template.content = "changed"
      const signed = finalizeEvent(template, failure === "wrong identity" ? generateSecretKey() : key)
      if (failure === "invalid signature") signed.sig = "0".repeat(128)
      AndroidRequests.complete(prompt.id, JSON.stringify(signed))
      expect(await rejected).toBeInstanceOf(Error)
      expect(((await rejected) as Error).message).toContain("different identity or event")
    } finally {
      signer.close()
    }
  },
)

test.each(["nip04", "nip44"] as const)(
  "preserves the %s peer, selected identity and unicode payload",
  async version => {
    const signer = AndroidSigner.restore({ ...connection })
    const peerKey = generateSecretKey()
    const peer = getPublicKey(peerKey)
    const plain = "? + & 日本語"
    try {
      const outbound = version === "nip04" ? signer.nip4Encrypt(plain, peer) : signer.nip44Encrypt(plain, peer)
      const first = await request(`${version}_encrypt`)
      expect(first.payload).toBe(plain)
      expect(first.uri.searchParams.get("pubkey")).toBe(peer)
      expect(first.uri.searchParams.get("current_user")).toBe(pubkey)
      const cipher =
        version === "nip04" ? await encrypt04(key, peer, plain) : encrypt(plain, getConversationKey(key, peer))
      AndroidRequests.complete(first.prompt.id, cipher)
      const actual = await outbound
      expect(
        version === "nip04"
          ? await decrypt04(peerKey, pubkey, actual)
          : decrypt(actual, getConversationKey(peerKey, pubkey)),
      ).toBe(plain)
      const incoming = version === "nip04" ? signer.nip4Decrypt(cipher, peer) : signer.nip44Decrypt(cipher, peer)
      const second = await request(`${version}_decrypt`)
      expect(second.payload).toBe(cipher)
      AndroidRequests.complete(second.prompt.id, plain)
      expect(await incoming).toBe(plain)
    } finally {
      signer.close()
    }
  },
)

test("reload retains only the public identity and asks for no second public-key approval", async () => {
  const signer = AndroidSigner.restore({ ...connection })
  const store = new LoginStore()
  store.loginWithAndroidSigner(signer)
  const restored = new LoginStore()
  try {
    expect(JSON.parse(unwrap(window.localStorage.getItem("session")))).toMatchObject({
      type: LoginType.Nip55,
      pubkey,
      android: { pubkey },
    })
    expect(window.localStorage.getItem("session")).not.toContain("privateKey")
    expect(await unwrap(getSigner(unwrap(restored.takeSnapshot()))).getPubKey()).toBe(pubkey)
    expect(AndroidRequests.snapshot()).toBeUndefined()
  } finally {
    store.logout()
    restored.logout()
  }
})

test.each(["logout", "switch", "other tab"])(
  "%s cancels pending Android signing and prevents stale-session reuse",
  async action => {
    const signer = AndroidSigner.restore({ ...connection })
    const store = new LoginStore()
    store.loginWithAndroidSigner(signer)
    const snapshot = unwrap(store.takeSnapshot())
    const pending = signer.sign({ kind: 1311, created_at: 1_800_000_000, tags: [], content: "pending" })
    const rejected = pending.catch((error: Error) => error)
    await request("sign_event")
    try {
      if (action === "logout") store.logout()
      else if (action === "switch") store.loginWithPrivateKey("11".repeat(32))
      else {
        window.localStorage.removeItem("session")
        window.dispatchEvent(new StorageEvent("storage", { key: "session", storageArea: window.localStorage }))
      }
      expect(await rejected).toBeInstanceOf(Error)
      expect(((await rejected) as Error).message).toContain("closed")
      expect(getSigner(snapshot)).toBeUndefined()
      expect(AndroidRequests.snapshot()).toBeUndefined()
    } finally {
      store.logout()
    }
  },
)

test("rejects invalid discovery, cancels and bounds abandoned Android requests", async () => {
  const invalid = AndroidSigner.connect()
  const rejected = invalid.catch((error: Error) => error)
  AndroidRequests.complete((await request("get_public_key")).prompt.id, "not a public key")
  expect(((await rejected) as Error).message).toContain("invalid public key")
  const cancelled = AndroidSigner.connect()
  const cancelResult = cancelled.catch((error: Error) => error)
  AndroidRequests.cancel((await request("get_public_key")).prompt.id)
  expect(((await cancelResult) as Error).message).toContain("cancelled")
  await expect(AndroidSigner.connect({ timeoutMs: 20 })).rejects.toThrow("timed out")
  expect(AndroidRequests.snapshot()).toBeUndefined()
})

test("concurrent requests keep their own result and ignore late completion after cancellation", async () => {
  const first = AndroidSigner.connect()
  const second = AndroidSigner.connect()
  const firstResult = first.catch((error: Error) => error)
  const old = (await request("get_public_key")).prompt.id
  AndroidRequests.cancel(old)
  expect(((await firstResult) as Error).message).toContain("cancelled")
  const next = (await request("get_public_key")).prompt.id
  AndroidRequests.complete(old, getPublicKey(generateSecretKey()))
  expect(AndroidRequests.snapshot()?.id).toBe(next)
  AndroidRequests.complete(next, pubkey)
  const signer = await second
  signer.close()
  expect(AndroidRequests.snapshot()).toBeUndefined()
})

test.each([{}, { pubkey: "bad" }, { pubkey: getPublicKey(generateSecretKey()) }])(
  "discards corrupt or mismatched saved Android identities %j",
  android => {
    window.localStorage.setItem("session", JSON.stringify({ type: LoginType.Nip55, pubkey, android }))
    expect(new LoginStore().takeSnapshot()).toBeUndefined()
    expect(window.localStorage.getItem("session")).toBeNull()
  },
)

test("failed Android session persistence preserves the previous login", () => {
  const signer = AndroidSigner.restore({ ...connection })
  const store = new LoginStore()
  const previous = getPublicKey(generateSecretKey())
  store.loginWithPubkey(previous)
  const storage = window.localStorage
  const descriptor = unwrap(Object.getOwnPropertyDescriptor(window, "localStorage"))
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      setItem() {
        throw new Error("Storage full")
      },
    },
  })
  try {
    expect(() => store.loginWithAndroidSigner(signer)).toThrow("Storage full")
    expect(store.takeSnapshot()?.pubkey).toBe(previous)
    expect(JSON.parse(unwrap(storage.getItem("session"))).pubkey).toBe(previous)
  } finally {
    Object.defineProperty(window, "localStorage", descriptor)
    store.logout()
    signer.close()
  }
})

test("another tab's Android replacement cancels this session without deleting the replacement", async () => {
  const signer = AndroidSigner.restore({ ...connection })
  const store = new LoginStore()
  store.loginWithAndroidSigner(signer)
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: "session", storageArea: window.localStorage }))
    expect(signer.closed).toBe(false)
    const next = getPublicKey(generateSecretKey())
    const replacement = JSON.stringify({ type: LoginType.Nip55, pubkey: next, android: { pubkey: next } })
    window.localStorage.setItem("session", replacement)
    window.dispatchEvent(new StorageEvent("storage", { key: "session", storageArea: window.localStorage }))
    expect(signer.closed).toBe(true)
    expect(store.takeSnapshot()).toBeUndefined()
    expect(window.localStorage.getItem("session")).toBe(replacement)
  } finally {
    store.logout()
  }
})
