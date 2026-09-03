import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pciacademy.app',
  appName: 'PCI Academy',
  webDir: 'dist',
  ios: {
    // The app paints its own background; keep the web view opaque so the
    // cream ground shows during scroll-bounce instead of white flashes.
    backgroundColor: '#f3f2f2',
    // The layout handles the notch and home indicator itself via
    // env(safe-area-inset-*), so the web view must not also inset the content.
    contentInset: 'never',
  },
};

export default config;
