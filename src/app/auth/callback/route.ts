import { NextResponse, type NextRequest } from "next/server";
import { supabaseSession } from "@/lib/server/supabaseAuth";

/** The email link variant: exchange `?code=` for a session cookie, then go to the start of a case. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await supabaseSession();
  if (!code || !supabase) return NextResponse.redirect(new URL("/sign-in?error=expired", request.url));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/sign-in?error=expired" : "/snap", request.url));
}
