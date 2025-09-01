import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { connectToDatabase } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import poemRoutes from "./routes/poemRoutes.js";

dotenv.config();

const app = express();

// Database
connectToDatabase();

// Middleware
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
const corsEnv = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000";
const allowedOrigins = corsEnv.split(",").map((s) => s.trim()).filter(Boolean);
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
app.use(morgan("dev"));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(apiLimiter);

// Routes
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "bakchoddost-api", hint: "Use /api/health" });
});
//Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "bakchoddost-api" });
});
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/poems/generate", generateLimiter);
app.use("/api/poems", poemRoutes);

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
  // Fallback error handler
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`);
});


