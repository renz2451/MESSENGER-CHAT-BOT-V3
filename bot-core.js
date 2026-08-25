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
// ===== YOUR BOT LOGIC =====
// ============================================================

// --- Load config ---
const config = require('./config.json');
global.GoatBot = { config };

// --- Load utilities ---
global.utils = require('./utils.js');

// --- Load FCA (use your version) ---
const login = require('fcanew-r3nz75');

// --- Load handlers (adjust paths if needed) ---
const loadCommands = require('./handlers/loadCommands');
const loadEvents = require('./handlers/loadEvents');
const loadDashboard = require('./dashboard/app.js');

// --- Start bot ---
async function startBot() {
    // Read account file
    let fbstate;
    try {
        const raw = fs.readFileSync(global.accountFilePath, 'utf8');
        fbstate = JSON.parse(raw);
    } catch (err) {
        console.error('Failed to read account file:', err);
        process.exit(1);
    }

    // Login
    login({ fbstate }, (err, api) => {
        if (err) {
            console.error('Login failed:', err);
            process.exit(1);
        }

        global.api = api;
        console.log('✅ Logged in successfully!');

        // Load commands, events, and dashboard
        loadCommands(api);
        loadEvents(api);
        loadDashboard(api);

        // Set options and start listening
        api.setOptions({
            listenEvents: true,
            autoMarkDelivery: true,
            selfListen: false,
            logLevel: 'error'
        });

        api.listenMqtt((err, event) => {
            if (err) {
                console.error('Listen error:', err);
                process.exit(2);
            }
            // Your event handlers (loaded via loadEvents) will process events
        });
    });
}

startBot();
