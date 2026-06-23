const IMAGE = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff", "tif", "ico", "avif"]);
const VIDEO = new Set(["mp4", "avi", "mov", "webm", "mkv", "wmv", "flv", "m4v", "mpeg", "mpg"]);
const CATEGORIES = ["image", "video", "other"];

export function extensionOf(filename) {
  const name = String(filename || "");
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function categoryForExtension(ext) {
  if (IMAGE.has(ext)) return "image";
  if (VIDEO.has(ext)) return "video";
  return "other";
}

export function normalizeAllowedTypes(input) {
  if (!input || input === "*") return "*";
  const parts = String(input)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => CATEGORIES.includes(s));
  const uniq = [...new Set(parts)].sort();
  return uniq.length ? uniq.join(",") : "*";
}

export function isTypeAllowed(filename, allowedTypes) {
  if (!allowedTypes || allowedTypes === "*") return true;
  const allowed = new Set(allowedTypes.split(",").map((s) => s.trim()));
  return allowed.has(categoryForExtension(extensionOf(filename)));
}
