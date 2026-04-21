import "server-only";

import { z } from "zod";
import { getOpenAiConfig } from "./env";

const scriptSchema = z.object({
  title: z.string().min(1),
  topic: z.string().min(1),
  hook: z.string().min(1),
  problem: z.string().min(1),
  cause: z.string().min(1),
  solution: z.string().min(1),
  cta: z.string().min(1),
  segments: z.array(
    z.object({
      index: z.number().int().min(1),
      title: z.string().min(1),
      narration: z.string().min(1),
      imagePrompt: z.string().min(1),
      videoPrompt: z.string().min(1),
    }),
  ),
});

const doctorPlanSchema = z.object({
  topic: z.string().min(1),
  captions: z.array(z.string().min(1)).min(4).max(4),
  imagePrompts: z.array(z.string().min(1)).min(4).max(4),
});

export async function generateScriptWithOpenAi(input: {
  mode: "explainer" | "organ_talk";
  topic: string;
  segmentCount: 3 | 5;
}) {
  const config = getOpenAiConfig();
  if (!config.apiKey) {
    return null;
  }

  const prompt = [
    `Create a Mongolian healthcare social reel script about "${input.topic}".`,
    `Mode: ${input.mode}.`,
    `Return strict JSON only.`,
    "Script language must be Mongolian Cyrillic.",
    "Image and video prompts must be English.",
    `Generate exactly ${input.segmentCount} segments.`,
    input.mode === "organ_talk"
      ? 'Use first-person organ voice, like "Сайн байна уу, би бол элэг байна".'
      : "Use a trustworthy educational doctor-like tone.",
    "Make it suitable for a short vertical medical social video.",
    "Each segment must have: index, title, narration, imagePrompt, videoPrompt.",
  ].join("\n");

  const raw = await callOpenAiJson(config.apiKey, config.responsesUrl, config.scriptModel, prompt);
  return scriptSchema.parse(raw);
}

export async function generateDoctorPlanWithOpenAi(input: {
  topic: string;
  specialty?: string;
}) {
  const config = getOpenAiConfig();
  if (!config.apiKey) {
    return null;
  }

  const prompt = [
    `Create a healthcare visual prompt plan for a Mongolian doctor lip-sync reel about "${input.topic}".`,
    `Doctor specialty context: ${input.specialty || "general healthcare"}.`,
    "Return strict JSON only.",
    "Topic must stay Mongolian Cyrillic.",
    "Captions must be Mongolian Cyrillic.",
    "Image prompts must be English.",
    "Return exactly 4 captions and 4 imagePrompts.",
    "Visual prompts should suit NanoBanana 2 and premium hospital social media visuals.",
  ].join("\n");

  const raw = await callOpenAiJson(config.apiKey, config.responsesUrl, config.scriptModel, prompt);
  return doctorPlanSchema.parse(raw);
}

async function callOpenAiJson(
  apiKey: string,
  responsesUrl: string,
  model: string,
  prompt: string,
) {
  const response = await fetch(responsesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are a medical short-form content writer. Follow the user's constraints exactly and output JSON only without markdown.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });

  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${JSON.stringify(json)}`);
  }

  const text = extractOutputText(json);
  if (!text) {
    throw new Error("OpenAI response did not include output text.");
  }

  return JSON.parse(text) as unknown;
}

function extractOutputText(payload: Record<string, unknown>) {
  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const output = payload.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const part of content) {
        if (!part || typeof part !== "object") {
          continue;
        }
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) {
          return text;
        }
      }
    }
  }

  return "";
}
