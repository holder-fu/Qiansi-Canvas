import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

describe('Windows development launcher LAN access', () => {
  it('opts the ordinary Windows launcher into trusted direct LAN mode', () => {
    const launcher = read('qiansi-launcher.mjs');
    expect(launcher).toContain("environment.QIANSI_CANVAS_LAN = '1'");
    expect(launcher).toContain("environment.QIANSI_CANVAS_TRUSTED_LAN || '1'");
    expect(launcher).toContain("environment.QIANSI_CANVAS_HOST || '0.0.0.0'");
  });

  it('opts the interactive development launcher into trusted direct LAN mode', () => {
    const launcher = read('tools/launchers/启动开发模式.bat');
    expect(launcher).toContain('if not defined QIANSI_CANVAS_LAN set "QIANSI_CANVAS_LAN=1"');
    expect(launcher).toContain(
      'if not defined QIANSI_CANVAS_TRUSTED_LAN set "QIANSI_CANVAS_TRUSTED_LAN=1"',
    );
    expect(launcher).toContain('LAN access: trusted direct mode');
    expect(launcher).toContain('LAN access: enabled with pairing protection');
  });

  it('keeps direct development-server use local unless LAN is explicitly requested', () => {
    const server = read('dev-server.mjs');
    expect(server).toContain("process.env.QIANSI_CANVAS_LAN === '1'");
    expect(server).toContain('const LAN_ACTIVE =');
    expect(server).toContain('process.env.QIANSI_CANVAS_TRUSTED_LAN');
    expect(server).toContain('createBridgeAccessToken');
    expect(server).toContain('QIANSI_CANVAS_ACCESS_TOKEN: DEVELOPMENT_ACCESS_TOKEN');
    expect(server).toContain("QIANSI_CANVAS_TRUSTED_LAN: TRUSTED_LAN ? '1' : '0'");
    expect(server).toContain('QIANSI_CANVAS_PAIR_RETURN_PORT: String(WEB_PORT)');
    expect(server).toContain("QIANSI_CANVAS_DEV_BRIDGE_PROXY: '1'");
    expect(server).toContain('DEVELOPMENT_BRIDGE_PROXY_PREFIX');
    expect(server).toContain(
      'VITE_QIANSI_CANVAS_BRIDGE_URL: `http://${urlHost(HOST)}:${WEB_PORT}${DEVELOPMENT_BRIDGE_PROXY_PREFIX}`',
    );
    expect(server).toContain('局域网一键配对并进入画布');
    expect(server).toContain('/?qiansi_pair=${DEVELOPMENT_ACCESS_TOKEN}');
    expect(server).toContain("LAN_REQUESTED ? '0.0.0.0' : LOOPBACK_HOST");
    expect(server).toContain('可信局域网直连已启用');
    expect(server).toContain('QIANSI_CANVAS_ALLOWED_ORIGINS');
  });
});
