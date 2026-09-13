# ECS Card Writer

This repository is becoming a small, cross-platform replacement for the card-writing
part of Baby Lock Palette 3. The target hardware is the older serial **Baby Lock
Palette Model ECS** writer used with Brother/Baby Lock rewritable embroidery cards.

The intended user experience is deliberately focused:

1. Connect and power the ECS writer.
2. Insert a rewritable card.
3. Choose design-library folders and browse or search their `.pes` files.
4. Preview designs, filter compatibility, and add multiple designs to a selection.
5. Review existing card contents, combined capacity, and preservation/erase warnings.
6. Compact the selected contents, write, read back, and verify the card.

Windows is the reverse-engineering and hardware-test environment. The finished app
must run on current Intel and Apple-silicon macOS without Palette, Windows, or a
virtual machine.

Source repository: <https://github.com/breimt/Stitchin-Good>

## Current status

- The Windows Palette 3 -> serial ECS -> rewritable card path has completed a real
  write, according to the 2026-09-11 session report.
- Static analysis has identified the ECS framing, checksums, control bytes, baud
  negotiation, card-status codes, and 128-byte block transfer protocol.
- A non-destructive, checksum-validated read captured a 128 KiB card image. The user
  confirmed its three matched PES files, making it the first golden card-image
  fixture. Captures are intentionally git-ignored.
- The cross-platform PES v1 parser now reproduces all three card design blobs exactly:
  66,013 bytes match the capture byte-for-byte. The remaining image-format work is
  the card directory, pointers, color/menu tables, and trailer.
- The local compatibility corpus contains 2,673 PES files. The current strict PES v1
  parser accepts 2,539 of them; newer versions and 43 nonstandard v1 files remain
  explicit unsupported cases. `scripts/catalog-pes.mjs` reproduces the inventory.
- A standalone Electron desktop shell now provides native folder selection, offline
  recursive indexing, PEC thumbnails, metadata, search, collection/compatibility
  filters, sorting, and persistent multi-selection in a compact dark workbench. It
  does not run a web server.
- The card inspector shows the exact transformed byte cost of every design and the
  combined pending selection. It deliberately leaves existing/free space unknown
  until an inserted card has been read and its directory can be validated.
- The Electron shell has a cross-platform Web Serial chooser and read-only 9600-baud
  `CT` card-status probe. This is the first macOS-capable hardware path, but full
  read/baud negotiation and guarded writing are not implemented yet.
- Library thumbnails are rendered from the actual color-separated PEC stitch stream,
  not the low-resolution machine-menu icon. A click opens full metadata and the
  ordered, isolated preview/color/stitch count for every thread step.
- Selection planning compacts designs into sequential card placements, so aggregate
  free capacity remains usable even when the previous card layout was fragmented.
- A dependency-free JavaScript implementation of the proven packet primitives is in
  [`app/src/protocol/ecs.js`](app/src/protocol/ecs.js), with tests.
- The current automated suite passes 21 tests covering protocol packets, card status,
  PES parsing, golden design blobs, search metadata, capacity checks, and compacted
  placement, plus the desktop UI safety contract.
- The remaining critical unknown is the binary card-image layout that Palette builds
  from PES/PEC data, thumbnails, metadata, and menus. We will not perform writes from
  the replacement until generated images match captured Palette output and pass
  read-back verification.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the product plan,
[`docs/ECS_PROTOCOL.md`](docs/ECS_PROTOCOL.md) for the wire protocol, and
[`docs/CARD_IMAGE_FORMAT.md`](docs/CARD_IMAGE_FORMAT.md) for the image layout.
The library/search product requirements are in
[`docs/DESIGN_LIBRARY.md`](docs/DESIGN_LIBRARY.md).

Windows-only development helpers under `scripts/` can probe/capture the legacy
hardware while the production implementation remains cross-platform.

## Develop the desktop app

Install the pinned desktop dependencies and run the tests:

```powershell
cd app
npm install
npm test
```

Launch the Windows development build against the repository's ignored design corpus:

```powershell
npm run dev
```

`npm start` launches without a preselected folder and uses the native folder picker.
The eventual macOS `.app`/`.dmg` is built on macOS with `npm run dist:mac`; no browser,
localhost service, Palette installation, or network connection is required at runtime.

The generated Intel and Apple-silicon DMGs are self-contained: Electron and all
application code are bundled inside the installed app. A Mac user does not install
Node.js, npm, JavaScript packages, or a separate application runtime. Tagged builds
and manual runs of `.github/workflows/build-macos.yml` produce both installers on a
macOS runner. Developer ID signing/notarization credentials are still required before
the final public handoff can install without Gatekeeper's unsigned-app warning.

## Safety

Writing an original/rewriteable embroidery card erases all of its previous designs.
The finished app will require explicit confirmation and will verify the result by
reading it back. Current code does not erase or write a card.
