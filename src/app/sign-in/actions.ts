"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseSession } from "@/lib/server/supabaseAuth";

const EMAIL_COOKIE = "snap_signin_email";

/** Step 1: email a one-time code. The address waits in a short httpOnly cookie, never in the URL. */
export async function sendCode(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/sign-in?error=email");
  const supabase = await supabaseSession();
  if (!supabase) redirect("/sign-in?error=unavailable");
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) redirect("/sign-in?error=send");
  (await cookies()).set(EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/sign-in" });
  redirect("/sign-in?sent=1");
}

/** Step 2: check the code; Supabase sets the session cookies. */
export async function verifyCode(form: FormData) {
  const jar = await cookies();
  const email = jar.get(EMAIL_COOKIE)?.value;
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!email) redirect("/sign-in?error=expired");
  if (!/^\d{6,10}$/.test(token)) redirect("/sign-in?sent=1&error=code");
  const supabase = await supabaseSession();
  if (!supabase) redirect("/sign-in?error=unavailable");
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect("/sign-in?sent=1&error=code");
  jar.delete({ name: EMAIL_COOKIE, path: "/sign-in" });
  redirect("/snap");
}
