import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { getKieConfig, requireKieApiKey, requireLipSyncApiKey } from "./env";

export class KieApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KieApiError";
  }
}

interface MarketResponse {
  code?: number;
  msg?: string;
  success?: boolean;
  data?: {
    taskId?: string;
    state?: string;
    resultJson?: unknown;
  };
}

interface VeoResponse {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    successFlag?: number;
    response?: {
      resultUrls?: string[];
    };
  };
}

export class KieClient {
  private readonly kieApiKey = requireKieApiKey();
  private readonly lipSyncApiKey = requireLipSyncApiKey();
  private readonly config = getKieConfig();

  async generateNanoBanana(prompt: string) {
    const submit = await this.requestJson<MarketResponse>(this.config.marketCreateTaskUrl, {
      method: "POST",
      apiKey: this.kieApiKey,
      payload: {
        model: this.config.nanoBananaModel,
        input: {
          prompt,
          image_input: [],
          aspect_ratio: "auto",
          resolution: "1K",
          output_format: "png",
        },
      },
    });

    const taskId = submit.data?.taskId;
    if (!taskId) {
      throw new KieApiError("NanoBanana taskId was missing.");
    }

    const final = await this.waitForMarketTask(taskId, this.kieApiKey);
    const urls = this.extractMarketUrls(final);
    if (urls.length === 0) {
      throw new KieApiError(`NanoBanana returned no result URLs for task ${taskId}.`);
    }

    return { taskId, url: urls[0], urls, raw: final };
  }

  async generateVeo(input: {
    prompt: string;
    imageUrls?: string[];
    aspectRatio?: string;
    generationType?: "TEXT_2_VIDEO" | "REFERENCE_2_VIDEO";
  }) {
    const submit = await this.requestJson<VeoResponse>(this.config.veoGenerateUrl, {
      method: "POST",
      apiKey: this.kieApiKey,
      payload: {
        prompt: input.prompt,
        model: input.imageUrls?.length ? this.config.veoFastModel : this.config.veoQualityModel,
        aspect_ratio: input.aspectRatio ?? "9:16",
        enableFallback: false,
        enableTranslation: true,
        ...(input.imageUrls?.length
          ? {
              imageUrls: input.imageUrls,
              generationType: input.generationType ?? "REFERENCE_2_VIDEO",
            }
          : {
              generationType: input.generationType ?? "TEXT_2_VIDEO",
            }),
      },
    });

    const taskId = submit.data?.taskId;
    if (!taskId) {
      throw new KieApiError("Veo taskId was missing.");
    }

    const final = await this.waitForVeoTask(taskId, this.kieApiKey);
    const urls = final.data?.response?.resultUrls ?? [];
    if (urls.length === 0) {
      throw new KieApiError(`Veo returned no result URLs for task ${taskId}.`);
    }

    return { taskId, url: urls[0], urls, raw: final };
  }

  async generateInfinityTalk(input: {
    imagePath: string;
    audioPath: string;
    prompt: string;
  }) {
    let imageUpload: { downloadUrl: string };
    let audioUpload: { downloadUrl: string };

    try {
      [imageUpload, audioUpload] = await Promise.all([
        this.uploadFile(input.imagePath, "healthcare/images", this.lipSyncApiKey),
        this.uploadFile(input.audioPath, "healthcare/audio", this.lipSyncApiKey),
      ]);
    } catch (error) {
      throw new KieApiError(`InfinityTalk file upload алдаа: ${describeFetchError(error)}`);
    }

    let submit: MarketResponse;
    try {
      submit = await this.requestJson<MarketResponse>(this.config.infinitalkUrl, {
        method: "POST",
        apiKey: this.lipSyncApiKey,
        payload: {
          model: this.config.infinitalkModel,
          input: {
            image_url: imageUpload.downloadUrl,
            audio_url: audioUpload.downloadUrl,
            prompt: input.prompt,
            resolution: "480p",
          },
        },
      });
    } catch (error) {
      throw new KieApiError(`InfinityTalk createTask алдаа: ${describeFetchError(error)}`);
    }

    const taskId = submit.data?.taskId;
    if (!taskId) {
      throw new KieApiError("InfinityTalk taskId was missing.");
    }

    const final = await this.waitForMarketTask(taskId, this.lipSyncApiKey);
    const urls = this.extractMarketUrls(final);
    if (urls.length === 0) {
      throw new KieApiError(`InfinityTalk returned no result URLs for task ${taskId}.`);
    }

    return { taskId, url: urls[0], urls, raw: final };
  }

