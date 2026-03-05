import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.certify.admin',
  appName: 'CERTIFY Admin',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false
  }
};

export default config;
