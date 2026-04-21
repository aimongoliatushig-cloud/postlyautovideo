import { NextResponse } from "next/server";
import { saveHospitalAssets } from "@/lib/server/hospital-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const hospitalName = String(formData.get("hospitalName") ?? "").trim();
    const outro = formData.get("outro");
    const brandFrame = formData.get("brandFrame");

    if (!hospitalName) {
      return NextResponse.json({ error: "Эмнэлгийн нэр шаардлагатай." }, { status: 400 });
    }

    const assets = await saveHospitalAssets({
      hospitalName,
      outro: outro instanceof File ? outro : null,
      brandFrame: brandFrame instanceof File ? brandFrame : null,
    });

    return NextResponse.json({ success: true, assets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Asset upload алдаа." },
      { status: 500 },
    );
  }
}
