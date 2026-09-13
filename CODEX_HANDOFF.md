# Stitchin' Good / ECS card-writer handoff

For the design-to-PES production and quality process, see
[`EMBROIDERY_DESIGN_GUIDE.md`](EMBROIDERY_DESIGN_GUIDE.md).

Last worked: 2026-09-13 (America/Chicago)

## User communication requirement

Every user-facing final response must end with a **What I need from you** section.
Use that section to state the specific action, information, hardware, or decision
needed from the user to keep the project moving. If nothing is currently required,
say that explicitly and state when user involvement will next be needed.

## Physical-card authorization

On 2026-09-13, the user confirmed that the card currently inserted in the ECS is a
genuine rewritable card and explicitly authorized overwriting its current contents.
The verified 128 KiB read-only capture remains the recovery baseline. This permission
removes the ownership/content blocker, but it does not bypass the engineering safety
gates: do not send erase/write commands until the write package is structurally
validated and the ambiguous `0x21` status is resolved or independently proven safe.

## 2026-09-13 UI and Mac-transport update

- Replaced the cream/green promotional interface with a compact VS Code-style dark
  workbench: square edges, dense design rows, library sidebar, persistent card
  inspector, selected-design list, and status bar.
- Every compatible design and selected item shows its exact transformed card-blob
  size. The inspector distinguishes exact selected bytes from unknown existing/free
  bytes and refuses to invent capacity before a successful card read.
- Added an Electron Web Serial device chooser, serial permission handling, 9600
  8-N-1 open with ECS RTS/DTR signals, and a read-only `CT` card-status probe. This
  is intended for macOS and Windows, but target-Mac hardware testing remains required.
- Destructive erase/write remains disabled. Full reads and actual used/free-space
  reporting still depend on recovering the card directory/image format; Mac writing
  additionally needs proven baud negotiation, block transport, image generation,
  read-back verification, signing, and packaged hardware testing.
- The suite now includes UI contract tests and passes 21 tests.
- Design previews now render the actual PEC stitch stream in ordered Brother thread
  colors, closely matching OS embroidery thumbnails instead of the tiny machine-menu
  silhouette. Clicking a design opens full metadata plus a tightly cropped stitch
  preview, color name, palette number, hex swatch, and stitch count for every step.
  Clicking the modal backdrop closes it. The old PEC icon frame is never rendered.
- The known Prolific `067B:23A3` adapter is preferred automatically by the serial
  chooser. The disconnected copy now distinguishes a physically connected cable
  from a serial port that the app has not opened.
- macOS packaging explicitly uses an ASAR bundle and CI can produce self-contained
  arm64/x64 DMGs. No runtime, npm, Palette, server, or network connection is needed;
  Developer ID signing/notarization and target-Mac adapter-driver validation remain.
- A live Electron smoke check opened the local `067B:23A3` adapter at 9600 baud and
  received card status `21`; step images loaded and backdrop-close behavior passed.
- Implemented and live-tested the requested recovery workflow. Electron read all
  1,024 checksum-validated blocks from the inserted card, honored its terminal ACK,
  parsed three designs, matched all three to the local library, and reported 80.5 KiB
  occupied / 47.5 KiB free. Individual Export, Export All, and raw `.img` backup are
  enabled; Export All includes both reconstructed PES files and the exact image.
- `app/src/formats/card-image.js` validates the captured P7H layout and trailer and
  reconstructs PES v1 recovery files. All three exports round-trip to their exact
  original card blobs. No erase/write command was sent.
- Added a platform-independent ECS transfer state machine and switched the live UI
  reader to it. Simulated tests cover read terminal ACK, corrupt-packet NAK/retry,
  write NAK/retry, cancellation, progress, and invalid inputs. The write function is
  deliberately not connected to Web Serial or the UI.
- Added a pure seven-gate write preflight. It requires user authorization, a proven
  writable status, a structurally valid latest read, an exact matching backup, a
  structurally valid output package, observed-capacity agreement, and reported-
  capacity agreement. Status `21` currently fails both status and capacity gates.
- Non-destructive live probes confirmed `CI -> 06`, `CV -> 41 01 42`, a valid
  132-byte `CD` test block, and stable `CT -> 41 21 62`. No erase/write command was
  sent. Exact per-design storage cost now includes its directory and color-table
  growth; the golden three-design plan independently totals `0x14210` occupied bytes.
- An independent write-package validator now checks standard capacity, contiguous
  design extents, directory placement, calculated storage totals, and a fully erased
  `0xFF` tail. Post-write comparison identifies the first mismatched byte.
- Added a pure guarded write-session reducer. It cannot skip read, exact-backup,
  preflight, confirmation, erase, write, or byte-for-byte verification states, and
  it exposes erase/write permission only in the corresponding safe state.
- The suite now passes 45 tests.

## Resume here next session

When the user asks **"where did we leave off?"**, read this file first, then verify
the live checkout with `git status --short`, `git log -1 --oneline`, and `npm test`
from `app/`.

