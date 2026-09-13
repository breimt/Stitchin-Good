export const KNOWN_ECS_ADAPTERS = Object.freeze([
  Object.freeze({ vendorId: "067b", productId: "23a3", name: "Prolific PL2303GT" }),
  Object.freeze({ vendorId: "1659", productId: "9123", name: "Prolific/ATEN serial adapter" }),
]);

export function normalizeUsbId(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 0xffff) {
    return value.toString(16).padStart(4, "0");
  }
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,4}$/.test(cleaned)) return null;
  return cleaned.padStart(4, "0");
}

function ids(device) {
  return {
    vendorId: normalizeUsbId(device?.usbVendorId ?? device?.vendorId),
    productId: normalizeUsbId(device?.usbProductId ?? device?.productId),
  };
}

export function identifyEcsSerialAdapter(device) {
  const actual = ids(device);
  return KNOWN_ECS_ADAPTERS.find((adapter) =>
    adapter.vendorId === actual.vendorId && adapter.productId === actual.productId) ?? null;
}

export function findKnownEcsSerialAdapter(devices) {
  if (!Array.isArray(devices)) throw new TypeError("devices must be an array");
  return devices.find((device) => identifyEcsSerialAdapter(device)) ?? null;
}
