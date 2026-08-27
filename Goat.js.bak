/**
 * @author R3nz75
 * RENZ MESSENGER BOT V3 - Bot Entry
 * Works exactly like original, but fbstate comes from Firebase when run as a child process.
 */

const fs = require("fs-extra");
const path = require("path");
const { promisify } = require("util");
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// ===== LOAD CONFIG =====
const configPath = path.join(__dirname, process.env.NODE_ENV === 'development' ? 'config.dev.json' : 'config.json');
const config = require(configPath);

// ===== SETUP GLOBAL =====
global.GoatBot = {
  config: config,
  configCommands: require(path.join(__dirname, process.env.NODE_ENV === 'development' ? 'configCommands.dev.json' : 'configCommands.json')),
  commands: new Map(),
  eventCommands: new Map(),
  aliases: new Map(),
  fcaApi: null,
  botID: null,
  botName: config.nameBot || "RENZ BOT",
  prefix: config.prefix || "$",
  language: config.language || "en",
  startTime: Date.now()
};

// ===== LOAD UTILITIES =====
const utils = require("./utils.js");
global.utils = utils;
global.log = utils.log;

// ===== LOAD FIREBASE =====
const { botModel } = require('./dashboard/firebase.js');

// ===== BOT ID FROM ENVIRONMENT =====
const BOT_ID = process.env.BOT_ID || null;
const BOT_OWNER = process.env.BOT_OWNER || null;
const BOT_FBSTATE = process.env.BOT_FBSTATE || null;
const IS_CHILD_PROCESS = !!process.env.BOT_ID;

console.log(`[BOT] Starting bot${BOT_ID ? ` ${BOT_ID}` : ''} (${IS_CHILD_PROCESS ? 'child process' : 'main process'})`);

// ===== LOGIN FUNCTION =====
async function loginBot() {
  try {
    const { login } = require("fcanew-r3nz75");
    
    let fbstate = null;

    // If child process, get fbstate from environment or Firebase
    if (IS_CHILD_PROCESS && BOT_ID) {
      console.log(`[BOT] Loading fbstate for bot ${BOT_ID}`);
      // First try environment variable (from botManager)
      if (BOT_FBSTATE) {
        try {
          fbstate = JSON.parse(BOT_FBSTATE);
          console.log(`[BOT] Loaded fbstate from environment`);
        } catch (e) {
          console.error(`[BOT] Failed to parse BOT_FBSTATE:`, e.message);
        }
      }
      // If not, fetch from Firebase directly
      if (!fbstate) {
        const bot = await botModel.getById(BOT_ID);
        if (bot && bot.fbstate) {
          try {
            fbstate = JSON.parse(bot.fbstate);
            console.log(`[BOT] Loaded fbstate from Firebase`);
          } catch (e) {
            console.error(`[BOT] Invalid fbstate in Firebase`);
          }
        }
      }
    } else {
      // Main process – not logging in as a bot
      console.log('[BOT] Main process – dashboard only');
      return null;
    }

    if (!fbstate || !Array.isArray(fbstate) || fbstate.length === 0) {
      console.error('[BOT] No valid fbstate found');
      process.exit(1);
    }

    console.log(`[BOT] ✅ fbstate validated (${fbstate.length} items)`);

    // ===== ORIGINAL LOGIN CODE (unchanged) =====
    console.log('[BOT] Logging in...');
    const api = await login({ 
      appState: fbstate,
      logLevel: 'error',
      forceLogin: true,
      listenEvents: true,
      updatePresence: true,
      listenTyping: true,
      autoMarkDelivery: true,
      autoReconnect: true
    });

    global.GoatBot.fcaApi = api;

    // Get user info (exactly as original)
    try {
      const userId = api.getCurrentUserID();
      const botInfo = await api.getUserInfo(userId);
      if (botInfo && botInfo[userId]) {
        global.GoatBot.botID = userId;
        global.GoatBot.botName = botInfo[userId].name || config.nameBot || "RENZ BOT";
        console.log(`[BOT] ✅ Logged in as: ${global.GoatBot.botName} (${global.GoatBot.botID})`);
      } else {
        global.GoatBot.botID = userId;
        console.log(`[BOT] ✅ Logged in with ID: ${global.GoatBot.botID}`);
      }
    } catch (err) {
      global.GoatBot.botID = api.getCurrentUserID();
      console.log(`[BOT] ✅ Logged in with ID: ${global.GoatBot.botID}`);
    }

    // Mark bot as running in Firebase
    if (BOT_ID) {
      await botModel.update(BOT_ID, { running: true });
    }

    // ===== LOAD DATABASE (exactly like original loadData.js) =====
    console.log('[BOT] Loading database...');
    const dbController = require('./database/controller/index.js');
    const db = await dbController(api);
    global.db = db;
    const { threadsData, usersData, dashBoardData, globalData } = db;

    // ===== LOAD COMMANDS (original logic) =====
    await loadCommands(api, threadsData, usersData, dashBoardData, globalData);

    // ===== START LISTENING (original logic) =====
    await startListening(api, threadsData, usersData, dashBoardData, globalData);

    return api;

  } catch (err) {
    console.error('[BOT] ❌ Login failed:', err.message);
    console.error(err.stack);
    if (!IS_CHILD_PROCESS) {
      console.log('[BOT] Main process continuing without bot login...');
      return null;
    }
    // Retry after delay
    setTimeout(() => {
      console.log('[BOT] 🔄 Retrying login...');
      loginBot();
    }, 10000);
  }
}

