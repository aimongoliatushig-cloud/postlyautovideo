import { NextResponse } from "next/server";
import { listHospitalSummaries } from "@/lib/server/hospital-store";

export const runtime = "nodejs";

export async function GET() {
  const hospitals = await listHospitalSummaries();
  return NextResponse.json({ hospitals });
}
