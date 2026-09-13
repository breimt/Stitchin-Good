import assert from "node:assert/strict";
import test from "node:test";
import { findKnownEcsSerialAdapter, identifyEcsSerialAdapter, normalizeUsbId }
  from "../src/protocol/serial-device.js";

test("USB identifiers normalize across Electron platform representations", () => {
  assert.equal(normalizeUsbId(0x067b), "067b");
  assert.equal(normalizeUsbId("067B"), "067b");
  assert.equal(normalizeUsbId("0x23A3"), "23a3");
  assert.equal(normalizeUsbId("7b"), "007b");
  assert.equal(normalizeUsbId("not-an-id"), null);
});

test("known ECS serial adapters match Web Serial and Electron port shapes", () => {
  assert.equal(identifyEcsSerialAdapter({ usbVendorId: 0x067b, usbProductId: 0x23a3 }).name,
    "Prolific PL2303GT");
  assert.equal(identifyEcsSerialAdapter({ vendorId: "067B", productId: "23A3" }).name,
    "Prolific PL2303GT");
  assert.equal(identifyEcsSerialAdapter({ vendorId: "1", productId: "2" }), null);
  assert.deepEqual(findKnownEcsSerialAdapter([
    { vendorId: "0001", productId: "0002" },
    { vendorId: "1659", productId: "9123", portId: "ecs" },
  ]), { vendorId: "1659", productId: "9123", portId: "ecs" });
});
