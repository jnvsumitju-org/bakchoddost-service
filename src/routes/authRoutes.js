import { Router } from "express";
import { z } from "zod";
import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand, SignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import { AdminUser } from "../models/AdminUser.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();
// ENV (provided later by user)
const REGION = process.env.AWS_REGION || "ap-south-1";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "";
const CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID || "";
const cognito = new CognitoIdentityProviderClient({ region: REGION });

// OTP login (CUSTOM_AUTH) flow
const phoneSchema = z.object({ phone: z.string().min(6) });
router.post("/otp/start", async (req, res) => {
  try {
    const { phone } = phoneSchema.parse(req.body);
    const params = {
      ClientId: CLIENT_ID,
      AuthFlow: "CUSTOM_AUTH",
      AuthParameters: { USERNAME: phone },
    };
    await cognito.send(new InitiateAuthCommand(params));
    res.json({ ok: true });
  } catch (error) {
    console.error("/api/auth/otp/start error", error);
    return res.status(500).json({ message: "Failed to start OTP" });
  }
});

const confirmSchema = z.object({ phone: z.string().min(6), code: z.string().min(4) });
router.post("/otp/confirm", async (req, res) => {
  try {
    const { phone, code } = confirmSchema.parse(req.body);
    const init = await cognito.send(new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "CUSTOM_AUTH",
      AuthParameters: { USERNAME: phone },
    }));
    const challenge = await cognito.send(new RespondToAuthChallengeCommand({
      ClientId: CLIENT_ID,
      ChallengeName: "CUSTOM_CHALLENGE",
      Session: init.Session,
      ChallengeResponses: { USERNAME: phone, ANSWER: code },
    }));
    if (!challenge.AuthenticationResult) return res.status(401).json({ message: "Invalid OTP" });

    // Find or create local admin user record
    let user = await AdminUser.findOne({ phone });
    if (!user) user = await AdminUser.create({ phone });
    const token = signToken(user._id.toString());
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.json({ id: user._id, phone });
  } catch (error) {
    console.error("/api/auth/otp/confirm error", error);
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


