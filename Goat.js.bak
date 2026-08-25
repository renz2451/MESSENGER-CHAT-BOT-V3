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

console.log(`[BOT ${BOT_ID}] Starting bot process...`);
console.log(`[BOT ${BOT_ID}] Owner: ${BOT_OWNER}`);

// ===== LOAD CONFIG =====
const configPath = path.join(__dirname, process.env.NODE_ENV === 'development' ? 'config.dev.json' : 'config.json');
let config = {};
try {
    config = require(configPath);
} catch (err) {
    console.error(`[BOT ${BOT_ID}] Failed to load config:`, err.message);
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
        }
    };
}

// ===== LOAD FIREBASE =====
const { botModel } = require('./dashboard/firebase.js');

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

        // ===== LOAD COMMANDS =====
        await loadCommands(api);

        // ===== LOAD EVENTS =====
        await loadEvents(api);

        // ===== START LISTENING =====
        await startListening(api);

        return api;

    } catch (err) {
        console.error(`[BOT ${BOT_ID}] ❌ Login failed:`, err.message);
        setTimeout(() => {
            console.log(`[BOT ${BOT_ID}] Retrying login...`);
            loginBot();
        }, 5000);
    }
}

// ================================================================
// ===== LOAD COMMANDS (Fixed Paths) =====
// ================================================================

async function loadCommands(api) {
    // Try multiple possible paths for commands
    const possiblePaths = [
        path.join(__dirname, 'scripts', 'cmds'),        // Your actual commands folder
        path.join(__dirname, 'commands'),               // Alternative location
        path.join(__dirname, 'bot', 'commands'),        // Alternative location
        path.join(__dirname, 'cmds')                    // Alternative location
    ];

    let commandsPath = null;
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            commandsPath = p;
            console.log(`[BOT ${BOT_ID}] Found commands at: ${p}`);
            break;
        }
    }

    if (!commandsPath) {
        console.log(`[BOT ${BOT_ID}] ❌ No commands folder found in any location`);
        return;
    }

    try {
        const commandFiles = await readdir(commandsPath);
        let loadedCount = 0;

        for (const file of commandFiles) {
            if (!file.endsWith('.js')) continue;

            try {
                const command = require(path.join(commandsPath, file));
                if (command.config && command.config.name) {
                    global.GoatBot.commands.set(command.config.name, command);

                    if (command.config.aliases) {
                        for (const alias of command.config.aliases) {
                            global.GoatBot.aliases.set(alias, command.config.name);
                        }
                    }
                    loadedCount++;
                }
            } catch (err) {
                console.error(`[BOT ${BOT_ID}] Failed to load command ${file}:`, err.message);
            }
        }

        console.log(`[BOT ${BOT_ID}] ✅ Loaded ${loadedCount} commands`);
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] Failed to read commands folder:`, err.message);
    }
}

// ================================================================
// ===== LOAD EVENTS =====
// ================================================================

async function loadEvents(api) {
    const possiblePaths = [
        path.join(__dirname, 'scripts', 'events'),
        path.join(__dirname, 'events'),
        path.join(__dirname, 'bot', 'events')
    ];

    let eventsPath = null;
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            eventsPath = p;
            console.log(`[BOT ${BOT_ID}] Found events at: ${p}`);
            break;
        }
    }

    if (!eventsPath) {
        console.log(`[BOT ${BOT_ID}] No events folder found`);
        return;
    }

    try {
        const eventFiles = await readdir(eventsPath);
        let loadedCount = 0;

        for (const file of eventFiles) {
            if (!file.endsWith('.js')) continue;

            try {
                const event = require(path.join(eventsPath, file));
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

        await handleEvent(api, event);
    });

    console.log(`[BOT ${BOT_ID}] ✅ Listening for messages...`);
}

// ===== HANDLE EVENTS =====
async function handleEvent(api, event) {
    try {
        // Process event commands
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
                        args,
                        commandName
                    };

                    await command.onStart(context);
                } catch (err) {
                    console.error(`[BOT ${BOT_ID}] Command ${commandName} error:`, err.message);
                    api.sendMessage(`⚠️ Error: ${err.message}`, event.threadID);
                }
            }
        }
    } catch (err) {
        console.error(`[BOT ${BOT_ID}] Event handler error:`, err.message);
    }
}

// ===== START BOT =====
process.on('SIGTERM', () => {
    console.log(`[BOT ${BOT_ID}] Received SIGTERM, shutting down...`);
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log(`[BOT ${BOT_ID}] Received SIGINT, shutting down...`);
    process.exit(0);
});

// Start the bot
loginBot().catch(err => {
    console.error(`[BOT ${BOT_ID}] Fatal error:`, err);
    process.exit(1);
});