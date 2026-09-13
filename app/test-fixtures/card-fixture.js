import { buildEcsDesignBlob } from "../src/formats/pes-v1.js";

function setFrame(icon) {
  for (let y = 0; y < 38; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      const marked = ((y === 1 || y === 36) && x >= 4 && x <= 43) ||
        ((y === 2 || y === 35) && (x === 3 || x === 44)) ||
        ((y === 3 || y === 34) && (x === 2 || x === 45)) ||
        ((x === 1 || x === 46) && y >= 4 && y <= 33);
      if (marked) icon[(y * 6) + (x >>> 3)] |= 1 << (x & 7);
    }
  }
}

export function syntheticCard() {
  const pecOffset = 12;
  const blockOffset = pecOffset + 512;
  const stitches = Uint8Array.of(
    0xf0, 0x64, 0x00, 0x96, 0x00, 0xe0, 0x01, 0xb0, 0x01,
    0x0a, 0x05, 0xff,
  );
  const blockLength = 7 + stitches.length;
  const iconOffset = blockOffset + blockLength;
  const pes = new Uint8Array(iconOffset + 456);
  pes.set(Buffer.from("#PES0001", "ascii"), 0);
  new DataView(pes.buffer).setUint32(8, pecOffset, true);
  pes.set(Buffer.from("LA:Synthetic       \r", "ascii"), pecOffset);
  pes[pecOffset + 34] = 6;
  pes[pecOffset + 35] = 38;
  pes[pecOffset + 48] = 0;
  pes[pecOffset + 49] = 5;
  pes[blockOffset + 2] = blockLength;
  pes[blockOffset + 5] = 0x31;
  pes[blockOffset + 6] = 0xff;
  pes.set(stitches, blockOffset + 7);
  setFrame(pes.subarray(iconOffset, iconOffset + 228));
  setFrame(pes.subarray(iconOffset + 228, iconOffset + 456));
  const blob = buildEcsDesignBlob(pes);

  const card = new Uint8Array(0x5000).fill(0xff);
  card.set(Buffer.from("brother_embP7H", "ascii"), 0);
  card.set(blob, 0x4000);
  const trailer = 0x4000 + blob.length;
  card.set(Uint8Array.of(
    1, 0xff, 0, 0, 0x40, 0, 0, 1, 0, 0, 0, 5,
  ), trailer);
  return card;
}

