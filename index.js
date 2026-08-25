/**
 * @author NTKhang
 * Official source code: https://github.com/ntkhang03/Goat-Bot-V2
 */

const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { getActiveBotFbstate } = require('./dashboard/firebase.js');

let accountFilePath = null;
let args = [];

(async () => {
    try {
        const activeFbstate = await getActiveBotFbstate();
        if (activeFbstate) {
            console.log('[LAUNCHER] Using active bot session from Firebase.');
            const tempFile = path.join(process.cwd(), 'account_temp.txt');
            fs.writeFileSync(tempFile, activeFbstate);
            accountFilePath = tempFile;
            args = ['--account', accountFilePath];
        } else {
            console.log('[LAUNCHER] No active bot in Firebase. Falling back to account.txt.');
            accountFilePath = path.join(process.cwd(), 'account.txt');
            args = [];
        }
    } catch (err) {
        console.error('[LAUNCHER] Error fetching active bot from Firebase:', err);
        accountFilePath = path.join(process.cwd(), 'account.txt');
        args = [];
    }

    const child = spawn('node', ['bot-core.js', ...args], {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            BOT_ACCOUNT_FILE: accountFilePath
        }
    });

    child.on('close', (code) => {
        if (code === 2) {
            console.log('[LAUNCHER] Restarting bot...');
            spawn('node', ['index.js'], {
                cwd: __dirname,
                stdio: 'inherit',
                shell: true
            });
        } else {
            console.log(`[LAUNCHER] Bot exited with code ${code}`);
        }
    });
})();
