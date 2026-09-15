import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderMocks = vi.hoisted(() => ({
  fbxLoadAsync: vi.fn(),
  gltfLoadAsync: vi.fn(),
  gltfRegister: vi.fn(),
}));

vi.mock('three/addons/loaders/FBXLoader.js', () => ({
  FBXLoader: class {
    loadAsync = loaderMocks.fbxLoadAsync;
  },
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync = loaderMocks.gltfLoadAsync;
    register = loaderMocks.gltfRegister;
  },
}));

import {
  DIRECTOR_MODEL_FILE_ACCEPT,
  directorModelFormatFromFileName,
  loadDirectorModelUrl,
} from './directorModel';

describe('3D director imported-model formats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts VRM, GLB and FBX file names without accepting sidecar GLTF files', () => {
    expect(directorModelFormatFromFileName('role.vrm')).toBe('vrm');
    expect(directorModelFormatFromFileName('ROLE.GLB')).toBe('glb');
    expect(directorModelFormatFromFileName('actor.FBX')).toBe('fbx');
    expect(directorModelFormatFromFileName('actor.gltf')).toBeNull();
    expect(directorModelFormatFromFileName('actor.fbx.png')).toBeNull();
    expect(DIRECTOR_MODEL_FILE_ACCEPT).toContain('.fbx');
  });

  it('loads FBX through FBXLoader and preserves embedded animation clips', async () => {
    const animations = [{ name: 'Take 001' }];
    const scene = { animations };
    loaderMocks.fbxLoadAsync.mockResolvedValue(scene);

    await expect(loadDirectorModelUrl('blob:actor', 'fbx')).resolves.toEqual({
      scene,
      animations,
    });
    expect(loaderMocks.fbxLoadAsync).toHaveBeenCalledWith('blob:actor');
    expect(loaderMocks.gltfLoadAsync).not.toHaveBeenCalled();
  });

  it('keeps GLB loading on GLTFLoader and registers VRM support only for VRM', async () => {
    const glbScene = { name: 'glb-scene' };
    const animations = [{ name: 'Idle' }];
    loaderMocks.gltfLoadAsync.mockResolvedValue({
      scene: glbScene,
      animations,
      userData: {},
    });

    await expect(loadDirectorModelUrl('blob:glb', 'glb')).resolves.toEqual({
      scene: glbScene,
      animations,
    });
    expect(loaderMocks.gltfRegister).not.toHaveBeenCalled();

    await loadDirectorModelUrl('blob:vrm', 'vrm');
    expect(loaderMocks.gltfRegister).toHaveBeenCalledOnce();
  });
});
