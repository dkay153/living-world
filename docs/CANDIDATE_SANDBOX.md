# Offline visual candidate sandbox

The first VM packaging lane uses Windows Sandbox on this Windows Pro host. The package builder **does not execute candidate code**. It exports a bounded, symlink-free copy of `server`, `public` and `config`, a trusted Node 22 executable, installed `ws`, the trusted Playwright controller and its Chromium runtime. No production database, credentials, owner account, environment or Git directory is mapped.

## Prepare and open

With the project Node 22 runtime and installed dependencies:

```powershell
npm run lab:sandbox:prepare
# Or review an isolated source candidate (no host builds/tests):
npm run lab:sandbox:prepare -- --candidate C:\path\to\candidate
```

Open the returned `review.wsb`. The VM boots the micro Realm on its own localhost and opens Chromium with the actual game. Play directly in that window. Closing the VM discards its database. Closing Chromium stops the Realm controller. Prepare again to review a new candidate; each package has its own evidence directory and input manifest.

Windows Sandbox must first be enabled. Run `scripts/enable-windows-sandbox.ps1` in an administrator PowerShell window and restart if Windows requests it. The script never reboots automatically. Microsoft's [configuration reference](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file) documents the read-only mapping and disabled networking settings.

## Boundaries and evidence

- Only the prepared input (read-only) and a fresh evidence directory (writable) are mapped. Candidate runtime state lives inside the VM.
- External networking, clipboard, microphones, cameras, printers and GPU sharing are disabled; Protected Client is enabled. VM-local browser/server communication stays on loopback.
- Before starting the candidate, the controller checks that input writes fail and a public-IP connection fails. Failed preflight prevents candidate launch.
- Desktop and mobile screenshots plus a report are exported. The report checks connection, accessible canvas label and horizontal overflow. These are smoke checks, not artistic judgment or a full gameplay/recovery drill.
- **All exported files and claims are untrusted.** The candidate shares the VM with the observation controller and can forge evidence or create arbitrary files in the export directory. Never execute exports. No result is wired to the promotion broker or release authority.
- This slice serves `/legacy/`, the canvas game. It does not build candidate React code, export Godot, provide Studio iframe access across the VM boundary, or run general source promotion.
- A prepared package is not a verified runtime. The first real VM launch and isolation/recovery drill remain required before calling candidate staging operational.

## Acceptance status — 13 October 2026

The Windows Sandbox feature was enabled through an elevated Windows process on 13 October. Windows returned `restartNeeded: true`; no reboot was performed. The package was generated successfully with Node 22.23.3 and the matching installed Chromium. All 66 repository tests passed. The trusted micro browser Lab also passed its quest, defeat, reconnect, history and rendering checks, and its screenshot was visually inspected.

Actual candidate execution and VM screenshots remain unverified until Windows is restarted and the prepared `.wsb` launches successfully. This does not enable autonomous candidate staging or general source promotion. The existing trusted baseline browser Lab remains separate. An existing visual-publication unit test was made independent of local generated Lab files by giving it its own synthetic baseline fixture; the runtime evidence gate was preserved.
