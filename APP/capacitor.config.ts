import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.certify.app',
  appName: 'CERTIFY',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      style: 'default'
    }
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
