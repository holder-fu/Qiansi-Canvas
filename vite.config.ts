import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBridgeRuntimeDataGuard,
  createLanBridgeProxyGuard,
  normalizeLanBridgePairingProxyResponse,
  normalizeLanBridgeProxyRequest,
  rewriteLanBridgeProxyPath,
} from './vite-lan-bridge-proxy.mjs';

const packageFileUrl = new URL('./package.json', import.meta.url);
const packageFilePath = fileURLToPath(packageFileUrl);
const projectRoot = fileURLToPath(new URL('./', import.meta.url));
const bridgeRuntimeDataRoot = resolve(
  projectRoot,
  String(process.env.QIANSI_CANVAS_DATA_DIR || 'data').trim() || 'data',
);
const packageVersion = String(
  (
    JSON.parse(readFileSync(packageFileUrl, 'utf8')) as {
      version?: unknown;
    }
  ).version ?? 'unknown',
);
const lanBridgeProxyPrefix = '/__qiansi_bridge';
const lanBridgeProxyEnabled = process.env.QIANSI_CANVAS_DEV_BRIDGE_PROXY === '1';
const trustedLan = process.env.QIANSI_CANVAS_TRUSTED_LAN === '1';
const lanBridgeProxyPort = Number(process.env.QIANSI_CANVAS_DEV_BRIDGE_PORT || 2896);
const lanBridgeProxyTarget = `http://127.0.0.1:${lanBridgeProxyPort}`;

function packageVersionPlugin(): Plugin {
  return {
    name: 'qiansi-package-version',
    config() {
      return {
        define: {
          'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion),
        },
      };
    },
    configureServer(server) {
      server.watcher.add(packageFilePath);
    },
    async handleHotUpdate(context) {
      if (context.file === packageFilePath) {
        await context.server.restart();
        return [];
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    packageVersionPlugin(),
    createBridgeRuntimeDataGuard({ dataRoot: bridgeRuntimeDataRoot, projectRoot }),
    createLanBridgeProxyGuard({
      prefix: lanBridgeProxyPrefix,
      accessToken: String(process.env.QIANSI_CANVAS_ACCESS_TOKEN || ''),
      enabled: lanBridgeProxyEnabled,
      trustedLan,
    }),
    react(),
    tailwindcss(),
  ],
  // Bridge-owned runtime data is not a browser entry point, so never crawl it
  // while discovering front-end dependencies.
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    // Keep the development UI local unless the developer explicitly opts into
    // LAN exposure. The production bridge applies its own stronger pairing and
    // capability checks.
    host: process.env.QIANSI_CANVAS_DEV_HOST || '127.0.0.1',
    port: 2895,
    strictPort: true,
    open: true,
    watch: {
      // The Bridge atomically replaces project revisions, asset indexes and
      // previews under data/. Watching that tree can hold Windows file handles
      // during rename and also causes unrelated full-page reloads.
      ignored: ['**/data/**'],
    },
    proxy: lanBridgeProxyEnabled
      ? {
          [`^${lanBridgeProxyPrefix}(?:/|$)`]: {
            target: lanBridgeProxyTarget,
            changeOrigin: true,
            rewrite: (path) => rewriteLanBridgeProxyPath(path, lanBridgeProxyPrefix),
            configure(proxy) {
              proxy.on('proxyReq', (proxyRequest, request) => {
                normalizeLanBridgeProxyRequest(
                  proxyRequest,
                  lanBridgeProxyTarget,
                  request.socket?.remoteAddress,
                );
              });
              proxy.on('proxyRes', (proxyResponse, request) => {
                normalizeLanBridgePairingProxyResponse(proxyResponse, request.url);
              });
            },
          },
        }
      : undefined,
  },
});
