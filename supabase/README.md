# Supabase

`migrations/0001_init.sql` is the schema for `STORE=supabase`: ten tables, row level security on every
one, `is_staff()`, read policies (owner or staff on cases and their child rows, staff only on resolutions
and audit events, audit insert-only) and the private storage bucket `documents`.

It is already applied to project `kdbqjygxyykdwpjmxyjh` (https://kdbqjygxyykdwpjmxyjh.supabase.co) as
migration `kindred_snap_init`. The file mirrors what is live; change both together.

## Apply to a new project

- Supabase MCP: `apply_migration` with name `kindred_snap_init` and the file's contents as the query.
- Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push` (reads `supabase/migrations/`).
- Or paste the file into the dashboard SQL editor.

## Environment

```
STORE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>     # sign-in and session cookies
SUPABASE_SERVICE_ROLE_KEY=<service role key>        # server only; the store uses it
```

The service-role key comes from the dashboard (Project Settings → API Keys). It bypasses RLS: keep it in
`.env.local` and the Vercel environment, never in a `NEXT_PUBLIC_` variable or client code. The store
checks access itself through `src/lib/server/authz.ts`.
