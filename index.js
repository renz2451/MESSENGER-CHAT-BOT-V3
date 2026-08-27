/**
 * RENZ MESSENGER BOT V3
 * Main entry – starts the dashboard
 */

console.log('[MAIN] Starting RENZ MESSENGER BOT V3...');
console.log(`[MAIN] Node.js version: ${process.version}`);
console.log(`[MAIN] Environment: ${process.env.NODE_ENV || 'development'}`);

// Start the dashboard directly
try {
  require('./dashboard/app.js');
} catch (err) {
  console.error('[MAIN] Failed to start dashboard:', err.message);
  console.error(err.stack);
  process.exit(1);
}