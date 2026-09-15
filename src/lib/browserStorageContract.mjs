/**
 * Browser-origin state that must survive a port, browser profile, or runtime change.
 * Project snapshots and libraries with their own Bridge contracts are intentionally absent.
 */
export const MANAGED_BROWSER_STORAGE_KEYS = Object.freeze([
  'kitty-canvas-agent-conversations-v1',
  'kitty-canvas-agent-current-conversation-v1',
  'kitty-canvas-agent-model-v1',
  'kitty-canvas-agent-preferences-v1',
  'kitty-canvas-api-providers-v1',
  'kitty-canvas-api-vault-v1',
  'kitty-canvas-camera-favorites-v1',
  'kitty-canvas-effect-favorites-v1',
  'kitty-canvas-effect-recents-v1',
  'kitty-canvas-effect-use-counts-v1',
  'kitty-canvas-feedbacks',
  'kitty-canvas-prompt-selected-id',
  'kitty-canvas-prompt-selected-modules',
  'kitty-canvas-style-prompt-guide-v1',
  'kitty-canvas-vault-master-v1',
  'qiansi-canvas-active-local-skills-v1',
  'qiansi-canvas-character-library-recent-v1',
  'qiansi-canvas-current-project-id',
  'qiansi-canvas-imported-language-packs-v1',
  'qiansi-canvas-imported-languages-v1',
  'qiansi-canvas-local-skills-v1',
  'qiansi-canvas-model-favorites-v1',
  'qiansi-canvas-plugin-languages-v1',
  'qiansi-canvas-preferences-v1',
  'qiansi-canvas-themes-v1',
  'qiansi-image-action-bar-layout-v2',
  'qiansi-plugin-audio-history-v1',
  'qiansi-plugin-preferences-v1',
  'qiansi-video-action-bar-layout-v1',
]);

const managedBrowserStorageKeys = new Set(MANAGED_BROWSER_STORAGE_KEYS);

export function isManagedBrowserStorageKey(value) {
  return typeof value === 'string' && managedBrowserStorageKeys.has(value);
}
