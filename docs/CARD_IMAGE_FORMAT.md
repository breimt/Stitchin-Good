# Palette 3 card-image format

Status: read path implemented for one user-confirmed 128 KiB P7H layout; arbitrary
image generation is still intentionally disabled.

In this document, **card image** means the complete binary contents and layout of the
card's storage. It is not a picture or embroidery preview. The ready-to-stitch PES
designs supply the stitch data and preview planes, but the ECS writer transfers the
whole capacity-sized storage layout rather than copying PES files onto a filesystem.

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

## Confirmed read directory and color trailer

The three design blobs end at `0x141dd`. For `N` designs, this capture then stores:

```text
[N repeated N times]
[ff repeated N times]
[N three-byte pointer records]
[N two-byte zero records]
[01 00]
[N little-endian cumulative color offsets]
[concatenated Brother PEC palette indexes]
```

Each design's color count equals its PEC icon-plane count minus one. The cumulative
offsets and color-array lengths independently validate the discovered design count.
The complete occupied region ends at `0x14210`, leaving 48,624 bytes free in the
captured 131,072-byte image. `app/src/formats/card-image.js` fails closed unless the
signature, thumbnail frames, stitch commands, terminators, design count, reserved
records, and color offsets agree.

The same module reconstructs standalone PES v1 exports. Tests prove that converting
each export back to a card blob reproduces its exact captured design bytes. The card
does not retain the original PES container, filename, or editable metadata, so these
exports are recovery files rather than byte-identical copies of the source PES.

## Other observed regions

- `0x0000` begins with ASCII `brother_embP7H`.
- `0x0000` through `0x3fff` contains sparse control data, tables, and machine UI
  graphics. It is not ordinary PES data.
- The three contiguous design blobs occupy `0x4000` through `0x141dc`.
- The parsed color trailer occupies `0x141dd` through `0x1420f`; the rest of the
  128 KiB image is mostly erased (`ff`) with sparse pointer targets/tables.
- Three-byte values ending in `40` or `41` appear to be encoded card-memory pointers,
  consistent with independent open-source card-image research. Their exact Palette 3
  semantics are not yet proven for this image.

## Safety boundary

The payload and captured read directory/color trailer are solved enough for safe
listing and recovery. Pointer semantics and the header/menu records required to build
arbitrary images are not. A complete image builder must reproduce those records before
any replacement-generated image is sent to a physical card. The best next fixtures
are Palette-generated images containing zero, one, and two small known designs.
