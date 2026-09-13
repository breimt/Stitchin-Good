import fs from "node:fs";
import path from "node:path";
import { compareCardImages, extractAsciiStrings, scanBrotherPointerCandidates }
  from "../app/src/formats/card-analysis.js";

const paths = process.argv.slice(2).map((value) => path.resolve(value));
if (paths.length < 1) {
  console.error("Usage: node scripts/analyze-card-images.mjs <card.img> [comparison.img ...]");
  process.exitCode = 2;
} else {
  const images = paths.map((file) => new Uint8Array(fs.readFileSync(file)));
  const perImage = images.map((image, index) => ({
    file: path.basename(paths[index]),
    bytes: image.length,
    pointerCandidates: scanBrotherPointerCandidates(image).length,
    strings: extractAsciiStrings(image).slice(0, 200),
  }));
  const rawComparison = images.length > 1 ? compareCardImages(images) : null;
  const comparison = rawComparison ? {
    imageCount: rawComparison.imageCount,
    imageBytes: rawComparison.imageBytes,
    variableBytes: rawComparison.variableBytes,
    invariantBytes: rawComparison.invariantBytes,
    regionCount: rawComparison.regions.length,
    regions: rawComparison.regions.slice(0, 200),
    regionsTruncated: rawComparison.regions.length > 200,
  } : null;
  console.log(JSON.stringify({ perImage, comparison }, null, 2));
}
