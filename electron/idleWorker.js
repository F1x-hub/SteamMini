import steamworks from 'steamworks.js';

const appId = parseInt(process.env.APP_ID, 10);

if (!appId || isNaN(appId)) {
  console.error('No APP_ID provided');
  process.exit(1);
}

try {
  const client = steamworks.init(appId);
  console.log(`Steamworks initialized for AppID: ${appId}`);

  // Keep the process alive
  setInterval(() => {
    // steamworks.js doesn't strictly need this to keep status, but we must keep Node.js alive.
  }, 1000);

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    process.exit(0);
  });

} catch (error) {
  console.error(`Failed to initialize Steamworks for AppID ${appId}:`, error);
  process.exit(1);
}
