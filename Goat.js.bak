/**
 * RENZ MESSENGER BOT V3 - Bot Process
 * This file runs as a child process for each bot
 */

const fs = require("fs-extra");
const path = require("path");
const { promisify } = require("util");
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// ===== CHECK IF THIS IS A BOT PROCESS =====
if (!process.env.IS_BOT_PROCESS && !process.env.BOT_ID) {
    console.log('[BOT] Not a bot process, exiting...');
    process.exit(0);
}

const BOT_ID = process.env.BOT_ID;
const BOT_OWNER = process.env.BOT_OWNER;
const BOT_FBSTATE = process.env.BOT_FBSTATE;

console.log(`[BOT ${BOT_ID}] Starting bot process...`);
console.log(`[BOT ${BOT_ID}] Owner: ${BOT_OWNER}`);

// ===== LOAD CONFIG =====
const configPath = path.join(__dirname, process.env.NODE_ENV === 'development' ? 'config.dev.json' : 'config.json');
let config = {};
try {
    config = require(configPath);
    console.log(`[BOT ${BOT_ID}] ✅ Config loaded`);
} catch (err) {
    console.error(`[BOT ${BOT_ID}] Failed to load config:`, err.message);
    config = { 
        prefix: "$", 
        language: "en", 
        nameBot: "RENZ BOT",
        adminBot: [],
        developer: [],
        vipuser: [],
        premium: [],
        creator: []
    };
}

// ===== SETUP GLOBAL =====
global.GoatBot = {
    config: config,
    commands: new Map(),
    eventCommands: new Map(),
    aliases: new Map(),
    fcaApi: null,
    botID: BOT_ID,
    botName: config.nameBot || "RENZ BOT",
    prefix: config.prefix || "$",
    language: config.language || "en",
    startTime: Date.now()
};

// ===== LOAD UTILITIES =====
try {
    const utils = require("./utils.js");
    global.utils = utils;
    console.log(`[BOT ${BOT_ID}] ✅ Utilities loaded`);
} catch (err) {
    console.warn(`[BOT ${BOT_ID}] utils.js not found, using fallback`);
    global.utils = {
        log: {
            info: console.log,
            warn: console.warn,
            error: console.error
        },
        convertTime: (ms) => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            if (days > 0) return `${days}d ${hours % 24}h`;
            if (hours > 0) return `${hours}h ${minutes % 60}m`;
            if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
            return `${seconds}s`;
        }
    };
}

// ===== LOAD FIREBASE =====
const { botModel } = require('./dashboard/firebase.js');

// ===== DATABASE MODELS (with fallback) =====
let usersData = null;
let threadsData = null;

async function loadDatabaseModels() {
    try {
        // Try to load from database/controller
        const dbController = require('./database/controller/index.js');
        const db = await dbController(null);
        usersData = db.usersData;
        threadsData = db.threadsData;
        console.log(`[BOT ${BOT_ID}] ✅ Database models loaded from database/controller`);
        return true;
    } catch (err) {
        console.warn(`[BOT ${BOT_ID}] Failed to load from database/controller:`, err.message);
    }

    try {
        // Try to load from database/models
        const usersModel = require('./database/models/users.js');
        const threadsModel = require('./database/models/threads.js');
        usersData = usersModel;
        threadsData = threadsModel;
        console.log(`[BOT ${BOT_ID}] ✅ Database models loaded from database/models`);
        return true;
    } catch (err) {
        console.warn(`[BOT ${BOT_ID}] Failed to load from database/models:`, err.message);
    }

    // Fallback: create dummy models
    console.warn(`[BOT ${BOT_ID}] ⚠️ Using fallback database models (no persistence)`);
    usersData = {
        get: async (id) => ({ money: 0, exp: 0, level: 1 }),
        set: async (id, data) => data,
        getAll: async () => []
    };
    threadsData = {
        get: async (id) => ({ members: [], adminIDs: [] }),
        set: async (id, data) => data,
        getAll: async () => []
    };
    return true;
}

