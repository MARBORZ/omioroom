import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Minimal stand-ins for the Supabase platform pieces the migrations rely on. */
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    is_anonymous boolean not null default false,
    created_at timestamptz not null default now(),
    last_sign_in_at timestamptz,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase grants everything on new public objects to its API roles by default.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create publication supabase_realtime;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets (id),
    name text not null,
    owner uuid default auth.uid(),
    created_at timestamptz not null default now()
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to authenticated, service_role;
  grant select on storage.buckets to authenticated;
`;

export class RpcError extends Error {}

export interface TestDb {
  db: PGlite;
  newUser(opts?: { anonymous?: boolean; email?: string; username?: string }): Promise<string>;
  as(userId: string | null): Client;
}

export interface Client {
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>;
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }

  let counter = 0;
  // Most tests need several rooms per user; the limit itself is tested explicitly (see rules.test.ts)
  // Most tests play simple direct links; the rule that bans them is tested explicitly
  await db.exec("create or replace function public.direct_media_allowed() returns boolean language sql immutable as $$ select true $$");
  // Most tests play direct links in open rooms; the open-room source rule is tested explicitly
  await db.exec("create or replace function public.open_rooms_platforms_only() returns boolean language sql immutable as $$ select false $$");
  // Tests act right after joining; the grace period itself is tested explicitly
  await db.exec("create or replace function public.join_grace() returns interval language sql immutable as $$ select interval '0 seconds' $$");
  await db.exec("create or replace function public.room_limit_per_user() returns integer language sql immutable as $$ select 100 $$");

  const run = async <T>(userId: string | null, sql: string, params: unknown[]): Promise<T[]> => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`);
    await db.exec(userId ? "set role authenticated" : "set role anon");
    try {
      const res = await db.query<T>(sql, params);
      return res.rows;
    } catch (err) {
      throw new RpcError(err instanceof Error ? err.message : String(err));
    } finally {
      await db.exec("reset role");
    }
  };

  return {
    db,
    async newUser(opts = {}) {
      counter += 1;
      const anonymous = opts.anonymous ?? true;
      const res = await db.query<{ id: string }>(
        `insert into auth.users (email, is_anonymous, raw_user_meta_data)
         values ($1, $2, $3::jsonb) returning id`,
        [
          anonymous ? null : opts.email ?? `user${counter}@example.com`,
          anonymous,
          JSON.stringify(opts.username ? { username: opts.username } : {}),
        ]
      );
      return res.rows[0]!.id;
    },
    as(userId) {
      return {
        async rpc(fn, args = {}) {
          const keys = Object.keys(args);
          const placeholders = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
          const rows = await run<Record<string, unknown>>(
            userId,
            `select public.${fn}(${placeholders}) as result`,
            keys.map((k) => {
              const v = args[k];
              return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
            })
          );
          return rows[0]?.result as any;
        },
        query: (sql, params = []) => run(userId, sql, params),
      };
    },
  };
}
