"use server";

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { revalidatePath } from "next/cache";
import { jobRuns, requireAdmin } from "@/lib/admin";

export type RunState = { error?: string; ok?: string };

const SOURCES = ["psx_companies", "psx_notices", "secp_notices", "dawn_business", "brecorder_latest", "tribune_business", "propakistani_business"];

/**
 * Start a pipeline run on this computer (JOB_RUNNER=local). The Python job records itself in
 * job_runs, so the page shows its progress. Later, scheduled runs will happen on GitHub instead.
 */
export async function startJob(_prev: RunState, form: FormData): Promise<RunState> {
  await requireAdmin();
  if (process.env.JOB_RUNNER !== "local") {
    return { error: "Running jobs from this page is only enabled on your own computer (JOB_RUNNER=local)." };
  }
  const job = String(form.get("job") ?? "");
  if (!["ingest", "process", "pipeline"].includes(job)) return { error: "Unknown job." };
  const args = ["run", "python", "-m", "pipeline.jobs.run", "--job", job, "--triggered-by", "admin"];

  const date = String(form.get("date") ?? "").trim();
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date must look like 2026-10-02." };
    args.push("--date", date);
  }
  const source = String(form.get("source") ?? "").trim();
  if (source) {
    if (!SOURCES.includes(source)) return { error: "Unknown source." };
    args.push("--source", source);
  }
  const maxAi = Number(form.get("max_ai") ?? 25);
  if (Number.isInteger(maxAi) && maxAi > 0 && maxAi <= 200) args.push("--max-ai", String(maxAi));

  const running = (await jobRuns(5)).find((r) => r.status === "running");
  if (running) return { error: `Run #${running.id} is still in progress. Wait for it to finish.` };

  const child = spawn("uv", args, {
    cwd: resolve(process.cwd(), ".."), // repository root (the website lives in web/)
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {}); // e.g. uv not installed: the run never appears, and the page says so
  child.unref();
  // Give the job a moment to register itself, so it shows up immediately.
  await new Promise((r) => setTimeout(r, 2500));
  revalidatePath("/admin/jobs");
  return { ok: `Started: ${job}${date ? ` for ${date}` : ""}${source ? ` (${source} only)` : ""}.` };
}
