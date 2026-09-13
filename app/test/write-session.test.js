import assert from "node:assert/strict";
import test from "node:test";
import { advanceWriteSession, createWriteSession, maySendErase, maySendWriteBlock,
  WRITE_SESSION_STATES } from "../src/workflow/write-session.js";

const bytes = () => new Uint8Array([1, 2, 3, 4]);
const passed = Object.freeze({ allowed: true, blockers: Object.freeze([]) });
function readySession() {
  let session = advanceWriteSession(createWriteSession(), { type: "card-read", bytes: bytes() });
  session = advanceWriteSession(session, { type: "backup-saved", bytes: bytes() });
  return advanceWriteSession(session, { type: "preflight-passed", preflight: passed,
    writePackage: bytes() });
}

test("guarded session requires every destructive workflow state in order", () => {
  let session = readySession();
  assert.equal(session.state, WRITE_SESSION_STATES.READY);
  assert.equal(maySendErase(session), false);
  session = advanceWriteSession(session, { type: "confirmed" });
  assert.equal(maySendErase(session), true);
  session = advanceWriteSession(session, { type: "erase-started" });
  session = advanceWriteSession(session, { type: "erase-complete" });
  assert.equal(maySendWriteBlock(session), true);
  session = advanceWriteSession(session, { type: "write-complete" });
  assert.equal(maySendWriteBlock(session), false);
  session = advanceWriteSession(session, { type: "verification-passed", bytes: bytes() });
  assert.equal(session.state, WRITE_SESSION_STATES.COMPLETE);
  assert.equal(session.history.length, 8);
});

test("guarded session rejects skipped gates and blocked preflight", () => {
  assert.throws(() => advanceWriteSession(createWriteSession(), { type: "confirmed" }),
    /invalid write transition/);
  let session = advanceWriteSession(createWriteSession(), { type: "card-read", bytes: bytes() });
  assert.throws(() => advanceWriteSession(session, { type: "backup-saved",
    bytes: new Uint8Array([9]) }), /does not exactly match/);
  session = advanceWriteSession(session, { type: "backup-saved", bytes: bytes() });
  assert.throws(() => advanceWriteSession(session, { type: "preflight-passed",
    preflight: { allowed: false }, writePackage: bytes() }), /has not passed/);
});

test("read-back mismatch cannot complete the session", () => {
  let session = readySession();
  for (const type of ["confirmed", "erase-started", "erase-complete", "write-complete"]) {
    session = advanceWriteSession(session, { type });
  }
  assert.throws(() => advanceWriteSession(session, { type: "verification-passed",
    bytes: new Uint8Array([1, 2, 0, 4]) }), /differs at byte 2/);
  assert.equal(session.state, WRITE_SESSION_STATES.VERIFYING);
});

test("cancel and failure are terminal", () => {
  const cancelled = advanceWriteSession(readySession(), { type: "cancelled" });
  assert.equal(cancelled.state, WRITE_SESSION_STATES.CANCELLED);
  assert.throws(() => advanceWriteSession(cancelled, { type: "confirmed" }), /invalid write transition/);
  const failed = advanceWriteSession(readySession(), { type: "failed", error: "serial lost" });
  assert.equal(failed.state, WRITE_SESSION_STATES.FAILED);
  assert.equal(failed.error, "serial lost");
});
