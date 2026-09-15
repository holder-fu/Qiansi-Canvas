import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { CanvasRuntimeBoundary } from './components/CanvasRuntimeBoundary';
import { BRIDGE_BASE_URL } from './lib/bridgeUrl';
import { clearDevelopmentRecoveryAttempt } from './lib/developmentRuntimeRecovery';
import { beginCanvasLanPairing } from './lib/lanPairingRedirect';
import { startConfiguredUserNameSync } from './lib/userProfileSync';
import { startGenerationLimitsSync } from './lib/generationLimitsSync';
import { startImageTypePresetCatalogSync } from './lib/imageTypePresets';
import { startTextModeCatalogSync } from './store/textModeCatalog';
import { startPromptLibrarySync } from './data/promptLibrary';
import { startUserLibrariesSync } from './lib/userLibrary';

if (!beginCanvasLanPairing(BRIDGE_BASE_URL)) {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Qiansi-Canvas 根容器不存在，无法启动应用。');
  createRoot(rootElement).render(
    <StrictMode>
      <CanvasRuntimeBoundary>
        <App />
      </CanvasRuntimeBoundary>
    </StrictMode>,
  );
  void startConfiguredUserNameSync();
  void startGenerationLimitsSync();
  void startImageTypePresetCatalogSync();
  void startTextModeCatalogSync();
  void startPromptLibrarySync();
  void startUserLibrariesSync();

  window.setTimeout(() => clearDevelopmentRecoveryAttempt(window.sessionStorage), 10_000);
}
