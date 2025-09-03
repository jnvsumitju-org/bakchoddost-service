import pkg from "pg";
import env from "./env.js";
import { logger } from "../utils/logger.js";

const { Pool } = pkg;

let pool;

export function getPool() {
  if (!pool) {
    const isDev = env.NODE_ENV !== "production";
    const ssl = isDev ? false : { rejectUnauthorized: false };
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
      ssl,
    });
  }
  return pool;
}

async function ensureLocalDatabase() {
  if (env.NODE_ENV === "production") return;
  try {
    const url = new URL(env.DATABASE_URL);
    const dbName = (url.pathname || "/").slice(1) || "postgres";
    if (!dbName || dbName === "postgres") return;
    const admin = new URL(env.DATABASE_URL);
    admin.pathname = "/postgres";
    const client = new pkg.Client({ connectionString: admin.toString(), ssl: false });
    await client.connect();
    logger.info("db:ensure:connect:postgres");
    const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rows.length === 0) {
      logger.info("db:ensure:create", { dbName });
      await client.query(`CREATE DATABASE "${dbName}"`);
      logger.info("db:ensure:created", { dbName });
    }
    await client.end();
  } catch (e) {
    logger.error("db:ensure:error", { message: e?.message });
  }
}

export async function connectToDatabase() {
  await ensureLocalDatabase();
  const p = getPool();
  // Test connection
  logger.info("db:connect:start");
  await p.query("SELECT 1");
  logger.info("db:connect:success");
  return p;
}

export async function migrate() {
  const p = getPool();
  logger.info("db:migrate:start");
  // Extensions (safe if superuser or permitted role). Ignore errors silently.
  try { await p.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`); } catch { /* noop */ }
  // AdminUser
  await p.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      password TEXT,
      phone TEXT UNIQUE,
      username TEXT UNIQUE,
      name TEXT,
      otp_code TEXT,
      otp_expires_at TIMESTAMPTZ,
      otp_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Backfill columns if migrating from older schema
  await p.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS otp_sent_at TIMESTAMPTZ;`);
  // PoemTemplate
  await p.query(`
    CREATE TABLE IF NOT EXISTS poem_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      text TEXT NOT NULL,
      instructions TEXT,
      owner_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Backfill column for existing tables
  await p.query(`ALTER TABLE poem_templates ADD COLUMN IF NOT EXISTS max_friend_required INTEGER NOT NULL DEFAULT 0;`);
  // Indexes
  await p.query(`CREATE INDEX IF NOT EXISTS idx_poem_templates_usage_count ON poem_templates (usage_count DESC);`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_poem_templates_text_gin ON poem_templates USING GIN (to_tsvector('english', text));`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_poem_templates_max_friend ON poem_templates (max_friend_required);`);
  // Backfill max_friend_required for existing rows once
  try {
    const { rows } = await p.query(`SELECT id, text FROM poem_templates WHERE max_friend_required = 0 LIMIT 1000`);
    if (rows.length > 0) {
      for (const row of rows) {
        const max = inferMaxFriend(row.text || "");
        if (Number.isFinite(max) && max > 0) {
          // eslint-disable-next-line no-await-in-loop
          await p.query(`UPDATE poem_templates SET max_friend_required = $2 WHERE id = $1`, [row.id, max]);
        }
      }
    }
  } catch (e) {
    logger.error("db:migrate:backfill:max_friend_required:error", { message: e?.message });
  }
  logger.info("db:migrate:success");
}

function inferMaxFriend(text) {
  const re = /\{\{\s*friendName(\d+)\s*\}\}/g;
  let m;
  let max = 0;
  while ((m = re.exec(text)) !== null) {
    const idx = parseInt(m[1], 10);
    if (!Number.isNaN(idx) && idx > max) max = idx;
  }
  return max;
}
