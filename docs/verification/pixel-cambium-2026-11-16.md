# Pixel / Cambium physical acceptance — 16 November 2026

**Passed within the recorded scope:** zap.stream's Android signer route on a physical Pixel,
using the installed Cambium APK and its existing Heartwood pairing. The
[structured receipt](pixel-cambium-2026-11-16.json) records the individual assertions.

## Tested combination

- Frontend: `739820d57555693f0cf2033cc5a444fa009d9ed4`, Vite development build at
  `http://127.0.0.1:5179`, forwarded through M4 and ADB.
- Device: physical Pixel 10 Pro XL, Android 17 / API 37.
- Browser: Vanadium `157.0.8103.78.0`, package `app.vanadium.browser`.
- Signer: installed Cambium `0.9.1` / versionCode `20`, package `dev.forgesworn.cambium`.
- Installed APK SHA-256: `b9f11de0969098a8a640dc425ea29760d8c9147082c8c7b9f4d21d004b8b3693`.
  This exactly matches the [published v0.9.1 release](https://github.com/forgesworn/cambium/releases/tag/v0.9.1).
- Heartwood: the existing paired identity; firmware revision was not observable in this run.
  Pairing data, user keys and unrelated grants were preserved.

## Results

| Check | Observed result |
| --- | --- |
| Actual login screen and Android link | Opened installed Cambium, displayed one-shot website consent, copied the selected public key and returned to the same browser tab; the actual OS clipboard result established the matching NIP-55 session. |
| Fresh signing challenge | Cambium/Heartwood returned a full event containing a fresh random challenge and `? + & 日本語`. An independent host-side `nostr-tools` verifier checked the Schnorr signature, event ID, public key, kind, timestamp, tags and content. |
| Reload and sign again | Restored the same public identity without another public-key request, then required fresh one-shot approval and returned another independently verified signature. Saved Android connection data contained only the public key. |
| NIP-04 and NIP-44, both directions | Four real installed-app approval and clipboard cycles passed. A disposable independent peer encrypted or decrypted each result; Unicode, special characters, leading/trailing spaces, newline and tab matched exactly. |
| Decline, cancel and retry | Plain Cambium Decline returned no signature; the browser request remained pending until Cancel. Cancellation rejected it without changing identity, and a fresh signing retry succeeded. |
| Pending operation and menu logout | A genuine signature was copied into the pending prompt without submission. Logout rejected the operation, cleared storage and removed the prompt. Delivering that late result to the retired request could not restore login. |
| Wrong identity | A controlled negative fixture supplied a valid event signed by a different disposable peer. The phone's actual frontend rejected it and preserved the logged-in identity. This case was deliberately constructed outside Cambium. |
| Two tabs | Both tabs restored the same session. With a request pending in each tab, menu logout in the second tab cleared both sessions, removed both prompts and rejected both pending operations. These requests were cancelled before opening the signer. |

The test used the real Android app, browser link, one-shot consent and OS clipboard for all positive
signing/encryption results. Browser automation used the actual frontend modules and DOM; it did not
install a replacement signing provider. Interception blocked public HTTP requests and handled public
relay sockets in the test tabs. No public relay publication attempt was observed, no test event was
broadcast, and no payment was made. Cambium's own connection to Heartwood was not intercepted.

## Qualifications and cleanup

This is acceptance of the specified development frontend and installed browser/signer combination.
It does not qualify a hosted production build, installed Signet/Bark/Amber, another Android version,
or an identified Heartwood firmware revision. The existing pairing was used without creating a
new identity; it was not replaced with the disposable identity suggested for repeatable test setups.
The disposable peer used for encryption and the wrong-identity fixture was held only in memory.

The first setup attempt was paused when the phone switched apps. On resumption, some DevTools
control calls stalled after external-app handoff; NIP-44 assertions completed and were read back
before being recorded as passes. A control timeout alone was never treated as a successful check.
Cambium still showed one signer paired after the run, with fresh successful contact. Its relay-update
health warning remained: saved relays were retained; relay-update recovery was outside this test.

Both task-owned browser tabs, test-origin storage and the task's last clipboard value were cleared.
The initial foreground app was restored. The task's ADB mappings, SSH tunnel, Vite server and browser
driver were removed or stopped. Task-created dependencies and private captures are deleted after
recording this receipt. No test service is left running.

Repeat using the [physical acceptance procedure](login-matrix.md#cambium-installed-device-acceptance).
The receipt excludes user public keys, device serials, pairing URIs, private keys and test payloads.
