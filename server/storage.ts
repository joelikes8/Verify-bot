import { 
  servers, type Server, type InsertServer,
  verifiedUsers, type VerifiedUser, type InsertVerifiedUser,
  approvalRequests, type ApprovalRequest, type InsertApprovalRequest,
  botStats, type BotStats, type InsertBotStats
} from "@shared/schema";

export interface IStorage {
  // Server methods
  getServer(serverId: string): Promise<Server | undefined>;
  getAllServers(): Promise<Server[]>;
  getApprovedServers(): Promise<Server[]>;
  createServer(server: InsertServer): Promise<Server>;
  updateServerApproval(serverId: string, isApproved: boolean): Promise<Server | undefined>;
  
  // Verified User methods
  getVerifiedUserByDiscordId(discordId: string): Promise<VerifiedUser | undefined>;
  getVerifiedUserByRobloxId(robloxId: string): Promise<VerifiedUser | undefined>;
  createVerifiedUser(user: InsertVerifiedUser): Promise<VerifiedUser>;
  updateVerifiedUser(discordId: string, robloxId: string, robloxUsername: string): Promise<VerifiedUser | undefined>;
  
  // Approval Request methods
  getApprovalRequest(serverId: string): Promise<ApprovalRequest | undefined>;
  getAllApprovalRequests(): Promise<ApprovalRequest[]>;
  getPendingApprovalRequests(): Promise<ApprovalRequest[]>;
  createApprovalRequest(request: InsertApprovalRequest): Promise<ApprovalRequest>;
  updateApprovalRequestStatus(serverId: string, status: string): Promise<ApprovalRequest | undefined>;
  
  // Bot Stats methods
  getBotStats(): Promise<BotStats | undefined>;
  updateBotStats(stats: Partial<InsertBotStats>): Promise<BotStats | undefined>;
  incrementCommandsRun(): Promise<void>;
  incrementVerifications(): Promise<void>;
  updateUptime(seconds: number): Promise<void>;
  updateLastStartup(): Promise<void>;
}

import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";

// Database implementation
export class DatabaseStorage implements IStorage {
  // Server methods
  async getServer(serverId: string): Promise<Server | undefined> {
    const result = await db.select().from(servers).where(eq(servers.serverId, serverId));
    return result[0];
  }
  
  async getAllServers(): Promise<Server[]> {
    return db.select().from(servers);
  }
  
  async getApprovedServers(): Promise<Server[]> {
    return db.select().from(servers).where(eq(servers.isApproved, true));
  }
  
  async createServer(insertServer: InsertServer): Promise<Server> {
    const approvedAt = insertServer.isApproved ? new Date() : undefined;
    const result = await db.insert(servers)
      .values({ ...insertServer, approvedAt })
      .returning();
    return result[0];
  }
  
  async updateServerApproval(serverId: string, isApproved: boolean): Promise<Server | undefined> {
    const approvedAt = isApproved ? new Date() : null;
    const result = await db.update(servers)
      .set({ isApproved, approvedAt })
      .where(eq(servers.serverId, serverId))
      .returning();
    return result[0];
  }
  
  // Verified User methods
  async getVerifiedUserByDiscordId(discordId: string): Promise<VerifiedUser | undefined> {
    const result = await db.select().from(verifiedUsers).where(eq(verifiedUsers.discordId, discordId));
    return result[0];
  }
  
  async getVerifiedUserByRobloxId(robloxId: string): Promise<VerifiedUser | undefined> {
    const result = await db.select().from(verifiedUsers).where(eq(verifiedUsers.robloxId, robloxId));
    return result[0];
  }
  
  async createVerifiedUser(insertUser: InsertVerifiedUser): Promise<VerifiedUser> {
    const now = new Date();
    const result = await db.insert(verifiedUsers)
      .values({ ...insertUser, verifiedAt: now, lastUpdatedAt: now })
      .returning();
    return result[0];
  }
  
  async updateVerifiedUser(discordId: string, robloxId: string, robloxUsername: string): Promise<VerifiedUser | undefined> {
    const now = new Date();
    const result = await db.update(verifiedUsers)
      .set({ robloxId, robloxUsername, lastUpdatedAt: now })
      .where(eq(verifiedUsers.discordId, discordId))
      .returning();
    return result[0];
  }
  
  // Approval Request methods
  async getApprovalRequest(serverId: string): Promise<ApprovalRequest | undefined> {
    const result = await db.select().from(approvalRequests).where(eq(approvalRequests.serverId, serverId));
    return result[0];
  }
  
  async getAllApprovalRequests(): Promise<ApprovalRequest[]> {
    return db.select().from(approvalRequests);
  }
  
