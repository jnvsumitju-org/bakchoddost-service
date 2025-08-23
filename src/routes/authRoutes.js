import { Router } from "express";
import { z } from "zod";
import { AdminUser } from "../models/AdminUser.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

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
  res.json({ id: req.user._id, email: req.user.email });
});

export default router;


