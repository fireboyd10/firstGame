import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Development identifier. Choose an owned, permanent ID before store release.
  appId: 'com.example.redflagrush',
  appName: 'Red Flag Rush',
  webDir: 'dist',
  backgroundColor: '#18111d',
  loggingBehavior: 'debug',
  // Use bundled files offline. Never commit a development server.url here.
};

export default config;
