import { PLUGIN_STUDIO_MANNEQUIN_ID } from './pluginPoseRigModel';

type PoseRigView = 'mapping' | 'director';

export type PluginPoseRigPreviewSession = { dispose: () => void };
export type PluginPoseRigPreviewReceipt = {
  id: string;
  label: string;
  role: string;
  thumbnail: Blob | null;
};

/** The independent Motion Captur plugin supplies the optional 3D renderer. */
export async function createPluginPoseRigPreview(options: {
  port: MessagePort;
  view: PoseRigView;
  modelId: string;
  onDispose?: () => void;
}): Promise<{
  session: PluginPoseRigPreviewSession;
  receipt: PluginPoseRigPreviewReceipt;
}> {
  void options;
  void PLUGIN_STUDIO_MANNEQUIN_ID;
  throw new Error('Motion Captur 插件未安装。请先安装完整插件包，再使用 3D 导演台。');
}
