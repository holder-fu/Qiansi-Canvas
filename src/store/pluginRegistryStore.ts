import { create } from 'zustand';
import {
  importPluginManifest,
  importPluginPackage,
  loadPluginCatalog,
  restoreInstalledPlugin,
  setInstalledPluginEnabled,
  uninstallInstalledPlugin,
  type PluginCatalog,
} from '../services/pluginRegistry';

type PluginRegistryState = {
  catalog: PluginCatalog | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  importManifest: (file: File) => Promise<void>;
  importPackage: (files: File[]) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
};

export const usePluginRegistryStore = create<PluginRegistryState>((set) => ({
  catalog: null,
  loading: false,
  loaded: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      set({ catalog: await loadPluginCatalog(), loaded: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '插件目录读取失败。' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  importManifest: async (file) => {
    set({ loading: true, error: null });
    try {
      set({ catalog: await importPluginManifest(file), loaded: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '插件导入失败。' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  importPackage: async (files) => {
    set({ loading: true, error: null });
    try {
      set({ catalog: await importPluginPackage(files), loaded: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '插件包导入失败。' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  setEnabled: async (id, enabled) => {
    set({ loading: true, error: null });
    try {
      set({ catalog: await setInstalledPluginEnabled(id, enabled), loaded: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '插件状态更新失败。' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  uninstall: async (id) => {
    set({ loading: true, error: null });
    try {
      set({ catalog: await uninstallInstalledPlugin(id), loaded: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '插件卸载失败。' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  restore: async (id) => {
    set({ loading: true, error: null });
    try {
      set({ catalog: await restoreInstalledPlugin(id), loaded: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '插件恢复失败。' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
}));
