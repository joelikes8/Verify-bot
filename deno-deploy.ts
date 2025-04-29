// Deno deploy entry point
import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { Client, GatewayIntentBits } from "npm:discord.js";

// Configure environment
const PORT = Deno.env.get("PORT") || "8000";
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const ROBLOX_COOKIE = Deno.env.get("ROBLOX_COOKIE");
const ADMIN_USER_ID = Deno.env.get("ADMIN_USER_ID");
const DATABASE_URL = Deno.env.get("DATABASE_URL");

const app = new Application();
const router = new Router();

// Root endpoint to verify service is running
router.get("/", (ctx) => {
  ctx.response.body = {
    status: "ok",
    message: "Discord Verify Bot API is running",
    timestamp: new Date().toISOString(),
  };
});

// Health check endpoint
router.get("/healthz", (ctx) => {
  ctx.response.body = { status: "ok" };
});

// Sample stats API endpoint
router.get("/api/bot/stats", (ctx) => {
  ctx.response.body = {
    id: 1,
    commandsRun: 35,
    verifications: 8,
    uptimeSeconds: 12345,
    lastStartup: new Date().toISOString(),
  };
});

// Initialize Discord bot
if (DISCORD_BOT_TOKEN) {
  console.log("Initializing Discord bot...");
  
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
    ],
  });
  
  client.once("ready", () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
  });
  
  // Initialize bot commands
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;
    
    const { commandName } = interaction;
    
    if (commandName === "ping") {
      await interaction.reply("Pong!");
    }
  });
  
  // Login to Discord
  client.login(DISCORD_BOT_TOKEN).catch(error => {
    console.error("Failed to log in to Discord:", error);
  });
}

// Use the router
app.use(router.routes());
app.use(router.allowedMethods());

// Log all requests
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url.pathname} - ${ms}ms`);
});

// Start the server
app.addEventListener("listen", ({ port }) => {
  console.log(`Server is running on port ${port}`);
});

await app.listen({ port: Number(PORT) });