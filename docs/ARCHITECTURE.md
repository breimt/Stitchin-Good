# ECS Card Writer architecture

## Product boundary

The first release replaces Palette's **file-to-card transfer utility**, not its
digitizing/editor features. It accepts existing PES files and writes a Brother/Baby
Lock rewritable card through the serial Palette Model ECS writer.

Palette is not part of the development or production write path. Existing captures
and read-only static-analysis notes may be used as compatibility references, but all
future physical-card writes are performed by this replacement after its image builder
passes the required fixture checks.

The application should be usable by a nontechnical Mac user:

- drag files into a writing list;
- choose library folders, then browse, search, filter, and multi-select designs;
- show filename, dimensions, colors, stitches, and compatibility warnings;
- discover likely USB-serial ports while still allowing manual selection;
- show the detected writer and card capacity;
- require an explicit confirmation that existing card contents will be erased;
- show block-level progress;
- read the result back and compare it before reporting success;
- export a diagnostic bundle with software version, port metadata, and redacted wire
  traces when something fails.

## Proposed layers

```text
Desktop UI
  -> design library index + search
  -> application workflow (read / preserve / compact / plan / write / verify)
    -> PES/PEC reader + card-image parser/builder
      -> ECS protocol state machine
        -> serial transport adapter
```

Every layer below the UI must run in automated tests with fixtures and simulated
serial I/O. The serial adapter is the only OS-facing layer.

## Desktop technology

Use an Electron shell with a small HTML/CSS/JavaScript UI for the first distributable
version. This repository already has a working modern Node.js toolchain, Electron can
produce normal `.app`/`.dmg` artifacts on macOS, and Electron officially exposes the
Web Serial API plus serial-device selection and permission handlers. Use Web Serial
for the first transport adapter so the app does not depend on a separately compiled
native serial-port add-on.

Mac builds must run on macOS CI rather than being cross-compiled on Windows. Release
automation should produce both `arm64` (Apple silicon) and `x64` artifacts, then a
universal signed/notarized app when Apple Developer credentials are available.

The protocol and card-image code must remain framework-independent. If the desktop
shell changes later, the difficult reverse-engineered code stays intact.

## Safety model

The write workflow is transactional from the user's point of view:

1. Probe the device and decode the card status.
2. Refuse unsupported, read-only, absent, or ambiguously detected cards.
3. Build the complete card image in memory.
4. Validate every input PES and ensure the image exactly matches card capacity.
5. Present the destructive confirmation with the detected capacity and design list.
6. Erase and write all blocks.
7. Read all blocks back.
8. Compare the read-back image byte-for-byte and report success only on a match.

There is no automatic retry of the destructive operation. Packet retries may occur
inside one active transfer when the device returns NAK or a checksum fails.

## Development milestones

### M1 - protocol fixtures

- Use the captured ECS read and existing static-analysis record as the baseline.
- Save timestamped TX/RX fixtures produced by the replacement with selected PES files
  and card capacity.
- Confirm commands, timeouts, retries, and baud negotiation directly against the ECS.

### M2 - card-image builder

- Parse the confirmed three-design capture and available independent card-image
  fixtures without invoking Palette for new writes.
- Identify headers, pointers, names, palettes, thumbnails, PEC stitch data, padding,
  and capacity-dependent fields.
- Generate byte-identical images for the fixtures.
- Add independent structural validation, not only golden-file comparisons.

### M2.5 - design library

- Recursively index user-selected folders without altering source files.
- Extract labels, dimensions, colors, stitches, thumbnails, compatibility, and
  estimated card-space cost.
- Implement local text search, folder browsing, filters, sorting, and multi-selection.
- Show selection capacity and compacted placement before enabling transfer.

### M3 - read-only hardware utility

- Enumerate ports and identify the ECS.
- Detect card type and capacity.
- Read a card to a backup file and parse its design directory.
- Test on Windows, then on the target Mac and USB-serial adapter.

### M4 - guarded writes

- Implement erase, block write, read-back, and verification.
- Test first with the rewritable card whose contents are known to be disposable.
- Confirm the resulting card in the Baby Lock Esante ESe.

### M5 - Mac handoff

- Package Intel and Apple-silicon builds on macOS CI.
- Test clean installation, serial permission UX, disconnect/reconnect behavior, and
  sleep/wake.
- Sign and notarize the final handoff build.

## Definition of done

The tool is ready to hand to the Mac user only when the same release artifact can:

- detect the ECS after a fresh install;
- reject an absent/read-only/unsupported card clearly;
- write known-good PES v1 designs;
- browse and search a local design library, then transfer a multi-selection;
- verify every byte by reading the card back;
- produce a card the Esante ESe lists and stitches;
- recover cleanly from unplugging the serial adapter at each workflow stage.