The repository is published at <https://github.com/breimt/Stitchin-Good> and local
`main` tracks `origin/main`. The passphrase-free repository deploy key is installed
outside the workspace as
`C:\Users\Tony\.ssh\stitchin_good_deploy_ed25519_v2`; its public half is registered
on GitHub with write access. The earlier encrypted key was deleted both locally and
from GitHub. Never commit or print the private key.

The next engineering task is to finish the arbitrary card-image builder around the
byte-exact PES v1 design blobs and now-validated read parser. Recover and test the
remaining header, pointer, menu, and allocation semantics using additional zero-,
one-, and two-design fixtures. The builder must compact selected designs so aggregate
free space remains usable. Keep all physical writes disabled until a complete image
matches Palette output and passes independent structural validation.

The read-only hardware path and recovery workflow are implemented. Next, add guarded
erase/write/read-back verification only after the builder gate above. Palette is not
part of this workflow and must not be launched for test writes. The card was last
read successfully from the ECS writer on COM3 at 9600 baud.

## 2026-09-11 update

- The user confirmed that the captured card is expected to contain
  `WL313Octopus.pes`, `H195KittyOnJackO'Lantern.pes`, and
  `H197TrickOrTreatSkeleton.pes`. This is now the golden regression fixture. Whether
  the Esante ESe completed a final machine-side read remains unrecorded.
- Work has started on a cross-platform replacement for Palette's card-writing
  utility, with macOS as the primary handoff platform. See `README.md`,
  `docs/ARCHITECTURE.md`, and `docs/ECS_PROTOCOL.md`.
- Static analysis of the installed, unmodified `palfutil.exe` recovered the ECS
  command packets, checksum rule, ACK/NAK/cancel bytes, baud negotiation values,
  card-capacity statuses, and 128-byte block framing. A tested JavaScript packet core
  now lives under `app/`.
- The PES v1-to-card design-blob transform has been recovered and implemented in
  `app/src/formats/pes-v1.js`. Its test reconstructs all 66,013 design bytes in the
  golden capture exactly. The critical remaining task is the surrounding directory,
  pointer, color/menu table, and trailer records. Do not enable replacement-tool
  writes until complete generated images match captured Palette output and read-back
  checks.
- A live, non-destructive `CT` query on COM3 returned `41 21 62` with a valid
  checksum. This confirms the response prefix/status/checksum interpretation. The
  inserted card at that moment reported raw status `21`, which Palette maps to a
  1 MiB read-only card; no erase or write command was sent.
- A full read was then attempted without any erase/write command. The physical ECS
  returned 1,024 valid 128-byte blocks followed by terminal ACK, so the observed image
  is 131,072 bytes despite Palette's static `0x21` mapping suggesting 1 MiB. The
  capture is `captures/20260912T002646Z/card.img`, SHA-256
  `e97ac9361e09061b10a10646475c6a1b4a01d98f662729d4f27932505f509c99`.
- Exact byte-signature comparison against 2,673 local PES files found three strong
  contents matches: `H195KittyOnJackO'Lantern.pes`, `WL313Octopus.pes`, and
  `H197TrickOrTreatSkeleton.pes`. The user confirmed all three. Exact layout analysis
  established their physical order as Octopus, Kitty, Skeleton. `NV855.pes` did not
  match this card.
- Added safe capture/matching helpers in `scripts/read-ecs-card.ps1`,
  `scripts/match-card-to-pes.mjs`, and `scripts/map-pes-to-card.mjs`. Raw captures are
  git-ignored; a hash-only golden manifest is checked in under `fixtures/manifests/`.
- Product scope now explicitly includes a local design library: recursive folder
  indexing, thumbnails and metadata, search/filter/sort, multi-selection, capacity
  planning, and transfer. See `docs/DESIGN_LIBRARY.md`.
- The design corpus contains 2,673 PES files across versions 1, 3, 4, and 5. The
  current strict v1 payload parser accepts 2,539 files. This corpus is available for
  offline parser, search, preview, capacity, and replacement-writer tests.
- Palette is not used for future test writes. Two accidentally launched Palette
  processes were closed before any card command or write occurred.
- The design library now runs as a standalone Electron desktop application, not a
  browser or localhost app. It has a native folder picker, offline indexing, previews,
  metadata, search/filter/sort, and multi-selection. Electron 44.3.0 and
  electron-builder 26.15.3 are pinned in `app/package-lock.json`; all 19 tests pass.
- The workspace is now an independent Git repository with remote
  `git@github.com:breimt/Stitchin-Good.git`. `Designs/`, `captures/`, and `*.iso` are
  ignored. A dedicated passphrase-free deploy key is bound through local Git
  configuration, registered on GitHub with write access, and has successfully pushed
  `main`. The obsolete encrypted key was removed.

## Goal

Build a standalone, cross-platform replacement for Palette's card-writing function,
with macOS as the primary handoff target and Windows as the hardware-development
environment. Palette must not be used for future physical-card writes; existing
captures and read-only static analysis are compatibility references only.

## Verified system inventory

