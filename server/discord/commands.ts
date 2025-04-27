import { Client, REST, Routes, SlashCommandBuilder } from 'discord.js';

export async function registerCommands(client: Client) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID || client.user?.id;
  
  // In development mode, if we're missing the client ID, we can skip slash command registration
  if (!token) {
    throw new Error('Missing required environment variable: DISCORD_BOT_TOKEN');
  }
  
  // Client ID might be undefined during startup, in which case we skip command registration
  if (!clientId) {
    console.warn('Missing DISCORD_CLIENT_ID. Skipping slash command registration.');
    return;
  }
  
  // Command definitions
  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Link your Discord account with your Roblox account')
      .addStringOption(option => 
        option
          .setName('username')
          .setDescription('Your Roblox username')
          .setRequired(true)
      ),
    
    new SlashCommandBuilder()
      .setName('update')
      .setDescription('Update your verification information'),
    
    new SlashCommandBuilder()
      .setName('reverify')
      .setDescription('Re-verify with a different Roblox account')
      .addStringOption(option => 
        option
          .setName('username')
          .setDescription('Your new Roblox username')
          .setRequired(true)
      ),
    
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show a list of available commands'),
    
    new SlashCommandBuilder()
      .setName('allowid')
      .setDescription('(Admin only) Approve a server to use the bot')
      .addStringOption(option => 
        option
          .setName('server_id')
          .setDescription('The ID of the server to approve')
          .setRequired(true)
      ),
    
    new SlashCommandBuilder()
      .setName('disallowid')
      .setDescription('(Admin only) Revoke a server\'s permission to use the bot')
      .addStringOption(option => 
        option
          .setName('server_id')
          .setDescription('The ID of the server to disallow')
          .setRequired(true)
      ),
  ];
  
  // Convert to JSON for REST API
  const commandsJson = commands.map(command => command.toJSON());
  
  // Create REST instance
  const rest = new REST({ version: '10' }).setToken(token);
  
  try {
    console.log('Started refreshing application (/) commands.');
    
    // Register commands globally
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commandsJson }
    );
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Failed to reload application (/) commands:', error);
  }
}
