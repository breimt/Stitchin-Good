# Design library and selection workflow

## Purpose

The application is both a design browser and a card writer. A user should be able to
point it at one or more folders, find designs visually, select a set, see whether that
set fits, and transfer it without using Palette.

## Library behavior

- Recursively index `.pes` files in user-selected folders.
- Preserve the relative folder path as useful collection/category information.
- Never modify, rename, or relocate source design files.
- Refresh incrementally using file path, size, and modification time; calculate a
  content hash before transfer or when duplicate detection is requested.
- Keep unavailable or unsupported files visible with a clear reason instead of
  silently dropping them.
- Treat filenames and paths as Unicode. The legacy card label is separate and may
  require a restricted character set.

Each indexed record should expose, where available:

- filename, relative path, collection folder, and embedded PEC label;
- PES version and compatibility status;
- design width and height;
- thread/color count and stitch count;
- source file size and estimated card-space cost;
- a thumbnail derived locally from the PEC overview graphic;
- warnings such as unsupported PES version, malformed PEC data, machine limits, or
  duplicate content.

## Browsing and search

The main library view will provide:

- text search across filename, embedded label, and folder path;
- folder/collection navigation;
- grid and compact-list views;
- filters for compatibility, dimensions, colors, stitches, and card-space cost;
- sorting by name, folder, dimensions, stitch count, color count, or card-space cost;
- multi-selection with persistent selection while searching or changing folders;
- a selection tray showing design count, combined card usage, and remaining space.

Search is local and case-insensitive. It does not upload design names, thumbnails, or
file contents.

## Card operations

The card browser and source library are distinct views. Reading a card should show its
existing design entries and allow the user to preserve, remove, or export them when
the format can be decoded safely.

Adding designs to a card uses a complete-image rebuild:

1. Read and validate the existing image.
2. Preserve every selected existing entry.
3. Convert newly selected PES files to card blobs.
4. Compact all retained and new blobs into one contiguous design region.
5. Rebuild every directory, pointer, color, thumbnail, and trailer record.
6. Refuse before erase if anything is unsupported or the rebuilt image does not fit.
7. Erase, write sequentially, read back, and compare byte-for-byte.

This compaction policy uses aggregate free capacity even when the old image contains
holes. Individual stitch/design blobs remain contiguous because no verified chaining
format has been observed.

## Current implementation status

- `scripts/catalog-pes.mjs` inventories the local test corpus.
- `app/src/formats/pes-v1.js` extracts proven PES v1 card payloads.
- `app/src/formats/card-layout.js` plans deterministic compacted placement.
- The local corpus currently contains 2,673 PES files; 2,539 pass the strict PES v1
  card-payload parser.
- Search/index records and thumbnail decoding are implemented in `app/src/catalog/`
  and `app/src/formats/pes-v1.js`.
- `app/src/main.js`, `app/src/preload.cjs`, and `app/ui/` implement the standalone
  Electron desktop library. It uses a native folder picker and direct main-process
  filesystem access through a narrow IPC bridge; it does not start a local server.
- The desktop library supports collection browsing, text search, compatibility
  filtering, sorting, local previews, and persistent multi-selection.
- Connecting the selection tray to the complete card-image builder and guarded ECS
  workflow is the next implementation slice. Transfer remains visibly locked until
  that safety boundary is met.
