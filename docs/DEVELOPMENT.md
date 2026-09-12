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

Run `npm run dist:mac` on macOS. The builder is configured to create DMG artifacts for
both Apple silicon (`arm64`) and Intel (`x64`). Signing and notarization will be added
when Apple Developer credentials are available; those credentials must never be
stored in the repository.

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
