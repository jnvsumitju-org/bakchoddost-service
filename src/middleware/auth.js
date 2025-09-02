import jwt from "jsonwebtoken";
import env from "../config/env.js";
import { findById } from "../repo/users.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const tokenFromHeader = header.startsWith("Bearer ") ? header.substring(7) : null;
    const tokenFromCookie = req.cookies?.token || null;
    const token = tokenFromHeader || tokenFromCookie;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await findById(payload.id);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export function signToken(userId) {
  return jwt.sign({ id: userId }, env.JWT_SECRET, { expiresIn: "7d" });
}


