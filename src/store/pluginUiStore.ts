import { create } from 'zustand';

function panelKey(pluginId: string, panelId: string) {
  return `${pluginId}:${panelId}`;
}

type PluginUiState = {
  panelOverrides: Record<string, boolean>;
  openPanel: (pluginId: string, panelId: string) => void;
  closePanel: (pluginId: string, panelId: string) => void;
  isPanelOpen: (pluginId: string, panelId: string, defaultOpen: boolean) => boolean;
};

export const usePluginUiStore = create<PluginUiState>((set, get) => ({
  panelOverrides: {},
  openPanel: (pluginId, panelId) =>
    set((state) => ({
      panelOverrides: { ...state.panelOverrides, [panelKey(pluginId, panelId)]: true },
    })),
  closePanel: (pluginId, panelId) =>
    set((state) => ({
      panelOverrides: { ...state.panelOverrides, [panelKey(pluginId, panelId)]: false },
    })),
  isPanelOpen: (pluginId, panelId, defaultOpen) =>
    get().panelOverrides[panelKey(pluginId, panelId)] ?? defaultOpen,
}));
