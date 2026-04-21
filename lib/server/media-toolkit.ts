import "server-only";

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { ensureDir, fileExists } from "./filesystem";

const ffmpegBin = ffmpegPath as string;
const ffprobeBin = ffprobe.path;
const windowsFont = "C\\:/Windows/Fonts/arial.ttf";

export async function probeDuration(filePath: string) {
  const result = await runProcess(ffprobeBin, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    filePath,
  ]);
  const value = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(value) ? value : 0;
}

export async function hasAudioStream(filePath: string) {
  const result = await runProcess(ffprobeBin, [
    "-v",
    "error",
    "-select_streams",
    "a",
    "-show_entries",
    "stream=index",
    "-of",
    "csv=p=0",
    filePath,
  ]);

  return result.stdout.trim().length > 0;
}

export async function splitAudioIntoChunks(inputPath: string, outputDirectory: string, maxSeconds: number) {
  await ensureDir(outputDirectory);
  const pattern = path.join(outputDirectory, "chunk_%03d.mp3");

  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-f",
    "segment",
    "-segment_time",
    String(maxSeconds),
    "-c:a",
    "libmp3lame",
    "-ar",
    "44100",
    "-ac",
    "2",
    pattern,
  ]);

  const entries = await fs.readdir(outputDirectory);
  return entries
    .filter((entry) => entry.endsWith(".mp3"))
    .sort()
    .map((entry) => path.join(outputDirectory, entry));
}

export async function decorateVerticalSegment(inputVideo: string, imagePath: string, title: string, subtitle: string, outputPath: string) {
  await ensureDir(path.dirname(outputPath));
  const titleText = escapeDrawtext(title);
  const subtitleText = escapeDrawtext(subtitle);

  await runFfmpeg([
    "-y",
    "-i",
    inputVideo,
    "-loop",
    "1",
    "-i",
    imagePath,
    "-filter_complex",
    [
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[base]",
      "[1:v]scale=350:-1[card]",
      "[base][card]overlay=60:90:enable='between(t,0.4,4.5)'[step1]",
      `[step1]drawbox=x=48:y=1485:w=984:h=265:color=black@0.42:t=fill,drawtext=${fontClause()}:text='${titleText}':fontcolor=white:fontsize=56:x=74:y=1535,drawtext=${fontClause()}:text='${subtitleText}':fontcolor=white@0.86:fontsize=34:x=74:y=1618[v]`,
    ].join(";"),
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    outputPath,
  ]);
}

export async function concatVideos(videoPaths: string[], outputPath: string) {
  await ensureDir(path.dirname(outputPath));
  const listFile = path.join(path.dirname(outputPath), "concat.txt");
  const manifest = videoPaths.map((videoPath) => `file '${videoPath.replace(/'/g, "'\\''").replace(/\\/g, "/")}'`).join("\n");
  await fs.writeFile(listFile, manifest, "utf8");

  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}

export async function ensureAmbientMusic(durationSeconds: number, outputPath: string) {
  await ensureDir(path.dirname(outputPath));
  const fadeOutStart = Math.max(durationSeconds - 2, 0).toFixed(2);

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=220:duration=${durationSeconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=329.63:duration=${durationSeconds}`,
    "-filter_complex",
    `[0:a]volume=0.06[a0];[1:a]volume=0.04[a1];[a0][a1]amix=inputs=2,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=2[a]`,
    "-map",
    "[a]",
    "-c:a",
    "mp3",
    outputPath,
  ]);

  return outputPath;
}

export async function mixBackgroundMusic(inputVideo: string, musicPath: string, outputPath: string) {
  await ensureDir(path.dirname(outputPath));

  if (await hasAudioStream(inputVideo)) {
    await runFfmpeg([
      "-y",
      "-i",
      inputVideo,
      "-i",
      musicPath,
      "-filter_complex",
      "[0:a]volume=1[a0];[1:a]volume=0.12[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[a]",
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      outputPath,
    ]);
    return outputPath;
  }

  await runFfmpeg([
    "-y",
    "-i",
    inputVideo,
    "-i",
    musicPath,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    outputPath,
  ]);
  return outputPath;
}

export async function ensureDefaultOutro(outroPath: string, hospitalName: string) {
  if (await fileExists(outroPath)) {
    return outroPath;
  }

  await ensureDir(path.dirname(outroPath));

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=#143d33:s=1080x1920:d=3.2",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-filter_complex",
    `[0:v]drawbox=x=90:y=360:w=900:h=1200:color=#ef8d73@0.18:t=fill,drawtext=${fontClause()}:text='${escapeDrawtext(
      hospitalName,
    )}':fontcolor=white:fontsize=78:x=(w-text_w)/2:y=770,drawtext=${fontClause()}:text='Эрүүл мэндээ өнөөдрөөс хамгаалъя':fontcolor=white@0.92:fontsize=44:x=(w-text_w)/2:y=910[v]`,
    "-map",
    "[v]",
    "-map",
    "1:a",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    outroPath,
  ]);

  return outroPath;
}

