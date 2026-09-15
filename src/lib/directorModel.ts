import type { AnimationClip, Object3D } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import type { DirectorModelFormat } from '../canvas/nodeTypes';

const IMPORTABLE_DIRECTOR_MODEL_FORMATS = new Set<DirectorModelFormat>(['vrm', 'glb', 'fbx']);

export const DIRECTOR_MODEL_FILE_ACCEPT =
  '.vrm,.glb,.fbx,model/gltf-binary,application/vnd.autodesk.fbx';

export interface LoadedDirectorModel {
  scene: Object3D;
  animations: AnimationClip[];
}

export function directorModelFormatFromFileName(fileName: string): DirectorModelFormat | null {
  const extension = fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  return IMPORTABLE_DIRECTOR_MODEL_FORMATS.has(extension as DirectorModelFormat)
    ? (extension as DirectorModelFormat)
    : null;
}

export async function loadDirectorModelUrl(
  url: string,
  format: DirectorModelFormat | undefined,
): Promise<LoadedDirectorModel> {
  if (format === 'fbx') {
    const scene = await new FBXLoader().loadAsync(url);
    return { scene, animations: scene.animations };
  }

  const loader = new GLTFLoader();
  if (format === 'vrm') loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  return {
    scene: (gltf.userData.vrm?.scene ?? gltf.scene) as Object3D,
    animations: gltf.animations,
  };
}
