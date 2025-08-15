import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";

const path = fileURLToPath(import.meta.url);
const isSSR = process.env.SSR === 'true';

export default {
  root: join(dirname(path), "client"),
  plugins: [react()],
  server: {
    allowedHosts: ["victoria-production.up.railway.app", "victoria.alfred-ai.fr"]
  },
  build: {
    minify: 'terser',
    sourcemap: false,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: isSSR ? undefined : {
          'react-vendor': ['react', 'react-dom']
        }
      }
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
};
