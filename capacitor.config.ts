import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.sportbuddy.mobile',
  appName: 'Sportbuddy',
  webDir: 'www',
  // Explicitly disable server URL for standalone builds
  server: {
    androidScheme: 'https'
  }
};

export default config;