export async function appendOutro(mainVideo: string, outroVideo: string, outputPath: string) {
  const normalizedOutro = path.join(path.dirname(outputPath), "normalized-outro.mp4");
  await normalizeVerticalVideo(outroVideo, normalizedOutro);
  await concatVideos([mainVideo, normalizedOutro], outputPath);
  return outputPath;
}

export async function normalizeVerticalVideo(inputPath: string, outputPath: string) {
  await ensureDir(path.dirname(outputPath));
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
  return outputPath;
}

export async function overlayBrandFrame(inputVideo: string, framePath: string, outputPath: string) {
  await ensureDir(path.dirname(outputPath));
  if (!(await fileExists(framePath))) {
    await fs.copyFile(inputVideo, outputPath);
    return outputPath;
  }

  await runFfmpeg([
    "-y",
    "-i",
    inputVideo,
    "-i",
    framePath,
    "-filter_complex",
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[base];[1:v]scale=1080:1920[frame];[base][frame]overlay=0:0[v]",
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
  return outputPath;
}

export async function buildImageSlideshow(imagePaths: string[], durationSeconds: number, outputPath: string) {
  await ensureDir(path.dirname(outputPath));
  const slideshowDir = path.join(path.dirname(outputPath), "slideshow");
  await ensureDir(slideshowDir);

  if (imagePaths.length === 0) {
    throw new Error("Дээд талын slideshow үүсгэхэд дор хаяж нэг зураг хэрэгтэй.");
  }

  const perImageDuration = durationSeconds / imagePaths.length;
  const clipPaths: string[] = [];
  let consumedDuration = 0;

  for (const [index, imagePath] of imagePaths.entries()) {
    const clipPath = path.join(slideshowDir, `slide_${index + 1}.mp4`);
    clipPaths.push(clipPath);
    const clipDuration =
      index === imagePaths.length - 1
        ? Math.max(durationSeconds - consumedDuration, 0.04)
        : Math.max(perImageDuration, 0.04);
    consumedDuration += clipDuration;

    await runFfmpeg([
      "-y",
      "-loop",
      "1",
      "-t",
      clipDuration.toFixed(3),
      "-i",
      imagePath,
      "-vf",
      "scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      clipPath,
    ]);
  }

  await concatVideos(clipPaths, outputPath);

  if (!(await fileExists(outputPath))) {
    throw new Error(`Дээд талын slideshow видео үүссэнгүй: ${outputPath}`);
  }
  return outputPath;
}

export async function buildSplitScreen(topVideo: string, bottomVideo: string, outputPath: string) {
  await ensureDir(path.dirname(outputPath));
  await runFfmpeg([
    "-y",
    "-i",
    topVideo,
    "-i",
    bottomVideo,
    "-filter_complex",
    "[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[top];[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[bottom];[top][bottom]vstack=inputs=2[v]",
    "-map",
    "[v]",
    "-map",
    "1:a?",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    outputPath,
  ]);

  if (!(await fileExists(outputPath))) {
    throw new Error(`Split-screen видео үүссэнгүй: ${outputPath}`);
  }
  return outputPath;
}

function fontClause() {
  if (existsSync("C:\\Windows\\Fonts\\arial.ttf")) {
    return `fontfile='${windowsFont}'`;
  }
  return "font='Arial'";
}

function escapeDrawtext(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\r?\n/g, " ");
}

async function runFfmpeg(args: string[]) {
  await runProcess(ffmpegBin, args);
}

async function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
}
