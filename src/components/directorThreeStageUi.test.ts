import { describe, expect, it } from 'vitest';
import source from './DirectorThreeStage.tsx?raw';
import studioSource from './DirectorThreeStudioModal.tsx?raw';
import previewSource from '../canvas/nodes/DirectorThreeNodePreview.tsx?raw';

describe('3D director stage UI contract', () => {
  it('uses the shared VRM, GLB and FBX loader in both live and canvas previews', () => {
    expect(source).toContain('loadDirectorModelUrl(subject.modelUrl, subject.modelFormat)');
    expect(previewSource).toContain('loadDirectorModelUrl(url, subject.modelFormat)');
  });

  it('centers the operation hint while preserving the left status label', () => {
    expect(source).toContain('items-start justify-center');
    expect(source).toContain('absolute left-4 rounded');
    expect(source).toContain('max-w-[62%] rounded bg-slate-950/60 px-3 py-1 text-center');
  });

  it('keeps empty and panorama stages fog-free across the full camera range', () => {
    expect(source).toContain('threeScene.fog = null');
    expect(source).not.toContain('new THREE.Fog');
    expect(source).toContain('THREE.EquirectangularReflectionMapping');
    expect(source).toContain('THREE.LinearMipmapLinearFilter');
    expect(source).toContain('threeScene.background = texture');
    expect(source).not.toContain("panorama.name = 'director-panorama'");
  });

  it('projects the panorama lower hemisphere onto the operation floor and keeps contact shadows', () => {
    expect(source).toContain('createDirectorPanoramaGroundMaterial(texture)');
    expect(source).toContain("name: 'director-panorama-ground-projection'");
    expect(source).toContain('directorWorldPosition.x');
    expect(source).toContain('-DIRECTOR_CAPTURE_HEIGHT');
    expect(source).toContain('panoramaUv.y + panoramaVerticalOffset');
    expect(source).toContain('panoramaShadowFloor.visible = true');
    expect(source).toContain('new THREE.ShadowMaterial({');
    expect(source).toContain("color: '#000000'");
    expect(source).toContain('opacity: 0.24');
    expect(source).toContain('previousFloorMaterial.dispose()');
    expect(source).toContain('horizonGround.material = new THREE.MeshBasicMaterial({');
    expect(source).toContain('depthWrite: false');
    expect(source).toContain('horizonGround.receiveShadow = false');
  });

  it('resolves the persisted panorama URL before Three.js loads it', () => {
    expect(source).toContain('resolveMediaSourceUrl(sceneRef.current.sceneUrl)');
    expect(source).not.toContain('new THREE.TextureLoader().load(sceneRef.current.sceneUrl');
  });

  it('scales the stage and its visible grid cells tenfold while extending ground to the panorama horizon', () => {
    expect(source).toContain('const WORLD_UNIT = DIRECTOR_STAGE_WORLD_UNIT');
    expect(source).toContain('const DIRECTOR_STAGE_SIZE = 280');
    expect(source).toContain('const DIRECTOR_STAGE_GRID_DIVISIONS = 28');
    expect(source).toContain('const DIRECTOR_STAGE_MINOR_GRID_DIVISIONS = 280');
    expect(source).toContain('const DIRECTOR_HORIZON_GROUND_RADIUS = 2000');
    expect(source).toContain('new THREE.PlaneGeometry(DIRECTOR_STAGE_SIZE, DIRECTOR_STAGE_SIZE)');
    expect(source).toContain('new THREE.CircleGeometry(DIRECTOR_HORIZON_GROUND_RADIUS, 128)');
    expect(source).toContain('material.opacity = 0.28');
    expect(source).toContain('DIRECTOR_STAGE_GRID_DIVISIONS');
    expect(source).toContain('side: THREE.DoubleSide');
    expect(source).toContain('groundDirectorCameraPosition(camera.position, orbit.target)');
    expect(source).toContain('orbit.maxDistance = DIRECTOR_CAMERA_RADIUS_MAX');
    expect(source).toContain('getDirectorWheelZoomTarget');
    expect(source).toContain(
      'camera.position.set(groundedCamera.x, groundedCamera.y, groundedCamera.z)',
    );
  });

  it('applies the persisted panorama horizon calibration during live rendering', () => {
    expect(source).toContain('directorPanoramaBackgroundPitchDegrees(');
    expect(source).toContain('current.sceneHorizonPitch');
    expect(source).toContain('current.scenePanoramaLift');
  });

  it('renders stage cameras as selectable high-contrast camera rigs with direction and framing', () => {
    expect(source).toContain('new THREE.BoxGeometry(0.72, 0.46, 0.62)');
    expect(source).toContain('new THREE.ArrowHelper');
    expect(source).toContain('directorCameraBodyMaterial');
    expect(source).toContain('directorCameraFrustumMaterial');
    expect(source).toContain('selectable.push(group)');
    expect(source).toContain('getDirectorStageCameraFrustumScale(cameraSpec.distance)');
    expect(source).toContain(
      'frustum.scale.set(frustumScale.spread, frustumScale.spread, frustumScale.length)',
    );
    expect(source).toContain('group.userData.directorFramingVisual = framingVisual');
    expect(source).toContain(
      'framingVisual.visible = !captureModeRef.current && !lensRuntime && selected',
    );
  });

  it('renders the live viewport and camera labels at a crisp high-density resolution', () => {
    expect(source).toContain(
      'renderer.setPixelRatio(getDirectorStagePixelRatio(window.devicePixelRatio || 1))',
    );
    expect(source).toContain('labelCanvas.width = 1024');
    expect(source).toContain('labelCanvas.height = 192');
    expect(source).toContain("context.font = '600 68px sans-serif'");
  });

  it('persists stage-camera translation, yaw and framing changes through dedicated callbacks', () => {
    expect(source).toContain("selected.userData.directorKind === 'camera'");
    expect(source).toContain('handlersRef.current.onStageCameraChange');
    expect(source).toContain('handlersRef.current.onStageCameraSelect');
    expect(source).toContain('patch.height = Math.max(0.35, Math.min(8, selected.position.y))');
  });

  it('renders selectable building primitives and persists their transform and material state', () => {
    expect(source).toContain("case 'sphere':");
    expect(source).toContain("case 'cylinder':");
    expect(source).toContain("case 'wall':");
    expect(source).toContain("case 'pillar':");
    expect(source).toContain("case 'arch':");
    expect(source).toContain("case 'stairs':");
    expect(source).toContain("selected.userData.directorKind === 'object'");
    expect(source).toContain('handlersRef.current.onSceneObjectSelect');
    expect(source).toContain('directorObjectMaterial');
    expect(source).toContain('patch.scaleY = Math.max(10, Math.min(5000');
    expect(source).toContain('patch.height = directorStageHeight(selected.position.y)');
    expect(source).toContain('group.position.y = directorStageHeight(object.height)');
    expect(source).toContain('getDirectorSceneObjectScale(object)');
    expect(source).toContain('transform.showY = true');
  });

  it('turns visible humanoid joint dots into direct draggable pose controls', () => {
    expect(source).toContain('helper.userData.directorRigJoint = joint');
    expect(source).toContain('beginRigJointDrag');
    expect(source).toContain('dragRigJoint');
    expect(source).toContain('patchDirectorJointFromTargetAngle');
    expect(source).toContain("helperMaterial.color.set(selected ? '#facc15' : '#f8fafc')");
    expect(source).toContain("addEventListener('pointermove', dragRigJoint, true)");
    expect(source).toContain('拖动人偶身上的白色圆点调整姿势');
  });

  it('binds bundled skinned actors to the same editable joint contract as procedural actors', () => {
    expect(source).toContain('installDirectorBuiltInSubjectModel');
    expect(source).toContain('directorRigRestQuaternion');
    expect(source).toContain('directorRigZeroDirection');
    expect(source).toContain('directorRigFrontAxis');
    expect(source).toContain('directorRigRightAxis');
    expect(source).toContain('directorRigBaseScale');
    expect(source).toContain('updateDirectorRigHelperAppearance(helper, selectedJoint)');
    expect(source).toContain('angleSign: rigAxis ? builtInRigAngleSign(joint, subject) : 1');
    expect(source).toContain('const builtInModel = getDirectorCharacterPreset');
    expect(source).toContain('builtInModel.url');
    expect(source).toContain('THREE.PropertyBinding.sanitizeNodeName(name)');
  });

  it('never paints the procedural fallback while a real character visual is loading', () => {
    expect(source).toContain(
      'const visualReady = !preset.model && !subject.modelAssetId && !subject.modelUrl',
    );
    expect(source).toContain('root.visible = visualReady');
    expect(source).toContain('group.userData.directorVisualReady !== false');
    expect(source).toContain("[subject.id]: 'ready'");
    expect(source).toContain("[subject.id]: 'error'");
  });

  it('hydrates the saved scene before mounting the interactive stage', () => {
    expect(studioSource).toContain(
      'const sceneHydrated = Boolean(node && loadedRef.current === node.id)',
    );
    expect(studioSource).toContain('sceneHydrated ? (');
    expect(studioSource).toContain("t('director3d.stage.loadingModels'");
  });

  it('exposes and persists the subject Y axis independently from root animation', () => {
    expect(source).toContain('patch.height = directorStageHeight');
    expect(source).toContain('directorStageHeight(subject.height) + frame.rootY');
    expect(source).toContain('(cameraSelected || objectSelected || subjectSelected)');
  });

  it('makes root-motion paths selectable and movable with the stage transform gizmo', () => {
    expect(source).toContain("directorKind: 'path'");
    expect(source).toContain('selectable.push(pathGroup)');
    expect(source).toContain('activeMotionPathSubjectRef');
    expect(source).toContain('translateDirectorMotionPath');
    expect(source).toContain('handlersRef.current.onMotionPathSelect');
    expect(source).toContain("activeMotionPathSubjectRef.current ? 'translate'");
  });

  it('accepts a dragged camera preset at the raycast floor position', () => {
    expect(source).toContain('DIRECTOR_CAMERA_PRESET_DRAG_TYPE');
    expect(source).toContain("addEventListener('dragover', handlePresetDragOver)");
    expect(source).toContain("addEventListener('drop', handlePresetDrop)");
    expect(source).toContain('raycaster.ray.intersectPlane(stageFloor');
    expect(source).toContain('handlersRef.current.onCameraPresetDrop');
  });

  it('sweeps animated roots against solid scene primitives before rendering', () => {
    expect(source).toContain('constrainDirectorMotionToScene(');
    expect(source).toContain('current.sceneObjects');
  });

  it('records a camera-clean WebM animation from the selected reference camera', () => {
    expect(source).toContain('captureAnimationVideo');
    expect(source).toContain('getDirectorStageCameraCapturePose(selectedStageCamera)');
    expect(source).toContain('renderer.domElement.captureStream(DIRECTOR_PREVIS_FPS)');
    expect(source).toContain('new MediaRecorder(stream');
    expect(source).toContain('videoCaptureRef.current = true');
    expect(source).toContain('if (!videoCaptureRef.current)');
    expect(source).toContain('cameraLabel = selectedStageCamera.label');
    expect(source).toContain('getDirectorTrackedStageCameraCapturePose(');
    expect(source).toContain("cameraSpec.trackingMode === 'follow-subject'");
  });

  it('renders lens view through the retained stage camera instead of the free orbit camera', () => {
    expect(source).toContain('previewStageCameraId?: string | null');
    expect(source).toContain('previewStageCameraRef');
    expect(source).toContain("cameraViewRef.current === 'shot'");
    expect(source).toContain(
      'stageCameraRuntimePose(current, previewStageCameraRef.current, time)',
    );
    expect(source).toContain('const viewportRuntime = capturedRuntime ?? lensRuntime');
    expect(source).toContain('group.visible = !captureModeRef.current && !lensRuntime');
    expect(source).toContain('orbit.enabled = !lensActive && !transform.dragging');
  });

  it('reports only primary stage clicks so the studio can leave camera view safely', () => {
    expect(source).toContain('onStagePrimaryPointerDown?: () => void');
    expect(source).toContain('if (event.button !== 0) return;');
    expect(source).toContain('if (transform.dragging) return;');
    expect(source).toContain('handlersRef.current.onStagePrimaryPointerDown?.();');
  });

  it('detaches the object transform gizmo while the exclusive joint tool is active', () => {
    expect(source).toContain(
      'const rigEditing = showRigRef.current && Boolean(activeSubjectRef.current)',
    );
    expect(source).toContain('!captureModeRef.current && !lensRuntime && !rigEditing');
    expect(source).toContain('activeSubject && !activeRigJoint && !rigEditing');
    expect(source).toContain('handlersRef.current.onTransformModeChange?.(nextMode)');
  });

  it('lets the selected character walk continuously with camera-relative arrow keys', () => {
    expect(source).toContain("pressedArrowKeys.has('ArrowUp')");
    expect(source).toContain("pressedArrowKeys.has('ArrowRight')");
    expect(source).toContain('camera.getWorldDirection(cameraForward)');
    expect(source).toContain('stepDirectorKeyboardWalk(');
    expect(source).toContain("animationClip: 'walk'");
    expect(source).toContain("window.addEventListener('keyup', handleKeyUp)");
    expect(source).toContain("window.addEventListener('blur', handleWindowBlur)");
    expect(source).toContain('commitKeyboardWalk(true)');
    expect(source).toContain('constrainDirectorMotionToScene(');
    expect(studioSource).toContain('onKeyboardWalkStart={() => {');
    expect(studioSource).toContain('setMotionPreviewOnly(false)');
    expect(studioSource).toContain("setTransformMode('translate')");
  });

  it('pans the free director view with arrow keys when no stage entity is selected', () => {
    expect(source).toContain('const controlsView = Boolean(');
    expect(source).toContain('!selectedSubjectId');
    expect(source).toContain('!activeSceneObjectRef.current');
    expect(source).toContain('!activeStageCameraRef.current');
    expect(source).toContain('stepDirectorKeyboardViewPan(');
    expect(source).toContain('camera.position.x += pan.deltaX');
    expect(source).toContain('camera.position.z += pan.deltaZ');
    expect(source).toContain('orbit.target.x = pan.x');
    expect(source).toContain('orbit.target.z = pan.z');
    expect(studioSource).toContain('onKeyboardViewPanStart={() => {');
    expect(studioSource).toContain("setCameraView('director')");
  });

  it('uses the real-rig-first catalog order in both character pickers', () => {
    expect(studioSource.match(/DIRECTOR_CHARACTER_CATALOG_PRESETS\.map/g)).toHaveLength(2);
  });
});
