import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Servers table to track approved Discord servers
export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  serverName: text("server_name").notNull(),
  ownerDiscordId: text("owner_discord_id").notNull(),
  isApproved: boolean("is_approved").default(false),
  memberCount: integer("member_count").default(0),
  requestedAt: timestamp("requested_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
});

// Verified users table to track Roblox-Discord verification
export const verifiedUsers = pgTable("verified_users", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  robloxId: text("roblox_id").notNull(),
  robloxUsername: text("roblox_username").notNull(),
  verifiedAt: timestamp("verified_at").defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
});

// Approval requests table for server approval requests
export const approvalRequests = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull().unique(),
  serverName: text("server_name").notNull(),
  requestedBy: text("requested_by").notNull(),
  memberCount: integer("member_count").default(0),
  status: text("status").default("pending"),
  requestedAt: timestamp("requested_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bot statistics table for dashboard metrics
export const botStats = pgTable("bot_stats", {
  id: serial("id").primaryKey(),
  commandsRun: integer("commands_run").default(0),
  verifications: integer("verifications").default(0),
  uptime: integer("uptime").default(0), // in seconds
  lastStartup: timestamp("last_startup").defaultNow(),
});

// Insert schemas
export const insertServerSchema = createInsertSchema(servers).omit({
  id: true,
  approvedAt: true
});

export const insertVerifiedUserSchema = createInsertSchema(verifiedUsers).omit({
  id: true,
  verifiedAt: true,
  lastUpdatedAt: true
});

export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({
  id: true,
  status: true,
  requestedAt: true,
  updatedAt: true
});

export const insertBotStatsSchema = createInsertSchema(botStats).omit({
  id: true,
  lastStartup: true
});

// Types
export type InsertServer = z.infer<typeof insertServerSchema>;
export type Server = typeof servers.$inferSelect;

export type InsertVerifiedUser = z.infer<typeof insertVerifiedUserSchema>;
export type VerifiedUser = typeof verifiedUsers.$inferSelect;

export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;

export type InsertBotStats = z.infer<typeof insertBotStatsSchema>;
export type BotStats = typeof botStats.$inferSelect;
