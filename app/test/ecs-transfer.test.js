import assert from "node:assert/strict";
import test from "node:test";

import { buildBlockPacket, buildCommand, COMMAND, ECS } from "../src/protocol/ecs.js";
import { readCardStorage, writeCardStorage } from "../src/protocol/ecs-transfer.js";

class ScriptedChannel {
  constructor(responses) {
    this.responses = responses.map((response) => Uint8Array.from(response));
    this.pending = new Uint8Array();
    this.writes = [];
  }

  async write(bytes) {
    this.writes.push(Uint8Array.from(bytes));
  }

  async readExactly(length) {
    while (this.pending.length < length) {
      const next = this.responses.shift();
      if (!next) throw new Error("scripted response exhausted");
      const combined = new Uint8Array(this.pending.length + next.length);
      combined.set(this.pending);
      combined.set(next, this.pending.length);
      this.pending = combined;
    }
    const result = this.pending.slice(0, length);
    this.pending = this.pending.slice(length);
    return result;
  }
}

function dataBlock(seed) {
  return Uint8Array.from({ length: ECS.BLOCK_SIZE }, (_, index) => (seed + index) & 0xff);
}

test("read state machine validates blocks and stops on terminal ACK", async () => {
  const first = dataBlock(0x10);
  const second = dataBlock(0x80);
  const channel = new ScriptedChannel([
    [ECS.ACK],
    buildBlockPacket(0, first),
    buildBlockPacket(1, second),
    [ECS.ACK],
  ]);
  const progress = [];
  const result = await readCardStorage(channel, {
    maximumBlocks: 10,
    onProgress: (state) => progress.push(state.bytesRead),
  });

  assert.deepEqual(result, new Uint8Array([...first, ...second]));
  assert.deepEqual(progress, [128, 256]);
  assert.deepEqual(channel.writes.map((bytes) => [...bytes]), [
    [...buildCommand(COMMAND.BEGIN_READ)],
    [ECS.ACK],
    [ECS.ACK],
    [ECS.ACK],
  ]);
});

test("read state machine requests retransmission after corrupt data", async () => {
  const data = dataBlock(3);
  const corrupt = buildBlockPacket(0, data);
  corrupt[20] ^= 0xff;
  const channel = new ScriptedChannel([
    [ECS.ACK],
    corrupt,
    buildBlockPacket(0, data),
    [ECS.ACK],
  ]);

  assert.deepEqual(await readCardStorage(channel, { maximumBlocks: 2 }), data);
  assert.deepEqual([...channel.writes[2]], [ECS.NAK]);
});

test("write state machine retries NAK and reports accepted blocks", async () => {
  const image = new Uint8Array([...dataBlock(1), ...dataBlock(2)]);
  const channel = new ScriptedChannel([
    [ECS.ACK],
    [ECS.NAK],
    [ECS.ACK],
    [ECS.ACK],
  ]);
  const progress = [];
  const result = await writeCardStorage(channel, image, {
    onProgress: (state) => progress.push(state.bytesWritten),
  });

  assert.deepEqual(result, { blockCount: 2, bytesWritten: 256 });
  assert.deepEqual(progress, [128, 256]);
  assert.deepEqual([...channel.writes[0]], [...buildCommand(COMMAND.BEGIN_WRITE)]);
  assert.deepEqual(channel.writes[1], channel.writes[2]);
  assert.equal(channel.writes[1].length, ECS.BLOCK_PACKET_SIZE);
  assert.equal(channel.writes[3].length, ECS.BLOCK_PACKET_SIZE);
});

test("write cancellation sends CAN and fails closed", async () => {
  const channel = new ScriptedChannel([[ECS.ACK], [ECS.CAN]]);
  await assert.rejects(() => writeCardStorage(channel, dataBlock(0)), /cancelled/);
  assert.deepEqual([...channel.writes.at(-1)], [ECS.CAN]);
});

test("invalid transfer inputs fail before any command is sent", async () => {
  const channel = new ScriptedChannel([]);
  await assert.rejects(() => writeCardStorage(channel, new Uint8Array(127)), /multiple of 128/);
  await assert.rejects(() => readCardStorage(channel, { maximumBlocks: 0 }), /maximumBlocks/);
  assert.equal(channel.writes.length, 0);
});
