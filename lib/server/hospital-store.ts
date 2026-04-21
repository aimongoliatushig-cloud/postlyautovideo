import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { DoctorMeta, HospitalSummary, VideoMetadata, ContentType } from "@/lib/types";
import { buildPreviewUrl, forwardSlashes, slugify, timestampSlug } from "@/lib/utils";
import { ensureDir, fileExists, listDirectories, readJsonFile, saveUploadedFile, writeJsonFile } from "./filesystem";
import { getSupabaseConfig } from "./env";

const projectsRoot = path.join(process.cwd(), "projects");

export function getProjectsRoot() {
  return projectsRoot;
}

export function getHospitalPaths(hospitalName: string) {
  const hospitalSlug = slugify(hospitalName || "hospital");
  const base = path.join(projectsRoot, hospitalSlug);

  return {
    hospitalSlug,
    hospitalName: hospitalName.trim() || hospitalSlug,
    base,
    doctorsRoot: path.join(base, "doctors"),
    videosRoot: path.join(base, "videos"),
    assetsRoot: path.join(base, "assets"),
    explainerRoot: path.join(base, "videos", "explainer"),
    organTalkRoot: path.join(base, "videos", "organ_talk"),
    doctorLipSyncRoot: path.join(base, "videos", "doctor_lipsync"),
    tempRoot: path.join(base, "videos", "_tmp"),
  };
}

export async function ensureHospital(hospitalName: string) {
  const paths = getHospitalPaths(hospitalName);
  await Promise.all([
    ensureDir(projectsRoot),
    ensureDir(paths.base),
    ensureDir(paths.doctorsRoot),
    ensureDir(paths.assetsRoot),
    ensureDir(paths.explainerRoot),
    ensureDir(paths.organTalkRoot),
    ensureDir(paths.doctorLipSyncRoot),
    ensureDir(paths.tempRoot),
  ]);
  await writeJsonFile(path.join(paths.base, "hospital.json"), {
    slug: paths.hospitalSlug,
    name: paths.hospitalName,
  });
  await syncHospital(paths.hospitalSlug, paths.hospitalName);
  return paths;
}

async function syncHospital(slug: string, name: string) {
  const config = getSupabaseConfig();
  if (!config) {
    return;
  }

  try {
    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false },
    });
    await supabase.from("hospitals").upsert({ slug, name }, { onConflict: "slug" });
  } catch (error) {
    console.error("Failed to sync hospital to Supabase", error);
  }
}

export async function saveDoctorRecord(input: {
  hospitalName: string;
  doctorName: string;
  specialty?: string;
  photo: File;
}) {
  const hospital = await ensureHospital(input.hospitalName);
  const doctorSlug = slugify(input.doctorName || "doctor");
  const directory = path.join(hospital.doctorsRoot, doctorSlug);
  const extension = path.extname(input.photo.name || ".png") || ".png";
  const photoPath = path.join(directory, `photo${extension}`);
  const id = `${hospital.hospitalSlug}-${doctorSlug}`;

  await ensureDir(directory);
  await saveUploadedFile(input.photo, photoPath);

  const record: DoctorMeta = {
    id,
    hospitalName: hospital.hospitalName,
    hospitalSlug: hospital.hospitalSlug,
    name: input.doctorName.trim(),
    slug: doctorSlug,
    specialty: input.specialty?.trim() || undefined,
    photoPath,
    createdAt: new Date().toISOString(),
  };

  await writeJsonFile(path.join(directory, "meta.json"), record);
  await syncDoctor(record);
  return record;
}

async function syncDoctor(doctor: DoctorMeta) {
  const config = getSupabaseConfig();
  if (!config) {
    return;
  }

  try {
    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false },
    });
    await supabase.from("doctors").upsert(
      {
        id: doctor.id,
        hospital_slug: doctor.hospitalSlug,
        name: doctor.name,
        specialty: doctor.specialty ?? null,
        photo_path: forwardSlashes(path.relative(process.cwd(), doctor.photoPath)),
      },
      { onConflict: "id" },
    );
  } catch (error) {
    console.error("Failed to sync doctor to Supabase", error);
  }
}

export async function getDoctorById(hospitalName: string, doctorId: string) {
  const hospital = getHospitalPaths(hospitalName);
  const doctorFolders = await listDirectories(hospital.doctorsRoot);
  for (const folder of doctorFolders) {
    const metaPath = path.join(hospital.doctorsRoot, folder, "meta.json");
    const doctor = await readJsonFile<DoctorMeta | null>(metaPath, null);
    if (doctor?.id === doctorId) {
      return doctor;
    }
  }
  return null;
}

