export const HOME_SIDEBAR_PLUGIN_LIMIT = 12;

export function splitHomeSidebarPlugins<T>(plugins: readonly T[]) {
  return {
    visiblePlugins: plugins.slice(0, HOME_SIDEBAR_PLUGIN_LIMIT),
    overflowPlugins: plugins.slice(HOME_SIDEBAR_PLUGIN_LIMIT),
  };
}
