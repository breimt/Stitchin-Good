import { buildBlockPacket, buildCommand, COMMAND, ECS, parseBlockPacket } from "./ecs.js";

function validateChannel(channel) {
  if (!channel || typeof channel.write !== "function" || typeof channel.readExactly !== "function") {
    throw new TypeError("channel must provide write(bytes) and readExactly(length)");
  }
}

function validateRetryLimit(value) {
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new RangeError("retryLimit must be an integer from 1 through 20");
  }
}

function unexpectedControl(operation, value) {
  const hex = value.toString(16).padStart(2, "0").toUpperCase();
  return new Error(`ECS ${operation} returned unexpected control byte 0x${hex}`);
}

/**
 * Read complete indexed blocks until the ECS sends its terminal ACK.
 *
 * The channel is deliberately abstract so the exact state machine can be tested
 * without Web Serial, an operating system, or connected hardware.
 */
export async function readCardStorage(channel, options = {}) {
  validateChannel(channel);
  const maximumBlocks = options.maximumBlocks ?? 8192;
  const retryLimit = options.retryLimit ?? 4;
  if (!Number.isInteger(maximumBlocks) || maximumBlocks < 1 || maximumBlocks > 65_536) {
    throw new RangeError("maximumBlocks must be an integer from 1 through 65536");
  }
  validateRetryLimit(retryLimit);
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const blocks = [];

  try {
    await channel.write(buildCommand(COMMAND.BEGIN_READ));
    const begin = (await channel.readExactly(1))[0];
    if (begin !== ECS.ACK) throw unexpectedControl("read start", begin);

    let terminalAck = false;
    for (let blockIndex = 0; blockIndex < maximumBlocks; blockIndex += 1) {
      let accepted = false;
      let control = ECS.ACK;
      for (let attempt = 1; attempt <= retryLimit && !accepted; attempt += 1) {
        await channel.write(Uint8Array.of(control));
        const first = (await channel.readExactly(1))[0];
        if (first === ECS.ACK) {
          terminalAck = true;
          break;
        }
        if (first === ECS.NAK) {
          control = ECS.NAK;
          continue;
        }
        if (first === ECS.CAN) throw new Error("ECS cancelled the card read");
        if (first !== ECS.SOH) {
          control = ECS.NAK;
          continue;
        }

        const packet = new Uint8Array(ECS.BLOCK_PACKET_SIZE);
        packet[0] = first;
        packet.set(await channel.readExactly(ECS.BLOCK_PACKET_SIZE - 1), 1);
        try {
          const parsed = parseBlockPacket(packet);
          if (parsed.blockIndex !== blockIndex) throw new Error("block index mismatch");
          blocks.push(parsed.data);
          accepted = true;
          onProgress(Object.freeze({
            blockCount: blocks.length,
            bytesRead: blocks.length * ECS.BLOCK_SIZE,
          }));
        } catch {
          control = ECS.NAK;
        }
      }
      if (terminalAck) break;
      if (!accepted) throw new Error(`card block ${blockIndex} failed validation after ${retryLimit} attempts`);
    }

    if (!terminalAck) await channel.write(Uint8Array.of(ECS.ACK));
  } catch (error) {
    try { await channel.write(Uint8Array.of(ECS.CAN)); } catch {}
    throw error;
  }

  if (blocks.length === 0) throw new Error("ECS returned no card data blocks");
  const result = new Uint8Array(blocks.length * ECS.BLOCK_SIZE);
  blocks.forEach((block, index) => result.set(block, index * ECS.BLOCK_SIZE));
  return result;
}

/**
 * Transmit a complete capacity-sized storage package after erase has succeeded.
 *
 * This function is intentionally not connected to the desktop UI yet. The caller
 * must enforce backup, card-status, package-validation, confirmation, and read-back
 * gates before using it with a physical channel.
 */
export async function writeCardStorage(channel, bytes, options = {}) {
  validateChannel(channel);
  if (!(bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
  if (bytes.length === 0 || bytes.length % ECS.BLOCK_SIZE !== 0) {
    throw new RangeError(`bytes must be a non-empty multiple of ${ECS.BLOCK_SIZE}`);
  }
  const blockCount = bytes.length / ECS.BLOCK_SIZE;
  if (blockCount > 65_536) throw new RangeError("storage package contains too many blocks");
  const retryLimit = options.retryLimit ?? 4;
  validateRetryLimit(retryLimit);
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};

  try {
    await channel.write(buildCommand(COMMAND.BEGIN_WRITE));
    const begin = (await channel.readExactly(1))[0];
    if (begin !== ECS.ACK) throw unexpectedControl("write start", begin);

    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      const start = blockIndex * ECS.BLOCK_SIZE;
      const packet = buildBlockPacket(blockIndex, bytes.subarray(start, start + ECS.BLOCK_SIZE));
      let accepted = false;
      for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
        await channel.write(packet);
        const response = (await channel.readExactly(1))[0];
        if (response === ECS.ACK) {
          accepted = true;
          onProgress(Object.freeze({
            blockCount: blockIndex + 1,
            bytesWritten: (blockIndex + 1) * ECS.BLOCK_SIZE,
          }));
          break;
        }
        if (response === ECS.CAN) throw new Error("ECS cancelled the card write");
        if (response !== ECS.NAK) throw unexpectedControl(`write block ${blockIndex}`, response);
      }
      if (!accepted) throw new Error(`card block ${blockIndex} was rejected ${retryLimit} times`);
    }
  } catch (error) {
    try { await channel.write(Uint8Array.of(ECS.CAN)); } catch {}
    throw error;
  }

  return Object.freeze({ blockCount, bytesWritten: bytes.length });
}
