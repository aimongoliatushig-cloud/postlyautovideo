import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { GenerationJob } from "@/lib/types";
import { slugify, timestampSlug } from "@/lib/utils";
import {
  ensureDir,
  fileExists,
  getStoredAudioExtension,
  readJsonFile,
  saveUploadedFile,
  writeJsonFile,
} from "./filesystem";
import { getSystemRoot } from "./system-paths";

const jobsRoot = path.join(getSystemRoot(), "jobs");
const activeJobs = new Set<string>();

function getJobPath(jobId: string) {
  return path.join(jobsRoot, `${jobId}.json`);
}

function appendProcessMessage(existing: string[] | undefined, nextMessage: string | undefined) {
  const messages = existing ? [...existing] : [];

  if (!nextMessage) {
    return messages;
  }

  const trimmed = nextMessage.trim();
  if (!trimmed) {
    return messages;
  }

  if (messages.at(-1) !== trimmed) {
    messages.push(trimmed);
  }

  return messages;
}

export async function createGenerationJob(input: {
  hospitalName: string;
  contentType: GenerationJob["contentType"];
  topic?: string;
  doctorId?: string;
  doctorName?: string;
  audioFile?: File | null;
}) {
  await ensureDir(jobsRoot);
  const createdAt = new Date().toISOString();
  const id = `${slugify(input.hospitalName || "hospital")}-${input.contentType}-${timestampSlug()}`;
  const jobDirectory = path.join(jobsRoot, id);
  await ensureDir(jobDirectory);

  let audioPath: string | undefined;
  if (input.audioFile) {
    const extension = getStoredAudioExtension(input.audioFile.name);
    audioPath = path.join(jobDirectory, `audio${extension}`);
    await saveUploadedFile(input.audioFile, audioPath);
  }

  const initialMessage = "Даалгавар хүлээгдэж байна.";
  const job: GenerationJob = {
    id,
    hospitalName: input.hospitalName.trim(),
    hospitalSlug: slugify(input.hospitalName || "hospital"),
    contentType: input.contentType,
    topic: input.topic?.trim() || undefined,
    doctorId: input.doctorId?.trim() || undefined,
    doctorName: input.doctorName?.trim() || undefined,
    audioPath,
    status: "queued",
    message: initialMessage,
    processMessages: [initialMessage],
    progressPercent: 0,
    createdAt,
    updatedAt: createdAt,
  };

  await writeJsonFile(getJobPath(id), job);
  return job;
}

export async function getGenerationJob(jobId: string) {
  await ensureDir(jobsRoot);
  return readJsonFile<GenerationJob | null>(getJobPath(jobId), null);
}

export async function updateGenerationJob(
  jobId: string,
  patch: Partial<Omit<GenerationJob, "id" | "createdAt">>,
) {
  const current = await getGenerationJob(jobId);
  if (!current) {
    throw new Error(`"${jobId}" даалгавар олдсонгүй.`);
  }

  const processMessages =
    patch.processMessages ??
    appendProcessMessage(current.processMessages ?? [current.message], patch.message);

  const next: GenerationJob = {
    ...current,
    ...patch,
    processMessages,
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFile(getJobPath(jobId), next);
  return next;
}

export function markJobActive(jobId: string) {
  if (activeJobs.has(jobId)) {
    return false;
  }
  activeJobs.add(jobId);
  return true;
}

export function markJobInactive(jobId: string) {
  activeJobs.delete(jobId);
}

export async function listRecentJobs(limit = 10) {
  await ensureDir(jobsRoot);
  const entries = await fs.readdir(jobsRoot, { withFileTypes: true });
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readJsonFile<GenerationJob | null>(path.join(jobsRoot, entry.name), null)),
  );

  return jobs
    .filter((job): job is GenerationJob => Boolean(job))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function deleteJobArtifacts(jobId: string) {
  const jobDirectory = path.join(jobsRoot, jobId);
  if (await fileExists(jobDirectory)) {
    await fs.rm(jobDirectory, { recursive: true, force: true });
  }
}
