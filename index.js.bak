/**
 * RENZ MESSENGER BOT V3
 * Main entry point - starts the dashboard server
 */

console.log('[MAIN] Starting RENZ MESSENGER BOT V3...');
console.log(`[MAIN] Node.js version: ${process.version}`);
console.log(`[MAIN] Environment: ${process.env.NODE_ENV || 'development'}`);

// Import and start the dashboard directly
try {
    require('./dashboard/app.js');
} catch (err) {
    console.error('[MAIN] Failed to start dashboard:', err.message);
    console.error(err.stack);
    process.exit(1);
}