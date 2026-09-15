import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, FolderTree, Puzzle, ShieldCheck } from 'lucide-react';
import { useAppTranslation } from '../i18n/appI18n';

const NODE_EXAMPLE = `{
  "schemaVersion": 2,
  "id": "my-runtime-tools",
  "name": "我的可编程工具",
  "version": "1.0.0",
  "author": "你的名字",
  "description": "自定义节点、右键菜单和画布面板。",
  "engine": { "qiansiCanvas": ">=0.0.0" },
  "runtime": { "entry": "runtime.js", "apiVersion": 2 },
  "permissions": [
    "canvas:update-own-node",
    "canvas:add-node",
    "canvas:create-project-graph",
    "canvas:notify",
    "storage:project-documents",
    "storage:shared-style-covers",
    "models:use-text",
    "models:use-media",
    "media:transform"
  ],
  "contributes": {
    "nodes": [
      {
        "id": "custom-workbench",
        "label": "自定义工作台",
        "description": "在隔离沙箱中运行自定义界面。",
        "accent": "#22d3ee",
        "input": "any",
        "output": "any",
        "hostKind": "plugin",
        "renderer": "sandbox",
        "view": "node-workbench",
        "width": 420,
        "height": 280
      }
    ],
    "menus": [
      {
        "id": "add-workbench",
        "label": "添加自定义工作台",
        "location": "canvas",
        "action": { "type": "add-node", "nodeId": "custom-workbench" }
      }
    ]
  }
}`;

const RUNTIME_EXAMPLE = `const root = document.getElementById('root');
root.innerHTML = \`
  <main style="padding:16px">
    <h3>API v2 项目工作台</h3>
    <textarea id="prompt" style="width:100%;height:100px"></textarea>
    <button id="preview">生成预览</button>
    <button id="deliver">生成并交付到新画布</button>
    <pre id="output"></pre>
  </main>\`;

document.getElementById('preview').onclick = async () => {
  const [model] = await qiansi.listManagedTextModels();
  if (!model) throw new Error('请先在画布 API 设置中启用文本模型');
  const result = await qiansi.runManagedTextModel({
    providerId: model.providerId,
    model: model.model,
    operation: 'screenplay_preview',
    prompt: document.getElementById('prompt').value,
    maxLength: 8000
  });
  const current = await qiansi.readProjectDocument('screenplay-draft');
  await qiansi.writeProjectDocument(
    'screenplay-draft',
    { text: result.text, approved: false },
    current?.revision
  );
  document.getElementById('output').textContent = result.text;
};

document.getElementById('deliver').onclick = async () => {
  const draft = await qiansi.readProjectDocument('screenplay-draft');
  if (!draft) throw new Error('请先生成并确认预览');
  await qiansi.createProjectGraph({
    applicationId: 'screenplay-draft-v' + draft.revision,
    name: '插件交付项目',
    nodes: [{
      clientId: 'screenplay',
      kind: 'text',
      position: { x: 0, y: 0 },
      data: { title: '总剧本', outputText: draft.value.text }
    }],
    edges: []
  });
};`;

const PET_EXAMPLE = `{
  "schemaVersion": 1,
  "id": "my-canvas-pet",
  "name": "我的画布宠物",
  "version": "1.0.0",
  "author": "你的名字",
  "description": "显示在画布右下角的创作伙伴。",
  "engine": { "qiansiCanvas": ">=0.0.0" },
  "contributes": {
    "widgets": [
      {
        "id": "my-pet",
        "type": "pet",
        "label": "创作伙伴",
        "description": "陪伴用户创作。",
        "asset": "pet.png",
        "position": "bottom-right",
        "width": 150,
        "message": "今天也一起创作吧！"
      }
    ]
  }
}`;

function HelpCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
      <h4 className="text-[13px] font-semibold text-white/80">{title}</h4>
      <div className="mt-3 text-[12px] leading-6 text-white/50">{children}</div>
    </section>
  );
}

function CodeExample({
  title,
  code,
  copied,
  onCopy,
}: {
  title: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const { t } = useAppTranslation();

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#101013]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
        <span className="text-[12px] font-medium text-white/65">{title}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white/80"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? t('guide.plugin.copy.success') : t('guide.plugin.copy.code')}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-4 text-[11px] leading-5 text-sky-100/65">
        <code>{code}</code>
      </pre>
    </section>
  );
}

