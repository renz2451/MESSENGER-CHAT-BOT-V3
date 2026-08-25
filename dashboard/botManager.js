const { spawn } = require('child_process');
const path = require('path');
const { botModel } = require('./firebase.js');

// Store running bot processes
const botProcesses = new Map();

// Start a bot as a child process
async function startBotProcess(botId) {
    try {
        const bot = await botModel.getById(botId);
        if (!bot) throw new Error('Bot not found');
        if (botProcesses.has(botId)) {
            throw new Error('Bot is already running');
        }

        console.log(`[BOT MANAGER] Starting bot ${botId} (${bot.botName})`);

        // ===== FIX: Ensure fbstate is properly stringified =====
        let fbstateString = bot.fbstate;
        
        // If fbstate is already a string, use it as-is
        if (typeof fbstateString === 'string') {
            // Verify it's valid JSON
            try {
                JSON.parse(fbstateString);
            } catch (e) {
                console.error(`[BOT MANAGER] Invalid fbstate JSON for bot ${botId}`);
                throw new Error('Invalid fbstate format in database');
            }
        } else {
            // If it's an object/array, stringify it
            fbstateString = JSON.stringify(bot.fbstate);
        }

        const env = {
            ...process.env,
            BOT_ID: botId,
            BOT_OWNER: bot.ownerFbid,
            BOT_FBSTATE: fbstateString,
            IS_BOT_PROCESS: 'true'
        };

        const child = spawn('node', ['Goat.js'], {
            cwd: process.cwd(),
            env: env,
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            detached: false
        });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            for (const line of lines) {
                console.log(`[BOT ${botId}] ${line}`);
            }
        });

        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            for (const line of lines) {
                console.error(`[BOT ${botId}] ${line}`);
            }
        });

        child.on('close', async (code) => {
            console.log(`[BOT ${botId}] Process exited with code ${code}`);
            botProcesses.delete(botId);
            await botModel.update(botId, { running: false, pid: null });
        });

        child.on('error', async (err) => {
            console.error(`[BOT ${botId}] Error:`, err);
            botProcesses.delete(botId);
            await botModel.update(botId, { running: false, pid: null });
        });

        botProcesses.set(botId, child);
        await botModel.update(botId, { running: true, pid: child.pid });

        return { success: true, message: 'Bot started', pid: child.pid };
    } catch (err) {
        console.error(`[BOT MANAGER] Failed to start bot ${botId}:`, err);
        return { success: false, error: err.message };
    }
}

// Stop a running bot
async function stopBotProcess(botId) {
    try {
        const child = botProcesses.get(botId);
        if (!child) {
            const bot = await botModel.getById(botId);
            if (bot && bot.running) {
                await botModel.update(botId, { running: false, pid: null });
                return { success: true, message: 'Bot marked as stopped' };
            }
            throw new Error('Bot is not running');
        }

        child.kill('SIGTERM');

        const exitPromise = new Promise((resolve) => {
            child.once('close', resolve);
        });

        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                if (!child.killed) {
                    child.kill('SIGKILL');
                }
                resolve();
            }, 5000);
        });

        await Promise.race([exitPromise, timeoutPromise]);

        botProcesses.delete(botId);
        await botModel.update(botId, { running: false, pid: null });

        return { success: true, message: 'Bot stopped' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// Get status of all running bots
function getRunningBots() {
    const status = [];
    for (const [id, child] of botProcesses) {
        status.push({
            id,
            pid: child.pid,
            running: !child.killed
        });
    }
    return status;
}

// Restore running bots on startup
async function restoreRunningBots() {
    try {
        const runningBots = await botModel.getRunning();
        console.log(`[BOT MANAGER] Found ${runningBots.length} bots to restore`);
        for (const bot of runningBots) {
            console.log(`[BOT MANAGER] Restoring bot ${bot.id} (${bot.botName})`);
            await startBotProcess(bot.id);
        }
    } catch (err) {
        console.error('[BOT MANAGER] Failed to restore bots:', err);
    }
}

module.exports = {
    startBotProcess,
    stopBotProcess,
    getRunningBots,
    restoreRunningBots,
    botProcesses
};