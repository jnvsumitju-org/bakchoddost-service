import { Router } from "express";
import { z } from "zod";
import { PoemTemplate } from "../models/PoemTemplate.js";
import { requireAuth } from "../middleware/auth.js";
import { renderPoemTemplate, validateTemplateOrThrow, analyzeTemplate } from "../utils/poemEngine.js";

const router = Router();

// Public endpoints
router.get("/trending", async (_req, res) => {
  // Return up to 4 random poems (skip count to reduce DB round trips)
  const poems = await PoemTemplate.aggregate([{ $sample: { size: 4 } }]);
  const demo = poems.map((p) => ({
    id: p._id,
    text: renderPoemTemplate(p.text, "आप", ["मोनू", "टिंकू", "बबलू"]),
    instructions: p.instructions,
    usageCount: p.usageCount || 0,
  }));
  res.json(demo);
});

// Public browse with pagination and text search
router.get("/browse", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const q = (req.query.q || "").toString().trim();

  const useTextSearch = q.length > 0;
  const filter = useTextSearch ? { $text: { $search: q } } : {};
  const sort = useTextSearch ? { score: { $meta: "textScore" } } : { createdAt: -1 };

  const total = await PoemTemplate.countDocuments(filter);
  const query = PoemTemplate.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .select({ text: 1, instructions: 1, usageCount: 1, ...(useTextSearch ? { score: { $meta: "textScore" } } : {}) });

  const items = await query;
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
});

const genSchema = z.object({
  userName: z.string().min(1).max(60),
  friendNames: z.array(z.string().min(1).max(60)).min(1).max(10),
});

router.post("/generate", async (req, res) => {
  try {
    const { userName, friendNames } = genSchema.parse(req.body);
    const [template] = await PoemTemplate.aggregate([{ $sample: { size: 1 } }]);
    if (!template) return res.status(404).json({ message: "No templates available" });
    // Ensure inputs satisfy template requirements
    const { maxFriendIndexRequired } = analyzeTemplate(template.text);
    if (friendNames.length < maxFriendIndexRequired) {
      return res.status(400).json({ message: `This template needs at least ${maxFriendIndexRequired} friend names` });
    }
    const text = renderPoemTemplate(template.text, userName, friendNames);
    await PoemTemplate.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } });
    res.json({ text, templateId: template._id });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("/api/poems/generate error", { message: error?.message, stack: error?.stack });
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Failed to generate poem" });
  }
});

// Admin CRUD
const poemSchema = z.object({
  text: z.string().min(1),
  instructions: z.string().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const poems = await PoemTemplate.find({ owner: req.user._id }).sort({ createdAt: -1 });
  res.json(poems);
});

router.get("/:id", requireAuth, async (req, res) => {
  const poem = await PoemTemplate.findOne({ _id: req.params.id, owner: req.user._id });
  if (!poem) return res.status(404).json({ message: "Not found" });
  res.json(poem);
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const data = poemSchema.parse(req.body);
    validateTemplateOrThrow(data.text);
    const poem = await PoemTemplate.create({ ...data, owner: req.user._id });
    res.status(201).json(poem);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Failed to create poem" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const data = poemSchema.parse(req.body);
    validateTemplateOrThrow(data.text);
    const poem = await PoemTemplate.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      data,
      { new: true }
    );
    if (!poem) return res.status(404).json({ message: "Not found" });
    res.json(poem);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: "Failed to update poem" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const deleted = await PoemTemplate.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!deleted) return res.status(404).json({ message: "Not found" });
  res.json({ ok: true });
});

export default router;


