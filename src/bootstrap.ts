import { startBrowserStorageBridge } from './lib/browserStorageBridge';

async function bootstrap() {
  try {
    await startBrowserStorageBridge();
  } catch {
    // Bridge may be restarting or unavailable; existing browser storage remains usable.
  }
  await import('./main.tsx');
}

void bootstrap();
