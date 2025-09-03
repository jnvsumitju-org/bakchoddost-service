import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { renderPoemTemplate, validateTemplateOrThrow, analyzeTemplate } from "../utils/poemEngine.js";
import { samplePoems, samplePoemsForFriendCount, browsePoems, incUsage, listByOwner, findByIdForOwner, createPoem, updatePoem as updatePoemRepo, deletePoem as deletePoemRepo, countFittingTemplates, getFitStats } from "../repo/poems.js";
import { getPool } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { findByUsername } from "../repo/users.js";

const router = Router();

// Public endpoints
router.get("/trending", async (_req, res) => {
  const poems = await samplePoems(4);
  const pool = getPool();
  const ownerIds = poems.map((p) => p.owner_id).filter(Boolean);
  let ownerMap = new Map();
  if (ownerIds.length) {
    const { rows } = await pool.query(`SELECT id, username FROM admin_users WHERE id = ANY($1::uuid[])`, [ownerIds]);
    ownerMap = new Map(rows.map((r) => [r.id, r.username]));
  }
  const demo = poems.map((p) => ({
    id: p.id,
    text: renderPoemTemplate(p.text, "आप", ["मोनू", "टिंकू", "बबलू"]),
    instructions: p.instructions,
    usageCount: p.usage_count || 0,
    ownerUsername: p.owner_id ? ownerMap.get(p.owner_id) || null : null,
  }));
  res.json(demo);
});

// Public browse with pagination and text search
router.get("/browse", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const q = (req.query.q || "").toString().trim();

  const { rows, total } = await browsePoems({ q, page, limit });
  const pool = getPool();
  const ownerIds = rows.map((r) => r.owner_id).filter(Boolean);
  let ownerMap = new Map();
  if (ownerIds.length) {
    const { rows: users } = await pool.query(`SELECT id, username FROM admin_users WHERE id = ANY($1::uuid[])`, [ownerIds]);
    ownerMap = new Map(users.map((u) => [u.id, u.username]));
  }
  const items = rows.map((d) => ({
    _id: d.id,
    text: d.text,
    instructions: d.instructions,
    usageCount: d.usage_count,
    ownerUsername: d.owner_id ? ownerMap.get(d.owner_id) || null : null,
  }));
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
});

const genSchema = z.object({
  userName: z.string().min(1).max(60),
  friendNames: z.array(z.string().min(1).max(60)).min(1).max(10),
});

router.post("/generate", async (req, res) => {
  try {
    const { userName, friendNames } = genSchema.parse(req.body);
    const normalizedFriends = friendNames.map((f) => f.trim()).filter(Boolean);
    req.log?.info("poem:generate", { userName, friends: normalizedFriends.length });
    // Prefer an exact match by required friend count
    let [template] = await samplePoemsForFriendCount(normalizedFriends.length, 1);
    if (!template) {
      // Fallback to any random template if exact match not available
      [template] = await samplePoems(1);
    }
    if (!template) return res.status(404).json({ message: "No templates available" });
    // Ensure inputs satisfy template requirements
    const { maxFriendIndexRequired } = analyzeTemplate(template.text);
    if (normalizedFriends.length < maxFriendIndexRequired) {
      return res.status(400).json({ message: `This template needs at least ${maxFriendIndexRequired} friend names` });
    }
    const text = renderPoemTemplate(template.text, userName, normalizedFriends);
    await incUsage(template.id);
    res.json({ text, templateId: template.id });
  } catch (error) {
    const log = req.log || logger;
    log.error("poem:generate:error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Failed to generate poem" });
  }
});

// Live count of matching templates for a given friend list length
router.get("/fit-count", async (req, res) => {
  const n = Math.max(0, parseInt((req.query.friends || "0"), 10) || 0);
  const c = await countFittingTemplates(n);
  res.json({ count: c });
});

router.get("/fit-stats", async (_req, res) => {
  const rows = await getFitStats();
  res.json({ items: rows });
});

// Admin CRUD
const poemSchema = z.object({
  text: z.string().min(1),
  instructions: z.string().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const poems = await listByOwner(req.user.id);
  res.json(poems.map((p) => ({ _id: p.id, text: p.text, instructions: p.instructions, usageCount: p.usage_count || p.usageCount || 0 })));
});

router.get("/:id", requireAuth, async (req, res) => {
  const poem = await findByIdForOwner(req.params.id, req.user.id);
  if (!poem) return res.status(404).json({ message: "Not found" });
  res.json({ _id: poem.id, text: poem.text, instructions: poem.instructions });
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const data = poemSchema.parse(req.body);
    validateTemplateOrThrow(data.text);
    req.log?.info("poem:create", { userId: req.user.id });
    const poem = await createPoem(req.user.id, data);
    res.status(201).json({ _id: poem.id });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    const log = req.log || logger;
    log.error("poem:create:error", { message: error?.message, stack: error?.stack });
    return res.status(500).json({ message: "Failed to create poem" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const data = poemSchema.parse(req.body);
    validateTemplateOrThrow(data.text);
    req.log?.info("poem:update", { userId: req.user.id, id: req.params.id });
    const ok = await updatePoemRepo(req.params.id, req.user.id, data);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ _id: req.params.id });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    const log = req.log || logger;
    log.error("poem:update:error", { message: error?.message, stack: error?.stack });
    return res.status(500).json({ message: "Failed to update poem" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  req.log?.info("poem:delete", { userId: req.user.id, id: req.params.id });
  const ok = await deletePoemRepo(req.params.id, req.user.id);
  if (!ok) return res.status(404).json({ message: "Not found" });
  res.json({ ok: true });
});

// Public: list poems by username
router.get("/by/:username", async (req, res) => {
  const username = (req.params.username || "").toString().trim();
  if (!username) return res.status(400).json({ message: "Username required" });
  const user = await findByUsername(username);
  if (!user) return res.status(404).json({ message: "User not found" });
  const poems = await listByOwner(user.id);
  res.json({ user: { id: user.id, username: user.username, name: user.name }, items: poems.map((p) => ({ _id: p.id, text: p.text, instructions: p.instructions })) });
});

export default router;


