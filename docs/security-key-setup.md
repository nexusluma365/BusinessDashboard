# USB Security Key — architecture

## Current state (Phase 1)

`apps/desktop/src/main/main.ts` exposes two IPC handlers, `security-key:status`
and `security-key:authenticate`, behind a build-time flag:

```
NEXUS_LUMA_ENABLE_SIMULATED_USB_KEY=true
```

This flag is read from `process.env` at main-process startup and combined
with `!app.isPackaged`, so it is **structurally impossible** for the
simulated key to activate in a packaged production build — there is no
runtime toggle, setting, or renderer message that can flip it on.

When disabled (the default, and always in production), `security-key:status`
returns `{ available: false }` and the renderer shows "Insert Security Key
to Continue" permanently, which is the correct production behavior until
real hardware support ships in Phase 7.

## Target production flow (Phase 7)

```
Open application
→ Scan for approved USB key (WebHID / node-hid, or FIDO2 CTAP2)
→ Verify USB device identity against an allowlist
→ Generate a cryptographic challenge (main process, not renderer)
→ Send challenge to the device; device signs with its private key
→ Send signature + device public key fingerprint to the cloud license server
→ License server validates signature, device registration, and account status
→ Prompt user for PIN (local, never leaves the device)
→ On success, license server issues a short-lived access token + refresh token
→ Renderer unlocks; sensitive data becomes visible
```

Key implementation notes for Phase 7:

- Use a real asymmetric keypair per device (generated on first pairing, private
  key never leaves the hardware token or the OS keychain/TPM).
- Session tokens are short-lived (minutes, not hours); refresh happens silently
  while the key remains present.
- On USB removal: immediately clear the Zustand security store, blank any
  visible lead/financial data, cancel in-flight sensitive mutations, and stop
  SYLUS listening. This should happen in under 250ms of the OS reporting
  device removal.
- All of the above is audit-logged server-side (key insert, PIN attempt,
  session issue, session revoke, key removal).
- Plan for FIDO2/WebAuthn as the primary interface so any FIDO2-compliant key
  (YubiKey, etc.) works without a proprietary device allowlist.
