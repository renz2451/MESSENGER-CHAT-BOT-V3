/**
 * @author NTKhang
 * Official source code: https://github.com/ntkhang03/Goat-Bot-V2
 * ! If you do not download the source code from the above address, you are using an unknown version and at risk of having your account hacked
 */

// ============================================================
// ===== SUPPORT CUSTOM ACCOUNT FILE =====
// ============================================================
const fs = require('fs-extra');
const path = require('path');

let accountFilePath = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--account' && args[i + 1]) {
        accountFilePath = args[i + 1];
        break;
    }
}
if (!accountFilePath && process.env.BOT_ACCOUNT_FILE) {
    accountFilePath = process.env.BOT_ACCOUNT_FILE;
}
if (!accountFilePath) {
    accountFilePath = path.join(process.cwd(), 'account.txt');
}
global.accountFilePath = accountFilePath;
process.env.BOT_ACCOUNT_FILE = accountFilePath;

console.log(`[BOT] Using account file: ${accountFilePath}`);

// ============================================================
// ===== LOAD CONFIG & UTILITIES =====
// ============================================================
const config = require('./config.json');
global.GoatBot = { config };
global.utils = require('./utils.js');

// ============================================================
// ===== LOAD FCA =====
// ============================================================
const login = require('fcanew-r3nz75');

// ============================================================
// ===== LOAD COMMANDS =====
// ============================================================
const commands = new Map();
const commandDir = path.join(__dirname, 'commands');
if (fs.existsSync(commandDir)) {
    const commandFiles = fs.readdirSync(commandDir).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const cmd = require(`./commands/${file}`);
            if (cmd.config && cmd.config.name) {
                commands.set(cmd.config.name, cmd);
                console.log(`[BOT] Loaded command: ${cmd.config.name}`);
            }
        } catch (err) {
            console.error(`[BOT] Error loading command ${file}:`, err);
        }
    }
}
global.GoatBot.commands = commands;

// ============================================================
// ===== LOAD EVENTS =====
// ============================================================
const events = [];
const eventDir = path.join(__dirname, 'events');
if (fs.existsSync(eventDir)) {
    const eventFiles = fs.readdirSync(eventDir).filter(f => f.endsWith('.js'));
    for (const file of eventFiles) {
        try {
            const ev = require(`./events/${file}`);
            if (ev.config && ev.config.name) {
                events.push(ev);
                console.log(`[BOT] Loaded event: ${ev.config.name}`);
            }
        } catch (err) {
            console.error(`[BOT] Error loading event ${file}:`, err);
        }
    }
}
global.GoatBot.events = events;

// ============================================================
// ===== START BOT =====
// ============================================================
async function startBot() {
    let fbstate;
    try {
        const raw = fs.readFileSync(global.accountFilePath, 'utf8');
        fbstate = JSON.parse(raw);
    } catch (err) {
        console.error('[BOT] Failed to read account file:', err);
        process.exit(1);
    }

    login({ fbstate }, (err, api) => {
        if (err) {
            console.error('[BOT] Login failed:', err);
            process.exit(1);
        }

        global.api = api;
        console.log('[BOT] ✅ Logged in successfully!');

        // Set options
        api.setOptions({
            listenEvents: true,
            autoMarkDelivery: true,
            selfListen: false,
            logLevel: 'error'
        });

        // ===== LOAD DASHBOARD (this starts the web server) =====
        const dashboard = require('./dashboard/app.js');
        dashboard(api);

        // ===== START LISTENING =====
        api.listenMqtt((err, event) => {
            if (err) {
                console.error('[BOT] Listen error:', err);
                process.exit(2);
            }

            // --- Handle messages (commands) ---
            if (event.type === 'message' && event.body) {
                const prefix = config.prefix || '$';
                if (event.body.startsWith(prefix)) {
                    const args = event.body.slice(prefix.length).trim().split(/\s+/);
                    const commandName = args.shift().toLowerCase();
                    const command = commands.get(commandName);
                    if (command) {
                        try {
                            command.onStart({
                                message: event,
                                event,
                                args,
                                api,
                                usersData: global.db ? global.db.usersData : null,
                                // ... other dependencies
                            });
                        } catch (err) {
                            console.error(`[BOT] Error executing command ${commandName}:`, err);
                        }
                    }
                }
            }

            // --- Handle other events ---
            for (const ev of events) {
                if (ev.onEvent) {
                    try {
                        ev.onEvent({ event, api, ... (global.db || {}) });
                    } catch (err) {
                        console.error(`[BOT] Error in event ${ev.config ? ev.config.name : 'unknown'}:`, err);
                    }
                }
            }
        });
    });
}

startBot();
