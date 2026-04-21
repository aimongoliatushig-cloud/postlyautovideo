import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { type ContentType, type VideoMetadata } from "@/lib/types";
import { buildPreviewUrl, forwardSlashes, serializeError, timestampSlug, trimText } from "@/lib/utils";
import {
  ensureDir,
  getStoredAudioExtension,
  saveUploadedFile,
} from "./filesystem";
import {
  createVideoFileName,
  ensureHospital,
  getDoctorById,
  getHospitalAssets,
  saveVideoRecord,
} from "./hospital-store";
import { KieClient } from "./kie-client";
import { buildDoctorVisualPlan, buildExplainerScript, buildOrganTalkScript } from "./script-engine";
import {
  appendOutro,
  buildImageSlideshow,
  buildSplitScreen,
  concatVideos,
  decorateVerticalSegment,
  ensureAmbientMusic,
  ensureDefaultOutro,
  mixBackgroundMusic,
  normalizeVerticalVideo,
  overlayBrandFrame,
  probeDuration,
  splitAudioIntoChunks,
} from "./media-toolkit";

type GenerateInput = {
  jobId?: string;
  hospitalName: string;
  contentType: ContentType;
  topic?: string;
  doctorId?: string;
  audioFile?: File | null;
  audioPath?: string;
  progress?: (update: { message: string; progressPercent: number }) => Promise<void> | void;
};

export async function generateHealthcareVideo(input: GenerateInput) {
  if (input.contentType === "explainer") {
    return generateExplainerVideo(input.hospitalName, input.topic ?? "", input.progress, input.jobId);
  }

  if (input.contentType === "organ_talk") {
    return generateOrganTalkVideo(input.hospitalName, input.topic ?? "", input.progress, input.jobId);
  }

  return generateDoctorLipSyncVideo(input);
}

async function generateExplainerVideo(
  hospitalName: string,
  topic: string,
  progress?: GenerateInput["progress"],
  jobId?: string,
) {
  const script = await buildExplainerScript(topic);
  return generateScriptedReel(hospitalName, "explainer", script, progress, jobId);
}

async function generateOrganTalkVideo(
  hospitalName: string,
  topic: string,
  progress?: GenerateInput["progress"],
  jobId?: string,
) {
  const script = await buildOrganTalkScript(topic);
  return generateScriptedReel(hospitalName, "organ_talk", script, progress, jobId);
}

async function generateScriptedReel(
  hospitalName: string,
  type: "explainer" | "organ_talk",
  script: Awaited<ReturnType<typeof buildExplainerScript>> | Awaited<ReturnType<typeof buildOrganTalkScript>>,
  progress?: GenerateInput["progress"],
  jobId?: string,
) {
  const hospital = await ensureHospital(hospitalName);
  const fileName = createVideoFileName("video");
  const tempDir = path.join(hospital.tempRoot, jobId ?? `${type}-${timestampSlug()}`);
  const kie = new KieClient();
  const decoratedSegments: string[] = [];
  const taskIds: string[] = [];
  const segmentCount = script.segments.length;

  await ensureDir(tempDir);

  try {
    await progress?.({
      message: "Скрипт бэлэн боллоо. Дүрслэлүүдийг бэлтгэж байна...",
      progressPercent: 8,
    });

    for (const segment of script.segments) {
      await progress?.({
        message: `${segment.index}/${segmentCount}: лавлах зураг үүсгэж байна...`,
        progressPercent: computeScriptedProgress(segment.index - 1, 0, segmentCount),
      });
      const imageResult = await kie.generateNanoBanana(segment.imagePrompt);
      taskIds.push(imageResult.taskId);

      const imagePath = path.join(tempDir, `image-${segment.index}.png`);
      await kie.downloadAsset(imageResult.url, imagePath);

      await progress?.({
        message: `${segment.index}/${segmentCount}: Veo клип үүсгэж байна...`,
        progressPercent: computeScriptedProgress(segment.index - 1, 1, segmentCount),
      });
      const videoResult = await kie.generateVeo({
        prompt: segment.videoPrompt,
        imageUrls: [imageResult.url],
        generationType: "REFERENCE_2_VIDEO",
      });
      taskIds.push(videoResult.taskId);

      const rawVideoPath = path.join(tempDir, `raw-${segment.index}.mp4`);
      const decoratedPath = path.join(tempDir, `decorated-${segment.index}.mp4`);
      await kie.downloadAsset(videoResult.url, rawVideoPath);
      await decorateVerticalSegment(
        rawVideoPath,
        imagePath,
        segment.title,
        trimText(segment.narration, 110),
        decoratedPath,
      );
      decoratedSegments.push(decoratedPath);
    }

    await progress?.({
      message: "Үүсгэсэн хэсгүүдийг нэгтгэж байна...",
      progressPercent: 72,
    });
    const mergedPath = path.join(tempDir, "merged.mp4");
    await concatVideos(decoratedSegments, mergedPath);

    return finalizeVideo({
      hospitalName,
      hospital,
      sourceVideoPath: mergedPath,
      type,
      fileName,
      topic: script.topic,
      scriptSummary: script.fullText,
      taskIds,
      progress,
    });
  } catch (error) {
    throw new Error(`Видео үүсгэх үе шат алдаа өглөө: ${serializeError(error)}`);
  }
}

