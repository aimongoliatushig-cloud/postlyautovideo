import { NextResponse } from "next/server";
import { z } from "zod";
import { getDoctorById } from "@/lib/server/hospital-store";
import { createGenerationJob } from "@/lib/server/job-store";
import { startGenerationJob } from "@/lib/server/job-runner";

export const runtime = "nodejs";

const contentTypeSchema = z.enum(["explainer", "organ_talk", "doctor_lipsync"]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const hospitalName = String(formData.get("hospitalName") ?? "").trim();
    const contentType = contentTypeSchema.parse(String(formData.get("contentType") ?? ""));
    const topic = String(formData.get("topic") ?? "").trim();
    const doctorId = String(formData.get("doctorId") ?? "").trim();
    const audio = formData.get("audio");

    if (!hospitalName) {
      return NextResponse.json({ error: "Эмнэлгийн нэр шаардлагатай." }, { status: 400 });
    }
    if (contentType !== "doctor_lipsync" && !topic) {
      return NextResponse.json({ error: "Сэдэв шаардлагатай." }, { status: 400 });
    }
    if (contentType === "doctor_lipsync" && !(audio instanceof File)) {
      return NextResponse.json({ error: "Doctor video үүсгэхэд аудио шаардлагатай." }, { status: 400 });
    }

    const doctor = doctorId ? await getDoctorById(hospitalName, doctorId) : null;
    const job = await createGenerationJob({
      hospitalName,
      contentType,
      topic,
      doctorId,
      doctorName: doctor?.name,
      audioFile: audio instanceof File ? audio : null,
    });
    await startGenerationJob(job.id);

    return NextResponse.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation алдаа.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
