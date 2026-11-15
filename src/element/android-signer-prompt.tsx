import { useState, useSyncExternalStore, type FormEvent } from "react"
import { FormattedMessage, useIntl } from "react-intl"
import { AndroidRequests } from "@/android-signer"

export function AndroidSignerPrompt() {
  const request = useSyncExternalStore(
    c => AndroidRequests.hook(c),
    () => AndroidRequests.snapshot(),
    () => undefined,
  )
  return request ? <Prompt key={request.id} request={request} /> : null
}

function Prompt({ request }: { request: NonNullable<ReturnType<typeof AndroidRequests.snapshot>> }) {
  const [result, setResult] = useState("")
  const { formatMessage } = useIntl()
  function submit(event: FormEvent) {
    event.preventDefault()
    AndroidRequests.complete(request.id, result)
  }
  return (
    <aside
      aria-label={formatMessage({ defaultMessage: "Android signer request" })}
      className="fixed bottom-4 left-4 right-4 z-[60] sm:left-auto sm:max-w-md rounded-xl border border-layer-3 bg-layer-1 p-4 shadow-2xl"
    >
      <p role="status">
        <FormattedMessage defaultMessage="Approve in Cambium or your Android signer, then paste its copied result here." />
      </p>
      <a href={request.uri} className="text-primary inline-block py-3">
        <FormattedMessage defaultMessage="Open Android signer" />
      </a>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="android-signer-result">
          <FormattedMessage defaultMessage="Signer result" />
        </label>
        <textarea
          id="android-signer-result"
          value={result}
          onChange={event => setResult(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="w-full"
        />
        <button type="submit" disabled={!result && ["get_public_key", "sign_event"].includes(request.method)}>
          <FormattedMessage defaultMessage="Use signer result" />
        </button>
        <button type="button" onClick={() => AndroidRequests.cancel(request.id)}>
          <FormattedMessage defaultMessage="Cancel signer request" />
        </button>
      </form>
    </aside>
  )
}
