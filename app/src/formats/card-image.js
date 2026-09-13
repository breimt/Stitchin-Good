import { PES_V1, buildEcsDesignBlob, parsePesV1 } from "./pes-v1.js";

const CARD_SIGNATURE = "brother_embP7H";
const DESIGN_DATA_OFFSET = 0x4000;
const PEC_GRAPHIC_BYTE_STRIDE = 6;
const PEC_GRAPHIC_HEIGHT = 38;
const MAX_ICON_COUNT = 65;

function asBytes(value, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  return value;
}

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

function isFramePixel(x, y) {
  const width = PEC_GRAPHIC_BYTE_STRIDE * 8;
  const height = PEC_GRAPHIC_HEIGHT;
  if ((y === 1 || y === height - 2) && x >= 4 && x <= width - 5) return true;
  if ((y === 2 || y === height - 3) && (x === 3 || x === width - 4)) return true;
  if ((y === 3 || y === height - 4) && (x === 2 || x === width - 3)) return true;
  return (x === 1 || x === width - 2) && y >= 4 && y <= height - 5;
}

function hasPecFrame(bytes, offset) {
  for (let y = 0; y < PEC_GRAPHIC_HEIGHT; y += 1) {
    for (let x = 0; x < PEC_GRAPHIC_BYTE_STRIDE * 8; x += 1) {
      if (!isFramePixel(x, y)) continue;
      const value = bytes[offset + (y * PEC_GRAPHIC_BYTE_STRIDE) + (x >>> 3)];
      if (((value >>> (x & 7)) & 1) === 0) return false;
    }
  }
  return true;
}

function parseStoredStitchStream(bytes, offset) {
  if (offset + 10 > bytes.length || bytes[offset] !== 0xf0 ||
      bytes[offset + 5] !== 0xe0 || bytes[offset + 6] !== 0x01 ||
      bytes[offset + 7] !== 0xb0 || bytes[offset + 8] !== 0x01) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const widthUnits = view.getUint16(offset + 1, true);
  const heightUnits = view.getUint16(offset + 3, true);
  if (widthUnits === 0 || heightUnits === 0 || widthUnits > 20_000 || heightUnits > 20_000) return null;

  let cursor = offset + 9;
  let stitches = 0;
  let jumps = 0;
  let trims = 0;
  let colorChanges = 0;
  while (cursor < bytes.length) {
    const first = bytes[cursor++];
    if (first === 0xff) {
      return Object.freeze({
        end: cursor,
        length: cursor - offset,
        widthUnits,
        heightUnits,
        stitches,
        jumps,
        trims,
        colorChanges,
      });
    }
    if (first === 0xfe && bytes[cursor] === 0xb0) {
      if (cursor + 2 > bytes.length) return null;
      cursor += 2;
      colorChanges += 1;
      continue;
    }

    let jump = false;
    let trim = false;
    if ((first & 0x80) !== 0) {
      jump ||= (first & 0x10) !== 0;
      trim ||= (first & 0x20) !== 0;
      if (cursor >= bytes.length) return null;
      cursor += 1;
    }
    if (cursor >= bytes.length) return null;
    const y = bytes[cursor++];
    if ((y & 0x80) !== 0) {
      jump ||= (y & 0x10) !== 0;
      trim ||= (y & 0x20) !== 0;
      if (cursor >= bytes.length) return null;
      cursor += 1;
    }
    if (jump) jumps += 1;
    else if (trim) {
      trims += 1;
      jumps += 1;
    } else stitches += 1;
  }
  return null;
}

