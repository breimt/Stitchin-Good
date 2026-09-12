import assert from "node:assert/strict";
import test from "node:test";

import {
  BAUD_NEGOTIATION,
  COMMAND,
  ECS,
  additiveChecksum,
  appendChecksum,
  blockCountForCapacity,
  buildBaudCommand,
  buildBlockPacket,
  buildCommand,
  decodeCardStatus,
  hasValidChecksum,
  parseBlockPacket,
  parseCardStatusResponse,
} from "../src/protocol/ecs.js";

test("command packets match bytes recovered from Palette 3", () => {
  assert.deepEqual([...buildCommand(COMMAND.IDENTIFY)], [0x43, 0x49, 0x8c]);
  assert.deepEqual([...buildCommand(COMMAND.VERSION)], [0x43, 0x56, 0x99]);
  assert.deepEqual([...buildCommand(COMMAND.CARD_TYPE)], [0x43, 0x54, 0x97]);
  assert.deepEqual([...buildCommand(COMMAND.ERASE)], [0x43, 0x45, 0x88]);
  assert.deepEqual([...buildCommand(COMMAND.DEVICE_DATA)], [0x43, 0x44, 0x87]);
  assert.deepEqual([...buildCommand(COMMAND.BEGIN_WRITE)], [0x43, 0x57, 0x9a]);
  assert.deepEqual([...buildCommand(COMMAND.BEGIN_READ)], [0x43, 0x52, 0x95]);
});

test("baud commands match Palette 3 negotiation packets", () => {
  const expected = [
    [0x43, 0x30, 0x73],
    [0x43, 0x31, 0x74],
    [0x43, 0x32, 0x75],
    [0x43, 0x33, 0x76],
    [0x43, 0x34, 0x77],
  ];
  assert.deepEqual(BAUD_NEGOTIATION.map(({ level }) => [...buildBaudCommand(level)]), expected);
});

test("additive checksums wrap at eight bits", () => {
  assert.equal(additiveChecksum(Uint8Array.of(0xff, 0x02)), 0x01);
  assert.deepEqual([...appendChecksum(Uint8Array.of(0xff, 0x02))], [0xff, 0x02, 0x01]);
});

test("block packets round-trip all 128 data bytes", () => {
  const data = Uint8Array.from({ length: ECS.BLOCK_SIZE }, (_, index) => index);
  const packet = buildBlockPacket(0x1234, data);

  assert.equal(packet.length, 132);
  assert.deepEqual([...packet.subarray(0, 3)], [0x01, 0x12, 0x34]);
  assert.equal(hasValidChecksum(packet), true);

  const parsed = parseBlockPacket(packet);
  assert.equal(parsed.blockIndex, 0x1234);
  assert.deepEqual(parsed.data, data);
});

test("corrupt block packets are rejected", () => {
  const packet = buildBlockPacket(7, new Uint8Array(ECS.BLOCK_SIZE));
  packet[20] ^= 0xff;
  assert.equal(hasValidChecksum(packet), false);
  assert.throws(() => parseBlockPacket(packet), /checksum/);
});

test("writable status codes expose the capacities Palette 3 accepts", () => {
  assert.deepEqual(decodeCardStatus(0x22), {
    rawStatus: 0x22,
    kind: "original",
    writable: true,
    capacityBytes: 128 * 1024,
  });
  assert.equal(decodeCardStatus(0x23).capacityBytes, 256 * 1024);
  assert.equal(decodeCardStatus(0x31).capacityBytes, 512 * 1024);
  assert.equal(decodeCardStatus(0xf0).capacityBytes, 512 * 1024);
  assert.equal(decodeCardStatus(0x14).writable, false);
});

test("live CT response follows Palette's static status mapping", () => {
  assert.deepEqual(parseCardStatusResponse(Uint8Array.of(0x41, 0x21, 0x62)), {
    rawStatus: 0x21,
    kind: "read-only",
    writable: false,
    capacityBytes: 1024 * 1024,
  });
});

test("capacity converts to the observed 128-byte block counts", () => {
  assert.equal(blockCountForCapacity(128 * 1024), 1024);
  assert.equal(blockCountForCapacity(256 * 1024), 2048);
  assert.equal(blockCountForCapacity(512 * 1024), 4096);
});

test("invalid inputs fail closed", () => {
  assert.throws(() => buildCommand("WRITE"), /one ASCII character/);
  assert.throws(() => buildBaudCommand(5), /0 through 4/);
  assert.throws(() => buildBlockPacket(-1, new Uint8Array(128)), /unsigned 16-bit/);
  assert.throws(() => buildBlockPacket(0, new Uint8Array(127)), /exactly 128/);
  assert.throws(() => blockCountForCapacity(129), /multiple of 128/);
});
