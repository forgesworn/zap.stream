# zap.stream

Nostr live streaming powered by Bitcoin & Nostr

This is a [NIP-53](https://github.com/nostr-protocol/nips/blob/master/53.md) nostr client.

This [ForgeSworn fork](https://github.com/forgesworn/zap.stream) adds remote-signer login to the
[upstream frontend](https://github.com/v0l/zap.stream). The upstream MIT licence and attribution are retained.
This repository is a client fork; it does not establish a ForgeSworn streaming service or deployment.

## Signing in

- **Browser extension**: enable Bark, Alby or another NIP-07 extension for the site's origin, then choose
  **Login → Browser extension**. Bark handles its own connection to Signet or your other remote signer.
- **Remote signer**: choose **Login → Remote signer** and paste a `bunker://` link from Signet or another
  NIP-46 signer. Alternatively, open **Pair by QR code instead**, choose a relay your signer can reach,
  create the code, then scan it or paste the connection link into your signer and approve.

Direct connections use NIP-44 encrypted NIP-46 requests. The browser stores a generated client connection
key, relay addresses and public identity in local storage so it can reconnect after reload. It does not
receive your signing private key or retain a one-time pairing secret. Treat that browser connection as
a credential: logout removes it locally and closes the connection; revoke the client in your signer to
withdraw its permission. Clearing browser data also requires pairing again.

For a new hosted origin, Bark may need site access enabled before its NIP-07 provider is available.
The default pairing relay is `wss://relay.primal.net`; bunker links use their own relay addresses.

## Login verification

```bash
bun test src/remote-signer.test.ts src/login.test.ts
bun tsc --noEmit
bun biome lint src/ packages/zap-stream-api/src/
bun run build
```

The loopback tests exercise bunker links with and without a secret, QR secret/recipient binding,
different transport and signing identities, chat (1311), HTTP authentication (27235), NIP-44 encryption,
restoration, revoked/rejected access, changed events, cancellation and timeouts. The small Bun patch to
`@snort/worker-relay@3.0.2` only marks an existing unused argument, allowing the standard strict type check.

Manual integration checks: load Bark, connect it to a test signer and allow the local site; sign in with
**Browser extension**, sign an event and reload. Repeat via a bunker link and via QR pairing with an
unlocked Signet, then verify logout clears the saved session. Check an invalid link, reject approval,
cancel an outstanding connection and retry. Use disposable identities and a local relay for automated
tests, without publishing chat or making wallet payments. Public-relay and physical-device checks are
separate from these local checks.

Upstream Docker, nsite and translation publishing workflows run only in the upstream repository.
The fork's CI performs checks without deploying a service.

## Building

```bash
bun install && bun run build
```

## Packages

| Package | Description |
|---------|-------------|
| [`@zap.stream/api`](./packages/zap-stream-api/) | API client for live streaming & account management |

## Translations

[![Crowdin](https://badges.crowdin.net/zapstream/localized.svg)](https://crowdin.com/project/zapstream)
