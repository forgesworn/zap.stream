import { useEffect, useRef, useState } from "react"
import { FormattedMessage } from "react-intl"
import { AndroidSigner } from "@/android-signer"
import { PrimaryButton } from "./buttons"

export function AndroidLogin({ onConnect }: { onConnect: (signer: AndroidSigner) => void }) {
  const attempt = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => () => attempt.current?.abort(), [])
  async function connect() {
    const controller = new AbortController()
    attempt.current?.abort()
    attempt.current = controller
    setBusy(true)
    setError("")
    try {
      const signer = await AndroidSigner.connect({ signal: controller.signal })
      if (controller.signal.aborted) {
        signer.close()
        return
      }
      attempt.current = null
      try {
        onConnect(signer)
      } catch (error) {
        signer.close()
        throw error
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : String(error))
    } finally {
      if (attempt.current === controller) attempt.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p>
        <FormattedMessage defaultMessage="Use Cambium or another compatible signer installed on this Android device. Your private key stays with your signer. Each signing request needs approval and a pasted result." />
      </p>
      <p>
        <FormattedMessage defaultMessage="For Amber, choose Remote signer and paste its bunker link instead." />
      </p>
      <PrimaryButton onClick={connect} disabled={busy}>
        <FormattedMessage defaultMessage="Connect Android signer" />
      </PrimaryButton>
      {error && (
        <p role="alert" className="text-warning">
          {error}
        </p>
      )}
    </div>
  )
}
