import { Router } from "express";
import { z } from "zod";
import twilio from "twilio";
import { AdminUser } from "../models/AdminUser.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

function getTwilio() {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID || "";
  const twilioToken = process.env.TWILIO_AUTH_TOKEN || "";
  const twilioFrom = process.env.TWILIO_FROM_NUMBER || "";
  const sms = twilioSid && twilioToken ? twilio(twilioSid, twilioToken) : null;
  return { sms, twilioFrom };
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

    await AdminUser.findOneAndUpdate(
      { phone },
      { $set: { phone, otpCode: code, otpExpiresAt: expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sms.messages.create({
      to: phone,
      from: twilioFrom,
      body: `Your Bakchoddost verification code is ${code}`,
    });
    // eslint-disable-next-line no-console
    console.log(`[otp] sent to=%s code=%s`, phone, code);
    const shouldReturnCode = process.env.BCD_RETURN_OTP === "true" || process.env.NODE_ENV !== "production";
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

    let user = await AdminUser.findOne({ phone });
    if (!user || !user.otpCode || !user.otpExpiresAt) {
      return res.status(401).json({ message: "Invalid OTP" });
    }
    if (user.otpCode !== code) return res.status(401).json({ message: "Invalid OTP" });
    if (user.otpExpiresAt < now) return res.status(401).json({ message: "OTP expired" });

    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    const token = signToken(user._id.toString());
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: isProd ? "lax" : "lax",
      secure: isProd,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ id: user._id, phone });
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
  const existing = await AdminUser.findOne({ username });
  res.json({ available: !existing });
});

// Register profile after OTP login
const profileSchema = z.object({ username: z.string().min(3), name: z.string().min(1) });
router.post("/register-profile", requireAuth, async (req, res) => {
  try {
    const { username, name } = profileSchema.parse(req.body);
    const taken = await AdminUser.findOne({ username: username.toLowerCase() });
    if (taken) return res.status(409).json({ message: "Username taken" });
    req.user.username = username.toLowerCase();
    req.user.name = name;
    await req.user.save();
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
    const existing = await AdminUser.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already registered" });
    const user = await AdminUser.create({ email, password });
    const token = signToken(user._id.toString());
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: isProd ? "lax" : "lax",
      secure: isProd,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ id: user._id, email: user.email, token });
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
    const user = await AdminUser.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });
    const token = signToken(user._id.toString());
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: isProd ? "lax" : "lax",
      secure: isProd,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ id: user._id, email: user.email, token });
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
  res.json({ id: req.user._id, email: req.user.email, phone: req.user.phone, username: req.user.username, name: req.user.name });
});

export default router;


