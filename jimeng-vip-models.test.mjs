import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  JIMENG_VIP_VIDEO_MODELS,
  inspectDreaminaVipAccess,
  jimengVideoModelsForVipAccess,
} from './src/lib/jimengCliContract.mjs';

test('Dreamina treats its empty vip_level as a verified non-VIP account', () => {
  assert.equal(inspectDreaminaVipAccess({ total_credit: 10, vip_level: '' }), false);
  assert.equal(inspectDreaminaVipAccess({ data: { vip_level: '0' } }), false);
  assert.equal(inspectDreaminaVipAccess({ result: { vip_level: 'non_vip' } }), false);
});

test('Dreamina accepts populated VIP levels without depending on one vendor spelling', () => {
  assert.equal(inspectDreaminaVipAccess({ vip_level: 'vip' }), true);
  assert.equal(inspectDreaminaVipAccess({ vip_level: 'SVIP-2' }), true);
  assert.equal(inspectDreaminaVipAccess({ vip_level: '3' }), true);
  assert.equal(inspectDreaminaVipAccess({ vip_level: 2 }), true);
  assert.equal(inspectDreaminaVipAccess({ vip_level: true }), true);
});

test('older Dreamina responses without vip_level remain unknown and are not accepted as VIP', () => {
  assert.equal(typeof inspectDreaminaVipAccess({ total_credit: 10 }), 'undefined');
  assert.equal(typeof inspectDreaminaVipAccess({ vip_level: { tier: 1 } }), 'undefined');
  assert.equal(typeof inspectDreaminaVipAccess({ vip_level: 'member' }), 'undefined');
});

test('only verified VIP accounts receive Dreamina video models', () => {
  assert.deepEqual(jimengVideoModelsForVipAccess(false), []);
  assert.deepEqual(jimengVideoModelsForVipAccess(), []);
  assert.deepEqual(jimengVideoModelsForVipAccess(true).slice(0, 3), JIMENG_VIP_VIDEO_MODELS);
});

test('Bridge publishes the account-filtered Jimeng catalog to health and v1 models', async () => {
  const source = await readFile(new URL('./local-bridge.mjs', import.meta.url), 'utf8');
  assert.match(source, /const hasVipAccess = inspectDreaminaVipAccess\(credit\.raw\)/);
  assert.match(source, /const ready = hasVipAccess === true/);
  assert.match(source, /models: jimengModels\(value\.hasVipAccess\)/);
  assert.match(source, /image: hasVipAccess === true \? \[\.\.\.JIMENG_IMAGE_MODELS\] : \[\]/);
  assert.match(source, /for \(const model of jimeng\.models\?\.video \|\| \[\]\)/);
  assert.doesNotMatch(source, /for \(const model of JIMENG_VIDEO_MODELS\)/);
});
