export const DOUBAO_SEED_AUDIO_PLUGIN_ID = 'doubao-seed-audio';
export const DOUBAO_SEED_AUDIO_GENERATOR_ID = 'doubao-seed-audio-cloud';

export type PluginVolcengineAudioAccess = {
  route: 'standalone';
};

export function selectPluginVolcengineAudioAccess(
  _connections: readonly unknown[],
): PluginVolcengineAudioAccess {
  return { route: 'standalone' };
}

export function publicPluginVolcengineAudioAccess(
  access: PluginVolcengineAudioAccess,
): PluginVolcengineAudioAccess {
  return access;
}

export async function readPluginVolcengineAudioAccess(): Promise<PluginVolcengineAudioAccess> {
  return { route: 'standalone' };
}

export async function resolvePluginVolcengineAudioProvider(
  _pluginId: string,
  _generatorId: string,
): Promise<undefined> {
  return undefined;
}
