import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  ManagedMotionWorkerPool,
  normalizeManagedMotionCaptureResult,
  resolveManagedMotionAdapter,
} from './managed-motion-worker.mjs';

function landmark(index = 0) {
  return { x: index / 200, y: index / 250, z: index / 300, visibility: 0.9 };
}

function fixtureResult(engineId = 'gem-x') {
  const jointCount = engineId === 'gem-x' ? 77 : 133;
  return {
    schemaVersion: 1,
    engineId,
    model: engineId,
    skeleton: engineId === 'gem-x' ? 'qiansi-soma-77' : 'qiansi-coco-wholebody-133',
    jointCount,
    sampleFps: 10,
    frames: [
      {
        timestampMs: 0,
        people: [
          {
            trackId: 1,
            confidence: 0.9,
            landmarks: Array.from({ length: jointCount }, (_, index) => landmark(index)),
            worldLandmarks: Array.from({ length: jointCount }, (_, index) => landmark(index)),
          },
        ],
      },
    ],
  };
}

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.exitCode = null;
    this.killed = false;
  }

  kill() {
    this.killed = true;
    this.exitCode = 1;
    this.emit('exit', 1);
  }
}

test('motion worker result validation keeps the canonical 33-point prefix and native extension', () => {
  const fixture = {
    ...fixtureResult('rtmw3d'),
    coordinateConvention: 'qiansi-camera-relative-y-down-v1',
    landmarkConvention: 'qiansi-screen-normalized-v1',
  };
  const value = normalizeManagedMotionCaptureResult(fixture, {
    engineId: 'rtmw3d',
    maxPoses: 2,
  });
  assert.equal(value.frames[0].people[0].landmarks.length, 133);
  assert.equal(value.frames[0].people[0].landmarks.slice(0, 33).length, 33);
  assert.equal(value.frames[0].confidence, 0.9);
  assert.equal(value.coordinateConvention, 'qiansi-camera-relative-y-down-v1');
  assert.equal(value.landmarkConvention, 'qiansi-screen-normalized-v1');
  assert.throws(
    () =>
      normalizeManagedMotionCaptureResult(
        { ...fixtureResult('gem-x'), jointCount: 33 },
        { engineId: 'gem-x', maxPoses: 1 },
      ),
    /关节点数量/,
  );
});

test('motion adapter resolution rejects a non-canonical plugin directory', () => {
  assert.throws(
    () =>
      resolveManagedMotionAdapter('gem-x', {
        projectRoot: 'C:\\fixture',
        pluginRoot: 'C:\\fixture\\data\\plugins\\other-plugin',
        platform: 'win32',
      }),
    /受信任/,
  );
});

test('motion adapter trust follows the configured Canvas plugin data root', () => {
  assert.throws(
    () =>
      resolveManagedMotionAdapter('gem-x', {
        projectRoot: 'C:\\application',
        pluginsRoot: 'D:\\canvas-data\\plugins',
        pluginRoot: 'C:\\application\\data\\plugins\\qiansi-motion-capture',
        platform: 'win32',
      }),
    /受信任/,
  );
  assert.throws(
    () =>
      resolveManagedMotionAdapter('gem-x', {
        projectRoot: 'C:\\application',
        pluginsRoot: 'D:\\canvas-data\\plugins',
        pluginRoot: 'D:\\canvas-data\\plugins\\qiansi-motion-capture',
        platform: 'win32',
      }),
    /Worker 未安装/,
  );
});

test('motion video upload header is allowed through the development CORS boundary', async () => {
  const bridgeSource = await readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8');
  assert.match(bridgeSource, /Access-Control-Allow-Headers[\s\S]{0,800}X-Qiansi-Motion-File-Name/);
});

test('RTMW3D sequentially decodes sampled frames without random MP4 seeking', async () => {
  const adapterSource = await readFile(
    new URL(
      './data/plugins/qiansi-motion-capture/worker/adapters/rtmw3d_adapter.py',
      import.meta.url,
    ),
    'utf8',
  );
  const commonSource = await readFile(
    new URL(
      './data/plugins/qiansi-motion-capture/worker/adapters/motion_common.py',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(adapterSource, /sampled_video_frames\(\s*video, cv2, args\.sample_fps/);
  assert.doesNotMatch(adapterSource, /CAP_PROP_POS_FRAMES/);
  assert.match(adapterSource, /predicted\.transformed_keypoints/);
  assert.match(adapterSource, /converted = -centered\[:, \[0, 2, 1\]\] \* scale/);
  assert.doesNotMatch(adapterSource, /screen = points\.copy\(\)/);
  assert.match(adapterSource, /"landmarkConvention": SCREEN_COORDINATE_CONVENTION/);
  assert.match(commonSource, /def sampled_video_frames\(/);
  assert.match(commonSource, /supports containers whose frame-count metadata is missing/);
});

test('motion worker reports health, completes a bounded job and returns validated frames', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'qiansi-motion-worker-test-'));
  const pluginRoot = join(projectRoot, 'data', 'plugins', 'qiansi-motion-capture');
  const adapter = {
    engineId: 'gem-x',
    label: 'GEM-X fixture',
    jointCount: 77,
    skeleton: 'qiansi-soma-77',
    command: 'fixture-python',
    adapterPath: 'fixture-adapter.py',
    runtimeRoot: projectRoot,
    modelPath: 'fixture-model.ckpt',
    detectorPath: '',
    cwd: projectRoot,
    env: {},
  };
  let captureArgs = [];
  const spawnImpl = (_command, args) => {
    const child = new FakeChild();
    setTimeout(async () => {
      if (args.includes('--probe')) {
        child.stdout.write(
          'QIMC_RESULT {"ready":true,"backend":"fixture CUDA","message":"ready"}\n',
        );
      } else {
        captureArgs = [...args];
        const outputPath = args[args.indexOf('--output') + 1];
        await writeFile(outputPath, JSON.stringify(fixtureResult('gem-x')));
        child.stdout.write(
          'QIMC_PROGRESS {"phase":"inference","message":"working","progress":80,"completedFrames":1,"totalFrames":1}\n',
        );
      }
      child.stdout.end();
      child.stderr.end();
      child.exitCode = 0;
      child.emit('exit', 0);
    }, 5);
    return child;
  };
  const pool = new ManagedMotionWorkerPool({
    projectRoot,
    pluginRoot,
    resolveAdapter: () => adapter,
    spawnImpl,
  });
  try {
    assert.equal((await pool.probe('gem-x')).available, true);
    const started = await pool.startCapture('gem-x', {
      bytes: Buffer.from('video fixture'),
      fileName: 'fixture.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 1,
      width: 1280,
      height: 720,
      sampleFps: 10,
      maxPoses: 1,
      confidenceThreshold: 0.4,
      smoothing: 0.65,
      staticCamera: true,
      detectionThreshold: 0.3,
      trackingMethod: 'iou',
      trackingThreshold: 0.3,
    });
    let status = pool.status(started.jobId);
    for (let attempt = 0; attempt < 50 && status.status !== 'done'; attempt += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
      status = pool.status(started.jobId);
    }
    assert.equal(status.status, 'done');
    assert.equal(pool.result(started.jobId).frames[0].people[0].landmarks.length, 77);
    assert.ok(captureArgs.includes('--static-camera'));
    assert.throws(() => pool.status(started.jobId, 'rtmw3d'), /引擎不匹配/);
  } finally {
    await pool.stopAll();
    await rm(projectRoot, { recursive: true, force: true });
  }
});