// ===== LOGIN FUNCTION =====
async function loginBot() {
    try {
        const { login } = require("fcanew-r3nz75");

        let fbstate = null;

        if (BOT_FBSTATE) {
            try {
                fbstate = JSON.parse(BOT_FBSTATE);
                console.log(`[BOT ${BOT_ID}] ✅ Loaded fbstate from environment`);
            } catch (parseError) {
                console.error(`[BOT ${BOT_ID}] ❌ Failed to parse fbstate JSON:`, parseError.message);
                process.exit(1);
            }
        } else {
            console.log(`[BOT ${BOT_ID}] Loading fbstate from Firebase...`);
            const bot = await botModel.getById(BOT_ID);
            if (!bot) {
                console.error(`[BOT ${BOT_ID}] ❌ Bot not found in Firebase`);
                process.exit(1);
            }
            fbstate = bot.fbstate;
            if (typeof fbstate === 'string') {
                try {
                    fbstate = JSON.parse(fbstate);
                    console.log(`[BOT ${BOT_ID}] ✅ Parsed fbstate from Firebase`);
                } catch (e) {
                    console.error(`[BOT ${BOT_ID}] ❌ Invalid fbstate format in Firebase`);
                    process.exit(1);
                }
            }
        }

        if (!fbstate || !Array.isArray(fbstate) || fbstate.length === 0) {
            console.error(`[BOT ${BOT_ID}] ❌ Invalid fbstate`);
            process.exit(1);
        }

        console.log(`[BOT ${BOT_ID}] ✅ fbstate validated (${fbstate.length} items)`);
        console.log(`[BOT ${BOT_ID}] Logging in...`);

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
        global.GoatBot.botID = api.getCurrentUserID();

        try {
            const botInfo = await api.getUserInfo(global.GoatBot.botID);
            if (botInfo && botInfo[global.GoatBot.botID]) {
                global.GoatBot.botName = botInfo[global.GoatBot.botID].name || config.nameBot || "RENZ BOT";
                console.log(`[BOT ${BOT_ID}] ✅ Logged in as: ${global.GoatBot.botName} (${global.GoatBot.botID})`);
            } else {
                console.log(`[BOT ${BOT_ID}] ✅ Logged in with ID: ${global.GoatBot.botID}`);
            }
        } catch (err) {
            console.log(`[BOT ${BOT_ID}] ✅ Logged in with ID: ${global.GoatBot.botID}`);
        }

        // Mark bot as running in Firebase
        await botModel.update(BOT_ID, { running: true });

        // Load database models
        await loadDatabaseModels();

        // ===== LOAD COMMANDS FROM SCRIPTS/CMDS =====
        await loadCommands(api);

        // ===== LOAD EVENTS FROM SCRIPTS/EVENTS =====
        await loadEvents(api);

        // ===== START LISTENING =====
        await startListening(api);

        return api;

    } catch (err) {
        console.error(`[BOT ${BOT_ID}] ❌ Login failed:`, err.message);
        console.error(err.stack);
        setTimeout(() => {
            console.log(`[BOT ${BOT_ID}] Retrying login...`);
            loginBot();
        }, 5000);
    }
}

// ================================================================
// ===== LOAD COMMANDS =====
// ================================================================

async function loadCommands(api) {
    // Try the correct path based on your repository structure
    const commandsPath = path.join(__dirname, 'scripts', 'cmds');
    
    if (!fs.existsSync(commandsPath)) {
        console.log(`[BOT ${BOT_ID}] ❌ Commands folder not found at: ${commandsPath}`);
        // Try alternative locations
        const altPaths = [
            path.join(__dirname, 'commands'),
            path.join(__dirname, 'cmds'),
            path.join(__dirname, 'bot', 'commands')
        ];
        let found = false;
        for (const alt of altPaths) {
            if (fs.existsSync(alt)) {
                console.log(`[BOT ${BOT_ID}] Found commands at alternative location: ${alt}`);
                await loadCommandsFromPath(api, alt);
                found = true;
                break;
            }
        }
        if (!found) {
            console.log(`[BOT ${BOT_ID}] ❌ No commands folder found`);
        }
        return;
    }

    await loadCommandsFromPath(api, commandsPath);
}

async function loadCommandsFromPath(api, commandsPath) {
    try {
        const files = await readdir(commandsPath);
        let loadedCount = 0;
        let failedCount = 0;

        for (const file of files) {
            if (!file.endsWith('.js')) continue;

            const filePath = path.join(commandsPath, file);
            try {
                // Clear require cache to load fresh
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);
                
                if (command.config && command.config.name) {
                    // Store command
                    global.GoatBot.commands.set(command.config.name, command);
                    
                    // Store aliases
                    if (command.config.aliases && Array.isArray(command.config.aliases)) {
                        for (const alias of command.config.aliases) {
                            global.GoatBot.aliases.set(alias, command.config.name);
                        }
                    }
                    loadedCount++;
                } else {
                    console.warn(`[BOT ${BOT_ID}] ⚠️ Command ${file} missing config.name`);
                    failedCount++;
                }
            } catch (err) {
                console.error(`[BOT ${BOT_ID}] ❌ Failed to load command ${file}:`, err.message);
                failedCount++;
            }
        }

        console.log(`[BOT ${BOT_ID}] ✅ Loaded ${loadedCount} commands (${failedCount} failed)`);
        
        // Log command names for debugging
        if (loadedCount > 0) {
            const names = Array.from(global.GoatBot.commands.keys()).slice(0, 10);
            console.log(`[BOT ${BOT_ID}] 📝 Commands: ${names.join(', ')}${global.GoatBot.commands.size > 10 ? '...' : ''}`);
        }
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] Failed to read commands folder:`, err.message);
    }
}

// ================================================================
// ===== LOAD EVENTS =====
// ================================================================

async function loadEvents(api) {
    const eventsPath = path.join(__dirname, 'scripts', 'events');
    
    if (!fs.existsSync(eventsPath)) {
        console.log(`[BOT ${BOT_ID}] ❌ Events folder not found at: ${eventsPath}`);
        // Try alternative locations
        const altPaths = [
            path.join(__dirname, 'events'),
            path.join(__dirname, 'bot', 'events')
        ];
        for (const alt of altPaths) {
            if (fs.existsSync(alt)) {
                console.log(`[BOT ${BOT_ID}] Found events at alternative location: ${alt}`);
                await loadEventsFromPath(api, alt);
                return;
            }
        }
        return;
    }

    await loadEventsFromPath(api, eventsPath);
}

async function loadEventsFromPath(api, eventsPath) {
    try {
        const files = await readdir(eventsPath);
        let loadedCount = 0;

        for (const file of files) {
            if (!file.endsWith('.js')) continue;

            const filePath = path.join(eventsPath, file);
            try {
                delete require.cache[require.resolve(filePath)];
                const event = require(filePath);
                
                if (event.config && event.config.name) {
                    global.GoatBot.eventCommands.set(event.config.name, event);
                    loadedCount++;
                }
            } catch (err) {
                console.error(`[BOT ${BOT_ID}] Failed to load event ${file}:`, err.message);
            }
        }

        console.log(`[BOT ${BOT_ID}] ✅ Loaded ${loadedCount} events`);
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] Failed to read events folder:`, err.message);
    }
}

