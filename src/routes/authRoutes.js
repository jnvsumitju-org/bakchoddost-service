import { Router } from "express";
import { z } from "zod";
import twilio from "twilio";
import axios from "axios";
import bcrypt from "bcryptjs";
import { signToken, requireAuth } from "../middleware/auth.js";
import env from "../config/env.js";
import { logger } from "../utils/logger.js";
import {
  upsertOtpByPhone,
  findByPhone,
  clearOtp,
  usernameAvailable,
  setProfile,
  findByEmail,
  createWithEmailPassword,
} from "../repo/users.js";

const router = Router();
// Outbound diagnostics - verify Internet egress from Lambda
router.get("/diag/outbound", async (req, res) => {
  try {
    const startedAt = Date.now();
    const { data } = await axios.get("https://api.ipify.org?format=json", { timeout: 3000 });
    const ms = Date.now() - startedAt;
    req.log?.info("diag:outbound:ok", { ip: data?.ip, ms });
    res.json({ ok: true, ip: data?.ip, ms });
  } catch (e) {
    req.log?.error("diag:outbound:error", { message: e?.message });
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});


function getTwilio() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = env;
  const sms = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;
  return { sms, twilioFrom: TWILIO_FROM_NUMBER };
}

// OTP login/signup start (send SMS)
const phoneSchema = z.object({ phone: z.string().min(6) });
router.post("/otp/start", async (req, res) => {
  try {
    logger.info("Sending OTP");
    const { phone } = phoneSchema.parse(req.body);
    req.log?.info("auth:otp:start", { phone });
    const { sms, twilioFrom } = getTwilio();
    const allowBypass = env.BCD_RETURN_OTP || !env.isProduction;
    req.log?.info("auth:otp:twilio:config", { hasClient: !!sms, hasFrom: !!twilioFrom, allowBypass });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 60 * 1000); // 1 minute expiry

    await upsertOtpByPhone(phone, code, expiresAt);

    if (sms && twilioFrom) {
      try {
        logger.info("Triggering SMS");
        const result = await sms.messages.create({
          to: phone,
          from: twilioFrom,
          body: `Your Bakchoddost verification code is ${code}`,
        });
        req.log?.info("auth:otp:twilio:sent", { sid: result?.sid, status: result?.status });
      } catch (twilioErr) {
        req.log?.error("auth:otp:twilio:error", { message: twilioErr?.message, code: twilioErr?.code });
        if (!allowBypass) return res.status(500).json({ message: "Failed to send OTP" });
      }
    } else if (!allowBypass) {
      return res.status(500).json({ message: "Twilio not configured" });
    }
    // Only log OTP meta in non-production to avoid leaking in logs
    if (!env.isProduction) {
      // eslint-disable-next-line no-console
      console.log(`[otp] sent to=%s code=%s`, phone, code);
    }
    if (allowBypass) return res.json({ ok: true, code });
    return res.json({ ok: true });
  } catch (error) {
    const log = req.log || logger;
    log.error("auth:otp:start:error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Failed to start OTP" });
  }
});

const confirmSchema = z.object({ phone: z.string().min(6), code: z.string().min(4) });
router.post("/otp/confirm", async (req, res) => {
  try {
    const { phone, code } = confirmSchema.parse(req.body);
    req.log?.info("auth:otp:confirm", { phone });
    const now = new Date();

    let user = await findByPhone(phone);
    if (!user || !user.otp_code || !user.otp_expires_at) {
      return res.status(401).json({ message: "Invalid OTP" });
    }
    if (user.otp_code !== code) return res.status(401).json({ message: "Invalid OTP" });
    if (new Date(user.otp_expires_at) < now) return res.status(401).json({ message: "OTP expired" });

    await clearOtp(user.id);

    const token = signToken(user.id);
    const isProd = env.isProduction;
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: isProd ? "lax" : "lax",
      secure: isProd,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ id: user.id, phone });
  } catch (error) {
    const log = req.log || logger;
    log.error("auth:otp:confirm:error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Failed to confirm OTP" });
  }
});

// Username availability
router.get("/username-available", async (req, res) => {
  const username = (req.query.username || "").toString().trim().toLowerCase();
  if (!username) return res.status(400).json({ available: false });
  const available = await usernameAvailable(username);
  res.json({ available });
});

// Register profile after OTP login (auto username)
const profileSchema = z.object({ firstName: z.string().min(1), lastName: z.string().optional() });
router.post("/register-profile", requireAuth, async (req, res) => {
  try {
    const { firstName, lastName } = profileSchema.parse(req.body);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    // Generate a unique username based on names
    const base = [firstName, lastName || ""].join("").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
    let candidate = base;
    let suffix = 0;
    // Ensure uniqueness with a bounded number of attempts
    // Try base, baseNN, and base + random if needed
    // eslint-disable-next-line no-await-in-loop
    while (!(await usernameAvailable(candidate))) {
      suffix += 1;
      if (suffix < 100) candidate = `${base}${suffix}`;
      else candidate = `${base}${Math.floor(100 + Math.random() * 900)}`;
      if (suffix > 500) break; // safety
    }
    req.log?.info("auth:profile:save", { userId: req.user.id, username: candidate });
    await setProfile(req.user.id, candidate, fullName);
    res.json({ ok: true, username: candidate, name: fullName });
  } catch (error) {
    const log = req.log || logger;
    log.error("auth:profile:save:error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Failed to register profile" });
  }
});

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/register", async (req, res) => {
  try {
    const { email, password } = authSchema.parse(req.body);
    req.log?.info("auth:register", { email });
    const existing = await findByEmail(email);
    if (existing) return res.status(400).json({ message: "Email already registered" });
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const user = await createWithEmailPassword(email, hash);
    const token = signToken(user.id);
    const isProd = env.isProduction;
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: isProd ? "lax" : "lax",
      secure: isProd,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ id: user.id, email: user.email, token });
  } catch (error) {
    const log = req.log || logger;
    log.error("auth:register:error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = authSchema.parse(req.body);
    req.log?.info("auth:login", { email });
    const user = await findByEmail(email);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });
    const token = signToken(user.id);
    const isProd = env.isProduction;
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: isProd ? "lax" : "lax",
      secure: isProd,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ id: user.id, email: user.email, token });
  } catch (error) {
    const log = req.log || logger;
    log.error("auth:login:error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Login failed" });
  }
});

router.post("/logout", (_req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: isProd ? "lax" : "lax",
    secure: isProd,
    path: "/",
  });
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, phone: req.user.phone, username: req.user.username, name: req.user.name });
});

export default router;


