import assert from "node:assert/strict";
import test from "node:test";
import { readCardStorage } from "../src/protocol/ecs-transfer.js";
import { buildBlockPacket, ECS } from "../src/protocol/ecs.js";
import { bytesToHex, createReplayChannel, createTranscriptChannel, hexToBytes }
  from "../src/protocol/ecs-trace.js";

class MemoryChannel {
  constructor(rx) { this.rx = rx.map((value) => Uint8Array.from(value)); this.tx = []; }
  async write(bytes) { this.tx.push(bytes.slice()); }
  async readExactly(length) {
    const value = this.rx.shift();
    if (!value || value.length !== length) throw new Error("unexpected read size");
    return value;
  }
}

test("hex codec round-trips protocol bytes and rejects malformed input", () => {
  const bytes = Uint8Array.of(0x00, 0x06, 0x9a, 0xff);
  assert.deepEqual(hexToBytes(bytesToHex(bytes)), bytes);
  assert.throws(() => hexToBytes("123"), /complete hexadecimal/);
  assert.throws(() => hexToBytes("xx"), /complete hexadecimal/);
});

test("recorded card-read transcript replays through the real state machine", async () => {
  const data = Uint8Array.from({ length: ECS.BLOCK_SIZE }, (_, index) => index);
  const packet = buildBlockPacket(0, data);
  const live = new MemoryChannel([[ECS.ACK], [packet[0]], packet.slice(1), [ECS.ACK]]);
  const entries = [];
  const recorded = await readCardStorage(createTranscriptChannel(live, entries), { maximumBlocks: 2 });
  assert.deepEqual(recorded, data);

  const replay = createReplayChannel(entries);
  assert.deepEqual(await readCardStorage(replay, { maximumBlocks: 2 }), data);
  replay.assertComplete();
});

test("replay fails at the first changed transmitted byte or unread entry", async () => {
  const replay = createReplayChannel([{ direction: "tx", hex: "435299" }]);
  await assert.rejects(() => replay.write(Uint8Array.of(0x43, 0x52, 0x00)), /TX mismatch/);
  const unread = createReplayChannel([{ direction: "rx", hex: "06" }]);
  assert.throws(() => unread.assertComplete(), /unread data/);
});
