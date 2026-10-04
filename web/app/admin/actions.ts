"use server";

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  adminCookieValue,
  markPosted,
  requireAdmin,
  saveManualSummary,
  setReviewStatus,
} from "@/lib/admin";
import { complianceProblems } from "@/lib/compliance";

export type ActionState = { error?: string; ok?: string };

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const given = Buffer.from(String(form.get("token") ?? ""));
  const real = Buffer.from(process.env.ADMIN_TOKEN ?? "");
  if (!real.length || given.length !== real.length || !timingSafeEqual(given, real)) {
    return { error: "Wrong admin password." };
  }
  (await cookies()).set(ADMIN_COOKIE, await adminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

function refreshSite() {
  revalidatePath("/", "layout"); // published items changed: rebuild cached pages
}

export async function approve(form: FormData) {
  await requireAdmin();
  await setReviewStatus(Number(form.get("id")), "approved");
  refreshSite();
}

export async function hide(form: FormData) {
  await requireAdmin();
  await setReviewStatus(Number(form.get("id")), "hidden");
  refreshSite();
}

export async function unhide(form: FormData) {
  await requireAdmin();
  await setReviewStatus(Number(form.get("id")), "approved");
  refreshSite();
}

export async function saveEdit(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get("id"));
  const fields = {
    en: { headline: String(form.get("headline_en") ?? "").trim(), body: String(form.get("body_en") ?? "").trim() },
    ur: { headline: String(form.get("headline_ur") ?? "").trim(), body: String(form.get("body_ur") ?? "").trim() },
  };
  for (const [lang, f] of Object.entries(fields)) {
    if (!f.headline || !f.body) return { error: `${lang.toUpperCase()}: headline and summary are required.` };
    if (f.headline.length > 90) return { error: `${lang.toUpperCase()}: headline is ${f.headline.length} characters (max 90).` };
    const problems = complianceProblems(`${f.headline}\n${f.body}`);
    if (problems.length) return { error: `${lang.toUpperCase()}: ${problems.join("; ")}` };
  }
  await saveManualSummary(id, "en", fields.en.headline, fields.en.body);
  await saveManualSummary(id, "ur", fields.ur.headline, fields.ur.body);
  await setReviewStatus(id, "approved");
  refreshSite();
  return { ok: "Saved and published." };
}

export async function posted(form: FormData) {
  await requireAdmin();
  await markPosted(Number(form.get("id")));
  revalidatePath("/admin/whatsapp");
}
