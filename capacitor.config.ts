import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Permanent store identifier. Locked once first uploaded to Google Play.
  appId: 'com.fireboydroid.redflagrush',
  appName: 'Red Flag Rush',
  webDir: 'dist',
  backgroundColor: '#18111d',
  loggingBehavior: 'debug',
  // Use bundled files offline. Never commit a development server.url here.
};

export default config;
