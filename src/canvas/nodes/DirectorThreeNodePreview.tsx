import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { DirectorSceneState } from '../nodeTypes';
import {
  applyDirectorPreviewPose,
  createDirectorPreviewSubject,
  directorPreviewWorldPosition,
  installDirectorBuiltInSubjectModel,
} from '../../components/DirectorThreeStage';
import { getDirectorCharacterPreset } from '../../lib/directorCharacters';
import { loadDirectorModelUrl } from '../../lib/directorModel';
import { loadDirectorModel, loadDirectorScene } from '../../lib/libraryMedia';
import { resolveMediaSourceUrl } from '../../lib/mediaPreview';
import { directorPanoramaBackgroundPitchDegrees } from '../../lib/directorPanorama';
import { useAppTranslation } from '../../i18n/appI18n';

function disposePreview(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** A lightweight, non-interactive Three.js view of the actual built-in director models. */
export function DirectorThreeNodePreview({
  scene,
  onThumbnail,
}: {
  scene: DirectorSceneState;
  onThumbnail?: (thumbnailUrl: string) => void;
}) {
  const { t } = useAppTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const thumbnailCallbackRef = useRef(onThumbnail);
  thumbnailCallbackRef.current = onThumbnail;
  const lastThumbnailRef = useRef('');
  const previewKey = JSON.stringify({
    panorama: {
      sceneAssetId: scene.sceneAssetId ?? '',
      sceneUrl: scene.sceneUrl ?? '',
      sceneHorizonPitch: scene.sceneHorizonPitch ?? 0,
      scenePanoramaLift: scene.scenePanoramaLift ?? 0,
    },
    subjects: scene.subjects.map((subject) => ({
      id: subject.id,
      modelAssetId: subject.modelAssetId,
      modelFormat: subject.modelFormat,
      characterPreset: subject.characterPreset,
      characterColors: subject.characterColors,
      rigPose: subject.rigPose,
      posePreset: subject.posePreset,
      poseLean: subject.poseLean,
      headTilt: subject.headTilt,
      headTurn: subject.headTurn,
      x: subject.x,
      depth: subject.depth ?? subject.y,
      scale: subject.scale,
      bodyAngle: subject.bodyAngle,
    })),
  });
  const [readyPreviewKey, setReadyPreviewKey] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color('#080b10');
    threeScene.fog = new THREE.Fog('#080b10', 14, 31);
    const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 80);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);

    threeScene.add(new THREE.HemisphereLight('#d8f4ff', '#11131b', 2.05));
    const key = new THREE.DirectionalLight('#fff4dc', 3.4);
    key.position.set(5, 9, 7);
    threeScene.add(key);
    const rim = new THREE.DirectionalLight('#43d4ff', 2.1);
    rim.position.set(-6, 4, -5);
    threeScene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 28),
      new THREE.MeshStandardMaterial({ color: '#121821', roughness: 0.94 }),
    );
    floor.rotation.x = -Math.PI / 2;
    threeScene.add(floor);
    const grid = new THREE.GridHelper(28, 28, '#2e647a', '#203340');
    grid.position.y = 0.012;
    threeScene.add(grid);

    const modelRoot = new THREE.Group();
    threeScene.add(modelRoot);
    const runtimeUrls: string[] = [];
    let panoramaTexture: THREE.Texture | null = null;
    let disposed = false;
    let hasSized = false;
    let pendingVisualLoads = 0;
    let modelRequestsQueued = false;
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = 480;
    thumbnailCanvas.height = 270;
    const publishThumbnail = () => {
      if (!hasSized || disposed || !modelRequestsQueued || pendingVisualLoads > 0) return;
      setReadyPreviewKey(previewKey);
      if (!thumbnailCallbackRef.current) return;
      const context = thumbnailCanvas.getContext('2d');
      if (!context) return;
      context.drawImage(renderer.domElement, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
      const thumbnailUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.76);
      if (thumbnailUrl === lastThumbnailRef.current) return;
      lastThumbnailRef.current = thumbnailUrl;
      thumbnailCallbackRef.current(thumbnailUrl);
    };
    const frameModels = () => {
      const bounds = new THREE.Box3().setFromObject(modelRoot);
      if (bounds.isEmpty()) {
        camera.position.set(6.5, 4.2, 8.8);
        camera.lookAt(0, 1.2, 0);
      } else {
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const span = Math.max(4.8, size.x * 1.4, size.z * 1.25, size.y * 1.6);
        camera.position.set(center.x + span * 0.64, Math.max(3.8, size.y * 1.1), center.z + span);
        camera.lookAt(center.x, Math.max(1.15, center.y * 0.72), center.z);
      }
      camera.updateProjectionMatrix();
      renderer.render(threeScene, camera);
      publishThumbnail();
    };
    const settleVisualLoad = () => {
      if (disposed) return;
      pendingVisualLoads = Math.max(0, pendingVisualLoads - 1);
      frameModels();
    };
    const settleSubjectVisual = (model: THREE.Group) => {
      if (disposed) return;
      model.userData.directorVisualReady = true;
      model.visible = true;
      settleVisualLoad();
    };

    const loadPanoramaTexture = (panoramaUrl: string) => {
      new THREE.TextureLoader().load(
        panoramaUrl,
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          panoramaTexture = texture;
          threeScene.background = texture;
          threeScene.backgroundRotation.x = THREE.MathUtils.degToRad(
            directorPanoramaBackgroundPitchDegrees(
              sceneRef.current.sceneHorizonPitch,
              sceneRef.current.scenePanoramaLift,
            ),
          );
          floor.visible = false;
          settleVisualLoad();
        },
        undefined,
        () => settleVisualLoad(),
      );
    };
    const panoramaUrl = sceneRef.current.sceneUrl
      ? resolveMediaSourceUrl(sceneRef.current.sceneUrl)
      : '';
    if (panoramaUrl || sceneRef.current.sceneAssetId) {
      pendingVisualLoads += 1;
      if (panoramaUrl) {
        loadPanoramaTexture(panoramaUrl);
      } else {
        const sceneAssetId = sceneRef.current.sceneAssetId as string;
        void loadDirectorScene(sceneAssetId)
          .then((blob) => {
            if (!blob || disposed) {
              if (!disposed) settleVisualLoad();
              return;
            }
            const runtimeUrl = URL.createObjectURL(blob);
            runtimeUrls.push(runtimeUrl);
            loadPanoramaTexture(runtimeUrl);
          })
          .catch(() => settleVisualLoad());
      }
    }

    for (const subject of sceneRef.current.subjects) {
      const model = createDirectorPreviewSubject(subject);
      const position = directorPreviewWorldPosition(subject.x, subject.depth ?? subject.y);
      model.position.copy(position);
      model.scale.setScalar(Math.max(0.3, Math.min(3, subject.scale / 100)));
      applyDirectorPreviewPose(model, subject, 0);
      model.traverse((child) => {
        if (child.userData.directorRigHelper || child.name === 'director-selection-ring') {
          child.visible = false;
        }
      });
      modelRoot.add(model);

      const builtInModel = getDirectorCharacterPreset(subject.characterPreset).model;
      if (builtInModel) {
        pendingVisualLoads += 1;
        const loader = new GLTFLoader();
        loader.load(
          builtInModel.url,
          (gltf) => {
            if (disposed) return;
            if (!installDirectorBuiltInSubjectModel(model, gltf.scene, subject, builtInModel)) {
              disposePreview(gltf.scene);
              settleSubjectVisual(model);
              return;
            }
            applyDirectorPreviewPose(model, subject, 0);
            model.traverse((child) => {
              if (child.userData.directorRigHelper || child.name === 'director-selection-ring') {
                child.visible = false;
              }
            });
            settleSubjectVisual(model);
          },
          undefined,
          () => settleSubjectVisual(model),
        );
      } else if (subject.modelAssetId) {
        const modelAssetId = subject.modelAssetId;
        pendingVisualLoads += 1;
        void (async () => {
          try {
            const blob = await loadDirectorModel(modelAssetId);
            if (!blob || disposed) return;
            const url = URL.createObjectURL(blob);
            runtimeUrls.push(url);
            const { scene: imported } = await loadDirectorModelUrl(url, subject.modelFormat);
            if (disposed) {
              disposePreview(imported);
              return;
            }
            const importedBounds = new THREE.Box3().setFromObject(imported);
            const importedSize = importedBounds.getSize(new THREE.Vector3());
            const importedCenter = importedBounds.getCenter(new THREE.Vector3());
            const importedScale = importedSize.y > 0 ? 2.78 / importedSize.y : 1;
            imported.scale.setScalar(importedScale);
            imported.position.set(
              -importedCenter.x * importedScale,
              -importedBounds.min.y * importedScale,
              -importedCenter.z * importedScale,
            );
            disposePreview(model);
            model.clear();
            model.rotation.set(0, THREE.MathUtils.degToRad(-subject.bodyAngle), 0);
            model.add(imported);
          } catch {
            // Keep the procedural fallback only when the persisted model cannot be restored.
          } finally {
            settleSubjectVisual(model);
          }
        })();
      }
    }
    modelRequestsQueued = true;
    frameModels();

    const render = () => renderer.render(threeScene, camera);
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height);
      hasSized = true;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
      publishThumbnail();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    return () => {
      disposed = true;
      observer.disconnect();
      runtimeUrls.forEach((url) => URL.revokeObjectURL(url));
      panoramaTexture?.dispose();
      if (threeScene.background === panoramaTexture) threeScene.background = null;
      disposePreview(threeScene);
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [previewKey]);

  return (
    <div
      ref={hostRef}
      className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${readyPreviewKey === previewKey ? 'opacity-100' : 'opacity-0'}`}
      aria-label={t('canvasShell.directorThree.preview', '3D导演台真实模型预览')}
    />
  );
}
