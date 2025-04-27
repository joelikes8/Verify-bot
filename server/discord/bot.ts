import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { storage } from '../storage';
import { registerCommands } from './commands';
import { 
  handleVerification, 
  verifyUserWithCode, 
  getIdFromUsername,
  updateLastVerificationCode as updateVerificationCodeRef
} from './verification';

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Bot configuration
const PREFIX = '!';
const COMMAND_COOLDOWN = 3000; // 3 second cooldown between commands

// Variable to store the last used verification code for error messages
let lastVerificationCode: string | null = null;

// Function to update the last verification code 
// This replaces the placeholder in verification.ts
updateVerificationCodeRef((code: string) => {
  lastVerificationCode = code;
  console.log(`Updated last verification code: ${code}`);
});

// Cooldown collection
const cooldowns = new Collection<string, number>();

// Initialize bot uptime interval
let uptimeInterval: NodeJS.Timeout;

export async function startBot() {
  // Check for required environment variables
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("Missing DISCORD_BOT_TOKEN environment variable. Bot will not be started.");
    return null; // Return null instead of throwing an error
  }

  try {
    // Track the bot startup time
    await storage.updateLastStartup();
    
    // Login to Discord first so we have the client.user available
    await client.login(token);
    console.log(`Bot logged in as ${client.user?.tag}`);
    
    // Now register slash commands after login
    await registerCommands(client);

    // Bot ready event
    client.once(Events.ClientReady, async (readyClient) => {
      console.log(`Bot logged in as ${readyClient.user.tag}`);

      // Start tracking uptime
      uptimeInterval = setInterval(async () => {
        const stats = await storage.getBotStats();
        if (stats && stats.lastStartup) {
          const uptime = Math.floor((Date.now() - stats.lastStartup.getTime()) / 1000);
          await storage.updateUptime(uptime);
        }
      }, 60000); // Update every minute
    });

    // Message event handler for prefix commands
    client.on(Events.MessageCreate, async (message) => {
      // Ignore messages from bots or messages that don't start with the prefix
      if (message.author.bot || !message.content.startsWith(PREFIX)) return;

      // Get server information
      const serverId = message.guild?.id;
      if (!serverId) return; // DM commands not supported

      // Check if the user is the admin - they can use commands anywhere
      const isAdmin = process.env.ADMIN_USER_ID && message.author.id === process.env.ADMIN_USER_ID;
      
      if (!isAdmin) {
        // Regular user - check if the server is approved
        const server = await storage.getServer(serverId);
        if (!server?.isApproved) {
          // The server is not approved
          return message.channel.send(
            "This server is not approved to use this bot. Please contact the bot owner to get approval."
          );
        }
      }

      // Parse command and arguments
      const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
      const commandName = args.shift()?.toLowerCase();

      if (!commandName) return;

      // Check for cooldown
      const userId = message.author.id;
      const now = Date.now();
      const cooldownKey = `${userId}-${commandName}`;

      if (cooldowns.has(cooldownKey)) {
        const expirationTime = cooldowns.get(cooldownKey)! + COMMAND_COOLDOWN;
        
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          return message.reply(
            `Please wait ${timeLeft.toFixed(1)} more seconds before using the \`${commandName}\` command.`
          );
        }
      }

      // Set cooldown
      cooldowns.set(cooldownKey, now);
      setTimeout(() => cooldowns.delete(cooldownKey), COMMAND_COOLDOWN);

      // Increment command usage counter
      await storage.incrementCommandsRun();

      // Handle command
      try {
        switch (commandName) {
          case 'verify':
            await handleVerification(message, args);
            break;
          case 'help':
            // Basic user commands
            let helpMessage = "Available Commands:\n" +
              "- `!verify [roblox_username]` - Link your Discord account with your Roblox account\n" +
              "- `!update` - Update your verification information\n" +
              "- `!reverify [roblox_username]` - Re-verify with a different Roblox account\n" +
              "- `!help` - Show this help message\n\n" +
              "You can also use slash commands like `/verify`, `/update`, `/reverify`, and `/help`.";
            
            // Add admin commands if user is admin
            if (isAdmin) {
              helpMessage += "\n\nAdmin Commands:\n" +
                "- `/allowid [server_id]` - Approve a server to use the bot\n" +
                "- `/disallowid [server_id]` - Revoke a server's permission to use the bot";
            }
            
            await message.reply({ content: helpMessage });
            break;
          case 'update':
            await message.reply("Please use `/update` to update your verification information.");
            break;
          case 'reverify':
            await message.reply("Please use `/reverify` to re-verify with a different Roblox account.");
            break;
          default:
            await message.reply(`Unknown command. Use \`${PREFIX}help\` to see available commands.`);
        }
      } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        await message.reply("There was an error executing that command.");
      }
    });

    // Interaction event handler for slash commands and buttons
    client.on(Events.InteractionCreate, async (interaction) => {
      // Handle button interactions
      if (interaction.isButton()) {
        // Get server information
        const serverId = interaction.guild?.id;
        if (!serverId) {
          return interaction.reply({
            content: "Buttons can only be used in servers, not in DMs.",
            ephemeral: true
          });
        }
        
        // Check if the server is approved
        const server = await storage.getServer(serverId);
        if (!server?.isApproved) {
          return interaction.reply({
            content: "This server is not approved to use this bot. Please contact the bot owner to get approval.",
            ephemeral: true
          });
        }
        
        const customId = interaction.customId;
        const userId = interaction.user.id;
        
        try {
          // Handle verification button
          if (customId === 'verify_check' || customId === 'reverify_check') {
            // Defer reply to give us time to process
            await interaction.deferReply({ ephemeral: true });
            
            // Check if the verification code is in the Roblox profile using our improved function
            console.log(`Checking verification for user ${userId}`);
            
            // Our verification method already has a timeout internally
            // This is a real verification check - success only if code is found in profile
            const success = await verifyUserWithCode(userId);
            console.log(`Verification result: ${success ? 'Success' : 'Failed'} - Code found in profile: ${success}`);
            
            if (success) {
              // Get the message that contains the verification info
              const message = await interaction.message;
              if (!message || !message.embeds || message.embeds.length === 0) {
                return await interaction.editReply("Could not find verification information. Please try the command again.");
              }
              
              // Extract the username from the embed
              const embed = message.embeds[0];
              const description = embed.description || "";
              
              // Extract the Roblox username using a regex pattern
              const usernameMatch = description.match(/\*\*(.*?)\*\*/);
              if (!usernameMatch || !usernameMatch[1]) {
                return await interaction.editReply("Could not determine the Roblox username. Please try the command again.");
              }
              
              const robloxUsername = usernameMatch[1];
              
              try {
                // Get Roblox ID from username
                const robloxId = await getIdFromUsername(robloxUsername);
                
                if (customId === 'verify_check') {
                  // Create a new verification
                  await storage.createVerifiedUser({
                    discordId: userId,
                    robloxId,
                    robloxUsername
                  });
                } else if (customId === 'reverify_check') {
                  // Update an existing verification
                  await storage.updateVerifiedUser(userId, robloxId, robloxUsername);
                }
                
                // Increment verification counter
                await storage.incrementVerifications();
                
                // Try to update the user's nickname to match their Roblox username
                let nicknameMessage = "";
                try {
                  // Get the guild and member
                  const guild = interaction.guild;
                  if (guild) {
                    const member = await guild.members.fetch(userId);
                    if (member) {
                      // Check if the bot has permission to manage nicknames
                      const bot = guild.members.me;
                      if (bot && bot.permissions.has("ManageNicknames")) {
                        // Check if bot's role is higher than the user's highest role
                        if (bot.roles.highest.position > member.roles.highest.position) {
                          // Set the nickname
                          await member.setNickname(robloxUsername);
                          nicknameMessage = "Your nickname has been updated to match your Roblox username.";
                        } else {
                          nicknameMessage = "I couldn't update your nickname because you have a higher role than me.";
                        }
                      } else {
                        nicknameMessage = "I don't have permission to update nicknames in this server.";
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error updating nickname:', error);
                  nicknameMessage = "I couldn't update your nickname due to an error.";
                }

                // Send success message
                await interaction.editReply({
                  content: `✅ Verification successful! Your Discord account is now linked to your Roblox account **${robloxUsername}**.\n\n${nicknameMessage}`,
                });
              } catch (error) {
                console.error('Verification database error:', error);
                await interaction.editReply({
                  content: "There was an error saving your verification. Please try again later.",
                });
              }
            } else {
              // Get the verification code to include in the error message
              let codeMessage = "";
              
              // Instead of trying to access the module directly, we'll use our own copy
              // of the last used code stored in a temporary variable
              
              if (lastVerificationCode) {
                codeMessage = `\nYour verification code is:\n\`\`\`\n${lastVerificationCode}\n\`\`\`\n`;
              } else {
                // Default message if we don't have the code
                codeMessage = "\nUse the verification code shown in the original verification message.\n";
              }
              
              await interaction.editReply({
                content: `❌ Verification failed. The code was not found in your Roblox profile.${codeMessage}\nPlease make sure you:\n\n1. Go to Roblox.com and log in\n2. Click on your avatar in the top-right and select 'My Profile'\n3. Click the pencil icon (✏️) to edit your profile\n4. Copy and paste the entire verification code to your About section\n5. Click the Save button\n6. Try verifying again by clicking the button below\n\nThe code must be added exactly as shown above, with no extra spaces or characters.\n\nIf you're still having trouble, try clearing your profile description completely, then add only the verification code.`,
              });
            }
          }
        } catch (error) {
          console.error(`Error handling button ${customId}:`, error);
          
          // Check if the reply was already deferred
          if (interaction.deferred) {
            await interaction.editReply("There was an error processing your request. Please try again later.");
          } else {
            await interaction.reply({
              content: "There was an error processing your request. Please try again later.",
              ephemeral: true
            });
          }
        }
        
        return;
      }
      
      // Continue with command handling
      if (!interaction.isCommand()) return;

      // Get server information
      const serverId = interaction.guild?.id;
      if (!serverId) {
        return interaction.reply({
          content: "Commands can only be used in servers, not in DMs.",
          ephemeral: true
        });
      }

      // Get the command name
      const commandName = interaction.commandName;
      
      // Special handling for admin commands - they need to work regardless of server approval status
      if (commandName !== 'allowid' && commandName !== 'disallowid') {
        // Check if the server is approved
        const server = await storage.getServer(serverId);
        if (!server?.isApproved) {
          // The server is not approved
          return interaction.reply({
            content: "This server is not approved to use this bot. Please contact the bot owner to get approval or use the `/allowid` command if you are the bot admin.",
            ephemeral: true
          });
        }
      }

      // Check for cooldown
      const userId = interaction.user.id;
      const now = Date.now();
      const cooldownKey = `${userId}-${commandName}`;

      if (cooldowns.has(cooldownKey)) {
        const expirationTime = cooldowns.get(cooldownKey)! + COMMAND_COOLDOWN;
        
        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          return interaction.reply({
            content: `Please wait ${timeLeft.toFixed(1)} more seconds before using the \`${commandName}\` command.`,
            ephemeral: true
          });
        }
      }

      // Set cooldown
      cooldowns.set(cooldownKey, now);
      setTimeout(() => cooldowns.delete(cooldownKey), COMMAND_COOLDOWN);

      // Increment command usage counter
      await storage.incrementCommandsRun();

      // Handle the command
      try {
        switch (commandName) {
          // Admin command to allow a server to use the bot
          case 'allowid':
            // Cast to any to avoid TypeScript errors with getString method
            const serverId = (interaction.options as any).getString('server_id');
            if (!serverId) {
              return interaction.reply({
                content: "Please provide a server ID.",
                ephemeral: true
              });
            }

            // Check if ADMIN_USER_ID is configured
            if (!process.env.ADMIN_USER_ID) {
              console.error("ADMIN_USER_ID environment variable not set. Admin commands are disabled.");
              return interaction.reply({
                content: "This command is currently disabled. Please contact the bot owner.",
                ephemeral: true
              });
            }

            // Strict admin permission check
            if (interaction.user.id !== process.env.ADMIN_USER_ID) {
              console.warn(`Unauthorized attempt to use /allowid by user ${interaction.user.id} (${interaction.user.tag})`);
              return interaction.reply({
                content: "You don't have permission to use this command. This incident has been logged.",
                ephemeral: true
              });
            }

            console.log(`Admin ${interaction.user.tag} (${interaction.user.id}) is approving server ID: ${serverId}`);
            
            // Add the server to the approved list
            const existingServer = await storage.getServer(serverId);
            if (existingServer) {
              await storage.updateServerApproval(serverId, true);
              await storage.updateApprovalRequestStatus(serverId, "approved");
              console.log(`Server ${serverId} was updated to approved status by admin`);
              return interaction.reply({
                content: `Server ${serverId} has been approved.`,
                ephemeral: true
              });
            } else {
              // Create a placeholder server entry
              await storage.createServer({
                serverId,
                serverName: "Approved Server",
                ownerDiscordId: interaction.user.id,
                isApproved: true,
                memberCount: 0
              });
              console.log(`New server ${serverId} was created and approved by admin`);
              return interaction.reply({
                content: `Server ${serverId} has been approved.`,
                ephemeral: true
              });
            }
            break;
            
          // Admin command to disallow a server from using the bot
          case 'disallowid':
            // Cast to any to avoid TypeScript errors with getString method
            const serverIdToDisallow = (interaction.options as any).getString('server_id');
            if (!serverIdToDisallow) {
              return interaction.reply({
                content: "Please provide a server ID.",
                ephemeral: true
              });
            }

            // Check if ADMIN_USER_ID is configured
            if (!process.env.ADMIN_USER_ID) {
              console.error("ADMIN_USER_ID environment variable not set. Admin commands are disabled.");
              return interaction.reply({
                content: "This command is currently disabled. Please contact the bot owner.",
                ephemeral: true
              });
            }

            // Strict admin permission check
            if (interaction.user.id !== process.env.ADMIN_USER_ID) {
              console.warn(`Unauthorized attempt to use /disallowid by user ${interaction.user.id} (${interaction.user.tag})`);
              return interaction.reply({
                content: "You don't have permission to use this command. This incident has been logged.",
                ephemeral: true
              });
            }

            console.log(`Admin ${interaction.user.tag} (${interaction.user.id}) is revoking permission for server ID: ${serverIdToDisallow}`);
            
            // Check if the server exists and update its approval status
            const serverToDisallow = await storage.getServer(serverIdToDisallow);
            if (!serverToDisallow) {
              return interaction.reply({
                content: `Server ${serverIdToDisallow} not found in the database.`,
                ephemeral: true
              });
            }
            
            await storage.updateServerApproval(serverIdToDisallow, false);
            // Also update any pending approval request
            await storage.updateApprovalRequestStatus(serverIdToDisallow, "denied");
            console.log(`Server ${serverIdToDisallow} permission was revoked by admin`);
            
            return interaction.reply({
              content: `Server ${serverIdToDisallow} permission has been revoked. The bot will no longer function in that server.`,
              ephemeral: true
            });
            break;

          // Other commands handled in separate files
          case 'verify':
          case 'update':
          case 'reverify':
            // Defer reply while we process
            await interaction.deferReply({ ephemeral: true });
            // Process verification commands
            await handleVerification(interaction);
            break;

          case 'help':
            // Get user commands
            const userCommands = "Available Commands:\n" +
              "- `/verify [roblox_username]` - Link your Discord account with your Roblox account\n" +
              "- `/update` - Update your verification information\n" +
              "- `/reverify [roblox_username]` - Re-verify with a different Roblox account\n" +
              "- `/help` - Show this help message";
            
            // Check if user is admin
            const isUserAdmin = process.env.ADMIN_USER_ID && interaction.user.id === process.env.ADMIN_USER_ID;
            const adminCommands = isUserAdmin ? 
              "\n\nAdmin Commands:\n" +
              "- `/allowid [server_id]` - Approve a server to use the bot\n" +
              "- `/disallowid [server_id]` - Revoke a server's permission to use the bot" : 
              "";
            
            await interaction.reply({
              content: userCommands + adminCommands,
              ephemeral: true
            });
            break;

          default:
            await interaction.reply({
              content: "Unknown command. Use `/help` to see available commands.",
              ephemeral: true
            });
        }
      } catch (error) {
        console.error(`Error executing slash command ${commandName}:`, error);
        
        // Check if the reply was already handled
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("There was an error executing that command.");
        } else {
          await interaction.reply({
            content: "There was an error executing that command.",
            ephemeral: true
          });
        }
      }
    });

    // Guild join event
    client.on(Events.GuildCreate, async (guild) => {
      const serverId = guild.id;
      const owner = await guild.fetchOwner();
      
      // Check if the server is already approved
      const server = await storage.getServer(serverId);
      if (server?.isApproved) {
        // Server is already approved, nothing to do
        return;
      }
      
      // Create a server approval request
      await storage.createApprovalRequest({
        serverId,
        serverName: guild.name,
        requestedBy: `${owner.user.tag}`,
        memberCount: guild.memberCount
      });
      
      // Also create a server entry (not approved)
      await storage.createServer({
        serverId,
        serverName: guild.name,
        ownerDiscordId: owner.id,
        isApproved: false,
        memberCount: guild.memberCount
      });
      
      // Send a message to the system channel if available
      const systemChannel = guild.systemChannel;
      if (systemChannel) {
        await systemChannel.send(
          "Thank you for adding the Roblox Verifier bot!\n\n" +
          "This server is not yet approved to use this bot. Your request has been sent to the bot administrator.\n" +
          "Once approved, all features will be available.\n\n" +
          "For expedited approval, please contact us on our website."
        );
      }
      
      // Send a message to the owner as well
      try {
        await owner.send(
          `Thank you for adding the Roblox Verifier bot to "${guild.name}"!\n\n` +
          "Your server is not yet approved to use this bot. Your request has been sent to the bot administrator.\n" +
          "Once approved, all features will be available.\n\n" +
          "For expedited approval, please contact us on our website."
        );
      } catch (error) {
        console.error("Could not send DM to guild owner:", error);
      }
    });

    // Handle errors
    client.on(Events.Error, (error) => {
      console.error('Discord client error:', error);
    });

    return client;
  } catch (error) {
    console.error('Failed to start Discord bot:', error);
    
    // Clean up interval if there was an error
    if (uptimeInterval) {
      clearInterval(uptimeInterval);
    }
    
    throw error;
  }
}

// Export the client for use in other modules
export { client };