async function generateDoctorLipSyncVideo(input: GenerateInput) {
  if (!input.audioFile && !input.audioPath) {
    throw new Error("Эмчийн видео үүсгэхэд аудио файл шаардлагатай.");
  }

  if (!input.doctorId) {
    throw new Error("Эмчийн видео үүсгэхэд эмч сонгосон байх шаардлагатай.");
  }

  const hospital = await ensureHospital(input.hospitalName);
  const doctor = await getDoctorById(input.hospitalName, input.doctorId);
  if (!doctor) {
    throw new Error("Сонгосон эмч олдсонгүй.");
  }

  const kie = new KieClient();
  const fileName = createVideoFileName("video");
  const tempDir = path.join(hospital.tempRoot, input.jobId ?? `doctor-${timestampSlug()}`);
  const taskIds: string[] = [];
  const plan = await buildDoctorVisualPlan(input.topic ?? doctor.specialty ?? doctor.name, doctor.specialty);

  await ensureDir(tempDir);

  try {
    let sourceAudioPath = input.audioPath;
    if (!sourceAudioPath && input.audioFile) {
      const audioExtension = getStoredAudioExtension(input.audioFile.name);
      sourceAudioPath = path.join(tempDir, `source${audioExtension}`);
      await saveUploadedFile(input.audioFile, sourceAudioPath);
    }

    if (!sourceAudioPath) {
      throw new Error("Аудио эх файл олдсонгүй.");
    }

    await input.progress?.({
      message: "Аудиог 14 секундээс ихгүй хэсгүүдэд хувааж бэлтгэж байна...",
      progressPercent: 10,
    });
    const chunkDir = path.join(tempDir, "chunks");
    const chunks = await splitAudioIntoChunks(sourceAudioPath, chunkDir, 14);
    if (chunks.length === 0) {
      throw new Error("Аудиог хэсэглэхэд алдаа гарлаа.");
    }

    await input.progress?.({
      message: `${chunks.length} аудио хэсэг үүслээ. Хэсэг бүрт InfinityTalk ажиллуулж байна...`,
      progressPercent: 14,
    });

    const lipSyncSegments: string[] = [];
    for (const [index, chunkPath] of chunks.entries()) {
      await input.progress?.({
        message: `${index + 1}/${chunks.length}: энэ хэсэгт InfinityTalk lip-sync үүсгэж байна...`,
        progressPercent: computeDoctorProgress({
          chunkIndex: index,
          totalChunks: chunks.length,
          visualIndex: 0,
          totalVisuals: plan.imagePrompts.length,
          phase: "lipsync",
        }),
      });

      const lipResult = await kie.generateInfinityTalk({
        imagePath: doctor.photoPath,
        audioPath: chunkPath,
        prompt: `${plan.topic} сэдвээр тайван, итгэл төрүүлэх өнгөөр ярьж буй монгол эмч, эмнэлгийн орчин.`,
      });
      taskIds.push(lipResult.taskId);

      const rawSegmentPath = path.join(tempDir, `lipsync-${index + 1}.mp4`);
      const normalizedSegmentPath = path.join(tempDir, `lipsync-${index + 1}-vertical.mp4`);
      await kie.downloadAsset(lipResult.url, rawSegmentPath);
      await normalizeVerticalVideo(rawSegmentPath, normalizedSegmentPath);
      lipSyncSegments.push(normalizedSegmentPath);
    }

    await input.progress?.({
      message: "Lip-sync клипүүдийг зөв дарааллаар нь нэгтгэж байна...",
      progressPercent: computeDoctorProgress({
        chunkIndex: chunks.length,
        totalChunks: chunks.length,
        visualIndex: 0,
        totalVisuals: plan.imagePrompts.length,
        phase: "merge-lipsync",
      }),
    });
    const mergedLipSyncPath = path.join(tempDir, "merged-lipsync.mp4");
    await concatVideos(lipSyncSegments, mergedLipSyncPath);
    const lipSyncDuration = await probeDuration(mergedLipSyncPath);

    const visualImages: string[] = [];
    for (const [index, imagePrompt] of plan.imagePrompts.entries()) {
      await input.progress?.({
        message: `${index + 1}/${plan.imagePrompts.length}: дээд талын NanoBanana дүрслэл үүсгэж байна...`,
        progressPercent: computeDoctorProgress({
          chunkIndex: chunks.length,
          totalChunks: chunks.length,
          visualIndex: index,
          totalVisuals: plan.imagePrompts.length,
          phase: "visual",
        }),
      });
      const imageResult = await kie.generateNanoBanana(imagePrompt);
      taskIds.push(imageResult.taskId);
      const imagePath = path.join(tempDir, `visual-${index + 1}.png`);
      await kie.downloadAsset(imageResult.url, imagePath);
      visualImages.push(imagePath);
    }

    await input.progress?.({
      message: "Дээд дүрслэл ба эмчийн видеог split-screen болгож угсарч байна...",
      progressPercent: computeDoctorProgress({
        chunkIndex: chunks.length,
        totalChunks: chunks.length,
        visualIndex: plan.imagePrompts.length,
        totalVisuals: plan.imagePrompts.length,
        phase: "split-screen",
      }),
    });
    const slideshowPath = path.join(tempDir, "top-visuals.mp4");
    const splitScreenPath = path.join(tempDir, "split-screen.mp4");
    await buildImageSlideshow(visualImages, lipSyncDuration, slideshowPath);
    await buildSplitScreen(slideshowPath, mergedLipSyncPath, splitScreenPath);

    return finalizeVideo({
      hospitalName: input.hospitalName,
      hospital,
      sourceVideoPath: splitScreenPath,
      type: "doctor_lipsync",
      fileName,
      topic: plan.topic,
      doctorId: doctor.id,
      doctorName: doctor.name,
      scriptSummary: `${plan.topic} сэдвийн lip-sync split-screen видео`,
      taskIds,
      progress: input.progress,
    });
  } catch (error) {
    throw new Error(`Эмчийн видео үүсгэх үе шат алдаа өглөө: ${serializeError(error)}`);
  }
}