- OS: Windows 10 Home, 64-bit, version 10.0.19045 (build 19045).
- PowerShell: Windows PowerShell 5.1.19041.6456, 64-bit Desktop edition.
- Normal user `MYSERVER\Tony` is not currently an administrator; elevation/UAC is needed for privileged changes.
- .NET Framework: 4.8.09037 (release 533325), plus legacy 2.0/3.0/3.5 components.
- Relevant VC++ installs: Visual C++ 2015-2022 x64 14.42.34438; VC++ 2013 x86/x64 debug runtimes. Palette ships its own VC6-era runtime DLLs.
- Optical drive: `D:` Slimtype DVD A DA8AESH, currently empty.
- Fixed drives: `C:` and `E:`. No removable drive was present.

## Serial adapter and ECS status

- Adapter: Prolific PL2303GT USB Serial COM Port.
- Hardware ID: `USB\VID_067B&PID_23A3\FTDCB2A6710`.
- Port: `COM3`.
- PnP status: started/OK, `CM_PROB_NONE`.
- Driver: Prolific 5.1.12.0 dated 2026-06-06, `oem12.inf`, signed by Microsoft Windows Hardware Compatibility Publisher.
- COM3 is already in Palette 3's supported COM1-COM4 range; do not reassign it.
- A non-transmitting 9600-baud port-open test succeeded. CTS=True and DSR=True, strongly confirming the powered ECS/cable path.
- Palette 3 File Utility was changed from AUTO to explicit COM3 and saved.
- Most important end-to-end evidence: invoking File Utility's write-card path contacted the ECS and displayed: `No original card is inserted. Please insert an original card.` This confirms protocol-level writer detection on COM3, not merely adapter detection.

## Palette software/media

- Installed base: `C:\Program Files (x86)\Babylock\palette Ver 3`.
- Installed upgrade: `C:\Program Files (x86)\Babylock\palette Ver5`.
- Palette 3 executables are 32-bit and launch successfully on Windows 10 with no forced compatibility flags.
- Palette 3 File Utility (`palfutil.exe`) launches and responds.
- Palette 3 Layout & Editing (`paledit.exe`) launches and responds.
- Palette 3 successfully opened this existing design: `Designs\OeSDVolume4\11038 small designs\NV855.pes`.
- Palette 5 binaries are installed at patch level 5.0.1.1.
- Local disc images:
  - `PALETTE_V3.iso` (9,293,824 bytes), SHA-256 `34C45C411BD047FE7C13E2B0CE1A04C418E2BFB64263FFB047766F024DC97708`
  - `PALETTE_V5.iso` (24,635,392 bytes), SHA-256 `50C61874CB7D3F7F0C96CA8A3E0A69491FE37310D5151CA371244B7483F1FFEA`
- Both ISOs were mounted read-only for inspection and then dismounted.
- Version 3 disc contains a 32-bit front-end launcher plus an old InstallShield component. Version 3 is already installed correctly, so no reinstall is currently justified.
- Version 5 disc is a 32-bit InstallShield package containing the Brother USB card-reader driver (`busbcrw.inf`, `busbcrw.sys`).

## Critical Palette 5 conclusion

- Palette 5 itself displayed that no reader was plugged in and exited normally with code 0.
- Its bundled readme explicitly says Version 5 adopted a new USB Card Reader/Writer Box and that the application will not operate correctly without it.
- The serial ECS does not satisfy Palette 5's USB hardware/license check.
- Do not install the V5 `busbcrw` driver for the serial ECS; no matching USB card-reader device is present.
- With only the serial ECS, use Palette 3 for design editing and card writing. Palette 5 can only be used if the user also has its newer USB reader/writer hardware. Do not attempt to bypass the hardware/license check.

## Existing test assets

- Known Palette-3-compatible test design opened successfully: `C:\Users\Tony\Documents\vibecode\embroidery\Designs\OeSDVolume4\11038 small designs\NV855.pes` (2,808 bytes).
- Palette 3 also ships known-compatible PEC samples in `C:\Program Files (x86)\Babylock\palette Ver 3\card\Sample01.pec` through `Sample04.pec`.
- Attempted Save As target `C:\Users\Tony\Documents\vibecode\embroidery\ECS_TEST_NV855.pes` was **not created**. Do not assume it exists.

## Historical next step (completed/superseded)

1. Re-inventory `Get-PnpDevice -Class Ports` and verify the ECS still returns the no-card-specific message on COM3.
2. Ask the user to insert an older rewritable embroidery card whose current contents are safe to erase. Writing the card is destructive to its previous contents.
3. Prefer Palette 3 Layout & Editing's native `File > Write to Card...` command (F4) with the already-open/known-good `NV855.pes`; its native command ID was verified as 32780. Alternatively use Palette 3 File Utility.
4. Inspect the write confirmation/capacity dialog before approving the final write.
5. Write the test design, wait for completion, then verify by reading/listing the card in Palette/File Utility.
6. Have the user move the card to the Baby Lock Esante ESe and confirm the design appears; this final machine-side check requires the user's physical action.

## Historical safety/state notes (as of 2026-09-09)

- No card write has occurred.
- No driver was installed or changed.
- No compatibility flags were applied.
- No original files were overwritten.
- Existing installed Palette 3 and Palette 5 files were left intact.