function findStoredDesign(bytes, start) {
  for (let iconCount = 2; iconCount <= MAX_ICON_COUNT; iconCount += 1) {
    const iconBytes = iconCount * PES_V1.PEC_ICON_BYTES;
    const separator = start + iconBytes;
    const stitchOffset = separator + 4;
    if (stitchOffset >= bytes.length) break;
    if (bytes[separator] !== 0 || bytes[separator + 1] !== 0 ||
        bytes[separator + 2] !== 0 || bytes[separator + 3] !== 0) continue;
    let framed = true;
    for (let iconIndex = 0; iconIndex < iconCount; iconIndex += 1) {
      if (!hasPecFrame(bytes, start + (iconIndex * PES_V1.PEC_ICON_BYTES))) {
        framed = false;
        break;
      }
    }
    if (!framed) continue;
    const stitch = parseStoredStitchStream(bytes, stitchOffset);
    if (!stitch || stitch.colorChanges + 2 !== iconCount) continue;
    return Object.freeze({ iconCount, iconBytes, stitchOffset, stitch });
  }
  return null;
}

function parseTrailer(bytes, offset, entries) {
  const count = entries.length;
  if (count === 0) throw new Error("card image contains no stored designs");
  const fixedLength = (9 * count) + 2;
  if (offset + fixedLength > bytes.length) throw new Error("card directory is truncated");
  for (let index = 0; index < count; index += 1) {
    if (bytes[offset + index] !== count) throw new Error("card directory design count is invalid");
    if (bytes[offset + count + index] !== 0xff) throw new Error("card directory marker is invalid");
  }
  const zeroTableOffset = offset + (5 * count);
  for (let index = 0; index < count * 2; index += 1) {
    if (bytes[zeroTableOffset + index] !== 0) throw new Error("card directory reserved table is invalid");
  }
  const markerOffset = offset + (7 * count);
  if (bytes[markerOffset] !== 1 || bytes[markerOffset + 1] !== 0) {
    throw new Error("card directory color marker is invalid");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offsetsStart = markerOffset + 2;
  const colorsStart = offset + fixedLength;
  let expectedColorOffset = 0;
  const colors = [];
  for (let index = 0; index < count; index += 1) {
    const storedOffset = view.getUint16(offsetsStart + (index * 2), true);
    if (storedOffset !== expectedColorOffset) throw new Error("card directory color offsets are invalid");
    const colorCount = entries[index].iconCount - 1;
    if (colorsStart + storedOffset + colorCount > bytes.length) {
      throw new Error("card directory color table is truncated");
    }
    colors.push(Object.freeze([...bytes.subarray(
      colorsStart + storedOffset,
      colorsStart + storedOffset + colorCount,
    )]));
    expectedColorOffset += colorCount;
  }
  return Object.freeze({
    offset,
    length: fixedLength + expectedColorOffset,
    end: colorsStart + expectedColorOffset,
    colors: Object.freeze(colors),
  });
}

/** Parse the layout observed on a Brother/Baby Lock Palette P7H ECS card. */
export function parseEcsCardImage(bytes) {
  asBytes(bytes, "bytes");
  if (bytes.length < DESIGN_DATA_OFFSET || ascii(bytes.subarray(0, CARD_SIGNATURE.length)) !== CARD_SIGNATURE) {
    throw new Error("not a supported Brother P7H card image");
  }

  const rawEntries = [];
  let cursor = DESIGN_DATA_OFFSET;
  while (cursor < bytes.length) {
    const stored = findStoredDesign(bytes, cursor);
    if (!stored) break;
    const end = stored.stitch.end;
    rawEntries.push(Object.freeze({
      start: cursor,
      end,
      length: end - cursor,
      iconCount: stored.iconCount,
      iconBytes: stored.iconBytes,
      stitchOffset: stored.stitchOffset,
      stitchBytes: stored.stitch.length,
      widthUnits: stored.stitch.widthUnits,
      heightUnits: stored.stitch.heightUnits,
      stitches: stored.stitch.stitches,
      jumps: stored.stitch.jumps,
      trims: stored.stitch.trims,
      colorChanges: stored.stitch.colorChanges,
    }));
    cursor = end;
  }

  const trailer = parseTrailer(bytes, cursor, rawEntries);
  const designs = rawEntries.map((entry, index) => Object.freeze({
    ...entry,
    index,
    id: `card-${index + 1}`,
    label: `Design ${index + 1}`,
    colorCount: entry.iconCount - 1,
    colorIndexes: trailer.colors[index],
    widthMm: entry.widthUnits / 10,
    heightMm: entry.heightUnits / 10,
    bytes: bytes.slice(entry.start, entry.end),
  }));

  return Object.freeze({
    signature: CARD_SIGNATURE,
    capacityBytes: bytes.length,
    designDataOffset: DESIGN_DATA_OFFSET,
    occupiedBytes: trailer.end,
    freeBytes: bytes.length - trailer.end,
    designs: Object.freeze(designs),
    trailer,
  });
}

function writeAscii(target, offset, value, maximumLength) {
  for (let index = 0; index < Math.min(value.length, maximumLength); index += 1) {
    target[offset + index] = value.charCodeAt(index) & 0x7f;
  }
}

/** Rebuild a standalone PEC file without changing the stored design payload. */
export function buildPecFromCardDesign(design, label = design?.label ?? "Card design") {
  if (!design || !(design.bytes instanceof Uint8Array)) throw new TypeError("design.bytes must be a Uint8Array");
  const colorIndexes = [...design.colorIndexes];
  if (colorIndexes.length !== design.iconCount - 1) throw new Error("design color table is invalid");
  const iconBytes = design.iconCount * PES_V1.PEC_ICON_BYTES;
  const stitchOffset = iconBytes + 4;
  const stitchBytes = design.bytes.subarray(stitchOffset);
  const icons = design.bytes.subarray(0, iconBytes);

  const header = new Uint8Array(PES_V1.PEC_HEADER_BYTES).fill(0x20);
  const safeLabel = String(label).replace(/[\r\n]/g, " ").slice(0, 16);
  writeAscii(header, 0, `LA:${safeLabel.padEnd(16, " ")}\r`, 20);
  header[32] = 0xff;
  header[33] = 0x00;
  header[34] = PEC_GRAPHIC_BYTE_STRIDE;
  header[35] = PEC_GRAPHIC_HEIGHT;
  header[48] = colorIndexes.length - 1;
  header.set(colorIndexes, 49);

  const blockLength = PES_V1.PEC_STITCH_PREFIX_BYTES + stitchBytes.length;
  const result = new Uint8Array(PES_V1.PEC_HEADER_BYTES + blockLength + icons.length);
  result.set(header, 0);
  const block = PES_V1.PEC_HEADER_BYTES;
  result[block] = 0;
  result[block + 1] = 0;
  result[block + 2] = blockLength & 0xff;
  result[block + 3] = (blockLength >>> 8) & 0xff;
  result[block + 4] = (blockLength >>> 16) & 0xff;
  result[block + 5] = 0x31;
  result[block + 6] = 0xff;
  result.set(stitchBytes, block + PES_V1.PEC_STITCH_PREFIX_BYTES);
  result.set(icons, block + blockLength);
  return result;
}

/** Wrap the reconstructed PEC data in the minimal PES v1 container. */
export function buildPesV1FromCardDesign(design, label = design?.label ?? "Card design") {
  const pec = buildPecFromCardDesign(design, label);
  const result = new Uint8Array(12 + pec.length);
  writeAscii(result, 0, "#PES0001", 8);
  new DataView(result.buffer).setUint32(8, 12, true);
  result.set(pec, 12);
  return result;
}

/** Assert that a reconstructed PES round-trips to the exact stored card bytes. */
export function verifyReconstructedDesign(design, pesBytes) {
  const parsed = parsePesV1(asBytes(pesBytes, "pesBytes"));
  const rebuilt = buildEcsDesignBlob(pesBytes);
  return parsed.colorIndexes.length === design.colorIndexes.length &&
    parsed.colorIndexes.every((value, index) => value === design.colorIndexes[index]) &&
    rebuilt.length === design.bytes.length && rebuilt.every((value, index) => value === design.bytes[index]);
}

export const CARD_IMAGE = Object.freeze({
  SIGNATURE: CARD_SIGNATURE,
  DESIGN_DATA_OFFSET,
  MAX_ICON_COUNT,
});
