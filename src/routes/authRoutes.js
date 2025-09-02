import { Router } from "express";
import { z } from "zod";
import twilio from "twilio";
import bcrypt from "bcryptjs";
import { signToken, requireAuth } from "../middleware/auth.js";
import env from "../config/env.js";
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

function getTwilio() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = env;
  const sms = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;
  return { sms, twilioFrom: TWILIO_FROM_NUMBER };
}

// OTP login/signup start (send SMS)
const phoneSchema = z.object({ phone: z.string().min(6) });
router.post("/otp/start", async (req, res) => {
  try {
    const { phone } = phoneSchema.parse(req.body);
    const { sms, twilioFrom } = getTwilio();
    if (!sms || !twilioFrom) return res.status(500).json({ message: "Twilio not configured" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await upsertOtpByPhone(phone, code, expiresAt);

    await sms.messages.create({
      to: phone,
      from: twilioFrom,
      body: `Your Bakchoddost verification code is ${code}`,
    });
    // Only log OTP meta in non-production to avoid leaking in logs
    if (!env.isProduction) {
      // eslint-disable-next-line no-console
      console.log(`[otp] sent to=%s code=%s`, phone, code);
    }
    const shouldReturnCode = env.BCD_RETURN_OTP || !env.isProduction;
    if (shouldReturnCode) return res.json({ ok: true, code });
    return res.json({ ok: true });
  } catch (error) {
    console.error("/api/auth/otp/start error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Failed to start OTP" });
  }
});

const confirmSchema = z.object({ phone: z.string().min(6), code: z.string().min(4) });
router.post("/otp/confirm", async (req, res) => {
  try {
    const { phone, code } = confirmSchema.parse(req.body);
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
    console.error("/api/auth/otp/confirm error", { message: error?.message, stack: error?.stack });
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

// Register profile after OTP login
const profileSchema = z.object({ username: z.string().min(3), name: z.string().min(1) });
router.post("/register-profile", requireAuth, async (req, res) => {
  try {
    const { username, name } = profileSchema.parse(req.body);
    const taken = !(await usernameAvailable(username));
    if (taken) return res.status(409).json({ message: "Username taken" });
    await setProfile(req.user.id, username, name);
    res.json({ ok: true });
  } catch (error) {
    console.error("/api/auth/register-profile error", error);
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
    // eslint-disable-next-line no-console
    console.error("/api/auth/register error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = authSchema.parse(req.body);
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
    // eslint-disable-next-line no-console
    console.error("/api/auth/login error", { message: error?.message, stack: error?.stack });
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


