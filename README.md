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
- **Android signer**: on Android with Cambium or another compatible NIP-55 signer installed, choose
  **Login → Android signer → Connect Android signer**. Open the signer, approve, return to the browser
  and paste its copied public key. Each later signing or encryption request uses the same approval
  and paste flow. Cambium delegates signing to your paired Heartwood; it is not a NIP-46 server.
- **Amber**: use its `bunker://` link through **Login → Remote signer**. Amber 6.6.9's Android URI
  parser truncates encoded payloads containing `?`, so this fork does not claim reliable Amber
  clipboard signing. The [verification receipt](docs/verification/login-matrix.md#amber-compatibility)
  links the affected source and distinguishes the recommended route from installed-app evidence.

Android signing uses the [NIP-55 web clipboard transport](https://github.com/nostr-protocol/nips/blob/master/55.md),
without a callback URL. The browser retains only the public identity for this login method. Requests
carry the selected identity, and signed events must match it and the exact requested event. Web
requests still need individual approval; reloading does not grant a remembered browser permission.

Direct connections use NIP-44 encrypted NIP-46 requests. The browser stores a generated client connection
key, relay addresses and public identity in local storage so it can reconnect after reload. It does not
receive your signing private key or retain a one-time pairing secret. Treat that browser connection as
a credential: logout removes it locally and closes the connection, including in other open tabs.
Revoke the client in your signer to withdraw its permission. Clearing browser data also requires pairing again.

If the signer asks for web approval, a prompt stays available across the app, including after reload.
Check the displayed host before opening its HTTPS link. Cancelling the request or letting it time out
closes that connection and removes the prompt; a later action can reconnect using the saved client key.

For a new hosted origin, Bark may need site access enabled before its NIP-07 provider is available.
The default pairing relay is `wss://relay.primal.net`; bunker links use their own relay addresses.

## Login verification

```bash
bun test src packages/zap-stream-api/src/
bun tsc --noEmit
bun biome lint src/ packages/zap-stream-api/src/ e2e/ playwright.config.ts
bun run build
bunx playwright install chromium
bun run test:e2e
```

The loopback tests exercise bunker links with and without a secret, QR secret/recipient binding,
different transport and signing identities, chat (1311), HTTP authentication (27235), NIP-44 encryption,
restoration, revoked/rejected access, changed events, cancellation and timeouts. Regression checks cover
approval prompts after reload, unsafe approval links, pending signing on cross-tab logout, and retained
session callbacks after logout or account switching. The small Bun patch to
`@snort/worker-relay@3.0.2` only marks an existing unused argument, allowing the standard strict type check.

The Playwright browser suite runs in CI on desktop Chromium and a Pixel 7 browser viewport. It exercises the actual login screens for NIP-07 (including
a provider without optional NIP-44), nsec/hex private keys, account creation, NIP-46 bunker and QR
pairing, and Cambium-compatible NIP-55. It verifies event signatures, saved identities, reload, logout,
rejection and retry. NIP-07 and NIP-55 providers are protocol fixtures; NIP-46 uses a real loopback
WebSocket relay and encrypted requests. HTTP requests to public hosts are blocked and public relay
WebSockets are intercepted, so generated accounts and test events stay local. Android intent handling
and installed signer applications require their own integration check. Source-level Cambium interoperability
and the verification boundaries are recorded in [the login matrix receipt](docs/verification/login-matrix.md).

Manual integration checks: load Bark, connect it to a test signer and allow the local site; sign in with
**Browser extension**, sign an event and reload. Repeat via a bunker link and via QR pairing with an
unlocked Signet, then verify logout clears the saved session in both open tabs. After reload, request a
signature that requires web approval; confirm the prompt remains visible until approval, cancellation
or timeout. Check an invalid link, reject approval, cancel an outstanding connection and retry.
Use disposable identities and a local relay for automated
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
