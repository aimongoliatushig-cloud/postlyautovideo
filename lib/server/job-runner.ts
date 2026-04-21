import "server-only";

import path from "node:path";
import { generateHealthcareVideo } from "./generator-service";
import { ensureHospital } from "./hospital-store";
import {
  getGenerationJob,
  markJobActive,
  markJobInactive,
  updateGenerationJob,
} from "./job-store";

type JobProgressUpdate = {
  message: string;
  progressPercent: number;
};

export async function startGenerationJob(jobId: string) {
  if (!markJobActive(jobId)) {
    return;
  }

  void (async () => {
    try {
      const job = await getGenerationJob(jobId);
      if (!job) {
        return;
      }

      const hospital = await ensureHospital(job.hospitalName);
      const artifactsPath = path.join(hospital.tempRoot, job.id);

      await updateGenerationJob(jobId, {
        status: "running",
        message: "Видео үүсгэж эхэллээ.",
        artifactsPath,
        progressPercent: 3,
      });

      const video = await generateHealthcareVideo({
        jobId: job.id,
        hospitalName: job.hospitalName,
        contentType: job.contentType,
        topic: job.topic,
        doctorId: job.doctorId,
        audioPath: job.audioPath,
        progress: async (update: string | JobProgressUpdate) => {
          const normalized =
            typeof update === "string"
              ? { message: update, progressPercent: 3 }
              : update;

          await updateGenerationJob(jobId, {
            status: "running",
            message: normalized.message,
            progressPercent: normalized.progressPercent,
          });
        },
      });

      await updateGenerationJob(jobId, {
        status: "completed",
        message: "Видео бэлэн боллоо.",
        progressPercent: 100,
        doctorName: video.doctorName,
        video,
      });
    } catch (error) {
      await updateGenerationJob(jobId, {
        status: "failed",
        message: "Видео үүсгэхэд алдаа гарлаа.",
        progressPercent: 100,
        error: error instanceof Error ? error.message : "Тодорхойгүй алдаа гарлаа.",
      });
    } finally {
      markJobInactive(jobId);
    }
  })();
}