// ===== LOAD COMMANDS (original) =====
async function loadCommands(api, threadsData, usersData, dashBoardData, globalData) {
  const commandsPath = path.join(__dirname, 'scripts', 'cmds');
  if (!fs.existsSync(commandsPath)) {
    console.log('[BOT] No commands folder found');
    return;
  }

  const commandFolders = await readdir(commandsPath);
  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const statInfo = await stat(folderPath);
    if (!statInfo.isDirectory()) continue;

    const commandFiles = await readdir(folderPath);
    for (const file of commandFiles) {
      if (!file.endsWith('.js')) continue;
      try {
        const command = require(path.join(folderPath, file));
        if (command.config && command.config.name) {
          global.GoatBot.commands.set(command.config.name, command);
          if (command.config.aliases) {
            for (const alias of command.config.aliases) {
              global.GoatBot.aliases.set(alias, command.config.name);
            }
          }
          console.log(`[BOT] Loaded command: ${command.config.name}`);
        }
      } catch (err) {
        console.error(`[BOT] Failed to load command ${file}:`, err.message);
      }
    }
  }
  console.log(`[BOT] Loaded ${global.GoatBot.commands.size} commands`);
}

// ===== START LISTENING (original) =====
async function startListening(api, threadsData, usersData, dashBoardData, globalData) {
  // Load events
  const eventsPath = path.join(__dirname, 'scripts', 'events');
  if (fs.existsSync(eventsPath)) {
    const eventFiles = await readdir(eventsPath);
    for (const file of eventFiles) {
      if (!file.endsWith('.js')) continue;
      try {
        const event = require(path.join(eventsPath, file));
        if (event.config && event.config.name) {
          global.GoatBot.eventCommands.set(event.config.name, event);
          console.log(`[BOT] Loaded event: ${event.config.name}`);
        }
      } catch (err) {
        console.error(`[BOT] Failed to load event ${file}:`, err.message);
      }
    }
  }

  // Start MQTT listener
  api.listenMqtt(async (err, event) => {
    if (err) {
      console.error('[BOT] MQTT Error:', err.message);
      return;
    }
    await handleEvent(api, event, threadsData, usersData, dashBoardData, globalData);
  });

  console.log('[BOT] ✅ Listening for messages...');
}

// ===== HANDLE EVENTS (original) =====
async function handleEvent(api, event, threadsData, usersData, dashBoardData, globalData) {
  try {
    // Process event commands
    for (const [name, eventCmd] of global.GoatBot.eventCommands) {
      try {
        if (eventCmd.onEvent) {
          await eventCmd.onEvent({ api, event, ...eventCmd.config });
        }
      } catch (err) {
        console.error(`[BOT] Event command ${name} error:`, err.message);
      }
    }

    // Process message commands
    if (event.type === 'message' && event.body) {
      const prefix = global.GoatBot.prefix;
      if (!event.body.startsWith(prefix)) return;

      const args = event.body.slice(prefix.length).trim().split(/\s+/);
      const commandName = args.shift().toLowerCase();

      const command = global.GoatBot.commands.get(commandName) || 
                      global.GoatBot.commands.get(global.GoatBot.aliases.get(commandName));

      if (command) {
        try {
          const context = {
            api,
            event,
            message: {
              reply: async (text) => {
                return api.sendMessage(text, event.threadID);
              },
              react: async (emoji) => {
                return api.setMessageReaction(emoji, event.messageID, event.threadID);
              }
            },
            usersData,
            threadsData,
            dashBoardData,
            globalData,
            args,
            commandName
          };
          await command.onStart(context);
        } catch (err) {
          console.error(`[BOT] Command ${commandName} error:`, err.message);
          api.sendMessage(`⚠️ Error: ${err.message}`, event.threadID);
        }
      }
    }
  } catch (err) {
    console.error('[BOT] Event handler error:', err.message);
  }
}

// ===== START BOT =====
console.log('[BOT] Starting RENZ MESSENGER BOT V3...');
console.log(`[BOT] Using Node.js ${process.version}`);

process.on('SIGTERM', () => {
  console.log('[BOT] Received SIGTERM, shutting down...');
  if (BOT_ID) botModel.update(BOT_ID, { running: false, pid: null }).catch(() => {});
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[BOT] Received SIGINT, shutting down...');
  if (BOT_ID) botModel.update(BOT_ID, { running: false, pid: null }).catch(() => {});
  process.exit(0);
});

// If child process, start the bot; otherwise keep alive for dashboard
if (IS_CHILD_PROCESS && BOT_ID) {
  console.log(`[BOT] Starting as bot ${BOT_ID} (owner: ${BOT_OWNER})`);
  loginBot().catch(err => {
    console.error('[BOT] Fatal error:', err);
    process.exit(1);
  });
} else {
  console.log('[BOT] Running as main process (dashboard only)');
  console.log('[BOT] To start bots, use the dashboard Start buttons.');
  setInterval(() => {}, 60000); // Keep alive
}