export function PluginDeveloperHelp({ pluginDirectory }: { pluginDirectory: string }) {
  const { t } = useAppTranslation();
  const [copied, setCopied] = useState<'node' | 'runtime' | 'pet' | null>(null);
  const [copyError, setCopyError] = useState(false);

  const copyExample = async (kind: 'node' | 'runtime' | 'pet', code: string) => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.025] p-5">
      <div>
        <div className="flex items-center gap-2 text-emerald-300/80">
          <Puzzle className="h-4 w-4" />
          <h3 className="text-[15px] font-semibold">{t('guide.plugin.title')}</h3>
        </div>
        <p className="mt-2 max-w-3xl text-[12px] leading-6 text-white/45">
          {t('guide.plugin.description')}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <HelpCard title={t('guide.plugin.purpose.title')}>
          <ul className="space-y-1.5">
            <li>• {t('guide.plugin.purpose.customNodes')}</li>
            <li>• {t('guide.plugin.purpose.canvasCommands')}</li>
            <li>• {t('guide.plugin.purpose.layoutPanels')}</li>
            <li>• {t('guide.plugin.purpose.petWidget')}</li>
            <li>• {t('guide.plugin.purpose.share')}</li>
            <li>• {t('guide.plugin.purpose.toggle')}</li>
          </ul>
        </HelpCard>
        <HelpCard title={t('guide.plugin.capabilities.title')}>
          <ul className="space-y-1.5">
            <li>• {t('guide.plugin.capabilities.hostNodes')}</li>
            <li>• {t('guide.plugin.capabilities.directorNodes')}</li>
            <li>• {t('guide.plugin.capabilities.interfaces')}</li>
            <li>• {t('guide.plugin.capabilities.ports')}</li>
            <li>• {t('guide.plugin.capabilities.petAssets')}</li>
            <li>• {t('guide.plugin.capabilities.management')}</li>
          </ul>
        </HelpCard>
        <HelpCard title={t('guide.plugin.security.title')}>
          <ul className="space-y-1.5">
            <li>• {t('guide.plugin.security.noSecrets')}</li>
            <li>• {t('guide.plugin.security.noSystemAccess')}</li>
            <li>• {t('guide.plugin.security.noCoreOverwrite')}</li>
            <li>• {t('guide.plugin.security.allowlistOnly')}</li>
          </ul>
        </HelpCard>
      </div>

      <HelpCard title="Runtime API v2：项目文档、受管模型与最终建图">
        <ul className="space-y-1.5">
          <li>
            • <code className="text-sky-200/70">storage:project-documents</code>{' '}
            提供按当前插件＋iframe 启动时来源项目隔离的 read／write／delete；切换活动项目不会把旧
            iframe 重定向到新项目，写入和删除可用 <code className="text-sky-200/70">revision</code>{' '}
            防止覆盖并发修改。
          </li>
          <li>
            • <code className="text-sky-200/70">models:use-text</code> 只能 list／run
            宿主已启用的文本模型；API Key、认证头和连接密钥不会暴露给插件。
          </li>
          <li>
            • <code className="text-sky-200/70">storage:shared-style-covers</code> 只允许按受限
            style-id 读写插件自己的 WebP 封面；宿主生成固定目录、校验内容哈希并用 revision
            防止跨页面覆盖，插件不能提交磁盘路径。
          </li>
          <li>
            • <code className="text-sky-200/70">models:use-media</code> 只返回当前 iframe 会话的
            opaque mediaId；图片可另取当前会话可撤销的 WebP 缩略图 blob 地址，但原始图片／视频
            URL、字节、密钥与任意端点不进入沙箱。下载、参考图解析和最终建图都由宿主按插件
            ID＋session 复核，旧会话 ID 必须重新生成。
          </li>
          <li>
            • <code className="text-sky-200/70">media:transform</code> 允许插件把当前会话的受管
            视频交给宿主截取首帧或末帧；只返回新的图片 mediaId，不返回视频地址、像素字节或本地路径。
          </li>
          <li>
            • <code className="text-sky-200/70">canvas:create-project-graph</code>{' '}
            只能由最终“生成并交付”按钮显式触发，不得在加载、自动保存、预览或模型返回后自动调用。
          </li>
          <li>
            • 请求必须带稳定的 <code className="text-sky-200/70">applicationId</code>
            ；宿主按 iframe 会话绑定的来源项目保存 pending／applied／failed 收据，建图切换项目后旧
            iframe 也不会改绑。applied 返回原收据，pending 拒绝重复执行；只有确认项目创建尚未开始的
            failed 才能在明确设置 <code className="text-sky-200/70">retryFailed: true</code>{' '}
            才能重试。
          </li>
          <li>
            • 首次建图会创建并打开新项目，不改写来源项目；上限为 240 个节点、480 条连线和 4 MiB
            UTF-8 节点图，且不会自动运行模型。
          </li>
        </ul>
      </HelpCard>

      <HelpCard title={t('guide.plugin.create.title')}>
        <ol className="grid gap-3 md:grid-cols-2">
          <li>
            <b className="text-white/70">{t('guide.plugin.create.directory.label')}</b>
            {t('guide.plugin.create.directory.description')}
          </li>
          <li>
            <b className="text-white/70">{t('guide.plugin.create.manifest.label')}</b>
            {t('guide.plugin.create.manifest.description')}
          </li>
          <li>
            <b className="text-white/70">{t('guide.plugin.create.features.label')}</b>
            {t('guide.plugin.create.features.description')}
          </li>
          <li>
            <b className="text-white/70">{t('guide.plugin.create.runtime.label')}</b>
            {t('guide.plugin.create.runtime.description')}
          </li>
          <li>
            <b className="text-white/70">{t('guide.plugin.create.refresh.label')}</b>
            {t('guide.plugin.create.refresh.description')}
          </li>
          <li>
            <b className="text-white/70">{t('guide.plugin.create.authorization.label')}</b>
            {t('guide.plugin.create.authorization.description')}
          </li>
        </ol>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <FolderTree className="mt-0.5 h-4 w-4 shrink-0 text-sky-300/70" />
          <div>
            <p className="text-[11px] text-white/40">{t('guide.plugin.localDirectory')}</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-sky-100/60">
              {pluginDirectory}
            </p>
          </div>
        </div>
      </HelpCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <CodeExample
          title={t('guide.plugin.example.manifest')}
          code={NODE_EXAMPLE}
          copied={copied === 'node'}
          onCopy={() => void copyExample('node', NODE_EXAMPLE)}
        />
        <CodeExample
          title={t('guide.plugin.example.runtime')}
          code={RUNTIME_EXAMPLE}
          copied={copied === 'runtime'}
          onCopy={() => void copyExample('runtime', RUNTIME_EXAMPLE)}
        />
        <CodeExample
          title={t('guide.plugin.example.pet')}
          code={PET_EXAMPLE}
          copied={copied === 'pet'}
          onCopy={() => void copyExample('pet', PET_EXAMPLE)}
        />
      </div>

      {copyError && (
        <p className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[11px] text-rose-200/70">
          {t('guide.plugin.copy.error')}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <HelpCard title={t('guide.plugin.requirements.title')}>
          <ul className="space-y-1.5">
            <li>• {t('guide.plugin.requirements.schema')}</li>
            <li>• {t('guide.plugin.requirements.ids')}</li>
            <li>• {t('guide.plugin.requirements.accent')}</li>
            <li>• {t('guide.plugin.requirements.limits')}</li>
            <li>• {t('guide.plugin.requirements.pet')}</li>
          </ul>
        </HelpCard>
        <HelpCard title={t('guide.plugin.install.title')}>
          <ul className="space-y-1.5">
            <li>• {t('guide.plugin.install.selectFiles')}</li>
            <li>• {t('guide.plugin.install.authorization')}</li>
            <li>• {t('guide.plugin.install.refresh')}</li>
            <li>• {t('guide.plugin.install.disable')}</li>
            <li>• {t('guide.plugin.install.crossDevice')}</li>
          </ul>
        </HelpCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-[11px] leading-5 text-emerald-100/55">
            {t('guide.plugin.safetyAdvice')}
          </p>
        </div>
        <div className="flex gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[11px] leading-5 text-amber-100/55">{t('guide.plugin.warning')}</p>
        </div>
      </div>
    </div>
  );
}
