import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Camera,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Image as ImageIcon,
  Move,
  Play,
  RotateCw,
  Save,
  Sparkles,
  Target,
  UserRound,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';

interface DirectorGuideModalProps {
  constraintPrompt: string;
  onClose: () => void;
}

const QUICK_STEPS = [
  {
    number: 1,
    title: '连接参考图片',
    detail: '在画布上把场景图、人物图连接到导演台左侧输入口。',
  },
  {
    number: 2,
    title: '指定场景和人物',
    detail: '在“素材”中把图片设为场景或人物，再从样板开始安排构图。',
  },
  {
    number: 3,
    title: '安排空间、表演与景深',
    detail: '可切换到 3D 预演，拖动人物站位与前后景深，并设置朝向、视线、动作和情绪。',
  },
  {
    number: 4,
    title: '设置镜头与时间轴',
    detail: '选择机位、运镜和时长，写清开始画面与结束画面。',
  },
  {
    number: 5,
    title: '导出最终视频节点',
    detail: '点击“导出到最终视频”自动创建并连好视频节点，再选择支持全能参考的模型生成。',
  },
];

function SectionTitle({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-6">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300/70">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-white/50">{detail}</p>
    </div>
  );
}

function DiagramNode({
  icon,
  title,
  detail,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  tone?: 'neutral' | 'sky' | 'violet';
}) {
  const toneClass =
    tone === 'sky'
      ? 'border-sky-300/30 bg-sky-400/10'
      : tone === 'violet'
        ? 'border-violet-300/25 bg-violet-400/10'
        : 'border-white/10 bg-white/[0.035]';
  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/25 text-white/75">
        {icon}
      </div>
      <div className="mt-3 text-sm font-medium text-white/85">{title}</div>
      <p className="mt-1 text-xs leading-5 text-white/40">{detail}</p>
    </div>
  );
}

function PersonGlyph({ color = '#67e8f9' }: { color?: string }) {
  return (
    <span className="relative block h-20 w-12" aria-hidden="true">
      <span
        className="absolute left-1/2 top-0 h-7 w-7 -translate-x-1/2 rounded-full border border-white/40"
        style={{ backgroundColor: `${color}66` }}
      />
      <span
        className="absolute bottom-0 left-1/2 h-14 w-10 -translate-x-1/2 rounded-t-full rounded-b-lg border border-white/40"
        style={{ backgroundColor: `${color}55` }}
      />
    </span>
  );
}

