import { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.CAP_DEV === 'true';
const devUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'ev.dev.liftlog',
  appName: 'Lift Log',
  webDir: 'www',
  ...(isDev && devUrl ? { server: { url: devUrl, cleartext: true } } : {}),
  plugins: {
    StatusBar: {
      overlays: false,
      style: 'DARK',
      backgroundColor: '#000000'
    }
  }
};

export default config;
