import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(directoryPath: string) {
  await fs.mkdir(directoryPath, { recursive: true });
  return directoryPath;
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, value: unknown) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function saveUploadedFile(file: File, destinationPath: string) {
  await ensureDir(path.dirname(destinationPath));
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(destinationPath, bytes);
  return destinationPath;
}

export function getStoredAudioExtension(fileName?: string) {
  const extension = path.extname(fileName || ".mp3").toLowerCase();
  if (extension === ".m4a") {
    return ".mp3";
  }
  return extension || ".mp3";
}

export async function listDirectories(parent: string) {
  if (!(await fileExists(parent))) {
    return [];
  }

  const entries = await fs.readdir(parent, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

export async function listFiles(parent: string) {
  if (!(await fileExists(parent))) {
    return [];
  }

  const entries = await fs.readdir(parent, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

export async function removeDirectory(directoryPath: string) {
  if (await fileExists(directoryPath)) {
    await fs.rm(directoryPath, { recursive: true, force: true });
  }
}
