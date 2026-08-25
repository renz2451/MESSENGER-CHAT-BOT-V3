/**
 * @author NTKhang
 * Official source code: https://github.com/ntkhang03/Goat-Bot-V2
 * ! If you do not download the source code from the above address, you are using an unknown version and at risk of having your account hacked
 */

const fs = require('fs-extra');
const path = require('path');
const { getActiveBotFbstate } = require('./dashboard/firebase.js');

let accountFilePath = null;
let fbstate = null;

// Check for --account argument (for child processes)
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--account' && args[i + 1]) {
        accountFilePath = args[i + 1];
        console.log(`[BOT] Child process using account file: ${accountFilePath}`);
        break;
    }
}

function startProject() {
    const { spawn } = require("child_process");
    const log = require("./logger/log.js");
    const child = spawn("node", ["index.js"], {
        cwd: __dirname,
        stdio: "inherit",
        shell: true,
        env: {
            ...process.env,
            BOT_ACCOUNT_FILE: accountFilePath
        }
    });
    child.on("close", (code) => {
        if (code == 2) {
            log.info("Restarting Project...");
            startProject();
        } else {
            log.info(`Project stopped with code ${code}`);
        }
    });
}

if (accountFilePath) {
    // Child process – use provided file
    global.accountFilePath = accountFilePath;
    process.env.BOT_ACCOUNT_FILE = accountFilePath;
    startProject();
} else {
    // Main process – fetch active bot from Firebase
    (async () => {
        try {
            const activeFbstate = await getActiveBotFbstate();
            if (activeFbstate) {
                console.log('[BOT] Using active bot session from Firebase.');
                const tempFile = path.join(process.cwd(), 'account_temp.txt');
                fs.writeFileSync(tempFile, activeFbstate);
                accountFilePath = tempFile;
                global.accountFilePath = accountFilePath;
                process.env.BOT_ACCOUNT_FILE = accountFilePath;
            } else {
                console.log('[BOT] No active bot in Firebase. Falling back to account.txt.');
                accountFilePath = path.join(process.cwd(), 'account.txt');
                global.accountFilePath = accountFilePath;
                process.env.BOT_ACCOUNT_FILE = accountFilePath;
            }
        } catch (err) {
            console.error('[BOT] Error fetching active bot from Firebase:', err);
            accountFilePath = path.join(process.cwd(), 'account.txt');
            global.accountFilePath = accountFilePath;
            process.env.BOT_ACCOUNT_FILE = accountFilePath;
        }
        startProject();
    })();
}