async function finalizeVideo(input: {
  hospitalName: string;
  hospital: Awaited<ReturnType<typeof ensureHospital>>;
  sourceVideoPath: string;
  type: ContentType;
  fileName: string;
  topic?: string;
  doctorId?: string;
  doctorName?: string;
  scriptSummary?: string;
  taskIds?: string[];
  progress?: GenerateInput["progress"];
}) {
  const tempDir = path.dirname(input.sourceVideoPath);
  const musicPath = path.join(tempDir, "music.mp3");
  const withMusicPath = path.join(tempDir, "with-music.mp4");
  const withOutroPath = path.join(tempDir, "with-outro.mp4");
  const brandedPath = path.join(tempDir, "branded.mp4");
  const assets = await getHospitalAssets(input.hospitalName);

  const sourceDuration = await probeDuration(input.sourceVideoPath);
  await input.progress?.({ message: "Арын хөгжим үүсгэж байна...", progressPercent: 80 });
  await ensureAmbientMusic(Math.max(sourceDuration, 4), musicPath);

  await input.progress?.({ message: "Арын хөгжмийг холиж байна...", progressPercent: 86 });
  await mixBackgroundMusic(input.sourceVideoPath, musicPath, withMusicPath);

  const outroPath = await ensureDefaultOutro(assets.outroPath, input.hospital.hospitalName);
  await input.progress?.({ message: "Эмнэлгийн outro-г төгсгөлд нь залгаж байна...", progressPercent: 92 });
  await appendOutro(withMusicPath, outroPath, withOutroPath);

  await input.progress?.({ message: "Brand frame байршуулж байна...", progressPercent: 97 });
  await overlayBrandFrame(withOutroPath, assets.brandFramePath, brandedPath);

  const targetDirectory =
    input.type === "explainer"
      ? input.hospital.explainerRoot
      : input.type === "organ_talk"
        ? input.hospital.organTalkRoot
        : input.hospital.doctorLipSyncRoot;

  const finalPath = path.join(targetDirectory, `${input.fileName}.mp4`);
  await fs.copyFile(brandedPath, finalPath);
  const finalDuration = await probeDuration(finalPath);
  const relativePath = forwardSlashes(path.relative(getHospitalProjectRoot(), finalPath));

  const record = await saveVideoRecord({
    id: `${input.hospital.hospitalSlug}-${input.type}-${timestampSlug()}`,
    hospitalName: input.hospital.hospitalName,
    hospitalSlug: input.hospital.hospitalSlug,
    type: input.type,
    topic: input.topic,
    doctorId: input.doctorId,
    doctorName: input.doctorName,
    durationSeconds: finalDuration,
    createdAt: new Date().toISOString(),
    fileName: input.fileName,
    relativePath,
    scriptSummary: input.scriptSummary,
    taskIds: input.taskIds,
  });

  return {
    ...record,
    previewUrl: buildPreviewUrl(record.relativePath),
  } satisfies VideoMetadata;
}

