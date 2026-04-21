"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CONTENT_LABELS,
  type ContentType,
  type GenerationJob,
  type HospitalSummary,
  type VideoMetadata,
} from "@/lib/types";

type GenerateResponse = {
  success: true;
  job: GenerationJob;
};

const CONTENT_OPTIONS: ContentType[] = ["explainer", "organ_talk", "doctor_lipsync"];
const NEW_HOSPITAL_VALUE = "__new_hospital__";

const JOB_STATUS_LABELS: Record<GenerationJob["status"], string> = {
  queued: "Хүлээгдэж байна",
  running: "Үүсгэж байна",
  completed: "Бэлэн",
  failed: "Алдаа гарсан",
};

export function Dashboard({
  initialHospitals,
  initialJobs,
}: {
  initialHospitals: HospitalSummary[];
  initialJobs: GenerationJob[];
}) {
  const [hospitals, setHospitals] = useState(initialHospitals);
  const [jobs, setJobs] = useState(initialJobs);
  const [selectedHospitalSlug, setSelectedHospitalSlug] = useState(
    initialHospitals[0]?.slug ?? NEW_HOSPITAL_VALUE,
  );
  const [newHospitalName, setNewHospitalName] = useState("");
  const [contentType, setContentType] = useState<ContentType>("explainer");
  const [topic, setTopic] = useState("Элэг");
  const [doctorId, setDoctorId] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [doctorSpecialty, setDoctorSpecialty] = useState("");
  const [doctorPhoto, setDoctorPhoto] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [outroFile, setOutroFile] = useState<File | null>(null);
  const [brandFrameFile, setBrandFrameFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Систем бэлэн байна.");
  const [error, setError] = useState("");
  const [latestVideo, setLatestVideo] = useState<VideoMetadata | null>(null);
  const [activeJob, setActiveJob] = useState<GenerationJob | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedHospital = hospitals.find((item) => item.slug === selectedHospitalSlug) ?? null;
  const processMessages = activeJob?.processMessages ?? [];
  const displayedJobs = jobs.filter(
    (job) =>
      selectedHospitalSlug === NEW_HOSPITAL_VALUE ||
      selectedHospitalSlug === "" ||
      job.hospitalSlug === selectedHospitalSlug,
  );

  const hospitalName =
    selectedHospitalSlug === NEW_HOSPITAL_VALUE
      ? newHospitalName
      : (selectedHospital?.name ?? "");

  const effectiveDoctorId = selectedHospital?.doctors.some((doctor) => doctor.id === doctorId)
    ? doctorId
    : (selectedHospital?.doctors[0]?.id ?? "");

  function formatJobTime(value: string) {
    return new Date(value).toLocaleString("mn-MN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  useEffect(() => {
    if (!activeJob || activeJob.status === "completed" || activeJob.status === "failed") {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/jobs/${activeJob.id}`, { cache: "no-store" });
      const data = (await response.json()) as { job?: GenerationJob; error?: string };

      if (!response.ok || !data.job) {
        setError(data.error ?? "Даалгаврын төлөв уншихад алдаа гарлаа.");
        return;
      }

      setActiveJob(data.job);
      setStatus(data.job.message);
      await refreshJobs();

      if (data.job.status === "completed" && data.job.video) {
        setLatestVideo(data.job.video);
        setError("");

        const refreshed = await fetch("/api/hospitals", { cache: "no-store" });
        if (refreshed.ok) {
          const refreshedData = (await refreshed.json()) as { hospitals: HospitalSummary[] };
          setHospitals(refreshedData.hospitals);
          const match =
            refreshedData.hospitals.find((hospital) => hospital.name === data.job?.hospitalName) ??
            refreshedData.hospitals.find((hospital) => hospital.slug === data.job?.hospitalSlug);

          if (match) {
            setSelectedHospitalSlug(match.slug);
          }
        }
      }

      if (data.job.status === "failed") {
        setError(data.job.error ?? "Видео үүсгэх ажил амжилтгүй боллоо.");
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [activeJob]);

  async function refreshJobs() {
    const response = await fetch("/api/jobs", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { jobs: GenerationJob[] };
    setJobs(data.jobs);
  }

  async function refreshHospitals(nextHospitalName?: string) {
    const response = await fetch("/api/hospitals", { cache: "no-store" });
    const data = (await response.json()) as { hospitals: HospitalSummary[] };
    setHospitals(data.hospitals);

    if (nextHospitalName) {
      const match =
        data.hospitals.find((hospital) => hospital.name === nextHospitalName) ??
        data.hospitals.find((hospital) => hospital.slug === nextHospitalName);

      if (match) {
        setSelectedHospitalSlug(match.slug);
        return;
      }
    }

    if (
      selectedHospitalSlug !== NEW_HOSPITAL_VALUE &&
      !data.hospitals.some((hospital) => hospital.slug === selectedHospitalSlug)
    ) {
      setSelectedHospitalSlug(data.hospitals[0]?.slug ?? NEW_HOSPITAL_VALUE);
    }
  }

  async function handleDoctorUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!hospitalName.trim()) {
      setError("Эмнэлгийн нэр оруулна уу.");
      return;
    }

    if (!doctorName.trim() || !doctorPhoto) {
      setError("Эмчийн нэр болон зураг заавал шаардлагатай.");
      return;
    }

    const payload = new FormData();
    payload.set("hospitalName", hospitalName);
    payload.set("doctorName", doctorName);
    payload.set("specialty", doctorSpecialty);
    payload.set("photo", doctorPhoto);

    startTransition(async () => {
      try {
        setStatus("Эмч хадгалж байна...");
        const response = await fetch("/api/doctors", { method: "POST", body: payload });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Эмч хадгалах үед алдаа гарлаа.");
        }

        setDoctorName("");
        setDoctorSpecialty("");
        setDoctorPhoto(null);
        setStatus("Эмч амжилттай бүртгэгдлээ.");
        await refreshHospitals(hospitalName);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Эмч хадгалах үед алдаа гарлаа.");
      }
    });
  }

  async function handleAssetUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!hospitalName.trim()) {
      setError("Эмнэлгийн нэр оруулна уу.");
      return;
    }

    if (!outroFile && !brandFrameFile) {
      setError("Ядаж нэг asset сонгоно уу.");
      return;
    }

    const payload = new FormData();
    payload.set("hospitalName", hospitalName);

    if (outroFile) {
      payload.set("outro", outroFile);
    }

    if (brandFrameFile) {
      payload.set("brandFrame", brandFrameFile);
    }

    startTransition(async () => {
      try {
        setStatus("Brand asset хадгалж байна...");
        const response = await fetch("/api/assets", { method: "POST", body: payload });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Asset хадгалах үед алдаа гарлаа.");
        }

        setOutroFile(null);
        setBrandFrameFile(null);
        setStatus("Asset шинэчлэгдлээ.");
        await refreshHospitals(hospitalName);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Asset хадгалах үед алдаа гарлаа.");
      }
    });
  }

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!hospitalName.trim()) {
      setError("Эмнэлгийн нэр шаардлагатай.");
      return;
    }

    if (contentType !== "doctor_lipsync" && !topic.trim()) {
      setError("Сэдэв оруулна уу.");
      return;
    }

    if (contentType === "doctor_lipsync") {
      if (!effectiveDoctorId) {
        setError("Эмч сонгоно уу.");
        return;
      }

      if (!audioFile) {
        setError("Аудио файл сонгоно уу.");
        return;
      }
    }

    const payload = new FormData();
    payload.set("hospitalName", hospitalName);
    payload.set("contentType", contentType);
    payload.set("topic", topic);
    payload.set("doctorId", effectiveDoctorId);

    if (audioFile) {
      payload.set("audio", audioFile);
    }

    startTransition(async () => {
      try {
        setStatus("Видео үүсгэх даалгавар үүсгэж байна...");
        const response = await fetch("/api/generate", { method: "POST", body: payload });
        const data = (await response.json()) as GenerateResponse | { error?: string };

        if (!response.ok || !("success" in data)) {
          throw new Error(
            "error" in data ? data.error ?? "Видео үүсгэхэд алдаа гарлаа." : "Видео үүсгэхэд алдаа гарлаа.",
          );
        }

        setActiveJob(data.job);
        setStatus(data.job.message);
        setLatestVideo(null);
        await refreshJobs();
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Видео үүсгэхэд алдаа гарлаа.");
      }
    });
  }

  const previewVideo = latestVideo ?? selectedHospital?.videos?.[0] ?? null;

  return (
    <main className="shell">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <section className="glass overflow-hidden rounded-[2rem] px-6 py-7 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <span className="status-pill ok">Postly Engine v1</span>
              <h1 className="accent-title max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                AI Healthcare Reel Generator
              </h1>
              <p className="max-w-3xl text-base leading-7 text-[var(--soft-text)] sm:text-lg">
                Монгол хэл дээр healthcare reel автоматаар үүсгэж, эмнэлгээр нь хадгалж,
                KIE.ai pipeline ашиглан brand outro-тай бэлэн видео гаргана.
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-[var(--soft-text)]">
                <span className="status-pill ok">NanoBanana 2</span>
                <span className="status-pill ok">Veo 3.1</span>
                <span className="status-pill ok">InfinityTalk</span>
                <span className="status-pill warn">9:16 Vertical</span>
              </div>
            </div>

            <div className="rounded-[1.75rem] bg-[linear-gradient(160deg,#17372f_0%,#295a4d_55%,#ef8d73_100%)] p-5 text-white shadow-2xl">
              <p className="text-sm uppercase tracking-[0.22em] text-white/70">Явцын төлөв</p>
              <div className="mt-4 space-y-4">
                <p className="text-2xl font-semibold">{status}</p>

                {activeJob ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                        <span>{activeJob.status === "failed" ? "Алдаа" : "Явц"}</span>
                        <span>{activeJob.progressPercent}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/15">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${
                            activeJob.status === "failed" ? "bg-[#f17a5d]" : "bg-white"
                          }`}
                          style={{ width: `${Math.max(activeJob.progressPercent, 3)}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/15 bg-black/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                        Яг одоо хийж байгаа алхмууд
                      </p>
                      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                        {processMessages.length > 0 ? (
                          processMessages.map((message, index) => (
                            <div
                              key={`${activeJob.id}-${index}`}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-6 text-white/88"
                            >
                              <span className="mr-2 text-white/55">{index + 1}.</span>
                              {message}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-white/75">Явцын мэдээлэл одоогоор алга.</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}

                <p className="text-sm leading-6 text-white/78">
                  `projects/{'{hospital}'}` дотор doctor, asset, reel metadata автоматаар хадгалагдана.
                </p>

                {error ? (
                  <div className="rounded-2xl border border-white/20 bg-white/10 p-4 text-sm text-white">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="grid-stack">
          <div className="space-y-6">
            <div className="glass rounded-[2rem] p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="label">Хадгалагдсан эмнэлэг</label>
                  <select
                    className="select mt-2"
                    value={selectedHospitalSlug}
                    onChange={(event) => setSelectedHospitalSlug(event.target.value)}
                  >
                    {hospitals.map((hospital) => (
                      <option key={hospital.slug} value={hospital.slug}>
                        {hospital.name}
                      </option>
                    ))}
                    <option value={NEW_HOSPITAL_VALUE}>Шинэ эмнэлэг нэмэх...</option>
                  </select>
                </div>

                <button
                  className="ghost-button"
                  type="button"
                  onClick={async () => {
                    await refreshHospitals(hospitalName || selectedHospitalSlug);
                    await refreshJobs();
                  }}
                  disabled={isPending}
                >
                  Сэргээх
                </button>
              </div>

              {selectedHospitalSlug === NEW_HOSPITAL_VALUE ? (
                <div className="mt-4">
                  <label className="label">Шинэ эмнэлгийн нэр</label>
                  <input
                    className="field mt-2"
                    placeholder="Жишээ: Интермед"
                    value={newHospitalName}
                    onChange={(event) => setNewHospitalName(event.target.value)}
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-[rgba(21,32,29,0.1)] bg-white/65 px-4 py-3 text-sm text-[var(--soft-text)]">
                  <p>
                    <strong className="text-[var(--foreground)]">Сонгосон эмнэлэг:</strong>{" "}
                    {selectedHospital?.name}
                  </p>
                  <p className="mt-1">
                    Эмч: {selectedHospital?.doctors.length ?? 0} · Brand frame:{" "}
                    {selectedHospital?.assets.hasBrandFrame ? "байгаа" : "байхгүй"} · Outro:{" "}
                    {selectedHospital?.assets.hasOutro ? "байгаа" : "байхгүй"}
                  </p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                {CONTENT_OPTIONS.map((option) => {
                  const active = contentType === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      className={active ? "primary-button" : "ghost-button"}
                      onClick={() => setContentType(option)}
                    >
                      {CONTENT_LABELS[option]}
                    </button>
                  );
                })}
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleGenerate}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className={contentType === "doctor_lipsync" ? "" : "md:col-span-2"}>
                    <label className="label">
                      {contentType === "organ_talk" ? "Эрхтэн / сэдэв" : "Сэдэв"}
                    </label>
                    <input
                      className="field mt-2"
                      placeholder="Жишээ: Элэг, Зүрх, Эрүүл хооллолт"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                    />
                  </div>

                  {contentType === "doctor_lipsync" ? (
                    <>
                      <div>
                        <label className="label">Эмч сонгох</label>
                        <select
                          className="select mt-2"
                          value={effectiveDoctorId}
                          onChange={(event) => setDoctorId(event.target.value)}
                        >
                          <option value="">Эмч сонгоно уу</option>
                          {selectedHospital?.doctors.map((doctor) => (
                            <option key={doctor.id} value={doctor.id}>
                              {doctor.name}
                              {doctor.specialty ? ` · ${doctor.specialty}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label">Аудио файл</label>
                        <input
                          className="field mt-2"
                          type="file"
                          accept="audio/*"
                          onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
                        />
                      </div>
                    </>
                  ) : null}
                </div>

                <button className="primary-button" type="submit" disabled={isPending}>
                  {isPending ? "Ажиллаж байна..." : "Видео үүсгэх"}
                </button>
              </form>
            </div>

            <div className="glass rounded-[2rem] p-6">
              <h2 className="text-2xl font-semibold">Эмч бүртгэх</h2>
              <form className="mt-5 space-y-4" onSubmit={handleDoctorUpload}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Эмчийн нэр</label>
                    <input
                      className="field mt-2"
                      value={doctorName}
                      onChange={(event) => setDoctorName(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Мэргэжил</label>
                    <input
                      className="field mt-2"
                      value={doctorSpecialty}
                      onChange={(event) => setDoctorSpecialty(event.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Зураг</label>
                  <input
                    className="field mt-2"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setDoctorPhoto(event.target.files?.[0] ?? null)}
                  />
                </div>

                <button className="ghost-button" type="submit" disabled={isPending}>
                  Эмч хадгалах
                </button>
              </form>
            </div>

            <div className="glass rounded-[2rem] p-6">
              <h2 className="text-2xl font-semibold">Brand assets</h2>
              <form className="mt-5 space-y-4" onSubmit={handleAssetUpload}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Outro видео</label>
                    <input
                      className="field mt-2"
                      type="file"
                      accept="video/*"
                      onChange={(event) => setOutroFile(event.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div>
                    <label className="label">Brand frame PNG</label>
                    <input
                      className="field mt-2"
                      type="file"
                      accept="image/png,image/webp,image/*"
                      onChange={(event) => setBrandFrameFile(event.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>

                <button className="ghost-button" type="submit" disabled={isPending}>
                  Asset хадгалах
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass rounded-[2rem] p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Preview</h2>
                {previewVideo ? (
                  <a className="ghost-button" href={previewVideo.previewUrl} download>
                    Татах
                  </a>
                ) : null}
              </div>

              <div className="mt-5 overflow-hidden rounded-[1.5rem] bg-[#0e1715] p-3">
                {previewVideo ? (
                  <video
                    className="aspect-[9/16] w-full rounded-[1.25rem] bg-black object-cover"
                    controls
                    src={previewVideo.previewUrl}
                  />
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center rounded-[1.25rem] border border-dashed border-white/15 text-center text-sm text-white/60">
                    Шинэ видео үүссэний дараа энд preview гарна.
                  </div>
                )}
              </div>

              {previewVideo ? (
                <div className="mt-4 space-y-2 text-sm text-[var(--soft-text)]">
                  <p>
                    <strong className="text-[var(--foreground)]">Төрөл:</strong>{" "}
                    {CONTENT_LABELS[previewVideo.type]}
                  </p>
                  <p>
                    <strong className="text-[var(--foreground)]">Сэдэв:</strong>{" "}
                    {previewVideo.topic || "Байхгүй"}
                  </p>
                  <p>
                    <strong className="text-[var(--foreground)]">Үргэлжлэх хугацаа:</strong>{" "}
                    {Math.round(previewVideo.durationSeconds)} сек
                  </p>
                </div>
              ) : null}

              {activeJob ? (
                <div
                  className={`mt-5 rounded-2xl border p-4 text-sm ${
                    activeJob.status === "failed"
                      ? "border-[#f17a5d]/35 bg-[#fff1ed] text-[#8f3e29]"
                      : "border-[rgba(21,32,29,0.1)] bg-white/65 text-[var(--soft-text)]"
                  }`}
                >
                  <p className="font-semibold text-[var(--foreground)]">Job: {activeJob.id}</p>
                  <p className="mt-1">Төлөв: {JOB_STATUS_LABELS[activeJob.status]}</p>
                  <p className="mt-1">{activeJob.message}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(21,32,29,0.08)]">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        activeJob.status === "failed" ? "bg-[#f17a5d]" : "bg-[var(--forest)]"
                      }`}
                      style={{
                        width: `${Math.max(
                          activeJob.progressPercent,
                          activeJob.status === "failed" ? 5 : 0,
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em]">
                    {activeJob.progressPercent}% гүйцсэн
                  </p>
                  {activeJob.error ? <p className="mt-2 text-[#8f3e29]">{activeJob.error}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="glass rounded-[2rem] p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Эмнэлгийн төлөв</h2>
                <span className={selectedHospital?.assets.hasOutro ? "status-pill ok" : "status-pill warn"}>
                  {selectedHospital?.assets.hasOutro ? "Outro бэлэн" : "Суурь outro ашиглана"}
                </span>
              </div>

              {selectedHospital ? (
                <div className="mt-5 space-y-5">
                  <div>
                    <p className="label">Эмч нар</p>
                    <div className="mt-3 space-y-2">
                      {selectedHospital.doctors.length > 0 ? (
                        selectedHospital.doctors.map((doctor) => (
                          <div
                            key={doctor.id}
                            className="rounded-2xl border border-[rgba(21,32,29,0.1)] bg-white/65 px-4 py-3"
                          >
                            <p className="font-semibold">{doctor.name}</p>
                            <p className="text-sm text-[var(--soft-text)]">
                              {doctor.specialty || "Мэргэжил оруулаагүй"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--soft-text)]">
                          Энэ эмнэлэгт одоогоор эмч бүртгэгдээгүй байна.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="label">Сүүлийн видеонууд</p>
                    <div className="mt-3 space-y-2">
                      {selectedHospital.videos.length > 0 ? (
                        selectedHospital.videos.slice(0, 5).map((video) => (
                          <div
                            key={video.id}
                            className="rounded-2xl border border-[rgba(21,32,29,0.1)] bg-white/65 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-semibold">{CONTENT_LABELS[video.type]}</p>
                                <p className="text-sm text-[var(--soft-text)]">
                                  {video.topic || "Сэдэвгүй"} · {Math.round(video.durationSeconds)} сек
                                </p>
                              </div>
                              <a className="ghost-button" href={video.previewUrl} download>
                                Татах
                              </a>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--soft-text)]">
                          Видео хараахан үүсээгүй байна.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--soft-text)]">
                  Эмнэлгийн нэр оруулаад generation эхлүүлнэ үү.
                </p>
              )}
            </div>

            <div className="glass rounded-[2rem] p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Бүх generation jobs</h2>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={refreshJobs}
                  disabled={isPending}
                >
                  Шинэчлэх
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {displayedJobs.length > 0 ? (
                  displayedJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-2xl border border-[rgba(21,32,29,0.1)] bg-white/65 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--foreground)]">
                            {CONTENT_LABELS[job.contentType]}
                          </p>
                          <p className="text-sm text-[var(--soft-text)]">
                            {job.hospitalName}
                            {job.topic ? ` · ${job.topic}` : ""}
                            {job.doctorName ? ` · ${job.doctorName}` : ""}
                          </p>
                        </div>
                        <span
                          className={
                            job.status === "completed"
                              ? "status-pill ok"
                              : job.status === "failed"
                                ? "status-pill warn"
                                : "status-pill ok"
                          }
                        >
                          {JOB_STATUS_LABELS[job.status]}
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-[var(--soft-text)]">{job.message}</p>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(21,32,29,0.08)]">
                        <div
                          className={`h-full rounded-full ${
                            job.status === "failed" ? "bg-[#f17a5d]" : "bg-[var(--forest)]"
                          }`}
                          style={{ width: `${Math.max(job.progressPercent, 4)}%` }}
                        />
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-[var(--soft-text)]">
                        <p>Үүсгэсэн: {formatJobTime(job.createdAt)}</p>
                        {job.video?.previewUrl ? (
                          <p>
                            Бэлэн файл:{" "}
                            <a className="underline" href={job.video.previewUrl} download>
                              Татах
                            </a>
                          </p>
                        ) : null}
                        {job.artifactsPath ? <p>Артефакт хавтас: {job.artifactsPath}</p> : null}
                        {job.audioPath ? <p>Эх аудио: {job.audioPath}</p> : null}
                        {job.error ? <p className="text-[#8f3e29]">Алдаа: {job.error}</p> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--soft-text)]">
                    Одоогоор хадгалагдсан generation job алга.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