export async function saveHospitalAssets(input: {
  hospitalName: string;
  outro?: File | null;
  brandFrame?: File | null;
}) {
  const hospital = await ensureHospital(input.hospitalName);

  if (input.outro) {
    const extension = path.extname(input.outro.name || ".mp4") || ".mp4";
    await saveUploadedFile(input.outro, path.join(hospital.assetsRoot, `outro${extension}`));
    if (extension !== ".mp4") {
      await fs.rename(
        path.join(hospital.assetsRoot, `outro${extension}`),
        path.join(hospital.assetsRoot, "outro.mp4"),
      );
    }
  }

  if (input.brandFrame) {
    const extension = path.extname(input.brandFrame.name || ".png") || ".png";
    await saveUploadedFile(input.brandFrame, path.join(hospital.assetsRoot, `brand_frame${extension}`));
    if (extension !== ".png") {
      await fs.rename(
        path.join(hospital.assetsRoot, `brand_frame${extension}`),
        path.join(hospital.assetsRoot, "brand_frame.png"),
      );
    }
  }

  return getHospitalAssets(input.hospitalName);
}

export async function getHospitalAssets(hospitalName: string) {
  const hospital = await ensureHospital(hospitalName);
  const outroPath = path.join(hospital.assetsRoot, "outro.mp4");
  const brandFramePath = path.join(hospital.assetsRoot, "brand_frame.png");

  return {
    outroPath,
    brandFramePath,
    hasOutro: await fileExists(outroPath),
    hasBrandFrame: await fileExists(brandFramePath),
  };
}

export async function saveVideoRecord(input: Omit<VideoMetadata, "previewUrl">) {
  const hospital = await ensureHospital(input.hospitalName);
  const typeDirectory = resolveVideoDirectory(hospital, input.type);
  const metadataFile = path.join(typeDirectory, `${input.fileName}.json`);

  const record: VideoMetadata = {
    ...input,
    previewUrl: buildPreviewUrl(input.relativePath),
  };

  await writeJsonFile(metadataFile, record);
  await syncVideo(record);
  return record;
}

function resolveVideoDirectory(
  hospital: Awaited<ReturnType<typeof ensureHospital>>,
  type: ContentType,
) {
  if (type === "explainer") {
    return hospital.explainerRoot;
  }
  if (type === "organ_talk") {
    return hospital.organTalkRoot;
  }
  return hospital.doctorLipSyncRoot;
}

async function syncVideo(video: VideoMetadata) {
  const config = getSupabaseConfig();
  if (!config) {
    return;
  }

  try {
    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false },
    });
    await supabase.from("videos").upsert(
      {
        id: video.id,
        hospital_slug: video.hospitalSlug,
        type: video.type,
        topic: video.topic ?? null,
        doctor_id: video.doctorId ?? null,
        doctor_name: video.doctorName ?? null,
        duration_seconds: video.durationSeconds,
        relative_path: video.relativePath,
        file_name: video.fileName,
        script_summary: video.scriptSummary ?? null,
        created_at: video.createdAt,
      },
      { onConflict: "id" },
    );
  } catch (error) {
    console.error("Failed to sync video to Supabase", error);
  }
}

export async function listHospitalSummaries(): Promise<HospitalSummary[]> {
  await ensureDir(projectsRoot);
  const hospitalSlugs = (await listDirectories(projectsRoot)).filter(
    (slug) => !slug.startsWith(".") && !slug.startsWith("_"),
  );
  const hospitals = await Promise.all(
    hospitalSlugs.map(async (hospitalSlug) => {
      const base = path.join(projectsRoot, hospitalSlug);
      const hospitalMeta = await readJsonFile<{ name?: string }>(path.join(base, "hospital.json"), {});
      const doctors = await readDoctors(hospitalSlug);
      const videos = await readVideos(hospitalSlug);
      const assets = {
        hasOutro: await fileExists(path.join(base, "assets", "outro.mp4")),
        hasBrandFrame: await fileExists(path.join(base, "assets", "brand_frame.png")),
      };

      return {
        name: hospitalMeta.name ?? doctors[0]?.hospitalName ?? hospitalSlug,
        slug: hospitalSlug,
        doctors,
        videos: videos.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        assets,
      } satisfies HospitalSummary;
    }),
  );

  return hospitals.sort((left, right) => left.name.localeCompare(right.name));
}

async function readDoctors(hospitalSlug: string) {
  const doctorRoot = path.join(projectsRoot, hospitalSlug, "doctors");
  const folders = await listDirectories(doctorRoot);
  const doctors = await Promise.all(
    folders.map((folder) =>
      readJsonFile<DoctorMeta | null>(path.join(doctorRoot, folder, "meta.json"), null),
    ),
  );

  return doctors
    .filter((doctor): doctor is DoctorMeta => Boolean(doctor))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readVideos(hospitalSlug: string) {
  const videoRoot = path.join(projectsRoot, hospitalSlug, "videos");
  const videoTypes = ["explainer", "organ_talk", "doctor_lipsync"] as const;
  const records: VideoMetadata[] = [];

  for (const type of videoTypes) {
    const typeRoot = path.join(videoRoot, type);
    if (!(await fileExists(typeRoot))) {
      continue;
    }

    const files = await fs.readdir(typeRoot, { withFileTypes: true });
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const record = await readJsonFile<VideoMetadata | null>(path.join(typeRoot, entry.name), null);
      if (record) {
        records.push({
          ...record,
          previewUrl: buildPreviewUrl(record.relativePath),
        });
      }
    }
  }

  return records;
}

export function createVideoFileName(prefix = "video") {
  return `${prefix}_${timestampSlug()}`;
}