  async getPendingApprovalRequests(): Promise<ApprovalRequest[]> {
    return db.select().from(approvalRequests).where(eq(approvalRequests.status, 'pending'));
  }
  
  async createApprovalRequest(insertRequest: InsertApprovalRequest): Promise<ApprovalRequest> {
    const now = new Date();
    const result = await db.insert(approvalRequests)
      .values({ 
        ...insertRequest, 
        status: 'pending', 
        requestedAt: now, 
        updatedAt: now 
      })
      .returning();
    return result[0];
  }
  
  async updateApprovalRequestStatus(serverId: string, status: string): Promise<ApprovalRequest | undefined> {
    const now = new Date();
    const result = await db.update(approvalRequests)
      .set({ status, updatedAt: now })
      .where(eq(approvalRequests.serverId, serverId))
      .returning();
    return result[0];
  }
  
  // Bot Stats methods
  async getBotStats(): Promise<BotStats | undefined> {
    const result = await db.select().from(botStats);
    return result[0];
  }
  
  async updateBotStats(stats: Partial<InsertBotStats>): Promise<BotStats | undefined> {
    const existingStats = await this.getBotStats();
    
    if (!existingStats) {
      // Create initial stats if they don't exist
      const result = await db.insert(botStats)
        .values(stats)
        .returning();
      return result[0];
    }
    
    // Update existing stats
    const result = await db.update(botStats)
      .set(stats)
      .where(eq(botStats.id, existingStats.id))
      .returning();
    return result[0];
  }
  
  async incrementCommandsRun(): Promise<void> {
    const stats = await this.getBotStats();
    if (!stats) {
      await db.insert(botStats).values({ commandsRun: 1 });
      return;
    }
    
    await db.update(botStats)
      .set({ commandsRun: sql`${botStats.commandsRun} + 1` })
      .where(eq(botStats.id, stats.id));
  }
  
  async incrementVerifications(): Promise<void> {
    const stats = await this.getBotStats();
    if (!stats) {
      await db.insert(botStats).values({ verifications: 1 });
      return;
    }
    
    await db.update(botStats)
      .set({ verifications: sql`${botStats.verifications} + 1` })
      .where(eq(botStats.id, stats.id));
  }
  
  async updateUptime(seconds: number): Promise<void> {
    const stats = await this.getBotStats();
    if (!stats) {
      await db.insert(botStats).values({ uptime: seconds });
      return;
    }
    
    await db.update(botStats)
      .set({ uptime: seconds })
      .where(eq(botStats.id, stats.id));
  }
  
  async updateLastStartup(): Promise<void> {
    const now = new Date();
    const stats = await this.getBotStats();
    
    if (!stats) {
      await db.insert(botStats).values({ lastStartup: now });
      return;
    }
    
    await db.update(botStats)
      .set({ lastStartup: now })
      .where(eq(botStats.id, stats.id));
  }

  // Initialize the database with sample data (only if empty)
  async initializeWithSampleData(): Promise<void> {
    // Check if we already have servers
    const existingServers = await this.getAllServers();
    if (existingServers.length === 0) {
      // Add sample approved servers
      await this.createServer({
        serverId: '123456789012345678',
        serverName: 'Premium Server #1',
        ownerDiscordId: '987654321098765432',
        isApproved: true,
        memberCount: 250
      });
      
      await this.createServer({
        serverId: '234567890123456789',
        serverName: 'Gaming Community',
        ownerDiscordId: '876543210987654321',
        isApproved: true,
        memberCount: 820
      });
      
      await this.createServer({
        serverId: '345678901234567890',
        serverName: 'Roblox Developers',
        ownerDiscordId: '765432109876543210',
        isApproved: true,
        memberCount: 1500
      });
    }
    
    // Check if we already have approval requests
    const existingRequests = await this.getAllApprovalRequests();
    if (existingRequests.length === 0) {
      // Add sample approval requests
      await this.createApprovalRequest({
        serverId: '456789012345678901',
        serverName: 'Roblox Fan Server',
        requestedBy: 'UsernameExample#1234',
        memberCount: 250
      });
      
      await this.createApprovalRequest({
        serverId: '567890123456789012',
        serverName: 'Gaming Community',
        requestedBy: 'GamerTag#5678',
        memberCount: 820
      });
    }
    
    // Check if we already have bot stats
    const existingStats = await this.getBotStats();
    if (!existingStats) {
      // Initialize bot stats
      await db.insert(botStats).values({
        commandsRun: 0,
        verifications: 0,
        uptime: 0,
        lastStartup: new Date()
      });
    }
  }
}

export const storage = new DatabaseStorage();