  async downloadAsset(sourceUrl: string, destinationPath: string) {
    const resolvedUrl = await this.resolveDownloadUrl(sourceUrl);
    const response = await fetch(resolvedUrl, {
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new KieApiError(`Failed to download asset: ${response.status} ${response.statusText}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.writeFile(destinationPath, bytes);
    return destinationPath;
  }

  private async uploadFile(filePath: string, uploadPath: string, apiKey: string) {
    const form = new FormData();
    const bytes = await fs.readFile(filePath);
    form.set("file", new Blob([bytes]), path.basename(filePath));
    form.set("uploadPath", uploadPath);
    form.set("fileName", path.basename(filePath));

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(this.config.fileStreamUploadUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
          signal: AbortSignal.timeout(120_000),
        });

        const json = (await response.json()) as {
          success?: boolean;
          code?: number;
          msg?: string;
          data?: { downloadUrl?: string };
        };

        if (!response.ok || json.success === false || json.code !== 200) {
          throw new KieApiError(json.msg ?? "Failed to upload file to KIE.");
        }

        const downloadUrl = json.data?.downloadUrl;
        if (!downloadUrl) {
          throw new KieApiError("KIE upload did not return a downloadUrl.");
        }

        return { downloadUrl };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown KIE upload failure");
        if (attempt < 2) {
          await sleep(2_500 * (attempt + 1));
        }
      }
    }

    throw new KieApiError(
      `KIE file upload алдаа (${uploadPath} -> ${this.config.fileStreamUploadUrl}): ${describeFetchError(lastError)}`,
    );
  }

  private async resolveDownloadUrl(url: string) {
    try {
      const response = await this.requestJson<{
        data?: { downloadUrl?: string; url?: string };
      }>(this.config.downloadUrl, {
        method: "POST",
        apiKey: this.kieApiKey,
        payload: { url },
      });

      return response.data?.downloadUrl ?? response.data?.url ?? url;
    } catch {
      return url;
    }
  }

  private extractMarketUrls(response: MarketResponse) {
    const raw = response.data?.resultJson;
    const parsed =
      typeof raw === "string"
        ? safeParseResultUrls(raw)
        : ((raw as { resultUrls?: string[] } | undefined) ?? {});
    return parsed.resultUrls ?? [];
  }

  private async waitForMarketTask(taskId: string, apiKey: string) {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await this.requestJson<MarketResponse>(
        `${this.config.marketStatusUrl}?taskId=${encodeURIComponent(taskId)}`,
        {
          method: "GET",
          apiKey,
        },
      );

      const state = response.data?.state;
      if (state === "success") {
        return response;
      }
      if (state === "fail") {
        throw new KieApiError(`KIE market task ${taskId} failed.`);
      }

      await sleep(15_000);
    }

    throw new KieApiError(`Timed out waiting for KIE task ${taskId}.`);
  }

  private async waitForVeoTask(taskId: string, apiKey: string) {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await this.requestJson<VeoResponse>(
        `${this.config.veoStatusUrl}?taskId=${encodeURIComponent(taskId)}`,
        {
          method: "GET",
          apiKey,
        },
      );

      const successFlag = response.data?.successFlag;
      if (successFlag === 1) {
        return response;
      }
      if (successFlag === 2 || successFlag === 3) {
        throw new KieApiError(`Veo task ${taskId} failed.`);
      }

      await sleep(15_000);
    }

    throw new KieApiError(`Timed out waiting for Veo task ${taskId}.`);
  }

  private async requestJson<T>(
    url: string,
    init: {
      method: "GET" | "POST";
      apiKey: string;
      payload?: unknown;
    },
  ) {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: init.method,
          headers: {
            Authorization: `Bearer ${init.apiKey}`,
            ...(init.payload ? { "Content-Type": "application/json" } : {}),
          },
          body: init.payload ? JSON.stringify(init.payload) : undefined,
          signal: AbortSignal.timeout(120_000),
          cache: "no-store",
        });

        const json = (await response.json()) as T & {
          code?: number;
          msg?: string;
          success?: boolean;
        };

        if (!response.ok) {
          throw new KieApiError(
            `KIE request failed (${response.status}): ${"msg" in json ? json.msg : response.statusText}`,
          );
        }

        if ("code" in json && json.code && json.code !== 200) {
          throw new KieApiError(json.msg ?? `KIE responded with code ${json.code}`);
        }

        if ("success" in json && json.success === false) {
          throw new KieApiError(json.msg ?? "KIE request failed.");
        }

        return json;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown KIE request failure");
        if (attempt < 2) {
          await sleep(2_500 * (attempt + 1));
        }
      }
    }

    throw new KieApiError(
      `KIE хүсэлт амжилтгүй (${init.method} ${url}): ${describeFetchError(lastError)}`,
    );
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseResultUrls(raw: string) {
  try {
    return JSON.parse(raw) as { resultUrls?: string[] };
  } catch {
    return {};
  }
}

function describeFetchError(error: unknown) {
  if (!error) {
    return "тодорхойгүй алдаа";
  }

  if (error instanceof KieApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "хүсэлтийн хугацаа хэтэрсэн";
    }

    const causeMessage =
      typeof (error as Error & { cause?: unknown }).cause === "object" &&
      (error as Error & { cause?: { message?: string } }).cause?.message
        ? ` | ${(error as Error & { cause?: { message?: string } }).cause?.message}`
        : "";

    return `${error.message}${causeMessage}`;
  }

  return String(error);
}
