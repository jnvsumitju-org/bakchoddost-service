import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/authRoutes.js";
import poemRoutes from "./routes/poemRoutes.js";
import { randomUUID } from "crypto";
import env from "./config/env.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  const allowedOrigins = env.CORS_ORIGINS;
  const corsMiddleware = cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key", "X-Amz-Security-Token"],
  });
  app.use(corsMiddleware);
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.isProduction ? "combined" : "dev"));
  }

  // Attach request id for correlation
  app.use((req, res, next) => {
    // eslint-disable-next-line no-param-reassign
    req.id = req.headers["x-request-id"] || randomUUID();
    res.setHeader("x-request-id", req.id);
    const reqLog = logger.child({ reqId: req.id, method: req.method, url: req.originalUrl || req.url });
    req.log = reqLog;
    reqLog.info("request:start", { headers: { ...(req.headers || {}) } });
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      reqLog.info("request:finish", { status: res.statusCode, durationMs: ms });
    });
    next();
  });

  const apiLimiter = rateLimit({ windowMs: env.MAX_API_CALL_WINDOW_MS, max: env.MAX_API_CALL_LIMIT, standardHeaders: true, legacyHeaders: false });
  const authLimiter = rateLimit({ windowMs: env.MAX_AUTH_API_CALL_WINDOW_MS, max: env.MAX_AUTH_API_CALL_LIMIT, standardHeaders: true, legacyHeaders: false });
  const generateLimiter = rateLimit({ windowMs: env.MAX_POEM_GENERATE_WINDOW_MS, max: env.MAX_POEM_GENERATE_LIMIT, standardHeaders: true, legacyHeaders: false });
  app.use(apiLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "bakchoddost-api" });
  });
  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/poems/generate", generateLimiter);
  app.use("/api/poems", poemRoutes);

  // API root - return 200 with noindex to satisfy crawlers
  app.get("/", (_req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.type("text/plain").send("bakchoddost API");
  });
  app.head("/", (_req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(200).end();
  });

  // Error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    const log = (req && req.log) || logger;
    log.error("request:error", { status, message: err.message, stack: err.stack });
    res.status(status).json({ message: err.message || "Server error" });
  });

  return app;
}


