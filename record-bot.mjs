import puppeteer from 'puppeteer';

const roomId = process.argv[2];
const adminToken = process.argv[3] || "";

if (!roomId) {
  console.error("Missing roomId");
  process.exit(1);
}

// Adjust this to wherever the frontend is hosted in production.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const targetUrl = `${FRONTEND_URL}/bot-room/${roomId}?token=${adminToken}`;

(async () => {
  let browser;
  try {
    console.log(`[Bot] Starting for room: ${roomId}`);
    
    // Launch headless browser to act as a stealth recorder client
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--autoplay-policy=no-user-gesture-required',
        // Make sure it runs at true full screen 1080p for good recording quality
        '--window-size=1920,1080',
      ],
      // Required to allow WebRTC audio playback without physical speakers
      ignoreDefaultArgs: ['--mute-audio'] 
    });
    
    const page = await browser.newPage();
    // High timeout to avoid randomly dying on slow initial loads
    page.setDefaultNavigationTimeout(60000);
    // Viewport must match the window size for 1080p canvas capturing
    await page.setViewport({ width: 1920, height: 1080 });

    const context = browser.defaultBrowserContext();
    await context.overridePermissions(FRONTEND_URL, ['camera', 'microphone']);

    console.log(`[Bot] Navigating to ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'load' });

    console.log(`[Bot] Joined room successfully. Awaiting BOT_FINISHED_RECORDING signature...`);
    
    // Listen for the explicit finish signal from the frontend React app
    page.on('console', async (msg) => {
      const text = msg.text();
      console.log(`[Bot Browser] ${text}`);
      if (text.includes('BOT_FINISHED_RECORDING')) {
        console.log(`[Bot] Recording uploaded successfully. Shutting down...`);
        await browser.close();
        process.exit(0);
      }
    });

    // Fallback maximum safety timer (4 hours) so server doesn't freeze zombies indefinitely
    setTimeout(async () => {
      console.log(`[Bot] Hard 4-hour limit reached for ${roomId}. Shutting down.`);
      await browser.close();
      process.exit(1);
    }, 4 * 60 * 60 * 1000);

  } catch (err) {
    console.error(`[Bot] Error:`, err);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