// ===== START LISTENING =====
async function startListening(api) {
    api.listenMqtt(async (err, event) => {
        if (err) {
            console.error(`[BOT ${BOT_ID}] MQTT Error:`, err.message);
            return;
        }

        // Log incoming messages for debugging
        if (event.type === 'message') {
            console.log(`[BOT ${BOT_ID}] 📩 Message from ${event.senderID}: ${event.body?.substring(0, 50) || '(no text)'}`);
        }

        await handleEvent(api, event);
    });

    console.log(`[BOT ${BOT_ID}] ✅ Listening for messages...`);
}

// ===== HANDLE EVENTS =====
async function handleEvent(api, event) {
    try {
        // Process event commands first
        for (const [name, eventCmd] of global.GoatBot.eventCommands) {
            try {
                if (eventCmd.onEvent) {
                    await eventCmd.onEvent({ api, event, ...eventCmd.config });
                }
            } catch (err) {
                console.error(`[BOT ${BOT_ID}] Event command ${name} error:`, err.message);
            }
        }

        // Handle message commands
        if (event.type === 'message' && event.body) {
            const prefix = global.GoatBot.prefix;
            
            // Check if message starts with prefix
            if (!event.body.startsWith(prefix)) return;

            // Parse command
            const args = event.body.slice(prefix.length).trim().split(/\s+/);
            const commandName = args.shift().toLowerCase();

            // Find command
            let command = global.GoatBot.commands.get(commandName);
            if (!command) {
                // Check aliases
                const aliasTarget = global.GoatBot.aliases.get(commandName);
                if (aliasTarget) {
                    command = global.GoatBot.commands.get(aliasTarget);
                }
            }

            if (command) {
                console.log(`[BOT ${BOT_ID}] 🎯 Executing command: ${commandName} from ${event.senderID}`);
                try {
                    const context = {
                        api,
                        event,
                        message: {
                            reply: async (text) => {
                                console.log(`[BOT ${BOT_ID}] 💬 Replying to ${event.senderID}: ${text?.substring(0, 50) || ''}`);
                                return api.sendMessage(text, event.threadID);
                            },
                            react: async (emoji) => {
                                return api.setMessageReaction(emoji, event.messageID, event.threadID);
                            }
                        },
                        usersData: usersData,
                        threadsData: threadsData,
                        args,
                        commandName
                    };

                    await command.onStart(context);
                } catch (err) {
                    console.error(`[BOT ${BOT_ID}] ❌ Command ${commandName} error:`, err.message);
                    console.error(err.stack);
                    try {
                        api.sendMessage(`⚠️ Error: ${err.message}`, event.threadID);
                    } catch (e) {
                        // Ignore send error
                    }
                }
            } else {
                // Command not found - only log if it's a valid prefix command
                if (event.body.startsWith(prefix)) {
                    console.log(`[BOT ${BOT_ID}] ❓ Unknown command: ${commandName}`);
                }
            }
        }
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] Event handler error:`, err.message);
        console.error(err.stack);
    }
}

// ===== START BOT =====
process.on('SIGTERM', () => {
    console.log(`[BOT ${BOT_ID}] Received SIGTERM, shutting down...`);
    botModel.update(BOT_ID, { running: false, pid: null }).catch(() => {});
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log(`[BOT ${BOT_ID}] Received SIGINT, shutting down...`);
    botModel.update(BOT_ID, { running: false, pid: null }).catch(() => {});
    process.exit(0);
});

// ===== Unhandled rejection handler =====
process.on('unhandledRejection', (reason, promise) => {
    console.error(`[BOT ${BOT_ID}] Unhandled Rejection at:`, promise);
    console.error(`[BOT ${BOT_ID}] Reason:`, reason);
});

// ===== Start the bot =====
console.log(`[BOT ${BOT_ID}] 🚀 Initializing...`);
loginBot().catch(err => {
    console.error(`[BOT ${BOT_ID}] 💀 Fatal error:`, err);
    process.exit(1);
});