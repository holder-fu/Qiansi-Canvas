import { describe, expect, it } from 'vitest';
import agentChatPanelSource from './AgentChatPanel.tsx?raw';
import agentPacksSource from '../i18n/agentPacks.ts?raw';

describe('AI Skill library suggestions', () => {
  it('hides the redundant header and consolidates file, ZIP, and folder imports', () => {
    expect(agentChatPanelSource).not.toContain("t('agent.skills.local', '本地 Skills')");
    expect(agentChatPanelSource).not.toContain("t('agent.skills.import', '导入 SKILL.md')");
    expect(agentChatPanelSource).toContain(
      "t('agent.skills.importFileOrZip', '导入 Skill 文件/ZIP')",
    );
    expect(agentChatPanelSource).toContain("t('agent.skills.importFolder', '导入 Skill 文件夹')");
    expect(agentChatPanelSource).toContain("t('agent.skills.importLocal', '导入本地 Skill')");
    expect(agentChatPanelSource).toContain('const [showSkillImportMenu, setShowSkillImportMenu]');
    expect(agentChatPanelSource.match(/<ToolButton\s+icon=\{<PackageOpen/g)).toHaveLength(1);
    expect(agentChatPanelSource).toContain('parseLocalCanvasSkillArchive(');
    expect(agentChatPanelSource).toContain('parseLocalCanvasSkillFolder(files)');
    expect(agentChatPanelSource).toContain("node?.setAttribute('webkitdirectory', '')");
  });

  it('keeps multiple active Skills and schedules a bounded request-specific subset', () => {
    expect(agentChatPanelSource).toContain('const [activeSkillIds, setActiveSkillIds]');
    expect(agentChatPanelSource).toContain('scheduleLocalCanvasSkills(');
    expect(agentChatPanelSource).toContain('activeSkills.length');
    expect(agentPacksSource).toContain("'agent.skills.activeMany':");
  });

  it('removes voice input and lets users re-enable previously imported packages', () => {
    expect(agentChatPanelSource).not.toContain('SpeechRecognition');
    expect(agentChatPanelSource).not.toContain('<Mic');
    expect(agentChatPanelSource).not.toContain('agent.voice.');
    expect(agentChatPanelSource).toContain('groupLocalCanvasSkills(localSkills)');
    expect(agentChatPanelSource).toContain("t('agent.skills.chooseSaved', '选择已导入 Skill')");
    expect(agentPacksSource).not.toContain("'agent.voice.");
  });

  it('does not subscribe to or recommend the Style Library inside AI Skill', () => {
    expect(agentChatPanelSource).not.toContain("useUserLibrary('style')");
    expect(agentChatPanelSource).not.toContain('STYLE_PRESETS');
    expect(agentChatPanelSource).not.toContain("kind: 'style'");
    expect(agentChatPanelSource).not.toContain('id: `style:${preset.id}`');
  });

  it('retains character and prompt recommendation sources in both languages', () => {
    expect(agentChatPanelSource).toContain("useUserLibrary('character')");
    expect(agentChatPanelSource).toContain('CHARACTER_PRESETS.filter');
    expect(agentChatPanelSource).toContain('promptItems.map');
    expect(agentChatPanelSource).toContain('resolveCharacterTurnaroundCoverSource(');
    expect(agentChatPanelSource).toContain('resolveUserLibraryThumbnail(');
    expect(agentPacksSource).toContain("'agent.library.heading': '角色库 · 提示词库'");
    expect(agentPacksSource).toContain("'agent.library.heading': 'Character · Prompt libraries'");
  });
});

describe('LAN asset attachments', () => {
  it('normalizes asset previews and attachment URLs through the active Bridge', () => {
    expect(agentChatPanelSource).toContain(
      "import { resolveMediaSourceUrl } from '../lib/mediaPreview';",
    );
    expect(agentChatPanelSource).toContain('.map(resolveMediaSourceUrl)');
    expect(agentChatPanelSource).toContain('asset.previewUrl ||');
    expect(agentChatPanelSource).toContain('resolveMediaSourceUrl(thumbnailSource)');
  });
});
