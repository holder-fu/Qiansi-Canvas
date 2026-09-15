import { describe, expect, it } from 'vitest';
import { HOME_SIDEBAR_PLUGIN_LIMIT, splitHomeSidebarPlugins } from './homePluginPresentation';

describe('Home plugin presentation', () => {
  it('shows up to twelve plugins directly without an overflow group', () => {
    const plugins = Array.from({ length: HOME_SIDEBAR_PLUGIN_LIMIT }, (_, index) => index + 1);

    expect(splitHomeSidebarPlugins(plugins)).toEqual({
      visiblePlugins: plugins,
      overflowPlugins: [],
    });
  });

  it('keeps only the first twelve plugins visible and exposes every remaining plugin', () => {
    const plugins = Array.from({ length: 25 }, (_, index) => index + 1);
    const result = splitHomeSidebarPlugins(plugins);

    expect(result.visiblePlugins).toEqual(plugins.slice(0, 12));
    expect(result.overflowPlugins).toEqual(plugins.slice(12));
    expect([...result.visiblePlugins, ...result.overflowPlugins]).toEqual(plugins);
  });
});
