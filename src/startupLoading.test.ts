import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import headerSource from './components/Header.tsx?raw';
import directorNodeSource from './canvas/nodes/DirectorNode.tsx?raw';
import bootstrapSource from './bootstrap.ts?raw';
import indexSource from '../index.html?raw';
import mainSource from './main.tsx?raw';

describe('startup loading boundaries', () => {
  it('keeps closed canvas panels and modal workbenches out of the eager app imports', () => {
    expect(appSource).not.toContain(
      "import { DirectorThreeStudioModal } from './components/DirectorThreeStudioModal'",
    );
    expect(appSource).not.toContain(
      "import { ImageEditorModal } from './components/ImageEditorModal'",
    );
    expect(appSource).not.toContain(
      "import { StyleLibraryModal } from './components/StyleLibraryModal'",
    );
    expect(appSource).toContain("import('./components/DirectorThreeStudioModal')");
    expect(appSource).toContain("import('./components/ImageEditorModal')");
    expect(appSource).toContain("import('./components/StyleLibraryModal')");
    expect(appSource).toContain('openModal === kind || mountedKinds.has(kind)');
  });

  it('defers app background runtimes until after the first frame', () => {
    expect(appSource).not.toContain("import { startModelCatalogSync } from './lib/modelCatalog'");
    expect(appSource).not.toContain(
      "import { startLanCollaboration } from './services/lanCollaboration'",
    );
    expect(appSource).toContain('useEffect(() => startDeferredAppRuntimes(), [])');
  });

  it('starts durable image generation type synchronization after mounting the app', () => {
    expect(mainSource).toContain(
      "import { startImageTypePresetCatalogSync } from './lib/imageTypePresets'",
    );
    expect(mainSource).toContain('void startImageTypePresetCatalogSync()');
  });

  it('hydrates Bridge-backed browser state before importing the application', () => {
    expect(indexSource).toContain('src="/src/bootstrap.ts"');
    expect(indexSource).not.toContain('src="/src/main.tsx"');
    expect(bootstrapSource).toContain(
      "import { startBrowserStorageBridge } from './lib/browserStorageBridge'",
    );
    expect(bootstrapSource).toContain('await startBrowserStorageBridge()');
    expect(bootstrapSource).toContain("await import('./main.tsx')");
  });

  it('loads settings, AI tools and ZIP packaging only when users request them', () => {
    expect(headerSource).not.toContain("import { SettingsPanel } from './SettingsPanel'");
    expect(headerSource).not.toContain("import { AiSkillPanel } from './AgentChatPanel'");
    expect(headerSource).toContain("import('./SettingsPanel')");
    expect(headerSource).toContain("import('./AgentChatPanel')");
    expect(headerSource).toContain("await import('../serialization/materialBundle')");
  });

  it('does not parse Three.js preview code until a 3D director node is selected', () => {
    expect(directorNodeSource).not.toContain(
      "import { DirectorThreeNodePreview } from './DirectorThreeNodePreview'",
    );
    expect(directorNodeSource).toContain("import('./DirectorThreeNodePreview')");
    expect(directorNodeSource).toContain('<Suspense fallback={null}>');
  });
});
