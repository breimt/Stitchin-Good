// Brother's built-in PEC thread chart. Index zero is an unspecified fallback.
// Values match the chart used by the open-source pyembroidery PEC reader.
const PEC_THREAD_COLORS = Object.freeze([
  "#000000", "#0e1f7c", "#0a55a3", "#008777", "#4b6baf", "#ed171f",
  "#d15c00", "#913697", "#e49acb", "#915fac", "#9ed67d", "#e8a900",
  "#feba35", "#ffff00", "#70bc1f", "#ba9800", "#a8a8a8", "#7d6f00",
  "#ffffb3", "#4f5556", "#000000", "#0b3d91", "#770176", "#293133",
  "#2a1301", "#f64a8a", "#b27624", "#fcbbc5", "#fe370f", "#f0f0f0",
  "#6a1c8a", "#a8ddc4", "#2584bb", "#feb343", "#fff36b", "#d0a660",
  "#d15400", "#66ba49", "#134a46", "#878787", "#d8ccc6", "#435607",
  "#fdd9de", "#f993bc", "#003822", "#b2afd4", "#686ab0", "#efe3b9",
  "#f73866", "#b54b64", "#132b1a", "#c70156", "#fe9e32", "#a8deeb",
  "#00673e", "#4e2990", "#2f7e20", "#ffcccc", "#ffd911", "#095ba6",
  "#f0f970", "#e3f35b", "#ff9900", "#fff08d", "#ffc8c8",
]);

const PEC_THREAD_NAMES = Object.freeze([
  "Unspecified", "Prussian Blue", "Blue", "Teal Green", "Cornflower Blue", "Red",
  "Reddish Brown", "Magenta", "Light Lilac", "Lilac", "Mint Green", "Deep Gold",
  "Orange", "Yellow", "Lime Green", "Brass", "Silver", "Russet Brown",
  "Cream Brown", "Pewter", "Black", "Ultramarine", "Royal Purple", "Dark Gray",
  "Dark Brown", "Deep Rose", "Light Brown", "Salmon Pink", "Vermilion", "White",
  "Violet", "Seacrest", "Sky Blue", "Pumpkin", "Cream Yellow", "Khaki",
  "Clay Brown", "Leaf Green", "Peacock Blue", "Gray", "Warm Gray", "Dark Olive",
  "Flesh Pink", "Pink", "Deep Green", "Lavender", "Wisteria Violet", "Beige",
  "Carmine", "Amber Red", "Olive Green", "Dark Fuchsia", "Tangerine", "Light Blue",
  "Emerald Green", "Purple", "Moss Green", "Flesh Pink", "Harvest Gold", "Electric Blue",
  "Lemon Yellow", "Fresh Green", "Orange", "Cream Yellow", "Applique",
]);

function normalizedIndex(index) {
  if (!Number.isInteger(index)) throw new TypeError("PEC thread index must be an integer");
  return ((index % PEC_THREAD_COLORS.length) + PEC_THREAD_COLORS.length) % PEC_THREAD_COLORS.length;
}

export function pecThreadColor(index) {
  return PEC_THREAD_COLORS[normalizedIndex(index)];
}

export function pecThread(index) {
  const normalized = normalizedIndex(index);
  return Object.freeze({ index: normalized, color: PEC_THREAD_COLORS[normalized], name: PEC_THREAD_NAMES[normalized] });
}

export const PEC_THREADS = Object.freeze({ colors: PEC_THREAD_COLORS, names: PEC_THREAD_NAMES });
