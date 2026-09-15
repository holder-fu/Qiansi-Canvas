import PoseRigWorker from '../../data/plugins/qiansi-motion-capture/studio/pluginPoseRigWorker?worker';
import { PLUGIN_STUDIO_MANNEQUIN } from '../../data/plugins/qiansi-motion-capture/studio/mannequin';
import { PLUGIN_STUDIO_MANNEQUIN_ID } from '../../data/plugins/qiansi-motion-capture/studio/pluginPoseRigModel';

type PoseRigView = 'mapping' | 'director';

export type PluginPoseRigPreviewSession = {
  dispose: () => void;
};

export type PluginPoseRigPreviewReceipt = {
  id: string;
  label: string;
  role: string;
  thumbnail: Blob | null;
};

const MAX_MODEL_BYTES = 16 * 1024 * 1024;
const WORKER_READY_TIMEOUT_MS = 12_000;

async function readAsset(url: string, kind: 'model' | 'thumbnail') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`插件内置人偶${kind === 'model' ? '模型' : '缩略图'}不可用。`);
  const length = Number(response.headers.get('content-length'));
  if (kind === 'model' && Number.isFinite(length) && length > MAX_MODEL_BYTES) {
    throw new Error('插件内置人偶模型超过安全大小限制。');
  }
  const blob = await response.blob();
  if (kind === 'model' && (blob.size <= 0 || blob.size > MAX_MODEL_BYTES)) {
    throw new Error('插件内置人偶模型数据无效。');
  }
  return blob;
}

async function readThumbnail(url: string | undefined) {
  if (!url) return null;
  try {
    const blob = await readAsset(url, 'thumbnail');
    return blob.type.startsWith('image/') && blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

function awaitWorkerReady(worker: Worker, channel: MessageChannel) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      channel.port1.onmessage = null;
      channel.port1.close();
      worker.onerror = null;
      callback();
    };
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error('插件内置人偶载入超时。'))),
      WORKER_READY_TIMEOUT_MS,
    );
    channel.port1.onmessage = (event) => {
      if (event.data?.ok === true) {
        finish(resolve);
        return;
      }
      finish(() => reject(new Error(String(event.data?.error || '插件内置人偶载入失败。'))));
    };
    worker.onerror = () => finish(() => reject(new Error('插件 3D 人偶渲染进程启动失败。')));
    channel.port1.start();
  });
}

export async function createPluginPoseRigPreview(options: {
  port: MessagePort;
  view: PoseRigView;
  modelId: string;
  onDispose?: () => void;
}): Promise<{
  session: PluginPoseRigPreviewSession;
  receipt: PluginPoseRigPreviewReceipt;
}> {
  if (options.modelId !== PLUGIN_STUDIO_MANNEQUIN_ID) {
    throw new Error('插件请求的 3D 导演台角色不受支持。');
  }
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('当前浏览器不支持独立的 3D 人偶渲染。');
  }
  const [modelBlob, thumbnail] = await Promise.all([
    readAsset(PLUGIN_STUDIO_MANNEQUIN.modelUrl, 'model'),
    readThumbnail(PLUGIN_STUDIO_MANNEQUIN.thumbnailUrl),
  ]);
  const modelBytes = await modelBlob.arrayBuffer();
  const worker = new PoseRigWorker();
  const acknowledge = new MessageChannel();
  const canvas = new OffscreenCanvas(1, 1);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    worker.postMessage({ type: 'dispose' });
    worker.terminate();
    options.port.close();
    options.onDispose?.();
  };
  worker.onmessage = (event) => {
    if (event.data?.type === 'disposed') dispose();
  };

  try {
    worker.postMessage(
      {
        type: 'init',
        canvas,
        port: options.port,
        acknowledge: acknowledge.port2,
        modelBytes,
        modelId: PLUGIN_STUDIO_MANNEQUIN_ID,
        view: options.view,
      },
      [canvas, options.port, acknowledge.port2, modelBytes],
    );
    await awaitWorkerReady(worker, acknowledge);
    return {
      session: { dispose },
      receipt: {
        id: PLUGIN_STUDIO_MANNEQUIN.id,
        label: PLUGIN_STUDIO_MANNEQUIN.label,
        role: PLUGIN_STUDIO_MANNEQUIN.role,
        thumbnail,
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
