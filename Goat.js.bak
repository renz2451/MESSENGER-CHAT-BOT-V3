/**
 * RENZ MESSENGER BOT V3 - Bot Process
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

console.log(`[BOT ${BOT_ID}] 🚀 Starting bot process...`);
console.log(`[BOT ${BOT_ID}] 👤 Owner: ${BOT_OWNER}`);

// ===== LOAD CONFIG =====
const configPath = path.join(__dirname, process.env.NODE_ENV === 'development' ? 'config.dev.json' : 'config.json');
let config = {};
try {
    config = require(configPath);
    console.log(`[BOT ${BOT_ID}] ✅ Config loaded`);
} catch (err) {
    console.error(`[BOT ${BOT_ID}] ❌ Failed to load config:`, err.message);
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

// ===== INITIALIZE GLOBAL VARIABLES =====
global.busyList = global.busyList || {};
global.welcomeEvent = global.welcomeEvent || {};
global.GoatBot.busyList = global.busyList;
global.GoatBot.welcomeEvent = global.welcomeEvent;

global.goat = global.goat || {
    commands: new Map(),
    events: new Map(),
    aliases: new Map()
};
global.db = global.db || {
    allThreadData: [],
    allUserData: [],
    globalData: []
};
global.client = global.client || {
    database: {
        creatingThreadData: [],
        creatingUserData: [],
        creatingDashBoardData: []
    }
};

// ===== LOAD UTILITIES =====
try {
    const utils = require("./utils.js");
    global.utils = utils;
    console.log(`[BOT ${BOT_ID}] ✅ Utilities loaded`);
} catch (err) {
    console.warn(`[BOT ${BOT_ID}] ⚠️ utils.js not found, using fallback`);
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

// ===== DATABASE MODELS =====
let usersData = null;
let threadsData = null;

async function loadDatabaseModels() {
    try {
        const dbController = require('./database/controller/index.js');
        const db = await dbController(null);
        usersData = db.usersData;
        threadsData = db.threadsData;
        console.log(`[BOT ${BOT_ID}] ✅ Database models loaded`);
        return true;
    } catch (err) {
        console.warn(`[BOT ${BOT_ID}] ⚠️ Database models not available:`, err.message);
        // Create fallback models that use the API
        usersData = {
            get: async (id) => {
                try {
                    if (global.GoatBot.fcaApi) {
                        const info = await global.GoatBot.fcaApi.getUserInfo(id);
                        return { money: 0, exp: 0, level: 1, name: info[id]?.name || 'User' };
                    }
                } catch (e) {}
                return { money: 0, exp: 0, level: 1 };
            },
            set: async (id, data) => data,
            getAll: async () => []
        };
        threadsData = {
            get: async (id) => {
                try {
                    if (global.GoatBot.fcaApi) {
                        const info = await global.GoatBot.fcaApi.getThreadInfo(id);
                        return { members: info.participantIDs || [], adminIDs: info.adminIDs || [] };
                    }
                } catch (e) {}
                return { members: [], adminIDs: [] };
            },
            set: async (id, data) => data,
            getAll: async () => []
        };
        return true;
    }
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
                console.error(`[BOT ${BOT_ID}] ❌ Failed to parse fbstate:`, parseError.message);
                const bot = await botModel.getById(BOT_ID);
                if (bot && bot.fbstate) {
                    try {
                        fbstate = JSON.parse(bot.fbstate);
                        console.log(`[BOT ${BOT_ID}] ✅ Loaded fbstate from Firebase`);
                    } catch (e) {
                        console.error(`[BOT ${BOT_ID}] ❌ Invalid fbstate in Firebase`);
                    }
                }
            }
        } else {
            console.log(`[BOT ${BOT_ID}] Loading fbstate from Firebase...`);
            const bot = await botModel.getById(BOT_ID);
            if (bot && bot.fbstate) {
                try {
                    fbstate = JSON.parse(bot.fbstate);
                    console.log(`[BOT ${BOT_ID}] ✅ Loaded fbstate from Firebase`);
                } catch (e) {
                    console.error(`[BOT ${BOT_ID}] ❌ Invalid fbstate in Firebase`);
                }
            }
        }

        if (!fbstate || !Array.isArray(fbstate) || fbstate.length === 0) {
            console.error(`[BOT ${BOT_ID}] ❌ No valid fbstate found`);
            await botModel.update(BOT_ID, { running: false, pid: null });
            process.exit(1);
        }

        console.log(`[BOT ${BOT_ID}] ✅ fbstate validated (${fbstate.length} items)`);
        console.log(`[BOT ${BOT_ID}] 🔑 Logging in to Facebook...`);

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

        if (!api) {
            console.error(`[BOT ${BOT_ID}] ❌ Login returned null`);
            await botModel.update(BOT_ID, { running: false, pid: null });
            process.exit(1);
        }

        // Store API in global
        global.GoatBot.fcaApi = api;

        let botID;
        try {
            botID = api.getCurrentUserID();
            global.GoatBot.botID = botID;
        } catch (err) {
            console.error(`[BOT ${BOT_ID}] ❌ Failed to get user ID:`, err.message);
            await botModel.update(BOT_ID, { running: false, pid: null });
            process.exit(1);
        }

        try {
            const botInfo = await api.getUserInfo(botID);
            if (botInfo && botInfo[botID]) {
                global.GoatBot.botName = botInfo[botID].name || config.nameBot || "RENZ BOT";
                console.log(`[BOT ${BOT_ID}] ✅ Logged in as: ${global.GoatBot.botName} (${botID})`);
            } else {
                console.log(`[BOT ${BOT_ID}] ✅ Logged in with ID: ${botID}`);
            }
        } catch (err) {
            console.log(`[BOT ${BOT_ID}] ✅ Logged in with ID: ${botID}`);
        }

        await botModel.update(BOT_ID, { running: true });
        await loadDatabaseModels();
        await loadCommands(api);
        await loadEvents(api);
        await startListening(api);

        return api;

    } catch (err) {
        console.error(`[BOT ${BOT_ID}] ❌ Login failed:`, err.message);
        console.error(err.stack);
        try {
            await botModel.update(BOT_ID, { running: false, pid: null });
        } catch (e) {}
        setTimeout(() => {
            console.log(`[BOT ${BOT_ID}] 🔄 Retrying login...`);
            loginBot();
        }, 10000);
    }
}

// ===== LOAD COMMANDS =====
async function loadCommands(api) {
    const commandsPath = path.join(__dirname, 'scripts', 'cmds');
    
    if (!fs.existsSync(commandsPath)) {
        console.log(`[BOT ${BOT_ID}] ❌ Commands folder not found`);
        return;
    }

    try {
        const files = await readdir(commandsPath);
        let loadedCount = 0;
        let failedCount = 0;

        for (const file of files) {
            if (!file.endsWith('.js')) continue;

            const filePath = path.join(commandsPath, file);
            try {
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);
                
                if (command.config && command.config.name) {
                    global.GoatBot.commands.set(command.config.name, command);
                    
                    if (command.config.aliases && Array.isArray(command.config.aliases)) {
                        for (const alias of command.config.aliases) {
                            global.GoatBot.aliases.set(alias, command.config.name);
                        }
                    }
                    loadedCount++;
                } else {
                    failedCount++;
                }
            } catch (err) {
                console.error(`[BOT ${BOT_ID}] ❌ Failed to load ${file}:`, err.message);
                failedCount++;
            }
        }

        console.log(`[BOT ${BOT_ID}] ✅ Loaded ${loadedCount} commands (${failedCount} failed)`);
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] Failed to read commands folder:`, err.message);
    }
}

// ===== LOAD EVENTS =====
async function loadEvents(api) {
    const eventsPath = path.join(__dirname, 'scripts', 'events');
    
    if (!fs.existsSync(eventsPath)) {
        console.log(`[BOT ${BOT_ID}] ❌ Events folder not found`);
        return;
    }

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
                console.error(`[BOT ${BOT_ID}] ❌ Failed to load event ${file}:`, err.message);
            }
        }

        console.log(`[BOT ${BOT_ID}] ✅ Loaded ${loadedCount} events`);
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] Failed to read events folder:`, err.message);
    }
}

// ===== START LISTENING =====
async function startListening(api) {
    if (!api) {
        console.error(`[BOT ${BOT_ID}] ❌ Cannot start listening: api is null`);
        return;
    }

    if (typeof api.listenMqtt !== 'function') {
        console.error(`[BOT ${BOT_ID}] ❌ API is not ready: listenMqtt is not a function`);
        setTimeout(() => {
            console.log(`[BOT ${BOT_ID}] 🔄 Retrying...`);
            startListening(api);
        }, 5000);
        return;
    }

    console.log(`[BOT ${BOT_ID}] ✅ API is ready, starting listener...`);

    try {
        api.listenMqtt(async (err, event) => {
            if (err) {
                console.error(`[BOT ${BOT_ID}] ❌ MQTT Error:`, err.message);
                return;
            }

            if (!event) return;

            if (event.type === 'message') {
                console.log(`[BOT ${BOT_ID}] 📩 Message from ${event.senderID}: ${event.body?.substring(0, 50) || '(no text)'}`);
            }

            await handleEvent(api, event);
        });

        console.log(`[BOT ${BOT_ID}] ✅ Listening for messages...`);
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] ❌ Failed to start listening:`, err.message);
        setTimeout(() => {
            console.log(`[BOT ${BOT_ID}] 🔄 Retrying start listening...`);
            startListening(api);
        }, 5000);
    }
}

// ===== HANDLE EVENTS =====
async function handleEvent(api, event) {
    // Validate API
    if (!api) {
        console.error(`[BOT ${BOT_ID}] ❌ Cannot handle event: api is null`);
        return;
    }

    if (typeof api.sendMessage !== 'function') {
        console.error(`[BOT ${BOT_ID}] ❌ API is not ready for handling events`);
        return;
    }

    try {
        // Process event commands
        for (const [name, eventCmd] of global.GoatBot.eventCommands) {
            try {
                if (eventCmd.onEvent) {
                    await eventCmd.onEvent({ api, event, ...eventCmd.config });
                }
            } catch (err) {
                console.error(`[BOT ${BOT_ID}] ❌ Event ${name} error:`, err.message);
            }
        }

        // Handle message commands
        if (event && event.type === 'message' && event.body) {
            const prefix = global.GoatBot.prefix;
            
            if (!event.body.startsWith(prefix)) return;

            const args = event.body.slice(prefix.length).trim().split(/\s+/);
            const commandName = args.shift().toLowerCase();

            let command = global.GoatBot.commands.get(commandName);
            if (!command) {
                const aliasTarget = global.GoatBot.aliases.get(commandName);
                if (aliasTarget) {
                    command = global.GoatBot.commands.get(aliasTarget);
                }
            }

            if (command) {
                console.log(`[BOT ${BOT_ID}] 🎯 Executing command: ${commandName}`);
                try {
                    // Create context with proper API reference
                    const context = {
                        api: api,
                        event: event,
                        message: {
                            reply: async (text, attachment = null) => {
                                if (!api) {
                                    console.error(`[BOT ${BOT_ID}] ❌ Cannot reply: api is null`);
                                    return;
                                }
                                try {
                                    if (typeof api.sendMessage !== 'function') {
                                        console.error(`[BOT ${BOT_ID}] ❌ api.sendMessage is not a function`);
                                        return;
                                    }
                                    if (attachment) {
                                        return await api.sendMessage({ body: text, attachment: attachment }, event.threadID);
                                    }
                                    return await api.sendMessage(text, event.threadID);
                                } catch (err) {
                                    console.error(`[BOT ${BOT_ID}] ❌ Failed to send message:`, err.message);
                                }
                            },
                            react: async (emoji) => {
                                if (!api) return;
                                try {
                                    if (typeof api.setMessageReaction !== 'function') return;
                                    return await api.setMessageReaction(emoji, event.messageID, event.threadID);
                                } catch (err) {
                                    console.error(`[BOT ${BOT_ID}] ❌ Failed to react:`, err.message);
                                }
                            }
                        },
                        usersData: usersData,
                        threadsData: threadsData,
                        args: args,
                        commandName: commandName,
                        // Include global for commands that need it
                        global: global
                    };

                    await command.onStart(context);
                } catch (err) {
                    console.error(`[BOT ${BOT_ID}] ❌ Command ${commandName} error:`, err.message);
                    console.error(err.stack);
                    try {
                        if (api && event && event.threadID && typeof api.sendMessage === 'function') {
                            await api.sendMessage(`⚠️ Error: ${err.message}`, event.threadID);
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] ❌ Event handler error:`, err.message);
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

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[BOT ${BOT_ID}] Unhandled Rejection:`, reason);
});

console.log(`[BOT ${BOT_ID}] 🚀 Initializing...`);
loginBot().catch(err => {
    console.error(`[BOT ${BOT_ID}] 💀 Fatal error:`, err);
    process.exit(1);
});