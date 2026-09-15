import { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { Modal } from './Modal';
import { useCanvasStore } from '../store/canvasStore';

const LINKS = [
  { label: '新手教程', action: 'tutorial' },
  { label: '快捷键说明', action: 'shortcuts' },
  { label: '常见问题', action: 'support' },
  { label: '意见反馈（本机草稿）', action: 'feedback' },
];

type SubPage = 'tutorial' | 'support' | 'feedback' | null;

export function HelpModal() {
  const openModal = useCanvasStore((s) => s.openModal);
  const closeModal = useCanvasStore((s) => s.closeModal);
  const setOpenModal = useCanvasStore((s) => s.setOpenModal);

  const [subPage, setSubPage] = useState<SubPage>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackSaveError, setFeedbackSaveError] = useState<string | null>(null);

  const handleClose = () => {
    setSubPage(null);
    setFeedback('');
    setFeedbackSaved(false);
    setFeedbackSaveError(null);
    closeModal();
  };

  const handleBack = () => {
    setSubPage(null);
    setFeedback('');
    setFeedbackSaved(false);
    setFeedbackSaveError(null);
  };

  const handleSaveFeedbackDraft = () => {
    if (!feedback.trim()) return;
    // Persist feedback to localStorage so it survives refresh
    try {
      const storageKey = 'kitty-canvas-feedbacks';
      const raw =
        localStorage.getItem(storageKey) ?? localStorage.getItem('libtv-feedbacks') ?? '[]';
      const parsed: unknown = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      list.push({ text: feedback.trim(), time: Date.now() });
      localStorage.setItem(storageKey, JSON.stringify(list.slice(-50)));
      setFeedbackSaveError(null);
      setFeedbackSaved(true);
    } catch {
      setFeedbackSaveError('浏览器本地存储不可用，草稿尚未保存。请复制内容后再重试。');
    }
  };

  const renderMainMenu = () => (
    <>
      <p className="text-xs leading-relaxed text-white/50">
        Qiansi-Canvas AI 创作工作台支持通过无限画布连接各类 AI
        生成节点。从文本、图片、音频到视频，拖拽连线即可构建你的工作流。
      </p>
      <div className="space-y-1">
        {LINKS.map((link) => (
          <button
            key={link.label}
            type="button"
            onClick={() => {
              if (link.action === 'shortcuts') {
                setOpenModal('shortcuts');
              } else {
                setSubPage(link.action as SubPage);
              }
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/5"
          >
            {link.label}
          </button>
        ))}
      </div>
    </>
  );

  const renderTutorial = () => (
    <>
      <button
        type="button"
        onClick={handleBack}
        className="mb-3 flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回
      </button>
      <div className="space-y-3 text-sm text-white/75 leading-relaxed">
        <h4 className="font-medium text-white/90">快速上手</h4>
        <ol className="list-decimal space-y-2 pl-4 text-white/60">
          <li>
            <span className="text-white/80">双击画布</span>{' '}
            或右键选择节点类型，创建你的第一个生成节点。
          </li>
          <li>
            <span className="text-white/80">拖拽节点底部的连接点</span>{' '}
            到另一个节点，建立数据流管线。
          </li>
          <li>
            <span className="text-white/80">选中节点</span>，在下方浮窗中输入指令（如
            "生成一张赛博朋克风格的城市"），按 Ctrl+Enter 发送。
          </li>
          <li>
            生成结果会自动更新到节点中，并通过连线{' '}
            <span className="text-white/80">传递到下游节点</span>。
          </li>
          <li>
            使用 <span className="text-white/80">风格库 / 特效库 / 角色库</span> 快速应用预设模板。
          </li>
        </ol>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300/80">
          提示：选中节点后，点击底部 Settings
          图标可进入参数配置面板，调整画质、分辨率、生成模式等高级选项。
        </div>
      </div>
    </>
  );

  const renderSupport = () => (
    <>
      <button
        type="button"
        onClick={handleBack}
        className="mb-3 flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回
      </button>
      <div className="space-y-3 text-sm text-white/70 leading-relaxed">
        <h4 className="font-medium text-white/90">常见问题</h4>
        <div className="space-y-2">
          {[
            { q: '如何创建节点？', a: '双击画布空白处，或右键选择「添加节点」' },
            { q: '如何连接节点？', a: '鼠标悬停节点边缘，拖拽 + 号连线到目标节点' },
            { q: '如何生成内容？', a: '选中节点后在浮窗输入指令，按 Ctrl+Enter 发送' },
            { q: '如何撤销操作？', a: '点击顶部撤销按钮，或按 Ctrl+Z' },
            { q: '节点太多如何查找？', a: '使用左下角搜索按钮，按标题/类型/提示词搜索' },
          ].map((faq) => (
            <details
              key={faq.q}
              className="group rounded-lg border border-white/[0.06] bg-white/[0.03]"
            >
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-white/80 hover:text-white">
                {faq.q}
              </summary>
              <p className="px-3 pb-2.5 text-xs text-white/50 leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-white/40">
          <p>当前版本未配置在线客服或反馈接收通道；「意见反馈」只保存本机草稿。</p>
        </div>
      </div>
    </>
  );

  const renderFeedback = () => (
    <>
      <button
        type="button"
        onClick={handleBack}
        className="mb-3 flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回
      </button>
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white/90">意见反馈</h4>
        {feedbackSaved ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center text-sm text-emerald-300/80">
            草稿已保存在当前浏览器中，尚未发送给任何人。
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100/70">
              当前版本没有在线反馈后端。这里仅保存本机草稿，不会上传，也不会产生客服回复。
            </div>
            <textarea
              value={feedback}
              maxLength={5000}
              onChange={(e) => {
                setFeedback(e.target.value);
                setFeedbackSaveError(null);
              }}
              placeholder="请描述您遇到的问题或建议…"
              rows={4}
              className="w-full resize-none rounded-lg border border-white/[0.06] bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/25 outline-none focus:border-emerald-500/30"
            />
            {feedbackSaveError && (
              <p role="alert" className="text-xs leading-relaxed text-rose-300/80">
                {feedbackSaveError}
              </p>
            )}
            <button
              type="button"
              onClick={handleSaveFeedbackDraft}
              disabled={!feedback.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/15 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Save className="h-3.5 w-3.5" />
              保存本机草稿
            </button>
          </>
        )}
      </div>
    </>
  );

  const renderContent = () => {
    switch (subPage) {
      case 'tutorial':
        return renderTutorial();
      case 'support':
        return renderSupport();
      case 'feedback':
        return renderFeedback();
      default:
        return renderMainMenu();
    }
  };

  const titleMap: Record<string, string> = {
    tutorial: '新手教程',
    support: '常见问题',
    feedback: '意见反馈（本机草稿）',
  };

  return (
    <Modal
      open={openModal === 'help'}
      onClose={handleClose}
      title={titleMap[subPage ?? ''] || '帮助'}
      width="w-[420px]"
    >
      <div className="flex flex-col gap-3 p-5">{renderContent()}</div>
    </Modal>
  );
}
