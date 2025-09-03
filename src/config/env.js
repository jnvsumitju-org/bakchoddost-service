import dotenv from "dotenv";
dotenv.config();
import { z } from "zod";

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().optional(),

  // Database (Postgres)
  DATABASE_URL: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),

  // Twilio (optional; OTP routes will fail fast if missing)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // Feature flags
  BCD_RETURN_OTP: z.string().optional(),

  // App Config
  MAX_API_CALL_LIMIT: z.string().optional(),
  MAX_API_CALL_WINDOW_MS: z.string().optional(),
  MAX_AUTH_API_CALL_LIMIT: z.string().optional(),
  MAX_AUTH_API_CALL_WINDOW_MS: z.string().optional(),
  MAX_POEM_GENERATE_LIMIT: z.string().optional(),
  MAX_POEM_GENERATE_WINDOW_MS: z.string().optional(),
});

const raw = RawEnvSchema.parse(process.env);
const isProduction = raw.NODE_ENV === "production";

// Compute validated + normalized env
export const env = {
  NODE_ENV: raw.NODE_ENV,
  isProduction,
  PORT: Number(raw.PORT || 4000),

  DATABASE_URL:
    raw.DATABASE_URL ||
    (isProduction
      ? undefined
      : "postgresql://bakchoddost:password@localhost:5432/bakchoddost"),

  JWT_SECRET: raw.JWT_SECRET || (isProduction ? undefined : "dev_secret"),

  CORS_ORIGINS:
    (raw.CORS_ORIGINS || raw.CORS_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),

  TWILIO_ACCOUNT_SID: raw.TWILIO_ACCOUNT_SID || undefined,
  TWILIO_AUTH_TOKEN: raw.TWILIO_AUTH_TOKEN || undefined,
  TWILIO_FROM_NUMBER: raw.TWILIO_FROM_NUMBER || undefined,

  BCD_RETURN_OTP: raw.BCD_RETURN_OTP === "true",

  MAX_API_CALL_LIMIT: Number(raw.MAX_API_CALL_LIMIT) || 3000,
  MAX_API_CALL_WINDOW_MS: Number(raw.MAX_API_CALL_WINDOW_MS) || 900000,
  MAX_AUTH_API_CALL_LIMIT: Number(raw.MAX_AUTH_API_CALL_LIMIT) || 3000,
  MAX_AUTH_API_CALL_WINDOW_MS: Number(raw.MAX_AUTH_API_CALL_WINDOW_MS) || 900000,
  MAX_POEM_GENERATE_LIMIT: Number(raw.MAX_POEM_GENERATE_LIMIT) || 3000,
  MAX_POEM_GENERATE_WINDOW_MS: Number(raw.MAX_POEM_GENERATE_WINDOW_MS) || 900000,
};

// Strict checks for production-only critical envs
const missing = [];
if (!env.DATABASE_URL) missing.push("DATABASE_URL");
if (!env.JWT_SECRET) missing.push("JWT_SECRET");

if (isProduction && missing.length > 0) {
  const msg = `Missing required environment variables: ${missing.join(", ")}`;
  // Throwing ensures Lambda cold start fails fast rather than at runtime
  throw new Error(msg);
}

export default env;


