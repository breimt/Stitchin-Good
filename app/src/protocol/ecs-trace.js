function requireBytes(value, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  return value;
}

export function bytesToHex(bytes) {
  requireBytes(bytes, "bytes");
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new TypeError("hex must contain complete hexadecimal bytes");
  }
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** Record lossless serial reads/writes around any channel without changing timing or protocol code. */
export function createTranscriptChannel(channel, transcript = []) {
  if (!channel || typeof channel.write !== "function" || typeof channel.readExactly !== "function") {
    throw new TypeError("channel must provide write(bytes) and readExactly(length)");
  }
  if (!Array.isArray(transcript)) throw new TypeError("transcript must be an array");
  return Object.freeze({
    transcript,
    async write(bytes) {
      requireBytes(bytes, "bytes");
      transcript.push(Object.freeze({ direction: "tx", hex: bytesToHex(bytes) }));
      await channel.write(bytes);
    },
    async readExactly(length) {
      const bytes = await channel.readExactly(length);
      requireBytes(bytes, "channel read result");
      if (bytes.length !== length) throw new Error(`channel returned ${bytes.length} bytes; expected ${length}`);
      transcript.push(Object.freeze({ direction: "rx", hex: bytesToHex(bytes) }));
      return bytes;
    },
  });
}

/**
 * Deterministically replay a lossless transcript. TX entries are assertions, so a
 * protocol change that sends different bytes fails at the first mismatch.
 */
export function createReplayChannel(entries) {
  if (!Array.isArray(entries)) throw new TypeError("entries must be an array");
  const queue = entries.map((entry, index) => {
    if (!entry || !["tx", "rx"].includes(entry.direction)) {
      throw new TypeError(`entry ${index} must have direction tx or rx`);
    }
    return Object.freeze({ direction: entry.direction, bytes: hexToBytes(entry.hex) });
  });
  let position = 0;
  let pendingRx = new Uint8Array();

  function next(direction) {
    const entry = queue[position];
    if (!entry) throw new Error(`transcript exhausted while expecting ${direction}`);
    if (entry.direction !== direction) {
      throw new Error(`transcript entry ${position} is ${entry.direction}; expected ${direction}`);
    }
    position += 1;
    return entry.bytes;
  }

  return Object.freeze({
    async write(bytes) {
      requireBytes(bytes, "bytes");
      const expected = next("tx");
      if (bytesToHex(bytes) !== bytesToHex(expected)) {
        throw new Error(`transcript TX mismatch at entry ${position - 1}`);
      }
    },
    async readExactly(length) {
      while (pendingRx.length < length) {
        const nextBytes = next("rx");
        const combined = new Uint8Array(pendingRx.length + nextBytes.length);
        combined.set(pendingRx);
        combined.set(nextBytes, pendingRx.length);
        pendingRx = combined;
      }
      const result = pendingRx.slice(0, length);
      pendingRx = pendingRx.slice(length);
      return result;
    },
    assertComplete() {
      if (position !== queue.length || pendingRx.length !== 0) {
        throw new Error(`transcript has unread data at entry ${position}`);
      }
    },
  });
}
