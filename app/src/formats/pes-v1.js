import { pecThread, pecThreadColor } from "./pec-threads.js";

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

function signed7(value) {
  return value > 0x3f ? value - 0x80 : value;
}

function signed12(value) {
  const masked = value & 0x0fff;
  return masked > 0x07ff ? masked - 0x1000 : masked;
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

function isPecIconFrame(x, y, width, height) {
  if ((y === 1 || y === height - 2) && x >= 4 && x <= width - 5) return true;
  if ((y === 2 || y === height - 3) && (x === 3 || x === width - 4)) return true;
  if ((y === 3 || y === height - 4) && (x === 2 || x === width - 3)) return true;
  return (x === 1 || x === width - 2) && y >= 4 && y <= height - 5;
}

function withoutPecIconFrame(thumbnail) {
  const pixels = thumbnail.pixels.slice();
  for (let y = 0; y < thumbnail.height; y += 1) {
    for (let x = 0; x < thumbnail.width; x += 1) {
      if (isPecIconFrame(x, y, thumbnail.width, thumbnail.height)) {
        pixels[(y * thumbnail.width) + x] = 0;
      }
    }
  }
  return pixels;
}

/** Composite PEC's per-thread icon planes into a color thumbnail. */
export function decodePecColorThumbnail(bytes) {
  const parsed = parsePesV1(bytes);
  const colors = Object.freeze(parsed.colorIndexes.map(pecThreadColor));
  const pixels = new Uint8Array(parsed.graphicWidth * parsed.graphicHeight);
  let coloredPixelCount = 0;

  for (let colorIndex = 0; colorIndex < colors.length; colorIndex += 1) {
    const iconIndex = colorIndex + 1;
    if (iconIndex >= parsed.iconCount) break;
    const plane = decodePecThumbnail(bytes, iconIndex);
    const planePixels = withoutPecIconFrame(plane);
    for (let index = 0; index < pixels.length; index += 1) {
      if (planePixels[index] === 0) continue;
      if (pixels[index] === 0) coloredPixelCount += 1;
      pixels[index] = colorIndex + 1;
    }
  }

  // Some writers include only the combined monochrome plane. Keep those designs
  // visible using their first recorded thread color.
  if (coloredPixelCount === 0) {
    const combined = decodePecThumbnail(bytes);
    pixels.set(withoutPecIconFrame(combined));
  }

  return Object.freeze({
    width: parsed.graphicWidth,
    height: parsed.graphicHeight,
    colors,
    pixels,
  });
}

/** Return each ordered PEC thread/color step with its isolated icon plane. */
export function decodePecColorSteps(bytes) {
  const parsed = parsePesV1(bytes);
  return Object.freeze(parsed.colorIndexes.map((paletteIndex, index) => {
    const thread = pecThread(paletteIndex);
    const iconIndex = index + 1;
    const plane = decodePecThumbnail(bytes, iconIndex < parsed.iconCount ? iconIndex : 0);
    return Object.freeze({
      number: index + 1,
      paletteIndex: thread.index,
      color: thread.color,
      colorName: thread.name,
      width: plane.width,
      height: plane.height,
      pixels: withoutPecIconFrame(plane),
    });
  }));
}

/** Decode the actual PEC stitch stream into ordered, color-aware SVG path data. */
export function decodePecStitchPlan(bytes) {
  const parsed = parsePesV1(bytes);
  const steps = parsed.colorIndexes.map((paletteIndex, index) => {
    const thread = pecThread(paletteIndex);
    return {
      number: index + 1,
      paletteIndex: thread.index,
      color: thread.color,
      colorName: thread.name,
      pathParts: [],
      stitchCount: 0,
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
  });

  let cursor = parsed.stitchDataOffset;
  let x = 0;
  let y = 0;
  let stepIndex = 0;
  let pathOpen = false;
  while (cursor < parsed.iconOffset && stepIndex < steps.length) {
    if (cursor === parsed.iconOffset - 1 && bytes[cursor] === 0xff) break;
    if (cursor + 1 >= parsed.iconOffset) break;
    let first = bytes[cursor++];
    let second = bytes[cursor++];
    if (first === 0xff && second === 0x00) break;
    if (first === 0xfe && second === 0xb0) {
      if (cursor < parsed.iconOffset) cursor += 1;
      stepIndex = Math.min(stepIndex + 1, steps.length - 1);
      pathOpen = false;
      continue;
    }

    let jump = false;
    let trim = false;
    let deltaX;
    let deltaY;
    if ((first & 0x80) !== 0) {
      trim ||= (first & 0x20) !== 0;
      jump ||= (first & 0x10) !== 0;
      if (cursor >= parsed.iconOffset) break;
      deltaX = signed12((first << 8) | second);
      second = bytes[cursor++];
    } else deltaX = signed7(first);

    if ((second & 0x80) !== 0) {
      trim ||= (second & 0x20) !== 0;
      jump ||= (second & 0x10) !== 0;
      if (cursor >= parsed.iconOffset) break;
      deltaY = signed12((second << 8) | bytes[cursor++]);
    } else deltaY = signed7(second);

    const previousX = x;
    const previousY = y;
    x += deltaX;
    y += deltaY;
    if (jump || trim || (deltaX === 0 && deltaY === 0)) {
      pathOpen = false;
      continue;
    }

    const step = steps[stepIndex];
    if (!pathOpen) step.pathParts.push(`M${previousX} ${previousY}`);
    step.pathParts.push(`l${deltaX} ${deltaY}`);
    pathOpen = true;
    step.stitchCount += 1;
    step.minX = Math.min(step.minX, previousX, x);
    step.minY = Math.min(step.minY, previousY, y);
    step.maxX = Math.max(step.maxX, previousX, x);
    step.maxY = Math.max(step.maxY, previousY, y);
  }

  const populated = steps.filter((step) => step.stitchCount > 0);
  const fallbackWidth = Math.max(1, parsed.widthMm * 10);
  const fallbackHeight = Math.max(1, parsed.heightMm * 10);
  const bounds = populated.length > 0 ? {
    minX: Math.min(...populated.map((step) => step.minX)),
    minY: Math.min(...populated.map((step) => step.minY)),
    maxX: Math.max(...populated.map((step) => step.maxX)),
    maxY: Math.max(...populated.map((step) => step.maxY)),
  } : {
    minX: -fallbackWidth / 2,
    minY: -fallbackHeight / 2,
    maxX: fallbackWidth / 2,
    maxY: fallbackHeight / 2,
  };

  return Object.freeze({
    bounds: Object.freeze(bounds),
    steps: Object.freeze(steps.map((step) => Object.freeze({
      number: step.number,
      paletteIndex: step.paletteIndex,
      color: step.color,
      colorName: step.colorName,
      path: step.pathParts.join(""),
      stitchCount: step.stitchCount,
      bounds: Object.freeze(step.stitchCount > 0 ? {
        minX: step.minX, minY: step.minY, maxX: step.maxX, maxY: step.maxY,
      } : bounds),
    }))),
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
