import { NextResponse } from "next/server";
import { listRecentJobs } from "@/lib/server/job-store";

export const runtime = "nodejs";

export async function GET() {
  const jobs = await listRecentJobs(200);
  return NextResponse.json({ jobs });
}
