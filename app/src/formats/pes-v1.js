const PES_V1_SIGNATURE = "#PES0001";
const PEC_HEADER_BYTES = 512;
const PEC_STITCH_PREFIX_BYTES = 7;
const PEC_ICON_BYTES = 228;

function asBytes(value, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  return value;
}

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function countPecCommands(bytes, start, end) {
  let cursor = start;
  let stitches = 0;
  let jumps = 0;
  let trims = 0;
  let colorChanges = 0;
  let ended = false;

  while (cursor < end) {
    // PEC writers store a single 0xff terminator as the final stitch-block byte;
    // many readers observe the following zero from the first thumbnail plane.
    if (cursor === end - 1 && bytes[cursor] === 0xff) {
      cursor += 1;
      ended = true;
      break;
    }
    if (cursor + 1 >= end) break;
    let first = bytes[cursor++];
    let second = bytes[cursor++];

    if (first === 0xff && second === 0x00) {
      ended = true;
      break;
    }
    if (first === 0xfe && second === 0xb0) {
      if (cursor >= end) break;
      cursor += 1;
      colorChanges += 1;
      continue;
    }

    let jump = false;
    let trim = false;
    if ((first & 0x80) !== 0) {
      trim ||= (first & 0x20) !== 0;
      jump ||= (first & 0x10) !== 0;
      if (cursor >= end) break;
      second = bytes[cursor++];
    }
    if ((second & 0x80) !== 0) {
      trim ||= (second & 0x20) !== 0;
      jump ||= (second & 0x10) !== 0;
      if (cursor >= end) break;
      cursor += 1;
    }

    if (jump) jumps += 1;
    else if (trim) {
      trims += 1;
      jumps += 1;
    } else stitches += 1;
  }

  return Object.freeze({ stitches, jumps, trims, colorChanges, ended });
}

/**
 * Parse the portions of a version-1 PES file used by Palette's ECS card image.
 *
 * Palette does not copy the PES container to the card. It relocates the PEC icon
 * blocks before the PEC stitch stream and discards the PES/PEC metadata headers.
 */
export function parsePesV1(bytes) {
  asBytes(bytes, "bytes");
  if (bytes.length < 12 || ascii(bytes.subarray(0, 8)) !== PES_V1_SIGNATURE) {
    throw new Error("only #PES0001 files are currently supported");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pecOffset = view.getUint32(8, true);
  const stitchBlockOffset = pecOffset + PEC_HEADER_BYTES;
  if (pecOffset < 12 || stitchBlockOffset + PEC_STITCH_PREFIX_BYTES > bytes.length) {
    throw new Error("PES file contains an invalid PEC offset");
  }

  const stitchBlockLength = readUint24LE(bytes, stitchBlockOffset + 2);
  const iconOffset = stitchBlockOffset + stitchBlockLength;
  const stitchOffset = stitchBlockOffset + PEC_STITCH_PREFIX_BYTES;
  if (stitchBlockLength < PEC_STITCH_PREFIX_BYTES || iconOffset > bytes.length) {
    throw new Error("PES file contains an invalid PEC stitch-block length");
  }
  if (bytes[stitchBlockOffset + 5] !== 0x31 || bytes[stitchBlockOffset + 6] !== 0xff ||
      bytes[stitchOffset] !== 0xf0) {
    throw new Error("PES file has an unsupported PEC stitch-block prefix");
  }

  const iconBytes = bytes.length - iconOffset;
  if (iconBytes === 0 || iconBytes % PEC_ICON_BYTES !== 0) {
    throw new Error("PES file has an unsupported PEC icon section");
  }

  const rawLabel = ascii(bytes.subarray(pecOffset, Math.min(pecOffset + 32, bytes.length)));
  const label = rawLabel.replace(/\r.*$/s, "").replace(/^LA:/, "").trimEnd();
  const graphicByteStride = bytes[pecOffset + 34];
  const graphicHeight = bytes[pecOffset + 35];
  const colorCount = bytes[pecOffset + 48] + 1;
  const colorIndexes = Object.freeze([...bytes.subarray(
    pecOffset + 49,
    pecOffset + 49 + colorCount,
  )]);
  const widthUnits = view.getUint16(stitchOffset + 1, true);
  const heightUnits = view.getUint16(stitchOffset + 3, true);
  const stitchDataOffset = stitchOffset + 9;
  const commandStats = countPecCommands(bytes, stitchDataOffset, iconOffset);

  return Object.freeze({
    label,
    pecOffset,
    stitchBlockOffset,
    stitchBlockLength,
    stitchOffset,
    stitchBytes: iconOffset - stitchOffset,
    iconOffset,
    iconBytes,
    iconCount: iconBytes / PEC_ICON_BYTES,
    graphicByteStride,
    graphicWidth: graphicByteStride * 8,
    graphicHeight,
    colorCount,
    colorIndexes,
    widthUnits,
    heightUnits,
    widthMm: widthUnits / 10,
    heightMm: heightUnits / 10,
    stitchDataOffset,
    ...commandStats,
  });
}

/** Decode one PEC 1-bit thumbnail plane into row-major pixels (0 or 1). */
export function decodePecThumbnail(bytes, iconIndex = 0) {
  const parsed = parsePesV1(bytes);
  if (!Number.isInteger(iconIndex) || iconIndex < 0 || iconIndex >= parsed.iconCount) {
    throw new RangeError(`iconIndex must be between 0 and ${parsed.iconCount - 1}`);
  }
  const planeBytes = parsed.graphicByteStride * parsed.graphicHeight;
  if (planeBytes !== PES_V1.PEC_ICON_BYTES) {
    throw new Error("PES file uses unsupported PEC thumbnail dimensions");
  }
  const sourceOffset = parsed.iconOffset + (iconIndex * planeBytes);
  const pixels = new Uint8Array(parsed.graphicWidth * parsed.graphicHeight);
  for (let y = 0; y < parsed.graphicHeight; y += 1) {
    for (let x = 0; x < parsed.graphicWidth; x += 1) {
      const sourceByte = bytes[sourceOffset + (y * parsed.graphicByteStride) + (x >>> 3)];
      pixels[(y * parsed.graphicWidth) + x] = (sourceByte >>> (x & 7)) & 1;
    }
  }
  return Object.freeze({
    width: parsed.graphicWidth,
    height: parsed.graphicHeight,
    pixels,
  });
}

/** Build the exact per-design byte layout observed in a Palette 3 ECS card image. */
export function buildEcsDesignBlob(bytes) {
  const parsed = parsePesV1(bytes);
  const result = new Uint8Array(parsed.iconBytes + 4 + parsed.stitchBytes);
  result.set(bytes.subarray(parsed.iconOffset), 0);
  // The four-byte separator is zero-filled by Uint8Array construction.
  result.set(bytes.subarray(parsed.stitchOffset, parsed.iconOffset), parsed.iconBytes + 4);
  return result;
}

export const PES_V1 = Object.freeze({
  SIGNATURE: PES_V1_SIGNATURE,
  PEC_HEADER_BYTES,
  PEC_STITCH_PREFIX_BYTES,
  PEC_ICON_BYTES,
});
