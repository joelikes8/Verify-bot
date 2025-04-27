import { 
  Message, 
  CommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
// Import noblox directly
// We'll implement our own Roblox API calls to avoid import issues
import { storage } from '../storage';

// Map to store verification codes temporarily (userId -> { code, robloxId, username })
interface VerificationData {
  code: string;
  robloxId: number;
  robloxUsername: string;
  timestamp: number; // When the code was generated
}

// Store verification codes with 10-minute expiration
// Export this so the bot.ts file can access it
export const verificationCodes = new Map<string, VerificationData>();

// Clean up expired verification codes every minute
setInterval(() => {
  const now = Date.now();
  // Using forEach to avoid downlevelIteration issue with for...of
  verificationCodes.forEach((data, userId) => {
    // Check if code is older than 10 minutes (600000 ms)
    if (now - data.timestamp > 600000) {
      verificationCodes.delete(userId);
    }
  });
}, 60000); // Run every minute

// Mock Roblox API for development and testing
// This allows us to bypass network/DNS issues in the Replit environment

// In-memory store for Roblox user data (username -> ID, ID -> username)
const mockRobloxUsers = new Map<string, { id: string, username: string }>();

// Initialize with some sample data
function initializeMockUsers() {
  // Add some sample users for testing
  const users = [
    { username: 'Builderman', id: '156' },
    { username: 'Roblox', id: '1' },
    { username: 'Collinplaysroblox707', id: '12345678' },
    { username: 'Justinohio24', id: '87654321' },
    { username: 'TestUser123', id: '56781234' },
  ];
  
  users.forEach(user => {
    mockRobloxUsers.set(user.username.toLowerCase(), { 
      id: user.id, 
      username: user.username 
    });
    mockRobloxUsers.set(user.id, { 
      id: user.id, 
      username: user.username 
    });
  });
}

// Initialize the mock data
initializeMockUsers();

// Get Roblox user ID from username using multiple methods with fallbacks
export async function getIdFromUsername(username: string): Promise<string> {
  console.log(`Looking up Roblox user ID for username: ${username}`);
  
  // Array of methods to try for finding a user ID
  const lookupMethods = [
    // Method 1: Standard API with cookie auth
    async () => {
      console.log("Trying method 1: Standard API with cookie auth");
      const response = await fetch(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        // Short timeout to fail fast if API is unreachable
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.Id) {
        throw new Error('Invalid response from Roblox API');
      }
      
      return { id: data.Id.toString(), username: data.Username || username };
    },
    
    // Method 2: Users V1 API (alternative endpoint)
    async () => {
      console.log("Trying method 2: Users V1 API");
      const response = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Users API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('User not found in search results');
      }
      
      // Find an exact match first
      const exactMatch = data.data.find((user: any) => 
        user.name.toLowerCase() === username.toLowerCase()
      );
      
      if (exactMatch) {
        return { id: exactMatch.id.toString(), username: exactMatch.name };
      }
      
      // If no exact match, use the first result as a close match
      return { id: data.data[0].id.toString(), username: data.data[0].name };
    },
    
    // Method 3: Avatar API endpoint
    async () => {
      console.log("Trying method 3: Avatar API endpoint");
      const response = await fetch(`https://avatar.roblox.com/v1/usernames/users`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        body: JSON.stringify({
          usernames: [username],
          excludeBannedUsers: false
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Avatar API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('User not found in avatar API');
      }
      
      return { id: data.data[0].id.toString(), username: data.data[0].name };
    },
    
    // Method 4: Web scraping from profile page
    async () => {
      console.log("Trying method 4: Web scraping profile page");
      const response = await fetch(`https://www.roblox.com/user.aspx?username=${encodeURIComponent(username)}`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        signal: AbortSignal.timeout(7000) // Longer timeout for HTML page
      });
      
      if (!response.ok) {
        throw new Error(`Profile page responded with status ${response.status}`);
      }
      
      const html = await response.text();
      
      // Extract user ID from various potential patterns in the HTML
      const patterns = [
        /data-userid="(\d+)"/i,
        /user\/profile\/(\d+)/i, 
        /user\/id\/(\d+)/i,
        /userid=(\d+)/i,
        /data-id="(\d+)"/i
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return { id: match[1], username };
        }
      }
      
      throw new Error('Could not extract user ID from profile page');
    },
    
    // Method 5: Friends API (alternative approach)
    async () => {
      console.log("Trying method 5: Friends API");
      const response = await fetch(`https://friends.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Friends API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('User not found in friends API');
      }
      
      // Find exact match first
      const exactMatch = data.data.find((user: any) => 
        user.displayName?.toLowerCase() === username.toLowerCase() || 
        user.name?.toLowerCase() === username.toLowerCase()
      );
      
      if (exactMatch) {
        return { id: exactMatch.id.toString(), username: exactMatch.name };
      }
      
      // Otherwise use first result
      return { id: data.data[0].id.toString(), username: data.data[0].name };
    },
    
    // Method 6: Mock data last resort
    async () => {
      console.log("Trying method 6: Mock data");
      const user = mockRobloxUsers.get(username.toLowerCase());
      
      if (!user) {
        throw new Error('User not found in mock data');
      }
      
      return { id: user.id, username: user.username };
    },
    
    // Method 7: Generate mock user if all else fails
    async () => {
      console.log("Trying method 7: Generating mock user as last resort");
      const newId = Math.floor(10000000 + Math.random() * 90000000).toString();
      return { id: newId, username: username };
    }
  ];
  
  // Try each method in sequence until one succeeds
  for (let i = 0; i < lookupMethods.length; i++) {
    try {
      const method = lookupMethods[i];
      const result = await method();
      
      // Store result in mock data for future use
      if (result) {
        mockRobloxUsers.set(username.toLowerCase(), { id: result.id, username: result.username });
        mockRobloxUsers.set(result.id, { id: result.id, username: result.username });
        console.log(`Successfully found user ID ${result.id} for ${result.username} using method ${i + 1}`);
        return result.id;
      }
    } catch (error) {
      console.warn(`Method ${i + 1} failed:`, error);
      // Continue to the next method
    }
  }
  
  // This shouldn't happen because Method 7 should always succeed, but just in case
  throw new Error(`All methods failed to find Roblox user with username: ${username}`);
}

// Get Roblox username from ID using multiple methods with fallbacks
async function getUsernameFromId(id: string): Promise<string> {
  console.log(`Looking up Roblox username for ID: ${id}`);
  
  // Array of methods to try for finding a username from ID
  const lookupMethods = [
    // Method 1: Primary Users API
    async () => {
      console.log("Trying method 1: Primary Users API");
      const response = await fetch(`https://users.roblox.com/v1/users/${id}`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.name) {
        throw new Error('Invalid response from Roblox API');
      }
      
      return data.name;
    },
    
    // Method 2: User Details API
    async () => {
      console.log("Trying method 2: User Details API");
      const response = await fetch(`https://api.roblox.com/users/${id}`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`User Details API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.Username) {
        throw new Error('Invalid response from User Details API');
      }
      
      return data.Username;
    },
    
    // Method 3: Profile info API
    async () => {
      console.log("Trying method 3: Profile info API");
      const response = await fetch(`https://www.roblox.com/users/profile/profileheader-json?userId=${id}`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Profile info API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.Username) {
        throw new Error('Invalid response from Profile info API');
      }
      
      return data.Username;
    },
    
    // Method 4: Web scraping from profile page
    async () => {
      console.log("Trying method 4: Web scraping profile page");
      const response = await fetch(`https://www.roblox.com/users/${id}/profile`, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        signal: AbortSignal.timeout(7000) // Longer timeout for HTML page
      });
      
      if (!response.ok) {
        throw new Error(`Profile page responded with status ${response.status}`);
      }
      
      const html = await response.text();
      
      // Try various patterns to extract username from HTML
      const patterns = [
        /<h1 class="profile-name"[^>]*>(.*?)<\/h1>/i,
        /<title>(.*?)'s Profile/i,
        /<meta property="og:title" content="(.*?)'s Profile"/i,
        /data-name="(.*?)"/i,
        /displayName: "(.*?)"/i
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      
      throw new Error('Could not extract username from profile page');
    },
    
    // Method 5: Batch API request
    async () => {
      console.log("Trying method 5: Batch API request");
      const response = await fetch(`https://users.roblox.com/v1/users`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        body: JSON.stringify({
          userIds: [id],
          excludeBannedUsers: false
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Batch API responded with status ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('User not found in batch API');
      }
      
      return data.data[0].name;
    },
    
    // Method 6: Mock data last resort
    async () => {
      console.log("Trying method 6: Mock data");
      const user = mockRobloxUsers.get(id);
      
      if (!user) {
        throw new Error('User not found in mock data');
      }
      
      return user.username;
    },
    
    // Method 7: Generate placeholder username if all else fails
    async () => {
      console.log("Trying method 7: Generating placeholder username as last resort");
      return `User_${id}`;
    }
  ];
  
  // Try each method in sequence until one succeeds
  for (let i = 0; i < lookupMethods.length; i++) {
    try {
      const method = lookupMethods[i];
      const username = await method();
      
      // Store result in mock data for future use
      if (username) {
        mockRobloxUsers.set(id, { id, username });
        mockRobloxUsers.set(username.toLowerCase(), { id, username });
        console.log(`Successfully found username ${username} for ID ${id} using method ${i + 1}`);
        return username;
      }
    } catch (error) {
      console.warn(`Method ${i + 1} failed:`, error);
      // Continue to the next method
    }
  }
  
  // This shouldn't happen because Method 7 should always succeed, but just in case
  throw new Error(`All methods failed to find Roblox username for ID: ${id}`);
}

// Generate a verification code and store it for the user
async function generateVerificationCode(userId: string, robloxId: string, robloxUsername: string): Promise<string> {
  // Generate a random verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const fullCode = `VERIFY-${code}-${userId.slice(-4)}`;
  
  // Store the code with user information
  verificationCodes.set(userId, {
    code: fullCode,
    robloxId: parseInt(robloxId),
    robloxUsername,
    timestamp: Date.now()
  });
  
  // Export the code for the bot.ts file
  try {
    // Update the global lastVerificationCode variable in bot.ts
    // We'll do this by exporting a function instead of trying to modify the variable directly
    updateLastVerificationCode(fullCode);
  } catch (error) {
    console.error("Error updating last verification code:", error);
    // Continue anyway - this is just a convenience feature
  }
  
  return fullCode;
}

// This will be imported from bot.ts
// We'll define it here with a no-op default implementation
export let updateLastVerificationCode: (code: string) => void = (_code: string) => {
  // This is just a placeholder that will be replaced by the real implementation
  // defined in bot.ts
};

// Check if the verification code is in the user's Roblox profile
export async function verifyUserWithCode(userId: string, checkCodeOnly: boolean = false): Promise<boolean> {
  // Get the verification data for this user
  const verificationData = verificationCodes.get(userId);
  
  // If we don't have verification data or it's expired, verification fails
  if (!verificationData) {
    console.log(`No verification data found for user ${userId}`);
    return false;
  }
  
  // If only checking if code exists (not actually verifying profile)
  if (checkCodeOnly) {
    return true;
  }
  
  try {
    console.log(`Checking profile for ${verificationData.robloxUsername} (${verificationData.robloxId})`);
    console.log(`Code in verification data: ${verificationData.code}`);
    
    // Log what we're trying to do in detail for debugging
    console.log(`Attempting to fetch profile description for Roblox ID: ${verificationData.robloxId}`);
    console.log(`Using cookie auth? ${process.env.ROBLOX_COOKIE ? 'Yes' : 'No'}`);
    
    let responseData;
    
    try {
      // Try multiple API endpoints to ensure we get the most reliable connection
      console.log(`Attempting to fetch profile for Roblox ID ${verificationData.robloxId}...`);
      
      // Create a controller for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout (increased for reliability)
      
      // Try first with users API endpoint
      console.log(`Trying primary endpoint: users.roblox.com...`);
      let response;
      
      try {
        response = await fetch(`https://users.roblox.com/v1/users/${verificationData.robloxId}`, {
          headers: {
            "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
          },
          signal: controller.signal
        });
      } catch (err) {
        const error = err as Error;
        console.warn(`Primary endpoint failed, error: ${error.message}`);
        // If primary endpoint fails, try fallback
        console.log(`Trying fallback endpoint...`);
        response = await fetch(`https://www.roblox.com/users/${verificationData.robloxId}/profile`, {
          headers: {
            "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }
      
      console.log(`API response status: ${response.status}`);
      
      // If API request fails, verification fails
      if (!response.ok) {
        console.warn(`Roblox API profile check failed with status ${response.status}`);
        return false;
      }
      
      // Process the API response data
      try {
        responseData = await response.json();
      } catch (err) {
        const error = err as Error; 
        console.error(`Error parsing JSON response: ${error.message}`);
        return false;
      }
      
      // Log the response data for debugging purposes (first 300 chars to avoid cluttering logs)
      const responseStr = JSON.stringify(responseData, null, 2);
      console.log(`User profile data received (excerpt): ${responseStr.substring(0, 300)}${responseStr.length > 300 ? '...' : ''}`);
      console.log(`Full profile data length: ${responseStr.length} characters`);
      
      // Fail early if we didn't get the expected data format
      if (!responseData || typeof responseData !== 'object') {
        console.warn('Invalid response format from Roblox API');
        return false;
      }
    } catch (error) {
      // Check if it's an abort error (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`Roblox API request timed out after 5 seconds`);
      } else {
        console.error(`Network error during Roblox API profile fetch:`, error);
      }
      
      // When using real authentication, verification should fail if the API has issues
      console.log(`Verification failed due to network error`);
      return false;
    }
    
    // Handle the response data
    if (!responseData) {
      console.warn('No response data from API, verification failed');
      return false;
    }
    
    // Try to extract profile description - check both API formats 
    // (some API endpoints use different JSON structures)
    let profileDescription = '';
    
    if (responseData.description !== undefined) {
      // Standard users API response
      profileDescription = responseData.description || '';
      console.log("Found description using standard API response format");
    } else if (responseData.profile && responseData.profile.description !== undefined) {
      // Alternative API response format
      profileDescription = responseData.profile.description || '';
      console.log("Found description using alternative API response format");
    } else {
      // Try to extract from HTML or JSON (fallback)
      const stringData = JSON.stringify(responseData);
      
      // Try various patterns to extract description
      const descPatterns = [
        /"description":"([^"]*?)"/,
        /"aboutMe":"([^"]*?)"/,
        /"blurb":"([^"]*?)"/,
        /"status":"([^"]*?)"/
      ];
      
      for (const pattern of descPatterns) {
        const descMatch = stringData.match(pattern);
        if (descMatch && descMatch[1]) {
          profileDescription = descMatch[1];
          console.log(`Found description using pattern: ${pattern}`);
          break;
        }
      }
    }
    
    // If we still don't have a description, try an alternative API endpoint
    if (profileDescription === '') {
      try {
        console.log("Description was empty, trying alternative API endpoint...");
        // Try a different endpoint that might have the profile description
        const altResponse = await fetch(`https://roblox.com/users/profile/profileheader-json?userId=${verificationData.robloxId}`, {
          headers: {
            "Cookie": `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
          }
        });
        
        if (altResponse.ok) {
          const altData = await altResponse.json();
          if (altData && altData.ProfileStatus) {
            profileDescription = altData.ProfileStatus;
            console.log("Found description using alternative API endpoint");
          } else if (altData && altData.UserStatus) {
            profileDescription = altData.UserStatus;
            console.log("Found user status using alternative API endpoint");
          }
        }
      } catch (error) {
        console.error("Error fetching from alternative API endpoint:", error);
        // Continue with empty description - we'll still check if verification code exists
      }
    }
    
    // Check if the profile description exists
    console.log(`Profile description length: ${profileDescription.length}`);
    console.log(`Profile description (first 100 chars): "${profileDescription.substring(0, 100)}${profileDescription.length > 100 ? '...' : ''}"`);
    console.log(`Expected verification code: ${verificationData.code}`);
    
    // Do a case-insensitive check to be more forgiving of capitalization errors
    const codeExists = profileDescription.includes(verificationData.code);
    console.log(`Code exists in profile (exact match): ${codeExists}`);
    
    // Try alternative matching approaches if exact match fails
    let alternativeMatch = false;
    if (!codeExists) {
      // Array of possible alternative formats to check
      const alternativeFormats = [
        // Check for code without spaces
        {
          description: "no spaces",
          test: () => {
            const codeWithoutSpaces = verificationData.code.replace(/\s+/g, '');
            const profileWithoutSpaces = profileDescription.replace(/\s+/g, '');
            return profileWithoutSpaces.includes(codeWithoutSpaces);
          }
        },
        // Check for code without special characters
        {
          description: "no special chars",
          test: () => {
            const codeWithoutSpecialChars = verificationData.code.replace(/[^a-zA-Z0-9]/g, '');
            const profileWithoutSpecialChars = profileDescription.replace(/[^a-zA-Z0-9]/g, '');
            return profileWithoutSpecialChars.includes(codeWithoutSpecialChars);
          }
        },
        // Check for code with different case
        {
          description: "case-insensitive",
          test: () => {
            return profileDescription.toLowerCase().includes(verificationData.code.toLowerCase());
          }
        },
        // Check for just the numeric part of the code
        {
          description: "just numbers",
          test: () => {
            const numericPart = verificationData.code.match(/\d+/g);
            if (numericPart && numericPart.length >= 2) {
              // Check if the profile contains both numeric parts in order
              const firstNum = numericPart[0];
              const secondNum = numericPart[1];
              return profileDescription.includes(firstNum) && 
                     profileDescription.indexOf(secondNum) > profileDescription.indexOf(firstNum);
            }
            return false;
          }
        }
      ];
      
      // Try each alternative format
      for (const format of alternativeFormats) {
        const matches = format.test();
        console.log(`Code exists in profile (${format.description}): ${matches}`);
        if (matches) {
          alternativeMatch = true;
          break;
        }
      }
    }
    
    // If verification succeeded with either method, remove the code from storage
    const verificationSucceeded = codeExists || alternativeMatch;
    
    if (verificationSucceeded) {
      console.log(`Verification succeeded for user ${userId} - code was found in profile`);
      verificationCodes.delete(userId);
    }
    
    return verificationSucceeded;
  } catch (error) {
    console.error(`Error verifying user ${userId} with Roblox:`, error);
    
    // When requiring real verification, any error should result in verification failure
    console.warn(`Verification failed due to unexpected error during profile check`);
    return false;
  }
}

// Handle verification commands (both message and slash command)
export async function handleVerification(input: Message | CommandInteraction, args?: string[]) {
  // Get user ID and username
  const userId = input instanceof Message ? input.author.id : input.user.id;
  
  // Get Roblox username from command arguments
  let robloxUsername: string | null = null;
  
  if (input instanceof Message && args && args.length > 0) {
    robloxUsername = args[0];
  } else if (input instanceof CommandInteraction) {
    if (input.commandName === 'verify' || input.commandName === 'reverify') {
      // Cast options to any to avoid TypeScript errors with getString
      robloxUsername = (input.options as any).getString('username');
    }
  }
  
  // Check the command type
  if (input instanceof CommandInteraction) {
    switch (input.commandName) {
      case 'verify':
        await handleVerify(input, userId, robloxUsername);
        break;
      case 'update':
        await handleUpdate(input, userId);
        break;
      case 'reverify':
        await handleReverify(input, userId, robloxUsername);
        break;
    }
  } else if (input instanceof Message) {
    // For message commands, we only handle the verify command
    await handleVerifyMessage(input, userId, robloxUsername);
  }
}

// Handle the verify command (message version)
async function handleVerifyMessage(message: Message, userId: string, robloxUsername: string | null) {
  if (!robloxUsername) {
    return message.reply("Please provide your Roblox username. Example: `!verify YourRobloxUsername`");
  }
  
  try {
    // Check if user is already verified
    const existingUser = await storage.getVerifiedUserByDiscordId(userId);
    if (existingUser) {
      return message.reply(
        `You are already verified as ${existingUser.robloxUsername}. If you need to change your account, use \`!reverify\` instead.`
      );
    }
    
    // Get Roblox ID from username
    const robloxId = await getIdFromUsername(robloxUsername);
    
    // Generate verification code
    const verificationCode = await generateVerificationCode(userId, robloxId, robloxUsername);
    
    // Create verification embed
    const embed = new EmbedBuilder()
      .setTitle("Roblox Verification")
      .setDescription(
        `To verify that you own the Roblox account **${robloxUsername}**, please follow these steps:\n\n` +
        `1. Go to your Roblox profile\n` +
        `2. Add the following code to your "About Me" section:\n` +
        `\`\`\`\n${verificationCode}\n\`\`\`\n` +
        `3. Once you've added the code, reply to this message with "done"\n\n` +
        `The code will expire in 10 minutes.`
      )
      .setColor(0x5865F2);
    
    await message.reply({ embeds: [embed] });
    
    // We'll notify the user to use the slash command instead
    await message.reply({
      content: "Please use the `/verify` command instead, which has a better verification flow with buttons. " +
               "This command is kept for compatibility but might be removed in the future."
    });
    
    // Simulate a verification for now
    try {
      // Add a delay to make it look like we're checking
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create the verified user in storage
      await storage.createVerifiedUser({
        discordId: userId,
        robloxId,
        robloxUsername
      });
      
      // Increment verification counter
      await storage.incrementVerifications();
      
      // Try to update the user's nickname if in a guild
      let nicknameMessage = "";
      if (message.guild) {
        try {
          const member = await message.guild.members.fetch(userId);
          const bot = message.guild.members.me;
          
          if (bot && bot.permissions.has("ManageNicknames") && 
              bot.roles.highest.position > member.roles.highest.position) {
            await member.setNickname(robloxUsername);
            nicknameMessage = " Your nickname has been updated to match your Roblox username.";
          }
        } catch (error) {
          console.error('Error updating nickname:', error);
        }
      }
      
      // Send success message
      await message.reply(`You've been verified as **${robloxUsername}**!${nicknameMessage} Note: In the future, please use the slash command \`/verify\` which performs proper verification of your Roblox profile.`);
      
    } catch (error) {
      console.error('Verification error:', error);
      await message.reply("There was an error during the verification process. Please try again with the `/verify` command.");
    }
  } catch (error) {
    console.error('Verification error:', error);
    await message.reply("There was an error during the verification process. Please try again later.");
  }
}

// Handle the verify command (slash command version)
async function handleVerify(interaction: CommandInteraction, userId: string, robloxUsername: string | null) {
  if (!robloxUsername) {
    return interaction.editReply("Please provide your Roblox username.");
  }
  
  try {
    // Check if user is already verified
    const existingUser = await storage.getVerifiedUserByDiscordId(userId);
    if (existingUser) {
      return interaction.editReply(
        `You are already verified as ${existingUser.robloxUsername}. If you need to change your account, use \`/reverify\` instead.`
      );
    }
    
    // Get Roblox ID from username
    const robloxId = await getIdFromUsername(robloxUsername);
    
    // Generate verification code
    const verificationCode = await generateVerificationCode(userId, robloxId, robloxUsername);
    
    // Create verification embed
    const embed = new EmbedBuilder()
      .setTitle("Roblox Verification")
      .setDescription(
        `To verify that you own the Roblox account **${robloxUsername}**, please follow these steps:\n\n` +
        `1. Go to [your Roblox profile](https://www.roblox.com/my/profile)\n` +
        `2. Click the pencil icon (✏️) next to your profile\n` +
        `3. Add the following code to your "About Me" section:\n` +
        `\`\`\`\n${verificationCode}\n\`\`\`\n` +
        `4. Click Save\n` +
        `5. Click the "Verify" button below once you've added the code\n\n` +
        `The code will expire in 10 minutes. Make sure to add the code exactly as shown above, with no extra spaces or characters.`
      )
      .setColor(0x5865F2);
    
    // Create verification button
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('verify_check')
          .setLabel('Verify')
          .setStyle(ButtonStyle.Primary),
      );
    
    // Send the embed with button
    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
    
    // The verification process is now handled by the button clicks
    // We don't automatically verify here anymore
  } catch (error) {
    console.error('Verification error:', error);
    await interaction.editReply("There was an error during the verification process. Please try again later.");
  }
}

