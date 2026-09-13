import { verifyWriteReadback } from "./write-preflight.js";

export const WRITE_SESSION_STATES = Object.freeze({
  IDLE: "idle", CARD_READ: "card-read", BACKUP_SAVED: "backup-saved",
  READY: "ready", CONFIRMED: "confirmed", ERASING: "erasing", WRITING: "writing",
  VERIFYING: "verifying", COMPLETE: "complete", FAILED: "failed", CANCELLED: "cancelled",
});

const transitions = Object.freeze({
  idle: ["card-read"], "card-read": ["backup-saved"], "backup-saved": ["preflight-passed"],
  ready: ["confirmed"], confirmed: ["erase-started"], erasing: ["erase-complete"],
  writing: ["write-complete"], verifying: ["verification-passed"],
});
const nextStates = Object.freeze({
  "card-read": "card-read", "backup-saved": "backup-saved", "preflight-passed": "ready",
  confirmed: "confirmed", "erase-started": "erasing", "erase-complete": "writing",
  "write-complete": "verifying", "verification-passed": "complete",
});

function copyBytes(value, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  return value.slice();
}
function freezeSession(session) {
  return Object.freeze({ ...session, history: Object.freeze([...session.history]) });
}

export function createWriteSession() {
  return freezeSession({ state: "idle", currentCard: null, backup: null, writePackage: null,
    preflight: null, verification: null, error: null, history: [] });
}

/** Pure reducer. No event can skip a destructive-workflow safety gate. */
export function advanceWriteSession(session, event) {
  if (!session || typeof session !== "object") throw new TypeError("session is required");
  if (!event || typeof event.type !== "string") throw new TypeError("event.type is required");
  if (event.type === "cancelled" || event.type === "failed") {
    if (["complete", "cancelled", "failed"].includes(session.state)) {
      throw new Error(`cannot ${event.type} a ${session.state} write session`);
    }
    return freezeSession({ ...session, state: event.type === "failed" ? "failed" : "cancelled",
      error: event.type === "failed" ? String(event.error || "write failed") : session.error,
      history: [...session.history, event.type] });
  }
  if (!transitions[session.state]?.includes(event.type)) {
    throw new Error(`invalid write transition: ${session.state} -> ${event.type}`);
  }
  const updated = { ...session, state: nextStates[event.type], history: [...session.history, event.type] };
  if (event.type === "card-read") updated.currentCard = copyBytes(event.bytes, "bytes");
  if (event.type === "backup-saved") {
    updated.backup = copyBytes(event.bytes, "bytes");
    if (!verifyWriteReadback(session.currentCard, updated.backup).matches) {
      throw new Error("saved backup does not exactly match the latest card read");
    }
  }
  if (event.type === "preflight-passed") {
    if (!event.preflight?.allowed) throw new Error("write preflight has not passed");
    updated.preflight = event.preflight;
    updated.writePackage = copyBytes(event.writePackage, "writePackage");
  }
  if (event.type === "verification-passed") {
    updated.verification = verifyWriteReadback(session.writePackage, event.bytes);
    if (!updated.verification.matches) {
      throw new Error(`read-back differs at byte ${updated.verification.firstMismatch}`);
    }
  }
  return freezeSession(updated);
}

export function maySendErase(session) {
  return session?.state === "confirmed" && session.preflight?.allowed === true;
}
export function maySendWriteBlock(session) {
  return session?.state === "writing" && session.preflight?.allowed === true;
}