function getHospitalProjectRoot() {
  return path.join(process.cwd(), "projects");
}

function computeScriptedProgress(
  segmentIndex: number,
  phaseIndex: number,
  totalSegments: number,
) {
  const totalOperations = Math.max(totalSegments * 2, 1);
  const completedOperations = segmentIndex * 2 + phaseIndex;
  return clampProgress(8 + Math.floor((completedOperations / totalOperations) * 60));
}

function computeDoctorProgress(input: {
  chunkIndex: number;
  totalChunks: number;
  visualIndex: number;
  totalVisuals: number;
  phase: "lipsync" | "merge-lipsync" | "visual" | "split-screen";
}) {
  const lipsyncStart = 16;
  const lipsyncRange = 40;
  const visualStart = 60;
  const visualRange = 16;

  if (input.phase === "lipsync") {
    const ratio = input.totalChunks > 0 ? input.chunkIndex / input.totalChunks : 0;
    return clampProgress(lipsyncStart + Math.floor(ratio * lipsyncRange));
  }

  if (input.phase === "merge-lipsync") {
    return 58;
  }

  if (input.phase === "visual") {
    const ratio = input.totalVisuals > 0 ? input.visualIndex / input.totalVisuals : 0;
    return clampProgress(visualStart + Math.floor(ratio * visualRange));
  }

  return 78;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(99, value));
}
