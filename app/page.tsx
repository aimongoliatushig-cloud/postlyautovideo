import { Dashboard } from "@/components/dashboard";
import { listHospitalSummaries } from "@/lib/server/hospital-store";
import { listRecentJobs } from "@/lib/server/job-store";

export default async function Home() {
  const [hospitals, jobs] = await Promise.all([
    listHospitalSummaries(),
    listRecentJobs(200),
  ]);

  return <Dashboard initialHospitals={hospitals} initialJobs={jobs} />;
}
