import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, loginSchema, registerSchema } from "@shared/schema";
import { z } from "zod";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// __dirname may not be available in all module contexts; use process.cwd() as fallback
const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// ── Simple password hashing (no bcrypt dep — use scrypt) ───────────────────
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const incoming = crypto.scryptSync(password, salt, 32).toString("hex");
  return incoming === hash;
}

// ── Load passages from JSON ─────────────────────────────────────────────────
let passagesCache: any[] | null = null;
function getPassages(): any[] {
  if (passagesCache) return passagesCache;
  // Try several likely paths
  const candidates = [
    path.join(_dirname, "../client/public/passages.json"),
    path.join(process.cwd(), "client/public/passages.json"),
    path.join(_dirname, "../dist/public/passages.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      passagesCache = JSON.parse(fs.readFileSync(p, "utf-8"));
      return passagesCache!;
    }
  }
  return [];
}

// ── Passage selection logic ─────────────────────────────────────────────────
function selectPassage(userId: string, delivered: string[]): any | null {
  const all = getPassages();
  const deliveredSet = new Set(delivered);
  const undelivered = all.filter(p => !deliveredSet.has(p.passage_id));
  if (undelivered.length === 0) return null;

  // Balance by book — prefer books least recently used
  const bookCounts: Record<string, number> = {};
  for (const p of all) {
    if (!bookCounts[p.book]) bookCounts[p.book] = 0;
  }
  for (const id of delivered) {
    const passage = all.find(p => p.passage_id === id);
    if (passage) bookCounts[passage.book] = (bookCounts[passage.book] || 0) + 1;
  }

  // Balance by type — pick the least-used type
  const typeCounts: Record<string, number> = { story: 0, aphorism: 0, reflection: 0, dialogue: 0, poem: 0 };
  for (const id of delivered) {
    const passage = all.find(p => p.passage_id === id);
    if (passage) typeCounts[passage.type] = (typeCounts[passage.type] || 0) + 1;
  }
  const minTypeCount = Math.min(...Object.values(typeCounts));
  const underrepresentedTypes = Object.entries(typeCounts)
    .filter(([, count]) => count <= minTypeCount + 1)
    .map(([t]) => t);

  // Filter by underrepresented types first; fall back to any undelivered
  let candidates = undelivered.filter(p => underrepresentedTypes.includes(p.type));
  if (candidates.length === 0) candidates = undelivered;

  // Within candidates, prefer less-used books
  candidates.sort((a, b) => (bookCounts[a.book] || 0) - (bookCounts[b.book] || 0));

  // Pick randomly from top 20% to introduce variety
  const topN = Math.max(1, Math.ceil(candidates.length * 0.2));
  const pool = candidates.slice(0, topN);
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    try {
      const body = registerSchema.parse(req.body);
      const existing = await storage.getUserByEmail(body.email);
      if (existing) return res.status(409).json({ error: "Email already registered" });

      const user = await storage.createUser({
        email: body.email,
        password: hashPassword(body.password),
      });

      // Create default preferences
      await storage.upsertPreferences({
        userId: user.id,
        preferredTime: "08:00",
        timezone: "Europe/London",
        emailNotifications: false,
      });

      // Return user (without password)
      const { password: _, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch (e: any) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(body.email);
      if (!user || !verifyPassword(body.password, user.password)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const { password: _, ...safeUser } = user;
      return res.json({ user: safeUser });
    } catch (e: any) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // ── Passages ─────────────────────────────────────────────────────────────────
  app.get("/api/passages/count", (_req, res) => {
    res.json({ count: getPassages().length });
  });

  // ── Deliveries ──────────────────────────────────────────────────────────────
  app.get("/api/deliveries/:userId", async (req, res) => {
    const deliveries = await storage.getDeliveriesForUser(req.params.userId);
    const passages = getPassages();
    const passageMap = new Map(passages.map(p => [p.passage_id, p]));
    const enriched = deliveries.map(d => ({
      ...d,
      passage: passageMap.get(d.passageId) ?? null,
    }));
    return res.json(enriched);
  });

  app.get("/api/deliveries/:userId/today", async (req, res) => {
    const delivery = await storage.getTodayDelivery(req.params.userId);
    if (!delivery) return res.json(null);
    const passage = getPassages().find(p => p.passage_id === delivery.passageId) ?? null;
    return res.json({ ...delivery, passage });
  });

  // Deliver today's thought (called on login / manual trigger)
  app.post("/api/deliveries/:userId/deliver", async (req, res) => {
    const { userId } = req.params;
    // Check if already delivered today
    const todayDelivery = await storage.getTodayDelivery(userId);
    if (todayDelivery) {
      const passage = getPassages().find(p => p.passage_id === todayDelivery.passageId) ?? null;
      return res.json({ ...todayDelivery, passage, alreadyDelivered: true });
    }

    const delivered = await storage.getDeliveredPassageIds(userId);
    const passage = selectPassage(userId, delivered);
    if (!passage) return res.status(404).json({ error: "All passages delivered — pool exhausted" });

    const delivery = await storage.createDelivery({
      userId,
      passageId: passage.passage_id,
      readAt: null,
      isFavourite: false,
    });
    return res.json({ ...delivery, passage });
  });

  // Toggle favourite
  app.patch("/api/deliveries/:deliveryId/favourite", async (req, res) => {
    const delivery = await storage.updateDelivery(req.params.deliveryId, {
      isFavourite: req.body.isFavourite,
    });
    if (!delivery) return res.status(404).json({ error: "Not found" });
    return res.json(delivery);
  });

  // Mark as read
  app.patch("/api/deliveries/:deliveryId/read", async (req, res) => {
    const delivery = await storage.updateDelivery(req.params.deliveryId, {
      readAt: new Date(),
    });
    if (!delivery) return res.status(404).json({ error: "Not found" });
    return res.json(delivery);
  });

  // Favourites list
  app.get("/api/favourites/:userId", async (req, res) => {
    const favs = await storage.getFavourites(req.params.userId);
    const passages = getPassages();
    const passageMap = new Map(passages.map(p => [p.passage_id, p]));
    return res.json(favs.map(d => ({ ...d, passage: passageMap.get(d.passageId) ?? null })));
  });

  // ── Preferences ─────────────────────────────────────────────────────────────
  app.get("/api/preferences/:userId", async (req, res) => {
    const prefs = await storage.getPreferences(req.params.userId);
    if (!prefs) return res.json(null);
    return res.json(prefs);
  });

  app.put("/api/preferences/:userId", async (req, res) => {
    const prefs = await storage.upsertPreferences({
      userId: req.params.userId,
      ...req.body,
    });
    return res.json(prefs);
  });

  // ── Stats ────────────────────────────────────────────────────────────────────
  app.get("/api/stats/:userId", async (req, res) => {
    const delivered = await storage.getDeliveredPassageIds(req.params.userId);
    const total = getPassages().length;
    const remaining = total - delivered.length;
    return res.json({
      total,
      delivered: delivered.length,
      remaining,
      favourites: (await storage.getFavourites(req.params.userId)).length,
    });
  });

  return httpServer;
}
