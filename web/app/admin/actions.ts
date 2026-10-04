"use server";

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  FAILURE_WINDOW_MIN,
  approveMany,
  clientIp,
  isAdminEmail,
  itemSources,
  markPosted,
  recordAttempt,
  requireAdmin,
  saveManualSummary,
  setReviewStatus,
  tooManyFailures,
} from "@/lib/admin";
import { complianceProblems } from "@/lib/compliance";
import { allowedNumbers, fmt, numberChanges, unknownNumbers } from "@/lib/numbers";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session";
import { SITE_URL } from "@/lib/brand";

export type ActionState = { error?: string; ok?: string; needsConfirm?: boolean };

const AUTH = `${process.env.SUPABASE_URL}/auth/v1`;
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const LOCKED = `Too many failed sign-ins from this address. Try again in ${FAILURE_WINDOW_MIN} minutes.`;

async function startSession(email: string) {
  const value = await signSession(email);
  if (!value) throw new Error("ADMIN_SESSION_SECRET is missing or shorter than 32 characters");
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // lax so the link in the sign-in email can land on a signed-in page
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

/** Step 1 of sign-in: email a one-time link (Supabase Auth). The answer is the same whether or not
 *  the email is an admin, so the form can't be used to discover admin addresses. */
export async function requestLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (await tooManyFailures(ip)) return { error: LOCKED };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const sent = { ok: "If this email belongs to an admin, a sign-in link is on its way. It works once and expires in 1 hour." };
  if (!email.includes("@")) return { error: "Enter your email address." };
  if (!(await isAdminEmail(email))) {
    await recordAttempt(ip, false);
    return sent;
  }
  const redirectTo = encodeURIComponent(`${SITE_URL}/admin/auth/callback`);
  const res = await fetch(`${AUTH}/otp?redirect_to=${redirectTo}`, {
    method: "POST",
    headers: { apikey: PUBLIC_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
  });
  await recordAttempt(ip, res.ok);
  if (res.status === 429) return { error: "Supabase is limiting sign-in emails right now. Wait a few minutes and try again." };
  if (!res.ok) return { error: `Could not send the email (Supabase answered ${res.status}).` };
  return sent;
}

/** Step 2: the link lands on /admin/auth/callback with a Supabase access token. Ask Supabase who it
 *  belongs to, check that person is in admin_users, then start our own signed session. */
export async function completeSignIn(accessToken: string): Promise<ActionState> {
  const ip = await clientIp();
  if (await tooManyFailures(ip)) return { error: LOCKED };
  const res = await fetch(`${AUTH}/user`, { headers: { apikey: PUBLIC_KEY, authorization: `Bearer ${accessToken}` } });
  const user = res.ok ? ((await res.json()) as { email?: string }) : null;
  const email = user?.email?.toLowerCase();
  if (!email || !(await isAdminEmail(email))) {
    await recordAttempt(ip, false);
    return { error: "This sign-in link is not valid for an admin. Request a new link." };
  }
  await recordAttempt(ip, true);
  await startSession(email);
  return { ok: "Signed in." };
}

/** Emergency sign-in with ADMIN_TOKEN, only when ADMIN_ALLOW_PASSWORD=1 (e.g. before email is set up). */
export async function passwordLogin(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (process.env.ADMIN_ALLOW_PASSWORD !== "1") return { error: "Password sign-in is turned off. Use the email link." };
  const ip = await clientIp();
  if (await tooManyFailures(ip)) return { error: LOCKED };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const given = Buffer.from(String(form.get("token") ?? ""));
  const real = Buffer.from(process.env.ADMIN_TOKEN ?? "");
  const passwordOk = real.length > 0 && given.length === real.length && timingSafeEqual(given, real);
  if (!passwordOk || !(await isAdminEmail(email))) {
    await recordAttempt(ip, false);
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing further
    return { error: "Wrong email or password." };
  }
  await recordAttempt(ip, true);
  await startSession(email);
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
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

export async function approveSelected(form: FormData) {
  await requireAdmin();
  const ids = form.getAll("ids").map(Number).filter(Number.isInteger);
  await approveMany(ids);
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

// Urdu style rules (mirrored from pipeline/core/quality.py), applied to admin edits too.
const UR_STYLE: [RegExp, string][] = [
  [/(^|[\s،])نل([\s،۔]|$)/, "'نل' means a water tap; write e.g. 'کوئی کیش ڈیویڈنڈ … تجویز نہیں کیے'"],
  [/آئی ایم ایف|ایف بی آر|ایس بی پی|ایس ای سی پی|پی ایس ایکس|ای پی ایس|اے جی ایم/, "write short codes (IMF, FBR, SBP…) in English letters"],
  [/بک کلوژر[^۔]*?(ہوگا|ہو گا|رہے گا|شروع ہوگا)/, "بک کلوژر is feminine: write 'ہوگی' / 'رہے گی'"],
];

/** Save an admin's corrected text. Every number must be in the original filing; a number that
 *  isn't (for example OCR garbled the source) needs the editor to tick "I checked these numbers". */
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
    if (lang === "ur") for (const [re, msg] of UR_STYLE) if (re.test(`${f.headline}\n${f.body}`)) problems.push(msg);
    if (problems.length) return { error: `${lang.toUpperCase()}: ${problems.join("; ")}` };
  }

  const { texts, before } = await itemSources(id);
  const allowed = allowedNumbers(texts);
  const unknown = (["en", "ur"] as const).flatMap((lang) =>
    unknownNumbers(`${fields[lang].headline}\n${fields[lang].body}`, allowed).map((u) => ({ ...u, lang })),
  );
  if (unknown.length && form.get("confirm_numbers") !== "on") {
    const list = unknown.map((u) => `${fmt(u.value)} (${u.lang.toUpperCase()}: “${u.sentence.slice(0, 80)}”)`).join("; ");
    return {
      error: `Not found in the original filing: ${list}. Check against the filing, then tick “I checked these numbers” to publish anyway.`,
      needsConfirm: true,
    };
  }

  await saveManualSummary(id, "en", fields.en.headline, fields.en.body);
  await saveManualSummary(id, "ur", fields.ur.headline, fields.ur.body);
  await setReviewStatus(id, "approved");
  refreshSite();
  const changes = numberChanges(before.en, `${fields.en.headline}\n${fields.en.body}`);
  const changed = [
    changes.removed.length ? `removed ${changes.removed.map(fmt).join(", ")}` : "",
    changes.added.length ? `added ${changes.added.map(fmt).join(", ")}` : "",
  ].filter(Boolean);
  return { ok: `Saved and published.${changed.length ? ` Numbers in English: ${changed.join("; ")}.` : ""}` };
}

export async function posted(form: FormData) {
  await requireAdmin();
  await markPosted(Number(form.get("id")));
  revalidatePath("/admin/whatsapp");
}
