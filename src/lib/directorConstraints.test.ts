import { describe, expect, it } from 'vitest';
import type { DirectorStageCamera } from '../canvas/nodeTypes';
import {
  buildDirectorConstraintPrompt,
  buildDirectorReferenceManifest,
  buildDirectorSupportingReferenceSlots,
  createDefaultDirectorScene,
  createDefaultDirectorSubject,
  createPersistentDirectorScene,
  directorBodyFacingFromAngle,
  getDirectorIntentReadiness,
  normalizeDirectorScene,
} from './directorConstraints';

describe('director composition constraints', () => {
  it('locks the connected subject count and rejects unreferenced people', () => {
    const scene = createDefaultDirectorScene();
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'subject-1',
        sourceNodeId: 'image-1',
        label: '女主角',
        imageUrl: 'hero.png',
        x: 24,
        y: 76,
        scale: 130,
        rotation: -10,
      }),
      createDefaultDirectorSubject({
        id: 'subject-2',
        sourceNodeId: 'image-2',
        label: '男主角',
        imageUrl: 'hero-2.png',
        x: 74,
        y: 48,
        scale: 90,
        rotation: 15,
      }),
    ];

    const prompt = buildDirectorConstraintPrompt(scene);

    expect(prompt).toContain('必须且只能出现2名人物');
    expect(prompt).toContain('禁止生成未被引用的额外人物或重复人物');
    expect(prompt).toContain('女主角：画面左侧、前景、较大景别');
    expect(prompt).toContain('男主角：画面右侧、中景、正常景别');
  });

  it('supports an empty people-free scene', () => {
    const prompt = buildDirectorConstraintPrompt(createDefaultDirectorScene());
    expect(prompt).toContain('画面中不要出现人物');
  });

  it('keeps identical image URLs as distinct semantic subject and scene slots', () => {
    const scene = createDefaultDirectorScene();
    scene.sceneReferenceUrl = 'shared-reference.png';
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'actor-a',
        sourceNodeId: 'source-a',
        label: '角色 A',
        imageUrl: 'shared-reference.png',
        x: 30,
        y: 50,
        scale: 100,
        rotation: 0,
      }),
      createDefaultDirectorSubject({
        id: 'actor-b',
        sourceNodeId: 'source-b',
        label: '角色 B',
        imageUrl: 'shared-reference.png',
        x: 70,
        y: 50,
        scale: 100,
        rotation: 0,
      }),
    ];

    expect(buildDirectorSupportingReferenceSlots(scene).map((slot) => slot.referenceId)).toEqual([
      'subject:actor-a',
      'subject:actor-b',
      'scene:environment',
    ]);
    expect(buildDirectorReferenceManifest(scene).map((item) => item.referenceId)).toEqual([
      'layout:0',
      'subject:actor-a',
      'subject:actor-b',
      'scene:environment',
    ]);
    const prompt = buildDirectorConstraintPrompt(scene);
    expect(prompt).toContain('角色 A：');
    expect(prompt).toContain('身份参考：参考图2');
    expect(prompt).toContain('角色 B：');
    expect(prompt).toContain('身份参考：参考图3');
  });

  it('turns performance, direction, camera and timing into explicit video instructions', () => {
    const scene = createDefaultDirectorScene();
    scene.sceneUrl = 'station.png';
    scene.sceneName = '雨夜火车站';
    scene.prompt = '女主听见身后脚步，在站台中央缓慢转身。';
    scene.cameraMovement = 'push-in';
    scene.duration = 8;
    scene.startFrame = '女主背对镜头站在站台中央';
    scene.endFrame = '女主转身看向镜头';
    scene.subjects = [
      {
        ...createDefaultDirectorSubject({
          id: 'hero',
          sourceNodeId: 'hero-node',
          label: '女主',
          imageUrl: 'hero.png',
          x: 50,
          y: 65,
          scale: 110,
          rotation: 0,
        }),
        bodyFacing: 'back',
        bodyAngle: 180,
        headDirection: 'camera',
        gazeTarget: '镜头',
        motion: 'turn-around',
        action: '听见脚步后缓慢转身',
        emotion: '警惕、克制',
      },
    ];

    const prompt = buildDirectorConstraintPrompt(scene);
    expect(prompt).toContain('参考图1：导演构图控制图');
    expect(prompt).toContain('参考图2：女主');
    expect(prompt).toContain('身体背对镜头');
    expect(prompt).toContain('听见脚步后缓慢转身');
    expect(prompt).toContain('摄影机稳定向主体推近');
    expect(prompt).toContain('8秒结束画面：女主转身看向镜头');
    expect(buildDirectorReferenceManifest(scene).map((item) => item.label)).toEqual([
      '导演构图控制图',
      '女主',
      '场景参考',
    ]);
    expect(getDirectorIntentReadiness(scene).level).toBe('表达清楚');
  });

  it('expresses scene objects and a subject-facing target as spatial video constraints', () => {
    const scene = createDefaultDirectorScene();
    scene.sceneName = '高中教室';
    scene.sceneObjects = [
      {
        id: 'blackboard',
        label: '黑板',
        kind: 'landmark',
        x: 50,
        y: 22,
        scale: 140,
        description: '固定在教室前墙中央，黑板上有少量板书',
      },
      {
        id: 'desk',
        label: '书桌',
        kind: 'furniture',
        x: 50,
        y: 72,
        scale: 110,
        description: '桌面上摆放几本课本、笔记本、铅笔和文具盒',
      },
    ];
    scene.subjects = [
      {
        ...createDefaultDirectorSubject({
          id: 'student',
          sourceNodeId: 'student-image',
          label: '学生',
          imageUrl: 'student.png',
          x: 50,
          y: 68,
          scale: 100,
          rotation: 0,
        }),
        bodyFacing: 'back',
        bodyAngle: 180,
        bodyTarget: '黑板',
      },
    ];

    const prompt = buildDirectorConstraintPrompt(scene);
    expect(prompt).toContain('场景类型：高中教室');
    expect(prompt).toContain(
      '黑板（固定结构，正方体 3D参考体）：画面中央、后景、离地高度0.0米、统一大小140%',
    );
    expect(prompt).toContain('三轴尺寸宽X 100% / 高Y 100% / 深Z 100%');
    expect(prompt).toContain('桌面上摆放几本课本、笔记本、铅笔和文具盒');
    expect(prompt).toContain('身体明确朝向场景目标“黑板”，不能误转向镜头');
    expect(prompt).toContain('水平朝向角度180度');
  });

  it('normalizes 3D primitive objects and serializes their shape, depth, rotation and color', () => {
    const scene = createDefaultDirectorScene();
    scene.stageMode = 'spatial';
    scene.sceneObjects = [
      {
        id: 'background-wall',
        label: '主建筑墙体',
        kind: 'landmark',
        primitive: 'wall',
        x: 82,
        y: 20,
        depth: 74,
        height: 4.25,
        scale: 135,
        scaleX: 240,
        scaleY: 2400,
        scaleZ: 180,
        rotationY: -28,
        color: '#AABBCC',
        description: '位于人物后方并形成主入口轮廓',
      },
    ];

    const normalized = normalizeDirectorScene(scene);
    const object = normalized.sceneObjects[0];
    const prompt = buildDirectorConstraintPrompt(normalized);
    if (!object) throw new Error('Expected the normalized 3D scene object.');

    expect(object).toMatchObject({
      primitive: 'wall',
      depth: 74,
      height: 4.25,
      rotationY: -28,
      color: '#aabbcc',
      scaleX: 240,
      scaleY: 2400,
      scaleZ: 180,
    });
    expect(prompt).toContain('主建筑墙体（固定结构，墙体 3D参考体）');
    expect(prompt).toContain('前景、离地高度4.3米、统一大小135%');
    expect(prompt).toContain('离地高度4.3米');
    expect(prompt).toContain('三轴尺寸宽X 240% / 高Y 2400% / 深Z 180%');
    expect(prompt).toContain('水平旋转-28°、材质颜色#aabbcc');

    scene.sceneObjects = [{ ...object, height: 99 }];
    expect(normalizeDirectorScene(scene).sceneObjects[0]?.height).toBe(50);
  });

  it('maps the continuous body angle to the closest semantic facing preset', () => {
    expect(directorBodyFacingFromAngle(-180)).toBe('back');
    expect(directorBodyFacingFromAngle(-92)).toBe('left-profile');
    expect(directorBodyFacingFromAngle(-40)).toBe('front-left');
    expect(directorBodyFacingFromAngle(0)).toBe('front');
    expect(directorBodyFacingFromAngle(46)).toBe('front-right');
    expect(directorBodyFacingFromAngle(95)).toBe('right-profile');
    expect(directorBodyFacingFromAngle(180)).toBe('back');
  });

  it('migrates a legacy saved scene without breaking old canvases', () => {
    const legacy = {
      ...createDefaultDirectorScene(),
      schemaVersion: undefined,
      cameraMovement: undefined,
      scenePanoramaLift: undefined,
      subjects: [
        {
          id: 'legacy',
          sourceNodeId: 'legacy-image',
          label: '旧人物',
          imageUrl: 'legacy.png',
          x: 50,
          y: 50,
          scale: 100,
          rotation: 12,
        },
      ],
    };
    const normalized = normalizeDirectorScene(
      legacy as unknown as ReturnType<typeof createDefaultDirectorScene>,
    );
    expect(normalized.schemaVersion).toBe(14);
    expect(normalized.cameraMovement).toBe('static');
    expect(normalized.scenePanoramaLift).toBe(0);
    expect(normalized.subjects[0]).toMatchObject({
      bodyFacing: 'front',
      bodyAngle: 0,
      bodyTarget: '',
      headDirection: 'follow-body',
      motion: 'still',
      rotation: 12,
      height: 0,
      frameShape: 'arch',
    });
    expect(normalized.sceneName).toBe('');
    expect(normalized.sceneObjects).toEqual([]);
    expect(normalized.backgroundActors).toEqual([]);
  });

  it('persists supported 2D subject frames and rejects unknown saved shapes', () => {
    const scene = createDefaultDirectorScene();
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'framed-subject',
        sourceNodeId: 'image-1',
        label: '带边框人物',
        imageUrl: 'subject.png',
        frameShape: 'shield',
        x: 50,
        y: 70,
        scale: 100,
        rotation: 0,
      }),
    ];

    expect(normalizeDirectorScene(scene).subjects[0]?.frameShape).toBe('shield');
    const subject = scene.subjects[0];
    if (!subject) throw new Error('Expected framed subject fixture');
    scene.subjects[0] = { ...subject, frameShape: 'triangle' as 'shield' };
    expect(normalizeDirectorScene(scene).subjects[0]?.frameShape).toBe('arch');
  });

  it('keeps local panorama ids while routing the compact reference image to AI', () => {
    const scene = createDefaultDirectorScene();
    scene.stageMode = 'spatial';
    scene.sceneAssetId = 'director-scene-1';
    scene.sceneUrl = 'blob:runtime-panorama';
    scene.sceneReferenceUrl = 'data:image/jpeg;base64,compact-reference';
    scene.sceneHorizonPitch = 42;
    scene.scenePanoramaLift = 80;

    const normalized = normalizeDirectorScene(scene);
    const sceneReference = buildDirectorReferenceManifest(normalized).find(
      (item) => item.kind === 'scene',
    );

    expect(normalized.sceneAssetId).toBe('director-scene-1');
    expect(normalized.sceneReferenceUrl).toBe('data:image/jpeg;base64,compact-reference');
    expect(normalized.sceneHorizonPitch).toBe(30);
    expect(normalized.scenePanoramaLift).toBe(30);
    expect(sceneReference?.imageUrl).toBe('data:image/jpeg;base64,compact-reference');

    const persisted = createPersistentDirectorScene(normalized);
    expect(persisted.sceneAssetId).toBe('director-scene-1');
    expect(persisted.sceneUrl).toBeUndefined();
    expect(persisted.sceneReferenceUrl).toBeUndefined();
    expect(persisted.sceneHorizonPitch).toBe(30);
    expect(persisted.scenePanoramaLift).toBe(30);
  });

  it('normalizes persisted background actor positions for 2D storyboard constraints', () => {
    const scene = createDefaultDirectorScene();
    scene.backgroundActors = [
      {
        id: 'extra',
        label: '路人',
        x: 130,
        y: -12,
        scale: 5,
        description: '从画面后方经过',
      },
    ];

    expect(normalizeDirectorScene(scene).backgroundActors).toEqual([
      {
        id: 'extra',
        label: '路人',
        x: 95,
        y: 10,
        scale: 30,
        description: '从画面后方经过',
      },
    ]);
  });

  it('normalizes persisted main-character geometry to the editable 2D stage range', () => {
    const scene = createDefaultDirectorScene();
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'off-stage',
        sourceNodeId: 'image',
        label: '越界人物',
        imageUrl: 'person.png',
        x: 400,
        y: -20,
        scale: 900,
        rotation: 0,
      }),
    ];

    expect(normalizeDirectorScene(scene).subjects[0]).toMatchObject({
      x: 95,
      y: 10,
      height: 0,
      scale: 300,
    });
  });

  it('persists a bounded 3D subject height and includes it in spatial constraints', () => {
    const scene = createDefaultDirectorScene();
    scene.stageMode = 'spatial';
    const raisedActor = createDefaultDirectorSubject({
      id: 'raised-actor',
      sourceNodeId: '',
      label: '悬空人物',
      imageUrl: '',
      x: 50,
      y: 50,
      depth: 50,
      height: 4.25,
      scale: 100,
      rotation: 0,
    });
    scene.subjects = [raisedActor];

    const normalized = normalizeDirectorScene(scene);
    expect(normalized.subjects[0]?.height).toBe(4.25);
    expect(createPersistentDirectorScene(normalized).subjects[0]?.height).toBe(4.25);
    expect(buildDirectorConstraintPrompt(normalized)).toContain('离地高度4.3米');

    raisedActor.height = 99;
    expect(normalizeDirectorScene(scene).subjects[0]?.height).toBe(50);
  });

  it('turns spatial previs camera and depth choices into final-video constraints', () => {
    const scene = createDefaultDirectorScene();
    scene.stageMode = 'spatial';
    scene.cameraYaw = 38;
    scene.cameraPitch = 22;
    scene.cameraDistance = 54;
    scene.subjects = [
      {
        ...createDefaultDirectorSubject({
          id: 'spatial-hero',
          sourceNodeId: 'hero-image',
          label: '主角',
          imageUrl: 'hero.png',
          x: 42,
          y: 58,
          scale: 100,
          rotation: 0,
        }),
        depth: 72,
      },
    ];

    const prompt = buildDirectorConstraintPrompt(scene);
    expect(prompt).toContain('3D导演预演');
    expect(prompt).toContain('摄影机环绕角度38°、俯仰22°、距离54%');
    expect(prompt).toContain('三维景深位置72%');
  });

  it('normalizes legacy below-floor shot pitches to a grounded camera angle', () => {
    const scene = createDefaultDirectorScene();
    scene.cameraDistance = 100;
    scene.cameraPitch = -35;

    const normalized = normalizeDirectorScene(scene);
    expect(normalized.cameraPitch).toBeGreaterThan(-3);
    expect(normalized.cameraPitch).toBeLessThan(0);
    expect(buildDirectorConstraintPrompt(normalized)).not.toContain('俯仰-35°');
  });

  it('persists the expanded root-camera zoom range for the enlarged stage', () => {
    const scene = createDefaultDirectorScene();
    scene.cameraDistance = 1400;
    expect(normalizeDirectorScene(scene).cameraDistance).toBe(1000);

    scene.cameraDistance = -20;
    expect(normalizeDirectorScene(scene).cameraDistance).toBe(5);
  });

  it('migrates schema-12 spatial placements onto the ten-times-expanded floor', () => {
    const scene = createDefaultDirectorScene();
    scene.schemaVersion = 12;
    scene.stageMode = 'spatial';
    scene.subjects = [
      {
        ...createDefaultDirectorSubject({
          id: 'actor-a',
          sourceNodeId: '',
          label: '演员',
          imageUrl: '',
          x: 38,
          y: 60,
          depth: 60,
          scale: 100,
          rotation: 0,
        }),
        motionPath: {
          type: 'line',
          width: 32,
          depthRange: 20,
          points: [
            { x: 38, depth: 60 },
            { x: 70, depth: 40 },
          ],
        },
      },
    ];
    scene.sceneObjects = [
      {
        id: 'wall',
        label: '墙体',
        kind: 'landmark',
        primitive: 'wall',
        x: 82,
        y: 74,
        depth: 74,
        scale: 100,
        description: '',
      },
    ];
    scene.stageCameras = [
      {
        id: 'camera',
        label: 'CAM 1',
        x: 50,
        depth: 18,
        height: 1.6,
        yaw: 0,
        pitch: 0,
        distance: 65,
      },
    ];

    const normalized = normalizeDirectorScene(scene);

    expect(normalized.schemaVersion).toBe(14);
    expect(normalized.subjects[0]).toMatchObject({ x: 48.8, y: 51, depth: 51 });
    expect(normalized.subjects[0]?.motionPath?.points).toEqual([
      { x: 48.8, depth: 51 },
      { x: 80.8, depth: 31 },
    ]);
    expect(normalized.sceneObjects[0]).toMatchObject({ x: 53.2, depth: 52.4 });
    expect(normalized.stageCameras?.[0]).toMatchObject({ x: 50, depth: 46.8 });
  });

  it('migrates v5 actors to the v6 rig, material and animation contract', () => {
    const scene = createDefaultDirectorScene();
    scene.schemaVersion = 5;
    scene.stageMode = 'spatial';
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'legacy-actor',
        sourceNodeId: '',
        label: '旧版演员',
        imageUrl: '',
        x: 50,
        y: 60,
        depth: 60,
        scale: 100,
        rotation: 0,
      }),
    ];
    delete scene.subjects[0]?.characterColors;
    delete scene.subjects[0]?.animationClip;
    delete scene.subjects[0]?.rigPose;

    const normalized = normalizeDirectorScene(scene);

    expect(normalized.schemaVersion).toBe(14);
    expect(normalized.subjects[0]).toMatchObject({
      characterPreset: 'cinematic-male',
      characterColors: {
        skin: '#c98f6b',
        outfit: '#334155',
        accent: '#0ea5e9',
        hair: '#201a18',
      },
      rigPose: {},
      linkLimbs: true,
      animationClip: 'idle',
      animationSpeed: 1,
      animationLoop: true,
    });
  });

  it('migrates editable stage cameras with height and includes their framing in AI constraints', () => {
    const scene = createDefaultDirectorScene();
    scene.stageMode = 'spatial';
    scene.stageCameras = [
      {
        id: 'camera-a',
        label: 'CAM 1 · 低位跟拍',
        x: 0,
        depth: 0,
        height: undefined,
        yaw: -42,
        pitch: 18,
        distance: 72,
      } as unknown as DirectorStageCamera,
    ];

    const normalized = normalizeDirectorScene(scene);

    expect(normalized.stageCameras?.[0]).toMatchObject({
      x: 0,
      depth: 0,
      height: 1.6,
      yaw: -42,
      pitch: 18,
      distance: 72,
    });
    expect(buildDirectorConstraintPrompt(normalized)).toContain(
      'CAM 1 · 低位跟拍位于舞台 X0 / Z0 / 高度1.6',
    );
    expect(normalized.stageCameras?.[0]?.trackingMode).toBe('fixed');
  });

  it('persists a subject-follow camera and describes its tracking behavior to AI', () => {
    const scene = createDefaultDirectorScene();
    scene.stageMode = 'spatial';
    scene.subjects = [
      createDefaultDirectorSubject({
        id: 'actor-followed',
        sourceNodeId: '',
        label: '主角',
        imageUrl: '',
        x: 50,
        y: 50,
        depth: 50,
        scale: 100,
        rotation: 0,
      }),
    ];
    scene.stageCameras = [
      {
        id: 'camera-follow',
        label: 'CAM 1 · 跟拍',
        x: 50,
        depth: 25,
        height: 1.8,
        yaw: 0,
        pitch: 0,
        distance: 65,
        trackingMode: 'follow-subject',
        trackingSubjectId: 'actor-followed',
      },
    ];

    const normalized = normalizeDirectorScene(scene);

    expect(normalized.stageCameras?.[0]).toMatchObject({
      trackingMode: 'follow-subject',
      trackingSubjectId: 'actor-followed',
    });
    expect(buildDirectorConstraintPrompt(normalized)).toContain(
      '跟随拍摄“主角”，保持相对距离并持续对准人物根节点',
    );
  });

  it('migrates untouched legacy front-wide shots and stage cameras to a level axis once', () => {
    const scene = createDefaultDirectorScene();
    scene.schemaVersion = 9;
    scene.cameraPreset = 'wide-front';
    scene.cameraYaw = 0;
    scene.cameraPitch = 12;
    scene.cameraDistance = 82;
    scene.stageCameras = [
      {
        id: 'legacy-wide',
        label: 'CAM 2 · 正面全景',
        x: 50,
        depth: 18,
        height: 1.6,
        yaw: 0,
        pitch: 12,
        distance: 82,
      },
      {
        id: 'custom-wide',
        label: 'CAM 3 · 正面全景',
        x: 50,
        depth: 18,
        height: 1.6,
        yaw: 0,
        pitch: 16,
        distance: 82,
      },
    ];

    const normalized = normalizeDirectorScene(scene);

    expect(normalized.schemaVersion).toBe(14);
    expect(normalized.cameraPitch).toBe(0);
    expect(normalized.stageCameras?.map((camera) => camera.pitch)).toEqual([0, 16]);

    normalized.cameraPitch = 12;
    if (normalized.stageCameras?.[0]) normalized.stageCameras[0].pitch = 12;
    const renormalized = normalizeDirectorScene(normalized);
    expect(renormalized.cameraPitch).toBe(12);
    expect(renormalized.stageCameras?.[0]?.pitch).toBe(12);
  });

  it('maps ordered 3D animation frames, colors, joints and path points into the AI contract', () => {
    const scene = createDefaultDirectorScene();
    scene.stageMode = 'spatial';
    scene.duration = 8;
    scene.animationSampleCount = 3;
    scene.subjects = [
      {
        ...createDefaultDirectorSubject({
          id: 'animated-actor',
          sourceNodeId: '',
          label: '动作演员',
          imageUrl: '',
          characterPreset: 'action-hero',
          characterColors: {
            skin: '#aa7755',
            outfit: '#112233',
            accent: '#ff6600',
            hair: '#111111',
          },
          x: 40,
          y: 70,
          depth: 70,
          scale: 110,
          rotation: 0,
        }),
        animationClip: 'run',
        animationSpeed: 1.25,
        animationLoop: false,
        rigPose: { rightElbow: -35 },
        motionPath: {
          type: 'line',
          width: 32,
          depthRange: 25,
          points: [
            { x: 40, depth: 70 },
            { x: 72, depth: 45 },
          ],
        },
      },
    ];

    const manifest = buildDirectorReferenceManifest(scene);
    const prompt = buildDirectorConstraintPrompt(scene);

    expect(manifest.map((item) => item.label)).toEqual([
      '3D动画关键帧1（0.0秒）',
      '3D动画关键帧2（3.0秒）',
      '3D动画关键帧3（6.6秒）',
    ]);
    expect(prompt).toContain('参考图3：3D动画关键帧3（6.6秒）');
    expect(prompt).toContain('服装#112233');
    expect(prompt).toContain('rightElbow-35°');
    expect(prompt).toContain('动画片段为动作跑步，速度1.25倍，只播放一次');
    expect(prompt).toContain('运动路径为直线，范围宽32% × 深25%');
    expect(prompt).toContain('人物根节点始终沿路径切线朝向前进');
    expect(prompt).toContain('面部、躯干与四肢始终统一朝向运动路径的前进切线');
    expect(prompt).toContain('包含2个连续路径点（40,70 → 72,45）');
  });

  it('omits obsolete free-form action and emotion prompts from the 3D contract only', () => {
    const spatialScene = createDefaultDirectorScene();
    spatialScene.stageMode = 'spatial';
    spatialScene.subjects = [
      {
        ...createDefaultDirectorSubject({
          id: 'actor',
          sourceNodeId: '',
          label: '演员',
          imageUrl: '',
          x: 50,
          y: 50,
          scale: 100,
          rotation: 0,
        }),
        action: '不应进入3D生成约束的旧动作提示',
        emotion: '不应进入3D生成约束的旧情绪提示',
      },
    ];

    const spatialPrompt = buildDirectorConstraintPrompt(spatialScene);
    expect(spatialPrompt).not.toContain('动作表演：');
    expect(spatialPrompt).not.toContain('情绪表演：');
    expect(spatialPrompt).not.toContain('不应进入3D生成约束的旧动作提示');
    expect(spatialPrompt).not.toContain('不应进入3D生成约束的旧情绪提示');

    const compositionScene = { ...spatialScene, stageMode: 'flat' as const };
    const compositionPrompt = buildDirectorConstraintPrompt(compositionScene);
    expect(compositionPrompt).toContain('动作表演：不应进入3D生成约束的旧动作提示');
    expect(compositionPrompt).toContain('情绪表演：不应进入3D生成约束的旧情绪提示');
  });
});
