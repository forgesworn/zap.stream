import { ExternalStore } from "@snort/shared"
import type { EventSigner, NostrEvent } from "@snort/system"
import { nip19 } from "nostr-tools"
import { validateSigningResult } from "./remote-signer"

const HEX_KEY = /^[0-9a-f]{64}$/

export interface AndroidConnection {
  pubkey: string
}

export function isAndroidConnection(value: unknown): value is AndroidConnection {
  return (
    !!value &&
    typeof value === "object" &&
    "pubkey" in value &&
    typeof value.pubkey === "string" &&
    HEX_KEY.test(value.pubkey)
  )
}

type Method = "get_public_key" | "sign_event" | "nip04_encrypt" | "nip04_decrypt" | "nip44_encrypt" | "nip44_decrypt"
interface Prompt {
  id: number
  method: Method
  uri: string
}
interface Pending extends Prompt {
  settle: (result?: string, error?: Error) => void
}

/** NIP-55 clipboard transport keeps the requesting page and its pending operation alive. */
class AndroidRequestStore extends ExternalStore<Prompt | undefined> {
  #queue: Pending[] = []
  #serial = 0

  request(owner: AbortSignal, method: Method, payload: string, params: Record<string, string>, timeoutMs: number) {
    if (owner.aborted) return Promise.reject(new Error("Android signer connection was closed"))
    const id = ++this.#serial
    const query = new URLSearchParams({
      type: method,
      returnType: "event",
      compressionType: "none",
      appName: "zap.stream",
      ...params,
    })
    return new Promise<string>((resolve, reject) => {
      const onAbort = () => settle(undefined, new Error("Android signer connection was closed"))
      const timer = setTimeout(
        () => settle(undefined, new Error("Android signer timed out. Try again when ready.")),
        timeoutMs,
      )
      const settle = (result?: string, error?: Error) => {
        clearTimeout(timer)
        owner.removeEventListener("abort", onAbort)
        this.#queue = this.#queue.filter(p => p.id !== id)
        this.notifyChange()
        if (error) reject(error)
        else resolve(result ?? "")
      }
      owner.addEventListener("abort", onAbort, { once: true })
      this.#queue.push({ id, method, uri: `nostrsigner:${encodeURIComponent(payload)}?${query}`, settle })
      this.notifyChange()
    })
  }

  complete(id: number, value: string) {
    this.#queue.find(p => p.id === id)?.settle(value)
  }

  cancel(id: number) {
    this.#queue.find(p => p.id === id)?.settle(undefined, new Error("Android signer request was cancelled"))
  }

  takeSnapshot(): Prompt | undefined {
    const prompt = this.#queue[0]
    return prompt ? { id: prompt.id, method: prompt.method, uri: prompt.uri } : undefined
  }
}

export const AndroidRequests = new AndroidRequestStore()

interface Options {
  signal?: AbortSignal
  timeoutMs?: number
}

class AndroidTransport {
  readonly controller = new AbortController()
  #onAbort = () => this.close()
  constructor(readonly options: Options) {
    options.signal?.addEventListener("abort", this.#onAbort, { once: true })
    if (options.signal?.aborted) this.close()
  }
  request(method: Method, payload: string, params: Record<string, string> = {}) {
    return AndroidRequests.request(this.controller.signal, method, payload, params, this.options.timeoutMs ?? 120_000)
  }
  close() {
    this.controller.abort()
    this.options.signal?.removeEventListener("abort", this.#onAbort)
  }
}

export class AndroidSigner implements EventSigner {
  private constructor(
    readonly connection: AndroidConnection,
    private readonly transport: AndroidTransport,
  ) {}

  static async connect(options: Options = {}) {
    const transport = new AndroidTransport(options)
    try {
      const result = (await transport.request("get_public_key", "")).trim()
      const decoded = result.startsWith("npub1") ? nip19.decode(result) : undefined
      const pubkey = decoded?.type === "npub" ? decoded.data : result
      if (!HEX_KEY.test(pubkey)) throw new Error("The Android signer returned an invalid public key")
      return new AndroidSigner({ pubkey }, transport)
    } catch (error) {
      transport.close()
      throw error
    }
  }

  static restore(connection: AndroidConnection, options: Options = {}) {
    if (!isAndroidConnection(connection)) throw new Error("Android signer session is invalid; connect again")
    return new AndroidSigner(connection, new AndroidTransport(options))
  }

  get closed() {
    return this.transport.controller.signal.aborted
  }
  get supports() {
    return ["nip04", "nip44"]
  }
  async init() {
    if (this.closed) throw new Error("Android signer connection was closed")
  }
  async getPubKey() {
    await this.init()
    return this.connection.pubkey
  }
  async sign(event: Pick<NostrEvent, "kind" | "created_at" | "tags" | "content">): Promise<NostrEvent> {
    await this.init()
    const template = {
      kind: event.kind,
      created_at: event.created_at,
      tags: event.tags.map(t => [...t]),
      content: event.content,
    }
    const result = await this.transport.request(
      "sign_event",
      JSON.stringify({ ...template, pubkey: this.connection.pubkey }),
      { current_user: this.connection.pubkey },
    )
    return validateSigningResult(JSON.parse(result), template, this.connection.pubkey)
  }
  private async crypto(method: Method, content: string, key: string) {
    await this.init()
    if (!HEX_KEY.test(key)) throw new Error("Invalid recipient public key")
    return await this.transport.request(method, content, { pubkey: key, current_user: this.connection.pubkey })
  }
  nip4Encrypt(content: string, key: string) {
    return this.crypto("nip04_encrypt", content, key)
  }
  nip4Decrypt(content: string, key: string) {
    return this.crypto("nip04_decrypt", content, key)
  }
  nip44Encrypt(content: string, key: string) {
    return this.crypto("nip44_encrypt", content, key)
  }
  nip44Decrypt(content: string, key: string) {
    return this.crypto("nip44_decrypt", content, key)
  }
  close() {
    this.transport.close()
  }
}
