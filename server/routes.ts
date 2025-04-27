import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertServerSchema, 
  insertVerifiedUserSchema, 
  insertApprovalRequestSchema 
} from "@shared/schema";
import { startBot } from "./discord/bot";

export async function registerRoutes(app: Express): Promise<Server> {
  // Start the Discord bot
  try {
    const client = await startBot();
    if (!client) {
      console.log("Discord bot not started in development mode. This is normal without a DISCORD_BOT_TOKEN.");
    }
  } catch (error) {
    console.error("Failed to start Discord bot:", error);
  }

  // API Routes
  // Server Routes
  app.get("/api/servers", async (_req: Request, res: Response) => {
    try {
      const servers = await storage.getAllServers();
      res.json(servers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch servers" });
    }
  });

  app.get("/api/servers/approved", async (_req: Request, res: Response) => {
    try {
      const approvedServers = await storage.getApprovedServers();
      res.json(approvedServers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch approved servers" });
    }
  });

  app.post("/api/servers", async (req: Request, res: Response) => {
    try {
      const validatedData = insertServerSchema.parse(req.body);
      const server = await storage.createServer(validatedData);
      res.status(201).json(server);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create server" });
      }
    }
  });

  app.patch("/api/servers/:serverId/approve", async (req: Request, res: Response) => {
    try {
      // Check for admin authorization
      const adminId = process.env.ADMIN_USER_ID;
      const requesterId = req.headers['x-user-id'] as string;
      
      if (!adminId) {
        console.error("ADMIN_USER_ID environment variable not set. Admin API endpoints are disabled.");
        return res.status(500).json({ error: "Admin ID not configured" });
      }
      
      if (!requesterId || requesterId !== adminId) {
        console.warn(`Unauthorized server approval attempt from user ID: ${requesterId}`);
        return res.status(403).json({ error: "Unauthorized: Admin permission required" });
      }
      
      const { serverId } = req.params;
      const isApproved = req.body.isApproved === true;
      
      const server = await storage.updateServerApproval(serverId, isApproved);
      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }
      
      // Also update the approval request status
      if (isApproved) {
        await storage.updateApprovalRequestStatus(serverId, "approved");
        console.log(`Server ${serverId} approved by admin ${requesterId}`);
      }
      
      res.json(server);
    } catch (error) {
      res.status(500).json({ error: "Failed to update server approval" });
    }
  });

  // Verified User Routes
  app.get("/api/users/verified/:discordId", async (req: Request, res: Response) => {
    try {
      const { discordId } = req.params;
      const user = await storage.getVerifiedUserByDiscordId(discordId);
      
      if (!user) {
        return res.status(404).json({ error: "Verified user not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch verified user" });
    }
  });

  app.post("/api/users/verified", async (req: Request, res: Response) => {
    try {
      const validatedData = insertVerifiedUserSchema.parse(req.body);
      const user = await storage.createVerifiedUser(validatedData);
      await storage.incrementVerifications();
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create verified user" });
      }
    }
  });

  app.patch("/api/users/verified/:discordId", async (req: Request, res: Response) => {
    try {
      const { discordId } = req.params;
      const { robloxId, robloxUsername } = req.body;
      
      if (!robloxId || !robloxUsername) {
        return res.status(400).json({ error: "robloxId and robloxUsername are required" });
      }
      
      const user = await storage.updateVerifiedUser(discordId, robloxId, robloxUsername);
      if (!user) {
        return res.status(404).json({ error: "Verified user not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update verified user" });
    }
  });

  // Approval Request Routes
  app.get("/api/approval-requests", async (_req: Request, res: Response) => {
    try {
      const requests = await storage.getAllApprovalRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch approval requests" });
    }
  });

  app.get("/api/approval-requests/pending", async (_req: Request, res: Response) => {
    try {
      const pendingRequests = await storage.getPendingApprovalRequests();
      res.json(pendingRequests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending approval requests" });
    }
  });

  app.post("/api/approval-requests", async (req: Request, res: Response) => {
    try {
      const validatedData = insertApprovalRequestSchema.parse(req.body);
      const request = await storage.createApprovalRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create approval request" });
      }
    }
  });

  app.patch("/api/approval-requests/:serverId/status", async (req: Request, res: Response) => {
    try {
      // Check for admin authorization
      const adminId = process.env.ADMIN_USER_ID;
      const requesterId = req.headers['x-user-id'] as string;
      
      if (!adminId) {
        console.error("ADMIN_USER_ID environment variable not set. Admin API endpoints are disabled.");
        return res.status(500).json({ error: "Admin ID not configured" });
      }
      
      if (!requesterId || requesterId !== adminId) {
        console.warn(`Unauthorized approval request status update attempt from user ID: ${requesterId}`);
        return res.status(403).json({ error: "Unauthorized: Admin permission required" });
      }
      
      const { serverId } = req.params;
      const { status } = req.body;
      
      if (!status || !['pending', 'approved', 'denied'].includes(status)) {
        return res.status(400).json({ error: "Valid status is required" });
      }
      
      const request = await storage.updateApprovalRequestStatus(serverId, status);
      if (!request) {
        return res.status(404).json({ error: "Approval request not found" });
      }
      
      // If the request is approved, also update the server
      if (status === 'approved') {
        await storage.updateServerApproval(serverId, true);
        console.log(`Server ${serverId} approved through request update by admin ${requesterId}`);
      } else if (status === 'denied') {
        console.log(`Server ${serverId} approval request denied by admin ${requesterId}`);
      }
      
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to update approval request status" });
    }
  });

  // Bot Stats Routes
  app.get("/api/bot/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getBotStats();
      
      if (!stats) {
        return res.status(404).json({ error: "Bot stats not found" });
      }
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bot stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
