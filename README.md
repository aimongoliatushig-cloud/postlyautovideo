# Postly Engine v1

AI-powered healthcare reel generator for Mongolian hospital social media content.

## What It Does

- Generates `explainer`, `organ talk`, and `doctor lip-sync` reels
- Stores every hospital under `projects/{hospital}/...`
- Uses KIE.ai for NanoBanana 2, Veo 3.1, and InfinityTalk
- Adds low-volume background music
- Always appends a hospital outro
- Mirrors metadata to Supabase when env vars are configured

## Required Environment

Copy `.env.example` to `.env.local` if you want env-based fallback values:

```bash
KIE_API_KEY=
LIPSYNC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=
```

Recommended flow: save the keys from the UI in `projects/_system/settings.json`.

`LIPSYNC_API_KEY` falls back to `KIE_API_KEY` if omitted.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Settings And Jobs

- API keys can be managed from the dashboard and are stored in `projects/_system/settings.json`
- Generation now starts an async local job and the UI polls `/api/jobs/:id`
- This avoids a single long request hanging on "working" while KIE jobs are still running

## Hospital Storage Layout

```text
/projects/
  /{hospital_name}/
    /doctors/
      /{doctor_name}/
        photo.png
        meta.json
    /videos/
      /explainer/
      /organ_talk/
      /doctor_lipsync/
    /assets/
      outro.mp4
      brand_frame.png
```

The app creates missing folders automatically. If a hospital has no `outro.mp4`, it generates a branded default outro and saves it under `assets/outro.mp4`.

## Notes

- Veo and NanoBanana prompts are sent in English for reliability.
- Doctor lip-sync uploads doctor image and audio chunks to KIE temporary storage before calling InfinityTalk.
- Media composition uses bundled `ffmpeg-static` and `ffprobe-static`, so no system ffmpeg install is required.
- The current background-job runner is suitable for a local/dev Node process. For production, move it to a real worker or callback-driven queue.
