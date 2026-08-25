/**
 * @author NTKhang
 * ! The source code is written by NTKhang, please don't change the author's name everywhere. Thank you for using
 * ! Official source code: https://github.com/ntkhang03/Goat-Bot-V2
 * ! If you do not download the source code from the above address, you are using an unknown version and at risk of having your account hacked
 */

// ===== NEW: Support for custom account file =====
const fs = require('fs-extra');
const path = require('path');

let accountFilePath = path.join(process.cwd(), 'account.txt');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--account' && args[i + 1]) {
        accountFilePath = args[i + 1];
        break;
    }
}

// Make it globally available so other modules can use it
global.accountFilePath = accountFilePath;

// Also store it in process.env for convenience
process.env.BOT_ACCOUNT_FILE = accountFilePath;

console.log(`[BOT] Using account file: ${accountFilePath}`);

// ===== Original startProject code =====
const { spawn } = require("child_process");
const log = require("./logger/log.js");

function startProject() {
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

startProject();
