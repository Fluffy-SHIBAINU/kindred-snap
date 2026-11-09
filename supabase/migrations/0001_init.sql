-- Mirror of migration `kindred_snap_init`, applied live to project kdbqjygxyykdwpjmxyjh.
-- Policies and is_staff() copied from pg_policies / pg_get_functiondef on that project.
create extension if not exists pgcrypto;
create table if not exists profiles (id uuid primary key references auth.users(id) on delete cascade, role text not null default 'helper' check (role in ('patient','helper','staff','admin')), created_at timestamptz not null default now());
create table if not exists cases (id text primary key, code text not null unique, state text not null check (state in ('created','reading','unreadable','needs_notice','connector_unavailable','comparing','needs_review','checking_assistance','drafting','ready_to_send','sent','responded','resolved','closed')), owner_id text not null, patient_name text not null, helper_name text, hospital_name text not null, hospital_ccn text, fixture_key text, consent jsonb, income jsonb, eligibility jsonb, due_date date, balance_cents bigint, steps jsonb not null default '[]'::jsonb, sent_at timestamptz, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists documents (id text primary key, case_id text not null references cases(id) on delete cascade, kind text not null check (kind in ('bill','msn','income','response_letter')), file_name text not null, pages int not null default 1, status text not null check (status in ('readable','unreadable','pending')), fields jsonb not null default '[]'::jsonb, bill_lines jsonb, bill_totals jsonb, msn_lines jsonb, msn_totals jsonb, text text, storage_path text, uploaded_at timestamptz not null default now());
create table if not exists findings (id text primary key, case_id text not null references cases(id) on delete cascade, kind text not null, amount_cents bigint, confidence text not null check (confidence in ('likely','possible','insufficient')), explanation text not null, evidence jsonb not null default '[]'::jsonb, requires_review boolean not null default false, staff_status text check (staff_status in ('confirmed','dismissed')), dismiss_reason text);
create table if not exists actions (id text primary key, case_id text not null references cases(id) on delete cascade, kind text not null check (kind in ('correction_request','information_request','assistance_application')), title text not null, draft text not null, status text not null check (status in ('drafted','approved','sent_simulated','responded')), approved_by text, approved_at timestamptz, sent_at timestamptz, validated_numbers jsonb not null default '[]'::jsonb);
create table if not exists consents (case_id text primary key references cases(id) on delete cascade, granted_at timestamptz not null, granted_by text not null, role text not null check (role in ('patient','helper')), scope text not null);
create table if not exists responses (id text primary key, case_id text not null references cases(id) on delete cascade, text text not null, quoted_line text not null, tier_applied int, new_balance_cents bigint not null, received_at timestamptz not null, simulated boolean not null default true check (simulated));
create table if not exists resolutions (case_id text primary key references cases(id) on delete cascade, estimated_opportunity_cents bigint not null default 0, confirmed_adjustment_cents bigint, actual_savings_cents bigint, basis_document_id text, recorded_by text, recorded_at timestamptz, constraint confirmed_needs_basis check (confirmed_adjustment_cents is null or basis_document_id is not null));
create table if not exists audit_events (id bigserial primary key, case_id text not null, at timestamptz not null default now(), actor text not null, role text not null, action text not null, details jsonb);
create table if not exists meta (key text primary key, value text not null);

-- Row level security. The server uses the service-role key, which bypasses RLS; these policies
-- bound what a signed-in browser session (publishable key) can read directly.
alter table profiles enable row level security;
alter table cases enable row level security;
alter table documents enable row level security;
alter table findings enable row level security;
alter table actions enable row level security;
alter table consents enable row level security;
alter table responses enable row level security;
alter table resolutions enable row level security;
alter table audit_events enable row level security;
alter table meta enable row level security;

create or replace function public.is_staff()
 returns boolean
 language sql
 stable
as $function$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('staff','admin'));
$function$;

create policy profiles_self on profiles for select using (id = auth.uid());

create policy cases_owner on cases for select using (owner_id = auth.uid()::text or is_staff());
create policy documents_owner on documents for select using (exists (select 1 from cases c where c.id = documents.case_id and (c.owner_id = auth.uid()::text or is_staff())));
create policy findings_owner on findings for select using (exists (select 1 from cases c where c.id = findings.case_id and (c.owner_id = auth.uid()::text or is_staff())));
create policy actions_owner on actions for select using (exists (select 1 from cases c where c.id = actions.case_id and (c.owner_id = auth.uid()::text or is_staff())));
create policy consents_owner on consents for select using (exists (select 1 from cases c where c.id = consents.case_id and (c.owner_id = auth.uid()::text or is_staff())));
create policy responses_owner on responses for select using (exists (select 1 from cases c where c.id = responses.case_id and (c.owner_id = auth.uid()::text or is_staff())));

create policy resolutions_staff on resolutions for select using (is_staff());
create policy audit_staff on audit_events for select using (is_staff());
-- Append-only: an insert policy and no update or delete policy.
create policy audit_insert_only on audit_events for insert with check (true);

-- meta has RLS on and no policy: only the service role reads or writes it.

insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
