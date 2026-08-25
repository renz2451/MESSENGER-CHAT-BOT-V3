/**
 * RENZ MESSENGER BOT V3
 * Main entry point - starts the dashboard first, then bot manager
 */

const { spawn } = require("child_process");
const fs = require("fs-extra");
const path = require("path");

console.log('[MAIN] Starting RENZ MESSENGER BOT V3...');

// First, start the dashboard (app.js) which binds to the port
const dashboard = spawn("node", ["dashboard/app.js"], {
  cwd: __dirname,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    IS_DASHBOARD: 'true'
  }
});

dashboard.on("close", (code) => {
  console.log(`[MAIN] Dashboard exited with code ${code}`);
  if (code !== 0) {
    console.log('[MAIN] Dashboard crashed, restarting...');
    setTimeout(() => {
      process.exit(1); // Let Render restart the whole service
    }, 5000);
  }
});

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('[MAIN] Received SIGTERM, shutting down...');
  dashboard.kill('SIGTERM');
  process.exit(0);
});