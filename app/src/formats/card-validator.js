import { summarizeCardStorage } from "./card-layout.js";
import { parseEcsCardImage } from "./card-image.js";
import { ECS } from "../protocol/ecs.js";

const SUPPORTED_CAPACITIES = new Set([128 * 1024, 256 * 1024, 512 * 1024]);

/**
 * Independently validate cross-record invariants required of a write package.
 * Throws on the first unsafe condition and returns an immutable report on success.
 */
export function validateCardStoragePackage(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
  if (bytes.length % ECS.BLOCK_SIZE !== 0) {
    throw new Error(`card storage length must be a multiple of ${ECS.BLOCK_SIZE}`);
  }
  if (!SUPPORTED_CAPACITIES.has(bytes.length)) {
    throw new Error(`unsupported card storage capacity: ${bytes.length} bytes`);
  }

  const parsed = parseEcsCardImage(bytes);
  let expectedStart = parsed.designDataOffset;
  for (const design of parsed.designs) {
    if (design.start !== expectedStart || design.end !== design.start + design.length) {
      throw new Error(`design ${design.index + 1} is not stored contiguously`);
    }
    if (design.colorIndexes.length !== design.colorCount) {
      throw new Error(`design ${design.index + 1} color table length is invalid`);
    }
    expectedStart = design.end;
  }
  if (expectedStart !== parsed.trailer.offset) throw new Error("directory does not follow the final design");

  const summary = summarizeCardStorage(parsed.designs.map((design) => ({
    cardBlobBytes: design.length,
    colorCount: design.colorCount,
  })), bytes.length);
  if (summary.occupiedBytes !== parsed.occupiedBytes || parsed.trailer.end !== parsed.occupiedBytes) {
    throw new Error("calculated occupied storage does not match the directory extent");
  }
  if (bytes.subarray(parsed.occupiedBytes).some((value) => value !== 0xff)) {
    throw new Error("unused card storage is not erased to 0xFF");
  }

  return Object.freeze({
    valid: true,
    capacityBytes: bytes.length,
    designCount: parsed.designs.length,
    occupiedBytes: parsed.occupiedBytes,
    freeBytes: parsed.freeBytes,
    payloadBytes: summary.payloadBytes,
    directoryBytes: summary.directoryBytes,
    erasedTailBytes: bytes.length - parsed.occupiedBytes,
  });
}
