-- Minimal stand-ins for the parts of Supabase the migrations use, so they can run on a plain local Postgres.
-- For local testing only (supabase/tests/run.sh). Never run this on the hosted project.
create extension if not exists pgcrypto;
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticator login noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text,
  recovery_token text, email_change_token_new text, email_change text, email_change_token_current text, phone_change text,
  phone_change_token text, reauthentication_token text, is_sso_user boolean, is_anonymous boolean);
create table if not exists auth.identities (
  id uuid primary key, user_id uuid references auth.users(id), provider_id text, identity_data jsonb, provider text,
  created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('sub', auth.uid(), 'role', auth.role()) $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema if not exists storage;
grant usage on schema storage to authenticated, service_role;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert on storage.objects to authenticated;
