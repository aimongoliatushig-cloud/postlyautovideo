import "server-only";

import { z } from "zod";

const envSchema = z.object({
  KIE_API_KEY: z.string().trim().min(1).optional(),
  LIPSYNC_API_KEY: z.string().trim().min(1).optional(),
  KIE_API_BASE_URL: z.string().trim().url().optional(),
  KIE_FILE_UPLOAD_BASE_URL: z.string().trim().url().optional(),
  KIE_MARKET_CREATE_TASK_URL: z.string().trim().url().optional(),
  KIE_MARKET_STATUS_URL: z.string().trim().url().optional(),
  KIE_VEO_GENERATE_URL: z.string().trim().url().optional(),
  KIE_VEO_STATUS_URL: z.string().trim().url().optional(),
  KIE_DOWNLOAD_URL: z.string().trim().url().optional(),
  KIE_FILE_STREAM_UPLOAD_URL: z.string().trim().url().optional(),
  KIE_INFINITALK_URL: z.string().trim().url().optional(),
  KIE_NANOBANANA_MODEL: z.string().trim().min(1).optional(),
  KIE_INFINITALK_MODEL: z.string().trim().min(1).optional(),
  KIE_VEO_FAST_MODEL: z.string().trim().min(1).optional(),
  KIE_VEO_QUALITY_MODEL: z.string().trim().min(1).optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_RESPONSES_URL: z.string().trim().url().optional(),
  OPENAI_SCRIPT_MODEL: z.string().trim().min(1).optional(),
  SUPABASE_URL: z.string().trim().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().trim().min(1).optional(),
});

const env = envSchema.parse({
  KIE_API_KEY: process.env.KIE_API_KEY,
  LIPSYNC_API_KEY: process.env.LIPSYNC_API_KEY,
  KIE_API_BASE_URL: process.env.KIE_API_BASE_URL,
  KIE_FILE_UPLOAD_BASE_URL: process.env.KIE_FILE_UPLOAD_BASE_URL,
  KIE_MARKET_CREATE_TASK_URL: process.env.KIE_MARKET_CREATE_TASK_URL,
  KIE_MARKET_STATUS_URL: process.env.KIE_MARKET_STATUS_URL,
  KIE_VEO_GENERATE_URL: process.env.KIE_VEO_GENERATE_URL,
  KIE_VEO_STATUS_URL: process.env.KIE_VEO_STATUS_URL,
  KIE_DOWNLOAD_URL: process.env.KIE_DOWNLOAD_URL,
  KIE_FILE_STREAM_UPLOAD_URL: process.env.KIE_FILE_STREAM_UPLOAD_URL,
  KIE_INFINITALK_URL: process.env.KIE_INFINITALK_URL,
  KIE_NANOBANANA_MODEL: process.env.KIE_NANOBANANA_MODEL,
  KIE_INFINITALK_MODEL: process.env.KIE_INFINITALK_MODEL,
  KIE_VEO_FAST_MODEL: process.env.KIE_VEO_FAST_MODEL,
  KIE_VEO_QUALITY_MODEL: process.env.KIE_VEO_QUALITY_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_RESPONSES_URL: process.env.OPENAI_RESPONSES_URL,
  OPENAI_SCRIPT_MODEL: process.env.OPENAI_SCRIPT_MODEL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,
});

export function requireKieApiKey() {
  const value = env.KIE_API_KEY;

  if (!value) {
    throw new Error("KIE API key is missing in .env.local.");
  }

  return value;
}

export function requireLipSyncApiKey() {
  return env.LIPSYNC_API_KEY ?? requireKieApiKey();
}

export function getKieConfig() {
  return {
    apiBaseUrl: env.KIE_API_BASE_URL ?? "https://api.kie.ai",
    fileUploadBaseUrl: env.KIE_FILE_UPLOAD_BASE_URL ?? "https://kieai.redpandaai.co",
    marketCreateTaskUrl: env.KIE_MARKET_CREATE_TASK_URL ?? "https://api.kie.ai/api/v1/jobs/createTask",
    marketStatusUrl: env.KIE_MARKET_STATUS_URL ?? "https://api.kie.ai/api/v1/jobs/recordInfo",
    veoGenerateUrl: env.KIE_VEO_GENERATE_URL ?? "https://api.kie.ai/api/v1/veo/generate",
    veoStatusUrl: env.KIE_VEO_STATUS_URL ?? "https://api.kie.ai/api/v1/veo/record-info",
    downloadUrl: env.KIE_DOWNLOAD_URL ?? "https://api.kie.ai/api/v1/common/download-url",
    fileStreamUploadUrl:
      env.KIE_FILE_STREAM_UPLOAD_URL ?? "https://kieai.redpandaai.co/api/file-stream-upload",
    infinitalkUrl: env.KIE_INFINITALK_URL ?? "https://api.kie.ai/api/v1/jobs/createTask",
    nanoBananaModel: env.KIE_NANOBANANA_MODEL ?? "nano-banana-2",
    infinitalkModel: env.KIE_INFINITALK_MODEL ?? "infinitalk/from-audio",
    veoFastModel: env.KIE_VEO_FAST_MODEL ?? "veo3_fast",
    veoQualityModel: env.KIE_VEO_QUALITY_MODEL ?? "veo3",
  };
}

export function getOpenAiConfig() {
  return {
    apiKey: env.OPENAI_API_KEY,
    responsesUrl: env.OPENAI_RESPONSES_URL ?? "https://api.openai.com/v1/responses",
    scriptModel: env.OPENAI_SCRIPT_MODEL ?? "gpt-5-mini",
  };
}

export function getSupabaseConfig() {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET ?? "healthcare-videos";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
    bucket,
  };
}
