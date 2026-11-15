import { ExternalStore, unwrap } from "@snort/shared"
import { EventKind, EventPublisher, Nip7Signer, PrivateKeySigner, UserState, type UserStateObject } from "@snort/system"
import { isRemoteConnection, RemoteSigner, type RemoteConnection } from "./remote-signer"

export enum LoginType {
  Nip7 = "nip7",
  PrivateKey = "private-key",
  Nip46 = "nip46",
}

export interface LoginSession {
  type: LoginType
  pubkey: string
  privateKey?: string
  remote?: RemoteConnection
  state?: UserState<never>
  color?: string
  wallet?: {
    type: number
    data: string
  }
}

const SESSION_KEY = "session"
const remoteSigners = new WeakMap<RemoteConnection, RemoteSigner>()

export class LoginStore extends ExternalStore<LoginSession | undefined> {
  #session?: LoginSession

  constructor() {
    super()
    const json = window.localStorage.getItem(SESSION_KEY)
    if (json) {
      try {
        this.#session = JSON.parse(json)
        if (
          this.#session?.type === LoginType.Nip46 &&
          (!isRemoteConnection(this.#session.remote) || this.#session.remote.pubkey !== this.#session.pubkey)
        ) {
          this.#session = undefined
          window.localStorage.removeItem(SESSION_KEY)
        }
      } catch {
        window.localStorage.removeItem(SESSION_KEY)
      }
      if (this.#session) {
        let save = false
        this.#session.state = this.#makeState()
        //reset
        this.#session.type ??= LoginType.Nip7
        if ("cards" in this.#session) {
          delete this.#session.cards
          save = true
        }
        if ("emojis" in this.#session) {
          delete this.#session.emojis
          save = true
        }
        if ("follows" in this.#session) {
          delete this.#session.follows
          save = true
        }
        if ("muted" in this.#session) {
          delete this.#session.muted
          save = true
        }

        if (save) {
          this.#save()
        }
      }
    }
  }

  #makeState(session = this.#session) {
    if (session) {
      const ret = new UserState(session.pubkey, undefined, session.state as UserStateObject<never> | undefined)
      ret.checkIsStandardList(EventKind.StorageServerList)
      ret.checkIsStandardList(EventKind.MuteList)
      ret.on("change", () => {
        this.#save()
      })
      return ret
    }
  }

  loginWithPubkey(pk: string, type = LoginType.Nip7) {
    this.#disposeSession()
    this.#session = {
      type,
      pubkey: pk,
    }
    this.#session.state = this.#makeState()
    this.#save()
  }

  loginWithPrivateKey(key: string) {
    const signer = new PrivateKeySigner(key)
    this.#disposeSession()
    this.#session = {
      type: LoginType.PrivateKey,
      pubkey: signer.getPubKey(),
      privateKey: signer.privateKey,
    }
    this.#session.state = this.#makeState()
    this.#save()
  }

  loginWithRemoteSigner(signer: RemoteSigner) {
    if (signer.closed) throw new Error("Remote signer connection was closed")
    const next: LoginSession = { type: LoginType.Nip46, pubkey: signer.connection.pubkey, remote: signer.connection }
    next.state = this.#makeState(next)
    // Save before adopting it: failed storage must not leave an invisible login.
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...next, state: next.state?.serialize() }))
    } catch (error) {
      next.state?.off("change")
      next.state?.destroy()
      throw error
    }
    this.#disposeSession()
    this.#session = next
    remoteSigners.set(signer.connection, signer)
    this.notifyChange()
  }

  #disposeSession() {
    if (this.#session?.remote) remoteSigners.get(this.#session.remote)?.close()
    const state = this.#session?.state
    if (state instanceof UserState) {
      state.off("change")
      state.destroy()
    }
  }

  logout() {
    this.#disposeSession()
    this.#session = undefined
    this.#save()
  }

  takeSnapshot() {
    return this.#session ? { ...this.#session } : undefined
  }

  setColor(color: string) {
    if (!this.#session) return
    this.#session.color = color
    this.#save()
  }

  update(fn: (s: LoginSession) => void) {
    if (!this.#session) return
    fn(this.#session)
    this.#save()
  }

  #save() {
    if (this.#session) {
      const ses = { ...this.#session } as Record<string, unknown>
      if (this.#session.state instanceof UserState) {
        ses.state = this.#session.state.serialize()
      }
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(ses))
    } else {
      window.localStorage.removeItem(SESSION_KEY)
    }
    this.notifyChange()
  }
}

export function getPublisher(session: LoginSession) {
  const signer = getSigner(session)
  if (signer) {
    return new EventPublisher(signer, session.pubkey)
  }
}

export function getSigner(session: LoginSession) {
  switch (session?.type) {
    case LoginType.Nip7: {
      return new Nip7Signer()
    }
    case LoginType.PrivateKey: {
      return new PrivateKeySigner(unwrap(session.privateKey))
    }
    case LoginType.Nip46: {
      const connection = unwrap(session.remote)
      let signer = remoteSigners.get(connection)
      if (!signer || signer.closed) {
        signer = RemoteSigner.restore(connection)
        remoteSigners.set(connection, signer)
      }
      return signer
    }
  }
}

export const Login = new LoginStore()
