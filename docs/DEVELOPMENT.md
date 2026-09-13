# Development and release

## Desktop application

The product is a standalone Electron desktop application. HTML/CSS are used only as
the contents of its native application window; there is no HTTP server and no hosted
web application.

```powershell
cd app
npm install
npm test
npm run dev
```

`npm run dev` selects `../Designs` as a development library. `npm start` opens the app
normally and remembers the folder chosen through the native folder picker.

The renderer has no Node access. Filesystem operations live in the Electron main
process and are exposed through the limited API in `src/preload.cjs`. Design files and
searches stay local.

## macOS builds

Run `npm run dist:mac` on macOS. The builder creates one self-contained universal DMG
with native Apple silicon (`arm64`) and Intel (`x64`) slices. The app bundles Electron
and all application code; Python, Node.js, Palette, and Ink/Stitch are not runtime
dependencies. The connected USB-to-RS-232 adapter must still be recognized as a
serial device by macOS because an application cannot safely bundle a kernel/system
driver for arbitrary adapters. Signing and notarization will be added
when Apple Developer credentials are available; those credentials must never be
stored in the repository.

The confirmed adapter is a Prolific PL2303GT (`067B:23A3`). Current vendor material
lists the GT family and PID `23A3` for macOS support, and adapter-vendor documentation
reports built-in macOS support on modern releases. This must still be tested on the
recipient Mac; if macOS does not enumerate the adapter, the app cannot repair that
below the operating-system device layer. References:

- <https://www.prolific.com.tw/portfolio-item/pl2303gt/>
- <https://plugable.com/products/pl2303-db9/>

## Repository safety

The local `Designs/` corpus, raw hardware captures, Palette ISO files, dependencies,
and build outputs are ignored. Before every commit, verify this with:

```powershell
git status --short --ignored
git check-ignore Designs captures PALETTE_V3.iso PALETTE_V5.iso
```

The repository uses a dedicated SSH deploy key through its local Git configuration.
Only the `.pub` value belongs in GitHub's repository settings. Never copy the private
key into this workspace, documentation, an issue, or a commit.

`main` tracks `origin/main` at <https://github.com/breimt/Stitchin-Good>. The current
automation key is intentionally passphrase-free so unattended Git pushes work, and
its GitHub deploy-key permission is limited to this repository with write access.

## Session handoff

Keep [`../CODEX_HANDOFF.md`](../CODEX_HANDOFF.md) current before ending a hardware or
reverse-engineering session. It is the authoritative restart point for the prompt
"where did we leave off?" and records safety constraints, verified findings, and the
next implementation task without checking in ignored designs or raw card images.
