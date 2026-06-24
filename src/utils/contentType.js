export const CONTENT_TYPE_MAP = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
  mp4: "video/mp4", avi: "video/x-msvideo", mov: "video/quicktime", webm: "video/webm",
  html: "text/html", htm: "text/html",
};
export function getContentType(ext) {
  return CONTENT_TYPE_MAP[ext] || "application/octet-stream";
}
