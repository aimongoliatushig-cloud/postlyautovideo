import { NextResponse } from "next/server";
import { saveDoctorRecord } from "@/lib/server/hospital-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const hospitalName = String(formData.get("hospitalName") ?? "").trim();
    const doctorName = String(formData.get("doctorName") ?? "").trim();
    const specialty = String(formData.get("specialty") ?? "").trim();
    const photo = formData.get("photo");

    if (!hospitalName) {
      return NextResponse.json({ error: "Эмнэлгийн нэр шаардлагатай." }, { status: 400 });
    }
    if (!doctorName) {
      return NextResponse.json({ error: "Эмчийн нэр шаардлагатай." }, { status: 400 });
    }
    if (!(photo instanceof File)) {
      return NextResponse.json({ error: "Эмчийн зураг шаардлагатай." }, { status: 400 });
    }

    const doctor = await saveDoctorRecord({
      hospitalName,
      doctorName,
      specialty,
      photo,
    });

    return NextResponse.json({ success: true, doctor });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Doctor upload алдаа." },
      { status: 500 },
    );
  }
}
