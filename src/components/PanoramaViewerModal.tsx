import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Expand,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  RotateCcw,
  X,
} from 'lucide-react';
import * as THREE from 'three';
import { useAppTranslation } from '../i18n/appI18n';
import {
  capturePanoramaFrame,
  clampPanoramaFov,
  clampPanoramaPitch,
  panoramaLookTarget,
  type PanoramaCapture,
} from '../lib/panoramaViewer';
import { persistImageFile } from '../services/mediaPersistence';
import { useCanvasStore } from '../store/canvasStore';

export function PanoramaViewerModal() {
  const { t } = useAppTranslation();
  const openModal = useCanvasStore((state) => state.openModal);
  const closeModal = useCanvasStore((state) => state.closeModal);
  const node = useCanvasStore((state) => state.nodes.find((item) => item.id === state.modalNodeId));
  const mountRef = useRef<HTMLDivElement>(null);
  const resetViewRef = useRef<() => void>(() => {});
  const captureViewRef = useRef<(() => Promise<PanoramaCapture>) | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const isOpen = openModal === 'panorama-viewer';
  const sourceUrl = node?.data.imageUrl || node?.data.images?.[0];
  const title =
    node?.data.imageFileName || node?.data.title || t('panorama.defaultTitle', '全景场景');

  const handleCaptureView = useCallback(async () => {
    const captureView = captureViewRef.current;
    if (!node || !captureView || capturing) return;

    setCapturing(true);
    setCaptureError(null);
    try {
      const capture = await captureView();
      const baseTitle =
        String(title).replace(/\.[^.]+$/u, '') || t('panorama.defaultTitle', '全景场景');
      const capturedTitle = t('panorama.capture.nodeTitle', '{title} · 当前视角', {
        title: baseTitle,
      });
      const file = new File([capture.blob], `${capturedTitle}.jpg`, { type: 'image/jpeg' });
      let imageUrl: string;
      let previewUrl: string | undefined;
      let bridgeAssetId: string | undefined;
      let persistenceResult: string;
      try {
        const item = await persistImageFile(
          file,
          'storyboard',
          useCanvasStore.getState().activeProjectId,
        );
        imageUrl = item.originalUrl;
        previewUrl = item.previewUrl;
        bridgeAssetId = item.bridgeAssetId;
        persistenceResult = t('panorama.capture.saved', '当前视角已保存到本机素材库。');
      } catch (persistenceError) {
        imageUrl = URL.createObjectURL(capture.blob);
        persistenceResult = t(
          'panorama.capture.sessionOnly',
          '当前视角仅在本次会话可用，刷新后会丢失；请启动本机 Bridge 后重试。{reason}',
          {
            reason:
              persistenceError instanceof Error && persistenceError.message
                ? ` ${persistenceError.message}`
                : '',
          },
        );
      }

      const store = useCanvasStore.getState();
      const sourceNode = store.nodes.find((item) => item.id === node.id);
      if (!sourceNode) {
        throw new Error(t('panorama.capture.nodeMissing', '没有找到当前全景图片节点。'));
      }
      const imageNodeId = store.addNodeWithImage(
        'image',
        {
          x: sourceNode.position.x + (sourceNode.width ?? 620) + 100,
          y: sourceNode.position.y,
        },
        imageUrl,
        capturedTitle,
      );
      store.updateNodeData(imageNodeId, {
        images: [imageUrl],
        imageFileName: `${capturedTitle}.jpg`,
        originalUrl: imageUrl,
        previewUrl: previewUrl || imageUrl,
        mediaWidth: capture.width,
        mediaHeight: capture.height,
        bridgeAssetId,
        mediaPersistenceState: bridgeAssetId ? undefined : 'session-only',
        mediaMimeType: capture.blob.type,
        aspectRatio: `${capture.width}:${capture.height}`,
        capturedFromPanoramaId: node.id,
        referenceOnly: true,
        result: persistenceResult,
      });
      store.onConnect({
        source: node.id,
        target: imageNodeId,
        sourceHandle: null,
        targetHandle: null,
      });
      useCanvasStore.setState((state) => ({
        nodes: state.nodes.map((item) => ({ ...item, selected: item.id === imageNodeId })),
        selectedNodeId: imageNodeId,
      }));
      closeModal();
    } catch (captureFailure) {
      setCaptureError(
        captureFailure instanceof Error && captureFailure.message === 'encode-failed'
          ? t('panorama.capture.encodeFailed', '浏览器无法编码当前全景视角。')
          : captureFailure instanceof DOMException && captureFailure.name === 'SecurityError'
            ? t(
                'panorama.capture.crossOrigin',
                '当前全景图片受跨域限制，无法截取视角。请下载后重新上传。',
              )
            : captureFailure instanceof Error
              ? captureFailure.message
              : t('panorama.capture.failed', '当前全景视角截取失败，请重试。'),
      );
    } finally {
      setCapturing(false);
    }
  }, [capturing, closeModal, node, t, title]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeModal, isOpen]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!isOpen || !sourceUrl || !mount) return;

    setLoading(true);
    setViewerReady(false);
    setError(null);
    setCaptureError(null);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090b);
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 100);
    camera.position.set(0, 0, 0.01);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'h-full w-full touch-none cursor-grab active:cursor-grabbing';
    renderer.domElement.setAttribute(
      'aria-label',
      t('panorama.viewerAria', '可拖动的 360 度全景场景'),
    );
    mount.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(10, 72, 48);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    let disposed = false;
    let texture: THREE.Texture | undefined;
    let yaw = 0;
    let pitch = 0;
    let fov = 72;
    let pointerId: number | null = null;
    let pointerX = 0;
    let pointerY = 0;

    const render = () => {
      const target = panoramaLookTarget(yaw, pitch);
      camera.lookAt(target.x, target.y, target.z);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const resetView = () => {
      yaw = 0;
      pitch = 0;
      fov = 72;
      render();
    };
    resetViewRef.current = resetView;
    captureViewRef.current = () => capturePanoramaFrame(renderer.domElement, render);

    const onPointerDown = (event: PointerEvent) => {
      pointerId = event.pointerId;
      pointerX = event.clientX;
      pointerY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const deltaX = event.clientX - pointerX;
      const deltaY = event.clientY - pointerY;
      pointerX = event.clientX;
      pointerY = event.clientY;
      yaw -= deltaX * 0.12;
      pitch = clampPanoramaPitch(pitch + deltaY * 0.12);
      render();
    };
    const releasePointer = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      pointerId = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      fov = clampPanoramaFov(fov + event.deltaY * 0.035);
      render();
    };
    const onViewerKeyDown = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '0'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      if (event.key === 'ArrowLeft') yaw -= 4;
      if (event.key === 'ArrowRight') yaw += 4;
      if (event.key === 'ArrowUp') pitch = clampPanoramaPitch(pitch + 4);
      if (event.key === 'ArrowDown') pitch = clampPanoramaPitch(pitch - 4);
      if (event.key === '+') fov = clampPanoramaFov(fov - 4);
      if (event.key === '-') fov = clampPanoramaFov(fov + 4);
      if (event.key === '0') resetView();
      render();
    };

    renderer.domElement.tabIndex = 0;
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', releasePointer);
    renderer.domElement.addEventListener('pointercancel', releasePointer);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('keydown', onViewerKeyDown);
    renderer.domElement.addEventListener('dblclick', resetView);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    new THREE.TextureLoader().load(
      sourceUrl,
      (loadedTexture) => {
        if (disposed) {
          loadedTexture.dispose();
          return;
        }
        texture = loadedTexture;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        material.map = texture;
        material.needsUpdate = true;
        setLoading(false);
        setViewerReady(true);
        render();
      },
      undefined,
      () => {
        if (disposed) return;
        setLoading(false);
        setViewerReady(false);
        setError(t('panorama.error.loadFailed', '全景图片加载失败，请确认图片仍然可用。'));
      },
    );

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      resetViewRef.current = () => {};
      captureViewRef.current = null;
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', releasePointer);
      renderer.domElement.removeEventListener('pointercancel', releasePointer);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('keydown', onViewerKeyDown);
      renderer.domElement.removeEventListener('dblclick', resetView);
      texture?.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [isOpen, sourceUrl, t]);

  if (!isOpen || !node) return null;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        className="relative h-[min(640px,calc(100vh-48px))] w-[min(1000px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-white/15 bg-black shadow-[0_28px_90px_rgba(0,0,0,0.72)]"
        role="dialog"
        aria-modal="true"
        aria-label={t('panorama.dialogAria', '全景查看：{title}', { title })}
      >
        <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between bg-gradient-to-b from-black/78 to-transparent px-5">
          <div className="flex min-w-0 items-center gap-2 text-sm text-white/84">
            <ImageIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{title}</span>
            <span className="rounded-full border border-white/12 bg-black/35 px-2 py-0.5 text-[11px] text-white/48">
              {t('panorama.qualityBadge', '360° 全景 · 高质量纹理')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => resetViewRef.current()}
              className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-3 text-xs text-white/65 backdrop-blur hover:bg-white/10 hover:text-white"
              title={t('panorama.resetTitle', '复位视角（0）')}
            >
              <RotateCcw className="h-4 w-4" />
              {t('panorama.reset', '复位视角')}
            </button>
            <button
              type="button"
              onClick={closeModal}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/35 text-white/65 backdrop-blur hover:bg-white/10 hover:text-white"
              aria-label={t('panorama.closeAria', '关闭全景查看器')}
              title={t('panorama.close', '关闭')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div ref={mountRef} className="absolute inset-0" />

        {loading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/55 text-sm text-white/65">
            {t('panorama.loading', '正在构建全景空间…')}
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-red-200">
            {error}
          </div>
        )}

        {captureError && (
          <div className="pointer-events-none absolute inset-x-4 bottom-20 z-30 flex justify-center">
            <div className="max-w-[min(520px,calc(100%-32px))] rounded-lg border border-red-300/20 bg-[#241c1e]/95 px-3 py-2 text-center text-[11px] leading-relaxed text-red-100 shadow-xl backdrop-blur">
              {captureError}
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center bg-gradient-to-t from-black/75 to-transparent pb-5 pt-16">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/38 px-4 py-2 text-[11px] text-white/56 backdrop-blur-md">
              <span className="flex items-center gap-1.5">
                <MousePointer2 className="h-3.5 w-3.5" />
                {t('panorama.dragHint', '按住拖动环视')}
              </span>
              <span className="flex items-center gap-1.5">
                <Expand className="h-3.5 w-3.5" />
                {t('panorama.zoomHint', '滚轮缩放')}
              </span>
              <span>{t('panorama.doubleClickHint', '双击复位')}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleCaptureView()}
              disabled={!viewerReady || capturing || Boolean(error)}
              className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/14 bg-black/50 text-white/72 shadow-lg backdrop-blur-md transition-colors hover:bg-white/12 hover:text-white disabled:cursor-wait disabled:opacity-40"
              aria-label={t('panorama.capture.aria', '截取当前全景视角')}
              title={t('panorama.capture.title', '截取当前视角并创建图片节点')}
            >
              {capturing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
