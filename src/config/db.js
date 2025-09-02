import pkg from "pg";
import env from "./env.js";

const { Pool } = pkg;

let pool;

export function getPool() {
  if (!pool) {
    const useSSL = typeof env.DATABASE_URL === "string" && env.DATABASE_URL.includes("sslmode=require");
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
      ssl: useSSL ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function connectToDatabase() {
  const p = getPool();
  // Test connection
  await p.query("SELECT 1");
  console.log("✅ Connected to Postgres");
  return p;
}

export async function migrate() {
  const p = getPool();
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
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
  // Indexes
  await p.query(`CREATE INDEX IF NOT EXISTS idx_poem_templates_usage_count ON poem_templates (usage_count DESC);`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_poem_templates_text_gin ON poem_templates USING GIN (to_tsvector('english', text));`);
}
