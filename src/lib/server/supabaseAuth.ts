import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Viewer } from "./authz";

/** The session client: publishable key plus the request's cookies. Null when Supabase is not configured (memory demo). */
export async function supabaseSession() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        // a server component cannot set cookies; route handlers and server actions can
        try { for (const { name, value, options } of list) jar.set(name, value, options); } catch {}
      },
    },
  });
}

/** The signed-in viewer with the role from `profiles` (default helper), or null. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await supabaseSession();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { id: user.id, role: (data?.role as Viewer["role"] | undefined) ?? "helper" };
}
