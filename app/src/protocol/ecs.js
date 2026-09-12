/**
 * Packet primitives for the serial Baby Lock/Brother ECS card writer.
 *
 * These functions intentionally contain no serial-port or UI code. Keeping the wire
 * format pure makes it testable on Windows, macOS, and CI without attached hardware.
 */

export const ECS = Object.freeze({
  COMMAND_PREFIX: 0x43, // ASCII "C"
  RESPONSE_PREFIX: 0x41, // ASCII "A"
  SOH: 0x01,
  ACK: 0x06,
  NAK: 0x15,
  CAN: 0x18,
  BLOCK_SIZE: 128,
  BLOCK_PACKET_SIZE: 132,
});

export const COMMAND = Object.freeze({
  IDENTIFY: "I",
  VERSION: "V",
  CARD_TYPE: "T",
  ERASE: "E",
  DEVICE_DATA: "D",
  BEGIN_WRITE: "W",
  BEGIN_READ: "R",
});

export const BAUD_NEGOTIATION = Object.freeze([
  Object.freeze({ level: 0, baudRate: 9_600, command: "0" }),
  Object.freeze({ level: 1, baudRate: 19_200, command: "1" }),
  Object.freeze({ level: 2, baudRate: 38_400, command: "2" }),
  Object.freeze({ level: 3, baudRate: 57_600, command: "3" }),
  Object.freeze({ level: 4, baudRate: 115_200, command: "4" }),
]);

const CARD_STATUS = new Map([
  [0x00, { kind: "unknown", writable: false, capacityBytes: null }],
  [0x0f, { kind: "unknown", writable: false, capacityBytes: null }],
  [0x11, { kind: "unknown", writable: false, capacityBytes: null }],
  [0x12, { kind: "read-only", writable: false, capacityBytes: 128 * 1024 }],
  [0x13, { kind: "read-only", writable: false, capacityBytes: 256 * 1024 }],
  [0x14, { kind: "read-only", writable: false, capacityBytes: 512 * 1024 }],
  [0x21, { kind: "read-only", writable: false, capacityBytes: 1024 * 1024 }],
  [0x22, { kind: "original", writable: true, capacityBytes: 128 * 1024 }],
  [0x23, { kind: "original", writable: true, capacityBytes: 256 * 1024 }],
  [0x31, { kind: "original", writable: true, capacityBytes: 512 * 1024 }],
  [0x32, { kind: "original", writable: true, capacityBytes: 128 * 1024 }],
  [0x33, { kind: "original", writable: true, capacityBytes: 256 * 1024 }],
  [0xf0, { kind: "original", writable: true, capacityBytes: 512 * 1024 }],
]);

function asBytes(value, name = "value") {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${name} must be a Uint8Array`);
  }
  return value;
}

/** Return the low eight bits of the unsigned sum of every byte. */
export function additiveChecksum(bytes) {
  asBytes(bytes, "bytes");
  let sum = 0;
  for (const byte of bytes) sum = (sum + byte) & 0xff;
  return sum;
}

/** Append the ECS additive checksum to a payload. */
export function appendChecksum(payload) {
  asBytes(payload, "payload");
  const packet = new Uint8Array(payload.length + 1);
  packet.set(payload);
  packet[payload.length] = additiveChecksum(payload);
  return packet;
}

/** Verify a packet whose final byte is the sum of all preceding bytes modulo 256. */
export function hasValidChecksum(packet) {
  asBytes(packet, "packet");
  return packet.length >= 2 &&
    additiveChecksum(packet.subarray(0, -1)) === packet.at(-1);
}

/** Build a three-byte command such as CT 97 or CW 9a. */
export function buildCommand(command) {
  if (typeof command !== "string" || command.length !== 1) {
    throw new TypeError("command must be one ASCII character");
  }
  const code = command.charCodeAt(0);
  if (code > 0x7f) throw new RangeError("command must be ASCII");
  return appendChecksum(Uint8Array.of(ECS.COMMAND_PREFIX, code));
}

/** Build a baud-change command (C0s through C4w). */
export function buildBaudCommand(level) {
  const setting = BAUD_NEGOTIATION.find((candidate) => candidate.level === level);
  if (!setting) throw new RangeError("baud level must be an integer from 0 through 4");
  return buildCommand(setting.command);
}

/**
 * Build one 132-byte transfer packet:
 *   SOH, block index high, block index low, 128 data bytes, checksum.
 */
export function buildBlockPacket(blockIndex, data) {
  asBytes(data, "data");
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex > 0xffff) {
    throw new RangeError("blockIndex must be an unsigned 16-bit integer");
  }
  if (data.length !== ECS.BLOCK_SIZE) {
    throw new RangeError(`data must contain exactly ${ECS.BLOCK_SIZE} bytes`);
  }

  const payload = new Uint8Array(3 + ECS.BLOCK_SIZE);
  payload[0] = ECS.SOH;
  payload[1] = blockIndex >>> 8;
  payload[2] = blockIndex & 0xff;
  payload.set(data, 3);
  return appendChecksum(payload);
}

/** Validate and decode one 132-byte transfer packet. */
export function parseBlockPacket(packet) {
  asBytes(packet, "packet");
  if (packet.length !== ECS.BLOCK_PACKET_SIZE) {
    throw new RangeError(`packet must contain exactly ${ECS.BLOCK_PACKET_SIZE} bytes`);
  }
  if (packet[0] !== ECS.SOH) throw new Error("packet does not begin with SOH");
  if (!hasValidChecksum(packet)) throw new Error("packet checksum is invalid");

  return {
    blockIndex: (packet[1] << 8) | packet[2],
    data: packet.slice(3, 3 + ECS.BLOCK_SIZE),
  };
}

/** Decode the raw middle byte returned by the CT (card type) command. */
export function decodeCardStatus(rawStatus) {
  if (!Number.isInteger(rawStatus) || rawStatus < 0 || rawStatus > 0xff) {
    throw new RangeError("rawStatus must be one byte");
  }
  const known = CARD_STATUS.get(rawStatus);
  return Object.freeze({
    rawStatus,
    kind: known?.kind ?? "unsupported",
    writable: known?.writable ?? false,
    capacityBytes: known?.capacityBytes ?? null,
  });
}

/** Validate a three-byte A/status/checksum response and decode its middle byte. */
export function parseCardStatusResponse(packet) {
  asBytes(packet, "packet");
  if (packet.length !== 3) throw new RangeError("card status response must be three bytes");
  if (packet[0] !== ECS.RESPONSE_PREFIX) {
    throw new Error("card status response does not begin with the response prefix");
  }
  if (!hasValidChecksum(packet)) throw new Error("card status response checksum is invalid");
  return decodeCardStatus(packet[1]);
}

/** Number of 128-byte blocks used by a supported card capacity. */
export function blockCountForCapacity(capacityBytes) {
  if (!Number.isInteger(capacityBytes) || capacityBytes <= 0 ||
      capacityBytes % ECS.BLOCK_SIZE !== 0) {
    throw new RangeError("capacityBytes must be a positive multiple of 128");
  }
  return capacityBytes / ECS.BLOCK_SIZE;
}
