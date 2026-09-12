# Palette 3 card-image format

Status: partial, with the per-design payload proven byte-for-byte against one
user-confirmed 128 KiB card image.

## Golden fixture

The local capture `captures/20260912T002646Z/card.img` has SHA-256
`e97ac9361e09061b10a10646475c6a1b4a01d98f662729d4f27932505f509c99`.
The user confirmed that it should contain these three designs. Exact reconstruction
establishes their physical order and extents:

| Order | Design | Card start | Bytes | Card end (exclusive) |
| ---: | --- | ---: | ---: | ---: |
| 1 | `WL313Octopus.pes` | `0x4000` | 21,515 | `0x940b` |
| 2 | `H195KittyOnJackO'Lantern.pes` | `0x940b` | 32,275 | `0x1121e` |
| 3 | `H197TrickOrTreatSkeleton.pes` | `0x1121e` | 12,223 | `0x141dd` |

The checked-in manifest at
`fixtures/manifests/palette3-three-design-card.json` records source sizes and hashes
without checking in the user-owned binary capture.

## Confirmed PES v1 transformation

Each source starts with `#PES0001`. Its little-endian 32-bit value at offset 8 points
to a 512-byte PEC header. At `PEC + 512`, a little-endian 24-bit length in bytes 2-4
gives the length of the complete PEC stitch block. The observed stitch prefix is:

```text
00 00 [length-low length-mid length-high] 31 ff f0 ...stitches... ff
```

The PEC icon section begins immediately after that length-sized block and runs to
the end of these PES v1 files. It consists of 228-byte monochrome icon planes.

Palette transforms each design to the following card blob:

```text
[all 228-byte PEC icon planes] 00 00 00 00 [PEC bytes from f0 through stitch-end ff]
```

In other words, it moves the icons before the stitch stream, removes the 512-byte PEC
metadata header and seven-byte PEC stitch prefix, and inserts a four-byte zero
separator. The design blobs are concatenated with no alignment padding.

`app/src/formats/pes-v1.js` implements this transform without platform-specific APIs.
The golden-fixture test proves that the three generated blobs exactly equal every
card byte from `0x4000` through `0x141dc` (66,013 bytes total).

## Other observed regions

- `0x0000` begins with ASCII `brother_embP7H`.
- `0x0000` through `0x3fff` contains sparse control data, tables, and machine UI
  graphics. It is not ordinary PES data.
- The three contiguous design blobs occupy `0x4000` through `0x141dc`.
- A small generated trailer begins at `0x141dd`; the rest of the 128 KiB image is
  mostly erased (`ff`) with sparse pointer targets/tables.
- Three-byte values ending in `40` or `41` appear to be encoded card-memory pointers,
  consistent with independent open-source card-image research. Their exact Palette 3
  semantics are not yet proven for this image.

## Safety boundary

The per-design payload is solved, but the directory, pointer, color, menu, and trailer
records are not. A complete image builder must reproduce those records before any
replacement-generated image is sent to a physical card. The best next fixtures are
Palette-generated images containing zero, one, and two small known designs; comparing
them with this three-design image will isolate count, pointer, and allocation fields.
