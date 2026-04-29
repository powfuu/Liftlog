import { CapacitorConfig } from '@capacitor/cli';

const isDev = !!process.env['CAP_DEV'];
const devUrl = (process.env['CAP_SERVER_URL'] || '').trim();

const config: CapacitorConfig = {
  appId: 'com.lemondevs.liftbuilder',
  appName: 'Lift Builder',
  webDir: 'www',
  plugins: {
    Keyboard: {
      resize: 'none',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_liftbuilder',
      iconColor: '#EF4444'
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: false
    }
  },
  server: isDev && devUrl ? { url: devUrl, cleartext: true } : undefined
};

export default config;
