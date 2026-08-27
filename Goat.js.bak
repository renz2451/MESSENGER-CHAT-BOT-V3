/**
 * RENZ MESSENGER BOT V3 - Bot Process
 * Fully working version – behaves like the original account.txt setup
 */

const fs = require("fs-extra");
const path = require("path");
const { promisify } = require("util");
const readdir = promisify(fs.readdir);

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
    config = { prefix: "$", language: "en", nameBot: "RENZ BOT" };
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

// ===== INITIALIZE GLOBAL VARIABLES (exactly like original) =====
global.busyList = global.busyList || {};
global.welcomeEvent = global.welcomeEvent || {};
global.GoatBot.busyList = global.busyList;
global.GoatBot.welcomeEvent = global.welcomeEvent;

// ===== LOAD UTILITIES =====
try {
    const utils = require("./utils.js");
    global.utils = utils;
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

// ===== DATABASE MODELS (fully working, using api) =====
let usersData = null;
let threadsData = null;
let dashBoardData = null;

// Load database models from the original database/controller
async function loadDatabaseModels(api) {
    try {
        const dbController = require('./database/controller/index.js');
        const db = await dbController(api);
        usersData = db.usersData;
        threadsData = db.threadsData;
        dashBoardData = db.dashBoardData;
        console.log(`[BOT ${BOT_ID}] ✅ Database models loaded with api`);
        return true;
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] ❌ Failed to load database models:`, err.message);
        // Create fallback models that work with api
        usersData = {
            get: async (id) => {
                try {
                    const info = await api.getUserInfo(id);
                    return { money: 0, exp: 0, level: 1, name: info[id]?.name || 'User' };
                } catch (e) { return { money: 0, exp: 0, level: 1 }; }
            },
            set: async (id, data) => data,
            getAll: async () => []
        };
        threadsData = {
            get: async (id) => {
                try {
                    const info = await api.getThreadInfo(id);
                    return { members: info.participantIDs || [], adminIDs: info.adminIDs || [] };
                } catch (e) { return { members: [], adminIDs: [] }; }
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

        // Get fbstate from environment or Firebase
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

        // Store API globally
        global.GoatBot.fcaApi = api;

        // Get bot info
        const botID = api.getCurrentUserID();
        global.GoatBot.botID = botID;
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

        // Mark bot as running
        await botModel.update(BOT_ID, { running: true });

        // Load database models with api
        await loadDatabaseModels(api);

        // Load commands
        await loadCommands();

        // Load events
        await loadEvents();

        // Start listening
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

// ===== LOAD COMMANDS (exactly like original) =====
async function loadCommands() {
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
async function loadEvents() {
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
    if (!api || typeof api.listenMqtt !== 'function') {
        console.error(`[BOT ${BOT_ID}] ❌ API not ready for listening`);
        return;
    }

    console.log(`[BOT ${BOT_ID}] ✅ Listening for messages...`);

    api.listenMqtt(async (err, event) => {
        if (err) {
            console.error(`[BOT ${BOT_ID}] ❌ MQTT Error:`, err.message);
            return;
        }
        if (!event) return;

        // Log message
        if (event.type === 'message') {
            console.log(`[BOT ${BOT_ID}] 📩 Message from ${event.senderID}: ${event.body?.substring(0, 50) || '(no text)'}`);
        }

        // Handle event – exactly as original
        await handleEvent(api, event);
    });
}

// ===== HANDLE EVENTS (mirrors original logic) =====
async function handleEvent(api, event) {
    if (!api || typeof api.sendMessage !== 'function') {
        console.error(`[BOT ${BOT_ID}] ❌ API not ready`);
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

        // Process message commands
        if (event.type === 'message' && event.body) {
            const prefix = global.GoatBot.prefix;
            if (!event.body.startsWith(prefix)) return;

            const args = event.body.slice(prefix.length).trim().split(/\s+/);
            const commandName = args.shift().toLowerCase();

            let command = global.GoatBot.commands.get(commandName);
            if (!command) {
                const alias = global.GoatBot.aliases.get(commandName);
                if (alias) command = global.GoatBot.commands.get(alias);
            }

            if (command) {
                console.log(`[BOT ${BOT_ID}] 🎯 Executing command: ${commandName}`);
                try {
                    // Create context exactly like original
                    const context = {
                        api: api,
                        event: event,
                        message: {
                            reply: async (text, attachment) => {
                                if (!api) return;
                                try {
                                    if (attachment) {
                                        return await api.sendMessage({ body: text, attachment: attachment }, event.threadID);
                                    }
                                    return await api.sendMessage(text, event.threadID);
                                } catch (err) {
                                    console.error(`[BOT ${BOT_ID}] ❌ Failed to reply:`, err.message);
                                }
                            },
                            react: async (emoji) => {
                                if (!api) return;
                                try {
                                    return await api.setMessageReaction(emoji, event.messageID, event.threadID);
                                } catch (err) {
                                    console.error(`[BOT ${BOT_ID}] ❌ Failed to react:`, err.message);
                                }
                            }
                        },
                        usersData: usersData,
                        threadsData: threadsData,
                        dashBoardData: dashBoardData,
                        args: args,
                        commandName: commandName
                    };

                    await command.onStart(context);
                } catch (err) {
                    console.error(`[BOT ${BOT_ID}] ❌ Command ${commandName} error:`, err.message);
                    console.error(err.stack);
                    try {
                        await api.sendMessage(`⚠️ Error: ${err.message}`, event.threadID);
                    } catch (e) {}
                }
            }
        }
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] ❌ Event handler error:`, err.message);
        console.error(err.stack);
    }
}

// ===== START =====
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

process.on('unhandledRejection', (reason) => {
    console.error(`[BOT ${BOT_ID}] Unhandled Rejection:`, reason);
});

console.log(`[BOT ${BOT_ID}] 🚀 Initializing...`);
loginBot().catch(err => {
    console.error(`[BOT ${BOT_ID}] 💀 Fatal error:`, err);
    process.exit(1);
});