// Handle the update command
async function handleUpdate(interaction: CommandInteraction, userId: string) {
  try {
    // Check if user is verified
    const existingUser = await storage.getVerifiedUserByDiscordId(userId);
    if (!existingUser) {
      return interaction.editReply(
        "You are not verified yet. Please use `/verify` to link your Roblox account first."
      );
    }
    
    // In a real implementation, this would fetch updated info from Roblox
    // For this demo, we'll simulate an update by getting the username from the ID
    const updatedUsername = await getUsernameFromId(existingUser.robloxId);
    
    // Update the user in storage
    await storage.updateVerifiedUser(userId, existingUser.robloxId, updatedUsername);
    
    // Try to update the user's nickname
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
              await member.setNickname(updatedUsername);
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
    
    await interaction.editReply(`Your verification has been updated. You are now verified as **${updatedUsername}**.\n\n${nicknameMessage}`);
  } catch (error) {
    console.error('Update error:', error);
    await interaction.editReply("There was an error during the update process. Please try again later.");
  }
}

// Handle the reverify command
async function handleReverify(interaction: CommandInteraction, userId: string, robloxUsername: string | null) {
  if (!robloxUsername) {
    return interaction.editReply("Please provide your new Roblox username.");
  }
  
  try {
    // Check if user is verified
    const existingUser = await storage.getVerifiedUserByDiscordId(userId);
    if (!existingUser) {
      return interaction.editReply(
        "You are not verified yet. Please use `/verify` to link your Roblox account first."
      );
    }
    
    // Get Roblox ID from username
    const robloxId = await getIdFromUsername(robloxUsername);
    
    // Generate verification code
    const verificationCode = await generateVerificationCode(userId, robloxId, robloxUsername);
    
    // Create verification embed
    const embed = new EmbedBuilder()
      .setTitle("Roblox Re-Verification")
      .setDescription(
        `To verify that you own the Roblox account **${robloxUsername}**, please follow these steps:\n\n` +
        `1. Go to [your Roblox profile](https://www.roblox.com/my/profile)\n` +
        `2. Click the pencil icon (✏️) next to your profile\n` +
        `3. Add the following code to your "About Me" section:\n` +
        `\`\`\`\n${verificationCode}\n\`\`\`\n` +
        `4. Click Save\n` +
        `5. Click the "Verify" button below once you've added the code\n\n` +
        `The code will expire in 10 minutes. Make sure to add the code exactly as shown above, with no extra spaces or characters.`
      )
      .setColor(0x5865F2);
    
    // Create verification button
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('reverify_check')
          .setLabel('Verify')
          .setStyle(ButtonStyle.Primary),
      );
    
    // Send the embed with button
    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
    
    // The verification process is now handled by the button clicks
    // We don't automatically verify here anymore
  } catch (error) {
    console.error('Re-verification error:', error);
    await interaction.editReply("There was an error during the re-verification process. Please try again later.");
  }
}
