import "server-only";

import path from "node:path";

export function getSystemRoot() {
  return path.join(process.cwd(), "projects", "_system");
}
