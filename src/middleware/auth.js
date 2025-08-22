import jwt from "jsonwebtoken";
import { AdminUser } from "../models/AdminUser.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const tokenFromHeader = header.startsWith("Bearer ") ? header.substring(7) : null;
    const tokenFromCookie = req.cookies?.token || null;
    const token = tokenFromHeader || tokenFromCookie;
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    const user = await AdminUser.findById(payload.id).select("-password");
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

export function signToken(userId) {
  const secret = process.env.JWT_SECRET || "dev_secret";
  return jwt.sign({ id: userId }, secret, { expiresIn: "7d" });
}


