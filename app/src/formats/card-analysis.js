function requireImage(value, name = "image") {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  return value;
}

/** Coalesce invariant and varying byte ranges across equal-sized raw card images. */
export function compareCardImages(images) {
  if (!Array.isArray(images) || images.length < 2) throw new TypeError("at least two images are required");
  images.forEach((image, index) => requireImage(image, `images[${index}]`));
  const imageBytes = images[0].length;
  if (imageBytes === 0 || images.some((image) => image.length !== imageBytes)) {
    throw new RangeError("card images must have the same non-zero size");
  }

  const regions = [];
  let start = 0;
  let varying = images.some((image) => image[0] !== images[0][0]);
  let variableBytes = 0;
  for (let offset = 0; offset < imageBytes; offset += 1) {
    const offsetVaries = images.some((image) => image[offset] !== images[0][offset]);
    if (offsetVaries) variableBytes += 1;
    if (offset > 0 && offsetVaries !== varying) {
      regions.push(Object.freeze({ start, endExclusive: offset, length: offset - start,
        kind: varying ? "varying" : "invariant" }));
      start = offset;
      varying = offsetVaries;
    }
  }
  regions.push(Object.freeze({ start, endExclusive: imageBytes, length: imageBytes - start,
    kind: varying ? "varying" : "invariant" }));
  return Object.freeze({ imageCount: images.length, imageBytes, variableBytes,
    invariantBytes: imageBytes - variableBytes, regions: Object.freeze(regions) });
}

/**
 * Find plausible three-byte Brother far pointers: low byte, high byte, bank 0x40+.
 * Results are candidates, not proof; false positives in stitch/bitmap data are expected.
 */
export function scanBrotherPointerCandidates(image) {
  requireImage(image);
  const candidates = [];
  for (let source = 0; source <= image.length - 3; source += 1) {
    const bank = image[source + 2];
    if (bank < 0x40) continue;
    const target = image[source] | (image[source + 1] << 8) | ((bank - 0x40) << 16);
    if (target >= image.length) continue;
    candidates.push(Object.freeze({ source, target, bank }));
  }
  return Object.freeze(candidates);
}

export function extractAsciiStrings(image, minimumLength = 6) {
  requireImage(image);
  if (!Number.isInteger(minimumLength) || minimumLength < 3) {
    throw new RangeError("minimumLength must be an integer of at least 3");
  }
  const strings = [];
  let start = null;
  for (let offset = 0; offset <= image.length; offset += 1) {
    const printable = offset < image.length && image[offset] >= 0x20 && image[offset] <= 0x7e;
    if (printable && start == null) start = offset;
    if (!printable && start != null) {
      if (offset - start >= minimumLength) {
        strings.push(Object.freeze({ offset: start,
          text: String.fromCharCode(...image.subarray(start, offset)) }));
      }
      start = null;
    }
  }
  return Object.freeze(strings);
}
