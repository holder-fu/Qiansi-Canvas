import { describe, expect, it } from 'vitest';
import directorNodeSource from './DirectorNode.tsx?raw';
import previewSource from './DirectorThreeNodePreview.tsx?raw';

describe('3D director node thumbnail contract', () => {
  it('prefers the generated thumbnail and falls back to a real saved director frame', () => {
    expect(directorNodeSource).toContain('const thumbnailUrl = thumbnailMatchesScene');
    expect(directorNodeSource).toContain('data.directorLayoutUrl ||');
    expect(directorNodeSource).toContain('data.imageUrl ||');
    expect(directorNodeSource).toContain('onThumbnail={saveThumbnail}');
    expect(directorNodeSource).toContain('3D导演台预演缩略图');
  });

  it('shows the saved panorama after refresh instead of an unversioned dark thumbnail', () => {
    expect(directorNodeSource).toContain('const panoramaPreviewKey = JSON.stringify([');
    expect(directorNodeSource).toContain('scene.sceneAssetId || scene.sceneUrl');
    expect(directorNodeSource).toContain('data.directorThumbnailSceneKey === panoramaPreviewKey');
    expect(directorNodeSource).toContain('directorThumbnailSceneKey: panoramaPreviewKey');
    expect(directorNodeSource).toContain("mediaPreviewUrl(scene.sceneUrl, 'image')");
    expect(directorNodeSource).toContain('const hasPanorama = Boolean(');
    expect(directorNodeSource).toContain('scene.sceneAssetId || scene.sceneUrl');
    expect(directorNodeSource).toContain('loadDirectorScene(sceneAssetId)');
    expect(directorNodeSource).toContain('<DirectorThreeSceneBackdrop');
  });

  it('captures a bounded compressed image from the actual Three renderer', () => {
    expect(previewSource).toContain('preserveDrawingBuffer: true');
    expect(previewSource).toContain('thumbnailCanvas.width = 480');
    expect(previewSource).toContain('thumbnailCanvas.height = 270');
    expect(previewSource).toContain("toDataURL('image/jpeg', 0.76)");
    expect(previewSource).toContain('lastThumbnailRef.current');
  });

  it('keeps the saved frame visible until every asynchronous character visual is ready', () => {
    expect(directorNodeSource).toContain('<DirectorThreeNodePreview');
    expect(directorNodeSource).toContain("mediaPreviewUrl(thumbnailUrl, 'image')");
    expect(previewSource).toContain('let pendingVisualLoads = 0');
    expect(previewSource).toContain('pendingVisualLoads > 0');
    expect(previewSource).toContain('readyPreviewKey === previewKey');
    expect(previewSource).toContain('modelRequestsQueued = true');
  });

  it('loads the saved panorama into the real preview before publishing its thumbnail', () => {
    expect(previewSource).toContain('sceneUrl: scene.sceneUrl');
    expect(previewSource).toContain('sceneAssetId: scene.sceneAssetId');
    expect(previewSource).toContain('sceneHorizonPitch: scene.sceneHorizonPitch');
    expect(previewSource).toContain('scenePanoramaLift: scene.scenePanoramaLift');
    expect(previewSource).toContain('resolveMediaSourceUrl(sceneRef.current.sceneUrl)');
    expect(previewSource).toContain('loadDirectorScene(sceneAssetId)');
    expect(previewSource).toContain('new THREE.TextureLoader().load(');
    expect(previewSource).toContain('THREE.EquirectangularReflectionMapping');
    expect(previewSource).toContain('directorPanoramaBackgroundPitchDegrees(');
    expect(previewSource).toContain('threeScene.background = texture');
    expect(previewSource).toContain('floor.visible = false');
    expect(previewSource).toContain('pendingVisualLoads += 1');
    expect(previewSource).toContain('settleVisualLoad()');
    expect(previewSource).toContain('panoramaTexture?.dispose()');
  });

  it('loads bundled rigged presets into the real node preview', () => {
    expect(previewSource).toContain('getDirectorCharacterPreset(subject.characterPreset).model');
    expect(previewSource).toContain('installDirectorBuiltInSubjectModel');
    expect(previewSource).toContain('builtInModel.url');
    expect(previewSource).toContain('settleSubjectVisual(model)');
  });
});
