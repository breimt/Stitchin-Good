#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [imageArgument, ...pesArguments] = process.argv.slice(2);
if (!imageArgument || pesArguments.length === 0) {
  console.error("Usage: node scripts/map-pes-to-card.mjs <card.img> <design.pes> [design.pes ...]");
  process.exit(2);
}

const imagePath = path.resolve(imageArgument);
const image = fs.readFileSync(imagePath);
const seedLength = 24;
const minimumRunLength = 64;
const maximumCandidatesPerSeed = 32;

function usefulSeed(bytes) {
  const unique = new Set(bytes);
  return unique.size >= 6 && !bytes.every((byte) => byte === 0x00 || byte === 0xff);
}

const imageIndex = new Map();
for (let offset = 0; offset <= image.length - seedLength; offset += 1) {
  const seed = image.subarray(offset, offset + seedLength);
  if (!usefulSeed(seed)) continue;
  const key = seed.toString("base64");
  const offsets = imageIndex.get(key);
  if (offsets && offsets.length < maximumCandidatesPerSeed) offsets.push(offset);
  else if (!offsets) imageIndex.set(key, [offset]);
}

function maximalRun(pes, pesSeedOffset, imageSeedOffset) {
  let pesStart = pesSeedOffset;
  let imageStart = imageSeedOffset;
  while (pesStart > 0 && imageStart > 0 && pes[pesStart - 1] === image[imageStart - 1]) {
    pesStart -= 1;
    imageStart -= 1;
  }

  let pesEnd = pesSeedOffset + seedLength;
  let imageEnd = imageSeedOffset + seedLength;
  while (pesEnd < pes.length && imageEnd < image.length && pes[pesEnd] === image[imageEnd]) {
    pesEnd += 1;
    imageEnd += 1;
  }

  return {
    pesStart,
    pesEnd,
    imageStart,
    imageEnd,
    length: pesEnd - pesStart,
    delta: imageStart - pesStart,
  };
}

function unionLength(intervals) {
  if (intervals.length === 0) return 0;
  const sorted = intervals
    .map(([start, end]) => [start, end])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let total = 0;
  let [start, end] = sorted[0];
  for (const [nextStart, nextEnd] of sorted.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd);
    else {
      total += end - start;
      [start, end] = [nextStart, nextEnd];
    }
  }
  return total + end - start;
}

function mapPes(pesPath) {
  const pes = fs.readFileSync(pesPath);
  const pecOffset = pes.indexOf(Buffer.from("#PEC"));
  const runs = [];
  const seen = new Set();

  for (let pesOffset = 0; pesOffset <= pes.length - seedLength; pesOffset += 1) {
    const seed = pes.subarray(pesOffset, pesOffset + seedLength);
    if (!usefulSeed(seed)) continue;
    const candidates = imageIndex.get(seed.toString("base64"));
    if (!candidates) continue;

    let best;
    for (const imageOffset of candidates) {
      const run = maximalRun(pes, pesOffset, imageOffset);
      if (!best || run.length > best.length) best = run;
    }
    if (!best || best.length < minimumRunLength) continue;

    const key = `${best.pesStart}:${best.imageStart}:${best.length}`;
    if (!seen.has(key)) {
      seen.add(key);
      runs.push(best);
    }

    // Every seed within this exact run would rediscover the same result.
    pesOffset = Math.max(pesOffset, best.pesEnd - seedLength);
  }

  runs.sort((left, right) => right.length - left.length || left.imageStart - right.imageStart);
  return {
    file: path.relative(process.cwd(), pesPath),
    pesBytes: pes.length,
    pecOffset,
    exactRunCount: runs.length,
    exactPesBytesCovered: unionLength(runs.map((run) => [run.pesStart, run.pesEnd])),
    exactImageBytesCovered: unionLength(runs.map((run) => [run.imageStart, run.imageEnd])),
    runs,
  };
}

const mappings = pesArguments.map((argument) => mapPes(path.resolve(argument)));
console.log(JSON.stringify({
  image: imagePath,
  imageBytes: image.length,
  seedLength,
  minimumRunLength,
  mappings,
}, null, 2));
