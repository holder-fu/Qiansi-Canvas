import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import source from './DirectorThreeStudioModal.tsx?raw';

const styles = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');

describe('3D director video task panel placement', () => {
  it('offers VRM, GLB and FBX as persistent local character formats', () => {
    expect(source).toContain("t('director3d.characters.importModel', '导入 VRM / GLB / FBX')");
    expect(source).toContain('accept={DIRECTOR_MODEL_FILE_ACCEPT}');
    expect(source).toContain('directorModelFormatFromFileName(file.name)');
    expect(source).toContain('FBX 请优先使用内嵌贴图');
  });

  it('places the untitled-scene summary below the local-model hint without an Outliner heading', () => {
    expect(source).not.toContain('SCENE OUTLINER');
    expect(source).not.toContain("t('director3d.sceneOutliner'");
    expect(source).not.toContain('data-director-scene-name-footer="true"');
    expect(source).toContain('data-director-scene-summary="true"');
    expect(source).toContain("placeholder={t('director.common.untitledScene', '未命名场景')}");
    expect(source.match(/value=\{draft\.sceneName\}/g)).toHaveLength(1);
    expect(source.indexOf('data-director-scene-summary="true"')).toBeGreaterThan(
      source.indexOf("'director3d.characters.importHint'"),
    );
    expect(source).toContain('setPreviewStageCameraId(stageCamera.id)');
    expect(source).toContain('LIVE');
  });

  it('adds direct row deletion for every character, object and stage camera in the scene summary', () => {
    expect(source).toContain('const removeSubject = (subjectId: string) =>');
    expect(source).toContain('const removeSceneObject = (objectId: string) =>');
    expect(source).toContain('const removeStageCamera = (cameraId: string) =>');
    expect(source).toContain("t('director3d.character.deleteNamed', '删除角色 {name}'");
    expect(source).toContain("t('director3d.object.deleteNamed', '删除物品 {name}'");
    expect(source).toContain("t('director3d.camera.deleteNamed', '删除机位 {name}'");
    expect(source).toContain('if (previewStageCameraId === cameraId)');
    expect(source).toContain('setPreviewStageCameraId(remainingCameras[0]?.id ?? null)');
  });

  it('places one compact creation button at the lower-right of the central 3D stage', () => {
    expect(source).toContain('absolute right-3 bottom-[150px] z-[640]');
    expect(source).toContain('min-w-[156px]');
    expect(source).toContain('onClick={() => void submitToAi()}');
    expect(source).toContain("t('director3d.videoTask.create', '创建视频任务')");
    expect(source.indexOf('absolute right-3 bottom-[150px] z-[640]')).toBeLessThan(
      source.indexOf('director-settings-sidebar absolute inset-x-0 bottom-0'),
    );
  });

  it('removes the duplicate expandable task panel from the right inspector', () => {
    expect(source).not.toContain('className="director-prompt-bar');
    expect(source).not.toContain('videoTaskOpen');
    expect(source).not.toContain('id="director-video-task-panel"');
    expect(source).not.toContain("t('director3d.videoTask.intentScore'");
    expect(source.match(/onClick=\{\(\) => void submitToAi\(\)\}/g)).toHaveLength(1);
  });

  it('lets users remove a loaded panorama from the stage', () => {
    expect(source).toContain("t('director3d.scene.panoramaReady', '环境贴图已加载到舞台')");
    expect(source).toContain('directorPanoramaRenderPlan(');
    expect(source).toContain('isDirectorPanoramaStageReady(bitmap.width, bitmap.height)');
    expect(source).toContain('const stagePanorama = await normalizePanoramaForStage(panorama)');
    expect(source).toContain('panorama: stagePanorama');
    expect(source).toContain('2K 为 2048×1024，4K 为 4096×2048');
    expect(source).toContain("t('director3d.scene.lift', '场景抬升')");
    expect(source).toContain('max={DIRECTOR_PANORAMA_LIFT_MAX}');
    expect(source).toContain('scenePanoramaLift: Number(event.target.value)');
    expect(source.match(/scenePanoramaLift: 0/g)).toHaveLength(2);
    expect(source).toContain(
      '纵向校准全景地面投影与网格的贴合位置，不改变人物、物品、路径或机位坐标。',
    );
    expect(source).toContain('sceneAssetId: undefined');
    expect(source).toContain('sceneReferenceUrl: undefined');
    expect(source).toContain('URL.revokeObjectURL(draft.sceneUrl)');
    expect(source).toContain("aria-label={t('director3d.scene.horizon', '全景地平线校准')}");
    expect(source).toContain('sceneHorizonPitch: Number(event.target.value)');
  });

  it('provides a precise inspector for selected stage-camera position and orientation', () => {
    expect(source).toContain('activeStageCameraId');
    expect(source).toContain("t('director3d.inspector.cameraHint', '舞台机位 · 可在视口拖动')");
    expect(source).toContain("['height', 'Y', activeStageCamera.height, 0.35, 8, 0.1]");
    expect(source).toContain("t('director3d.camera.yaw', '水平角度')");
    expect(source).toContain("t('director3d.camera.pitch', '俯仰角度')");
    expect(source).toContain("t('director3d.camera.range', '取景范围')");
    expect(source).toContain('onStageCameraChange={patchStageCamera}');
  });

  it('creates the front wide shot with a truly level camera axis', () => {
    expect(source).toMatch(
      /id: 'wide-front',\s+label: '正面全景',\s+detail: '28mm · 水平环境',\s+yaw: 0,\s+pitch: 0,\s+distance: 82/,
    );
    expect(source).toContain('pitch: shot.pitch');
    expect(source).toContain(
      'cameraPitch: getDirectorGroundedCameraPitch(shot.distance, shot.pitch)',
    );
  });

  it('places a dedicated primitive-object library after character assets with a full inspector', () => {
    expect(
      source.indexOf("{ id: 'objects', label: t('director3d.assets.objects', '物品') }"),
    ).toBeGreaterThan(
      source.indexOf("{ id: 'actors', label: t('director3d.assets.characters', '角色资产') }"),
    );
    expect(
      source.indexOf("{ id: 'objects', label: t('director3d.assets.objects', '物品') }"),
    ).toBeLessThan(
      source.indexOf("{ id: 'cameras', label: t('director3d.assets.cameras', '机位') }"),
    );
    expect(
      source.indexOf("{ id: 'cameras', label: t('director3d.assets.cameras', '机位') }"),
    ).toBeLessThan(
      source.indexOf("{ id: 'scene', label: t('director3d.assets.environment', '环境') }"),
    );
    expect(source).toContain('OBJECT_PRIMITIVES.map');
    expect(source).toContain("aria-label={t('director3d.objects.add', '添加 {name}'");
    expect(source).toContain("t('director3d.inspector.objectHint', '3D 物品 · 可在视口变换')");
    expect(source).toContain("aria-label={t('director3d.object.colorAria', '物品颜色')}");
    expect(source).toContain("t('director3d.object.axisScale', '建筑三轴尺寸')");
    expect(source).toContain("t('director3d.object.heightY', '高度 Y')");
    expect(source).toContain("t('director3d.object.lift', '物品抬升')");
    expect(source).toContain("'director3d.object.liftHint'");
    expect(source).toContain('activeSceneObject.height ?? 0');
    expect(source).toContain('height: Number(event.target.value)');
    expect(source).toContain('step={0.1}');
    expect(source).toContain('height: 0');
    expect(source).toContain("'director3d.object.dimensionHint'");
    expect(source).toContain('onSceneObjectSelect');
  });

  it('owns Delete and Backspace inside the studio without deleting the canvas node', () => {
    expect(source).toContain("event.key === 'Delete' || event.key === 'Backspace'");
    expect(source).toContain('!shouldIgnoreStudioShortcut(event)');
    expect(source).toContain('event.stopPropagation()');
    expect(source).toContain('camera.id !== selectedStageCameraId');
    expect(source).toContain('object.id !== selectedSceneObjectId');
    expect(source).toContain('subject.id !== selectedSubjectId');
    expect(source).toContain('selectedMotionPathSubjectId');
    expect(source).toContain('{ ...subject, motionPath: undefined }');
  });

  it('supports click-or-drag camera presets and drops them at an exact stage position', () => {
    expect(source).toContain('draggable');
    expect(source).toContain('DIRECTOR_CAMERA_PRESET_DRAG_TYPE');
    expect(source).toContain('cameraShotKey(shot)');
    expect(source).toContain('onCameraPresetDrop={(presetKey, placement) =>');
    expect(source).toContain('addStageCamera(shot, placement)');
  });

  it('offers selectable root-path placement and enlarged professional ranges', () => {
    expect(source).toContain('activeMotionPathSubjectId');
    expect(source).toContain("t('director3d.path.selectHint', '在舞台中选中并移动路径')");
    expect(source).toContain('moveMotionPathAnchor');
    expect(source).toContain('DIRECTOR_MOTION_PATH_RANGE_MAX');
    expect(source).toContain('约 {Math.round(range.width * 1.6)}m');
    expect(source).toContain("'director3d.path.collisionHint'");
  });

  it('uses a dedicated readable type scale and wider inspector surfaces', () => {
    expect(source).toContain('director-three-studio');
    expect(source).toContain('w-[304px]');
    expect(source).toContain('w-[336px]');
  });

  it('routes a clicked 3D joint into the rig inspector and keeps a keyboard slider equivalent', () => {
    expect(source).toContain('activeRigJoint={activeRigJoint}');
    expect(source).toContain('onRigJointSelect={(selection) =>');
    expect(source).toContain("setInspectorTab('rig')");
    expect(source).toContain(
      "t('director3d.rig.hint', '直接拖动舞台上的关节圆点，或使用下方精确滑杆')",
    );
    expect(source).toContain("aria-label={t('director3d.rig.adjustJoint', '调节 {name}'");
  });

  it('applies Humanoid pose presets as real static poses with persistent selected feedback', () => {
    expect(source).toContain('const applyPosePreset = useCallback(');
    expect(source).toContain('setIsPlaying(false)');
    expect(source).toContain('setPlaybackSeconds(0)');
    expect(source).toContain("animationClip: 'none'");
    expect(source).toContain('rigPose: {}');
    expect(source).toContain('onClick={() => applyPosePreset(active.id, pose.id)}');
    expect(source).toContain('aria-pressed={active.posePreset === pose.id}');
    expect(source).toContain('director-pose-preset--selected');
    expect(source).toContain("t('director3d.rig.currentPose', '当前姿势：')");
  });

  it('keeps the mirror-link control aligned and on one line in the narrow inspector', () => {
    expect(source).toContain('mb-3 flex items-start justify-between gap-3');
    expect(source).toContain('min-w-[92px] shrink-0');
    expect(source).toContain('justify-center gap-1.5 whitespace-nowrap');
    expect(source).toContain("active.linkLimbs !== false ? 'director-settings-card--selected");
    expect(source).toContain("t('director3d.rig.mirror', '镜像联动')");
  });

  it('records and persists a playable 3D animation before creating the task node', () => {
    expect(source).toContain('stageRef.current?.captureAnimationVideo()');
    expect(source).toContain('persistVideoFile(');
    expect(source).toContain('createVideoFromDirector(modalNodeId, {');
    expect(source).not.toContain('void generateNode(videoNodeId)');
    expect(source).toContain("submitProgress || t('director3d.videoTask.exporting', '正在导出…')");
  });

  it('does not expose obsolete free-form performance prompts in the 3D inspector', () => {
    expect(source).not.toContain('动作导演备注');
    expect(source).not.toContain('AI 动作说明');
    expect(source).not.toContain('动作表演');
    expect(source).not.toContain('情绪表演');
    expect(source).not.toContain('描述动作节奏和结束状态');
    expect(source).not.toContain('例如：警惕但克制');
    expect(source).not.toContain("t('director3d.scene.story'");
    expect(source).not.toContain("t('director3d.scene.storyPlaceholder'");
    expect(source).not.toContain('描述场景、人物关系与镜头中发生的事件');
  });

  it('automatically persists lightweight 3D scene edits and exposes save status', () => {
    expect(source).toContain("type AutoSaveStatus = 'dirty' | 'saving' | 'saved' | 'error'");
    expect(source).toContain('const persistDraftAutomatically = useCallback');
    expect(source).toContain('createPersistentDirectorScene({');
    expect(source).toContain('directorOutputDirty: true');
    expect(source).toContain('window.setTimeout(() => void persistDraftAutomatically(), 600)');
    expect(source).toContain("document.addEventListener('visibilitychange', flushPendingDraft)");
    expect(source).toContain("window.addEventListener('beforeunload', flushBeforeUnload)");
    expect(source).toContain("? t('director.autosave.saved', '已自动保存')");
    expect(source).toContain("? t('director.autosave.savingShort', '自动保存中')");
    expect(source).toContain("? t('director.autosave.retry', '重试保存')");
    expect(source).toContain("t('director.autosave.waiting', '等待自动保存')");
    expect(source).toContain("t('director3d.autosave.savedAction'");
  });

  it('configures a selected stage camera as fixed or subject-following', () => {
    expect(source).toContain("t('director3d.camera.mode', '拍摄模式')");
    expect(source).toContain("t('director3d.camera.fixed', '固定机位')");
    expect(source).toContain("t('director3d.camera.follow', '跟随拍摄')");
    expect(source).toContain("aria-label={t('director3d.camera.followTarget', '跟随目标角色')}");
    expect(source).toContain("trackingMode: 'follow-subject'");
    expect(source).toContain("'director3d.camera.followHint'");
  });

  it('retains the last selected camera as the real lens-view source', () => {
    expect(source).toContain('const [previewStageCameraId, setPreviewStageCameraId]');
    expect(source).toContain('previewStageCameraId={previewStageCamera?.id ?? null}');
    expect(source).toContain('setPreviewStageCameraId(id)');
    expect(source).toContain("t('director3d.stage.previewCamera', '使用 {name} 的真实取景画面'");
    expect(source).toContain("{t('director3d.stage.cameraView', '镜头视角')}");
    expect(source).toContain("{previewStageCamera ? ` · ${previewStageCamera.label}` : ''}");
  });

  it('makes move, rotate, scale and joint editing mutually exclusive real tools', () => {
    expect(source).toContain('const [showRig, setShowRig] = useState(false)');
    expect(source).toContain("aria-label={t('director3d.stage.tools', '舞台操作工具')}");
    expect(source).toContain('setShowRig(false);');
    expect(source).toContain('setActiveRigJoint(null);');
    expect(source).toContain("setCameraView('director');");
    expect(source).toContain("cameraView === 'director' && !showRig && transformMode === mode");
    expect(source).toContain(
      "t('director3d.stage.rigToolHelp', '关节工具：拖动人偶圆点调整骨骼姿势')",
    );
    expect(source).toContain("aria-pressed={cameraView === 'director' && showRig}");
  });

  it('returns a primary stage click from camera view to the move tool', () => {
    expect(source).toContain('onStagePrimaryPointerDown={() => {');
    expect(source).toContain("if (cameraView !== 'shot') return;");
    expect(source).toContain("setCameraView('director');");
    expect(source).toContain("setTransformMode('translate');");
    expect(source).toContain('setShowRig(false);');
    expect(source).toContain('setActiveRigJoint(null);');
  });
});

describe('3D director built-in character thumbnails', () => {
  it('uses a preset-specific real image while retaining procedural thumbnails as fallback', () => {
    expect(source).toContain('if (preset.thumbnailUrl)');
    expect(source).toContain('src={preset.thumbnailUrl}');
    expect(source).toContain('director-character-photo');
    expect(source).toContain('object-contain object-bottom');
    expect(styles).toContain('.director-character-photo');
    expect(styles).toContain('mask-image: radial-gradient(');
    expect(source).toContain('director-character-thumb__head');
  });
});

describe('3D director subject height controls', () => {
  it('provides a precise Y field beside X and Z', () => {
    expect(source).toContain("t('director3d.character.positionY', '位置 Y')");
    expect(source).toContain('active.height ?? 0');
    expect(source).toContain("step={key === 'height' ? 0.1 : 1}");
  });
});