export function DirectorGuideModal({ constraintPrompt, onClose }: DirectorGuideModalProps) {
  return (
    <div
      className="fixed inset-0 z-[190] flex flex-col bg-[#0b0c0e] text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="director-guide-title"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#151619] px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <h1 id="director-guide-title" className="text-base font-semibold">
              导演台使用说明
            </h1>
            <p className="text-xs text-white/35">从人物素材到可提交的 AI 视频导演指令</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
          返回导演台
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <section className="overflow-hidden rounded-3xl border border-sky-300/20 bg-gradient-to-br from-sky-400/[0.11] via-[#161a20] to-violet-400/[0.08] p-8 md:p-10">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100/80">
                <Sparkles className="h-3.5 w-3.5" />
                Qiansi-Canvas AI 视频导演
              </span>
              <h2 className="mt-5 text-3xl font-semibold leading-tight text-white md:text-4xl">
                把“谁站在哪里、看向哪里、怎样运动”讲清楚
              </h2>
              <p className="mt-4 text-base leading-8 text-white/55">
                导演台负责把人物图片、场景位置、身体朝向、动作、镜头和时间轴整理成 AI
                更容易理解的构图控制图与结构化指令。切换到 3D
                预演后，还会保存景深与摄影机环绕参数；“导出到最终视频”会自动创建并连接下游视频节点，再由你选定的
                AI 视频模型执行。
              </p>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <DiagramNode
                icon={<ImageIcon className="h-5 w-5" />}
                title="构图控制图"
                detail="把人物站位、大小、场景物件和镜头构图压成一张清晰的布局图。"
                tone="sky"
              />
              <DiagramNode
                icon={<UserRound className="h-5 w-5" />}
                title="编号参考图"
                detail="每个人物按顺序编号，让模型知道人物1、人物2分别对应哪张图片。"
                tone="violet"
              />
              <DiagramNode
                icon={<Clapperboard className="h-5 w-5" />}
                title="3D 导演约束"
                detail="把位置、景深、摄影机参数、朝向、动作、情绪、运镜和首尾画面组合成可提交的文字约束。"
              />
            </div>
          </section>

          <section className="mt-14">
            <SectionTitle
              eyebrow="Quick start"
              title="第一次使用，按这五步完成"
              detail="每一步都对应导演台中的真实区域。设置会自动保存；需要创建可生成的下游节点时，点击“导出到最终视频”。"
            />
            <div className="grid gap-3 lg:grid-cols-5">
              {QUICK_STEPS.map((step) => (
                <article
                  key={step.number}
                  className="rounded-2xl border border-white/10 bg-[#17191d] p-4"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 text-sm font-semibold text-sky-100">
                    {step.number}
                  </span>
                  <h3 className="mt-4 text-sm font-medium text-white/85">{step.title}</h3>
                  <p className="mt-2 text-xs leading-6 text-white/40">{step.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-14 rounded-3xl border border-white/10 bg-[#15171b] p-6 md:p-8">
            <SectionTitle
              eyebrow="Step 1"
              title="先在无限画布中建立正确的连接关系"
              detail="人物、场景仍然是普通图片节点。连接线告诉导演台哪些图片可以被选择；导演台的输出再连接到视频节点。"
            />
            <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_0.8fr_auto_1fr]">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <DiagramNode
                  icon={<ImageIcon className="h-5 w-5" />}
                  title="场景图"
                  detail="教室、街道或房间"
                />
                <DiagramNode
                  icon={<UserRound className="h-5 w-5" />}
                  title="人物 1"
                  detail="保持身份与服装"
                />
                <DiagramNode
                  icon={<UserRound className="h-5 w-5" />}
                  title="人物 2"
                  detail="可连接多个人物"
                />
              </div>
              <ArrowRight className="mx-auto hidden h-7 w-7 text-sky-300/55 lg:block" />
              <DiagramNode
                icon={<Clapperboard className="h-6 w-6" />}
                title="导演台"
                detail="安排空间、人物、镜头和时间轴"
                tone="sky"
              />
              <ArrowRight className="mx-auto hidden h-7 w-7 text-sky-300/55 lg:block" />
              <DiagramNode
                icon={<Video className="h-6 w-6" />}
                title="视频节点"
                detail="选择支持全能参考或多图参考的视频模型"
                tone="violet"
              />
            </div>
            <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-400/[0.055] px-4 py-3 text-sm leading-6 text-amber-100/65">
              连接图片只是把素材交给导演台，还需要在左侧“素材”中明确指定哪张是场景、哪张是人物。
            </div>
          </section>

          <section className="mt-14 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-3xl border border-white/10 bg-[#15171b] p-6 md:p-8">
              <SectionTitle
                eyebrow="Step 2 · Example"
                title="教室场景应该怎样设置"
                detail="先登记空间里的固定结构和道具，再让人物明确朝向某个已登记目标。这样比只写“人物在教室里”更容易稳定站位。"
              />
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/15 bg-[#111820]">
                <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(56,189,248,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.25)_1px,transparent_1px)] [background-size:64px_48px]" />
                <div className="absolute left-1/2 top-5 w-1/2 -translate-x-1/2 rounded-lg border border-amber-300/55 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-100/80">
                  黑板 · 后景中央
                </div>
                <div className="absolute bottom-5 left-[12%] right-[12%] grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((desk) => (
                    <div
                      key={desk}
                      className="rounded-md border border-white/15 bg-white/[0.055] py-3 text-center text-xs text-white/35"
                    >
                      书桌 {desk}
                    </div>
                  ))}
                </div>
                <div className="absolute left-1/2 top-[43%] flex -translate-x-1/2 flex-col items-center">
                  <ArrowDown className="mb-1 h-6 w-6 rotate-180 text-sky-300" />
                  <PersonGlyph />
                  <span className="mt-1 rounded-md bg-sky-400/15 px-2 py-1 text-xs text-sky-100/80">
                    学生 · 身体朝向黑板
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-[#17191d] p-6 md:p-8">
              <h3 className="text-lg font-semibold text-white">教室案例填写表</h3>
              <div className="mt-5 space-y-3 text-sm">
                {[
                  ['场景名称', '高中教室'],
                  ['固定结构', '黑板：后景中央'],
                  ['家具', '书桌：前景与中景'],
                  ['桌面内容', '课本、笔记本、铅笔、文具盒'],
                  ['人物站位', '画面中央、中景'],
                  ['身体目标', '黑板'],
                  ['人物朝向', '背面 180°（镜头位于人物身后）'],
                  ['动作', '站在书桌旁，抬头看黑板并记笔记'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[88px_1fr] gap-3 rounded-xl border border-white/8 bg-black/15 px-3 py-2.5"
                  >
                    <span className="text-white/35">{label}</span>
                    <span className="leading-6 text-white/70">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-14 rounded-3xl border border-white/10 bg-[#15171b] p-6 md:p-8">
            <SectionTitle
              eyebrow="Step 3"
              title="人物站位、朝向和表演分别控制什么"
              detail="先在中间画面点选人物，再到右侧调整。每个人物都有独立设置，双人或群像时不要把多人动作写在同一个人物里。"
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DiagramNode
                icon={<Move className="h-5 w-5" />}
                title="左右 / 前后位置"
                detail="直接拖动人物，或用滑杆精调。前后位置同时决定画面层级与遮挡关系。"
                tone="sky"
              />
              <DiagramNode
                icon={<ZoomIn className="h-5 w-5" />}
                title="人物大小"
                detail="控制人物在构图中的占比，不等同于人物真实身高。近景人物通常更大。"
              />
              <DiagramNode
                icon={<RotateCw className="h-5 w-5" />}
                title="人物朝向角度"
                detail="0° 正面、-90° 左侧、90° 右侧、±180° 背面；预设按钮和滑杆会同步。"
                tone="violet"
              />
              <DiagramNode
                icon={<Target className="h-5 w-5" />}
                title="身体与视线目标"
                detail="身体可以朝向黑板，头部和视线可以看向老师、门口或镜头，三者不要混写。"
              />
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                ['人物动作', '先停下脚步，再转身抬手指向门外。'],
                ['表情与情绪', '警惕但克制，眉头轻皱，呼吸逐渐急促。'],
                ['移动方式', '原地表演、向左/右移动、走向镜头或向场景深处移动。'],
              ].map(([title, example]) => (
                <div key={title} className="rounded-xl border border-white/10 bg-black/15 p-4">
                  <div className="text-sm font-medium text-white/75">{title}</div>
                  <p className="mt-2 text-sm leading-6 text-white/40">例：{example}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-14 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-[#15171b] p-6 md:p-8">
              <SectionTitle
                eyebrow="Step 4"
                title="用镜头和时间轴描述变化"
                detail="视频模型更容易执行有起点和终点的动作。不要只写“人物很紧张”，要写清镜头怎样运动、人物从什么状态变成什么状态。"
              />
              <div className="rounded-2xl border border-white/10 bg-[#101318] p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200">
                    <Camera className="h-6 w-6" />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-white/80">正面中景 · 缓慢推近</div>
                    <div className="mt-1 text-xs text-white/35">速度：缓慢 · 时长：5 秒</div>
                  </div>
                  <ArrowRight className="ml-auto h-6 w-6 text-violet-300/55" />
                </div>
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex items-center gap-2 text-xs text-sky-200/70">
                      <Play className="h-3.5 w-3.5" />0 秒
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/55">学生背对镜头，看向黑板。</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-white/25" />
                  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex items-center gap-2 text-xs text-violet-200/70">
                      <Clock3 className="h-3.5 w-3.5" />5 秒
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      学生转头看向门口，镜头停在近景。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#15171b] p-6 md:p-8">
              <SectionTitle
                eyebrow="Step 5"
                title="自动保存与“应用到画布”不是一回事"
                detail="导演台的输入设置会自动保存。应用按钮负责重新生成要交给视频模型的控制材料，并把新结果传给已连接节点。"
              />
              <div className="space-y-4">
                <div className="flex gap-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.06] p-4">
                  <Save className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" />
                  <div>
                    <div className="text-sm font-medium text-emerald-100/85">自动保存</div>
                    <p className="mt-1 text-sm leading-6 text-white/45">
                      站位、物件、动作、角度、镜头和时间轴会实时保存到本机；关闭或刷新前还会再强制保存一次。
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] p-4">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-sky-300" />
                  <div>
                    <div className="text-sm font-medium text-sky-100/85">应用到画布</div>
                    <p className="mt-1 text-sm leading-6 text-white/45">
                      更新构图控制图、参考图编号和导演指令，并把最新内容传播到下游视频节点。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-14 rounded-3xl border border-white/10 bg-[#15171b] p-6 md:p-8">
            <SectionTitle
              eyebrow="AI handoff"
              title="导演台最终会提交怎样的内容"
              detail="下面是当前导演台设置生成的结构化指令预览。它会随着你的场景、人物和镜头设置自动变化。"
            />
            <details className="rounded-2xl border border-white/10 bg-[#0d0f12] p-4" open>
              <summary className="cursor-pointer select-none text-sm font-medium text-white/70">
                查看当前导演指令
              </summary>
              <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 p-4 text-xs leading-6 text-white/45">
                {constraintPrompt}
              </pre>
            </details>
          </section>

          <section className="mt-14 mb-6">
            <SectionTitle
              eyebrow="Tips"
              title="提高生成稳定性的四条原则"
              detail="导演台能降低人物乱出、站位漂移和动作含糊，但最终精度仍取决于视频模型的参考图能力。"
            />
            <div className="grid gap-3 md:grid-cols-2">
              {[
                [
                  '模型要选对',
                  '优先选择“全能参考 / 多模态视频”模型。普通文生视频通常不能稳定保持人物身份。',
                ],
                [
                  '不要写冲突指令',
                  '例如身体朝向黑板，同时又要求身体正对镜头，会让模型随机选择其中一个要求。',
                ],
                ['动作按时间顺序写', '使用“先……再……最后……”描述连续动作，比堆叠形容词更容易执行。'],
                [
                  '关键限制写进禁止事项',
                  '明确禁止新增人物、交换身份、改变服装、瞬移和无关镜头切换。',
                ],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-[#17191d] p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300/75" />
                    {title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/40">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
