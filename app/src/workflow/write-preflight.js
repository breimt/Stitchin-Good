import { validateCardStoragePackage } from "../formats/card-validator.js";
import { ECS } from "../protocol/ecs.js";

function asBytes(value, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  return value;
}

function equalBytes(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function check(id, passed, detail) {
  return Object.freeze({ id, passed: Boolean(passed), detail });
}

/**
 * Evaluate every non-interactive safety condition required before an erase.
 * This never performs I/O and user authorization can never override another gate.
 */
export function evaluateWritePreflight(options) {
  if (!options || typeof options !== "object") throw new TypeError("options are required");
  const currentCard = asBytes(options.currentCard, "currentCard");
  const backup = asBytes(options.backup, "backup");
  const writePackage = asBytes(options.writePackage, "writePackage");
  const status = options.cardStatus;
  if (!status || !Number.isInteger(status.rawStatus) || typeof status.writable !== "boolean") {
    throw new TypeError("cardStatus must be a decoded ECS card status");
  }

  let currentLayout = null;
  let packageLayout = null;
  let currentError = null;
  let packageError = null;
  try { currentLayout = validateCardStoragePackage(currentCard); } catch (error) { currentError = error; }
  try { packageLayout = validateCardStoragePackage(writePackage); } catch (error) { packageError = error; }

  const observedCapacity = currentCard.length;
  const checks = Object.freeze([
    check("authorization", options.userAuthorized === true,
      options.userAuthorized === true ? "User authorized overwriting this card" : "User authorization is required"),
    check("status", status.writable === true,
      status.writable ? `Writable ECS status 0x${status.rawStatus.toString(16).padStart(2, "0")}` :
        `ECS status 0x${status.rawStatus.toString(16).padStart(2, "0")} is not independently proven writable`),
    check("current-layout", Boolean(currentLayout), currentLayout ?
      `${currentLayout.designCount} current designs parsed` : currentError?.message),
    check("backup", equalBytes(currentCard, backup), equalBytes(currentCard, backup) ?
      "Backup exactly matches the latest card read" : "Backup does not match the latest card read"),
    check("package-layout", Boolean(packageLayout), packageLayout ?
      `${packageLayout.designCount} output designs parsed` : packageError?.message),
    check("package-capacity", writePackage.length === observedCapacity && writePackage.length % ECS.BLOCK_SIZE === 0,
      writePackage.length === observedCapacity ? `${writePackage.length} bytes` :
        `Output is ${writePackage.length} bytes; observed card capacity is ${observedCapacity} bytes`),
    check("reported-capacity", status.capacityBytes == null || status.capacityBytes === observedCapacity,
      status.capacityBytes == null || status.capacityBytes === observedCapacity ? "Reported capacity is consistent" :
        `Reported capacity ${status.capacityBytes} conflicts with observed capacity ${observedCapacity}`),
  ]);

  return Object.freeze({
    allowed: checks.every((item) => item.passed),
    observedCapacity,
    currentDesignCount: currentLayout?.designCount ?? null,
    outputDesignCount: packageLayout?.designCount ?? null,
    exactRestore: equalBytes(currentCard, writePackage),
    checks,
    blockers: Object.freeze(checks.filter((item) => !item.passed).map((item) => item.id)),
  });
}

export function assertWritePreflight(options) {
  const result = evaluateWritePreflight(options);
  if (!result.allowed) throw new Error(`write preflight blocked: ${result.blockers.join(", ")}`);
  return result;
}

/** Compare the post-write card read to the exact package that was transmitted. */
export function verifyWriteReadback(expected, actual) {
  asBytes(expected, "expected");
  asBytes(actual, "actual");
  const comparableLength = Math.min(expected.length, actual.length);
  let firstMismatch = null;
  for (let index = 0; index < comparableLength; index += 1) {
    if (expected[index] !== actual[index]) {
      firstMismatch = index;
      break;
    }
  }
  if (firstMismatch == null && expected.length !== actual.length) firstMismatch = comparableLength;
  return Object.freeze({
    matches: firstMismatch == null,
    expectedBytes: expected.length,
    actualBytes: actual.length,
    firstMismatch,
  });
}
