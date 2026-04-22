import {
  type User, type InsertUser,
  type Delivery, type InsertDelivery,
  type UserPreferences, type InsertUserPreferences,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Deliveries
  getDeliveriesForUser(userId: string): Promise<Delivery[]>;
  getDeliveredPassageIds(userId: string): Promise<string[]>;
  getTodayDelivery(userId: string): Promise<Delivery | undefined>;
  createDelivery(delivery: InsertDelivery): Promise<Delivery>;
  updateDelivery(id: string, updates: Partial<Delivery>): Promise<Delivery | undefined>;
  getFavourites(userId: string): Promise<Delivery[]>;

  // Preferences
  getPreferences(userId: string): Promise<UserPreferences | undefined>;
  upsertPreferences(prefs: InsertUserPreferences): Promise<UserPreferences>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private deliveries: Map<string, Delivery> = new Map();
  private preferences: Map<string, UserPreferences> = new Map();

  // ── Users ──────────────────────────────────────────────────────────────────
  async getUser(id: string) { return this.users.get(id); }

  async getUserByEmail(email: string) {
    return [...this.users.values()].find(u => u.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  // ── Deliveries ─────────────────────────────────────────────────────────────
  async getDeliveriesForUser(userId: string): Promise<Delivery[]> {
    return [...this.deliveries.values()]
      .filter(d => d.userId === userId)
      .sort((a, b) => (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0));
  }

  async getDeliveredPassageIds(userId: string): Promise<string[]> {
    return [...this.deliveries.values()]
      .filter(d => d.userId === userId)
      .map(d => d.passageId);
  }

  async getTodayDelivery(userId: string): Promise<Delivery | undefined> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return [...this.deliveries.values()].find(d => {
      if (d.userId !== userId) return false;
      const dt = new Date(d.deliveredAt!);
      dt.setHours(0, 0, 0, 0);
      return dt.getTime() === today.getTime();
    });
  }

  async createDelivery(delivery: InsertDelivery): Promise<Delivery> {
    const id = randomUUID();
    const record: Delivery = {
      id,
      userId: delivery.userId,
      passageId: delivery.passageId,
      deliveredAt: new Date(),
      readAt: delivery.readAt ?? null,
      isFavourite: delivery.isFavourite ?? false,
    };
    this.deliveries.set(id, record);
    return record;
  }

  async updateDelivery(id: string, updates: Partial<Delivery>): Promise<Delivery | undefined> {
    const existing = this.deliveries.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.deliveries.set(id, updated);
    return updated;
  }

  async getFavourites(userId: string): Promise<Delivery[]> {
    return [...this.deliveries.values()]
      .filter(d => d.userId === userId && d.isFavourite)
      .sort((a, b) => (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0));
  }

  // ── Preferences ─────────────────────────────────────────────────────────────
  async getPreferences(userId: string): Promise<UserPreferences | undefined> {
    return [...this.preferences.values()].find(p => p.userId === userId);
  }

  async upsertPreferences(prefs: InsertUserPreferences): Promise<UserPreferences> {
    const existing = [...this.preferences.values()].find(p => p.userId === prefs.userId);
    if (existing) {
      const updated: UserPreferences = { ...existing, ...prefs };
      this.preferences.set(existing.id, updated);
      return updated;
    }
    const id = randomUUID();
    const record: UserPreferences = {
      id,
      userId: prefs.userId,
      preferredTime: prefs.preferredTime ?? "08:00",
      timezone: prefs.timezone ?? "Europe/London",
      emailNotifications: prefs.emailNotifications ?? false,
    };
    this.preferences.set(id, record);
    return record;
  }
}

export const storage = new MemStorage();
