export const CONTENT_TYPES = ["explainer", "organ_talk", "doctor_lipsync"] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_LABELS: Record<ContentType, string> = {
  explainer: "🎥 Тайлбар",
  organ_talk: "🧠 Эрхтэн ярина",
  doctor_lipsync: "👨‍⚕️ Эмчийн видео",
};

export interface DoctorMeta {
  id: string;
  hospitalName: string;
  hospitalSlug: string;
  name: string;
  slug: string;
  specialty?: string;
  photoPath: string;
  createdAt: string;
}

export interface VideoMetadata {
  id: string;
  hospitalName: string;
  hospitalSlug: string;
  type: ContentType;
  topic?: string;
  doctorId?: string;
  doctorName?: string;
  durationSeconds: number;
  createdAt: string;
  fileName: string;
  relativePath: string;
  previewUrl: string;
  scriptSummary?: string;
  taskIds?: string[];
}

export interface HospitalSummary {
  name: string;
  slug: string;
  doctors: DoctorMeta[];
  videos: VideoMetadata[];
  assets: {
    hasOutro: boolean;
    hasBrandFrame: boolean;
  };
}

export type GenerationJobStatus = "queued" | "running" | "completed" | "failed";

export interface GenerationJob {
  id: string;
  hospitalName: string;
  hospitalSlug: string;
  contentType: ContentType;
  topic?: string;
  doctorId?: string;
  doctorName?: string;
  audioPath?: string;
  artifactsPath?: string;
  status: GenerationJobStatus;
  message: string;
  processMessages: string[];
  progressPercent: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  video?: VideoMetadata;
}

export interface ScriptSegment {
  index: number;
  title: string;
  narration: string;
  imagePrompt: string;
  videoPrompt: string;
}

export interface GeneratedScript {
  mode: "explainer" | "organ_talk";
  topic: string;
  title: string;
  hook: string;
  problem: string;
  cause: string;
  solution: string;
  cta: string;
  fullText: string;
  segments: ScriptSegment[];
}

export interface DoctorVisualPlan {
  topic: string;
  imagePrompts: string[];
  captions: string[];
}
