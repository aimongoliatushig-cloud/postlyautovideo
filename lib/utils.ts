import path from "node:path";

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function trimText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function forwardSlashes(value: string) {
  return value.split(path.sep).join("/");
}

export function buildPreviewUrl(relativePath: string) {
  const segments = forwardSlashes(relativePath)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  return `/api/media/${segments.join("/")}`;
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
