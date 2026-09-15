export interface CameraPreset {
  id: string;
  title: string;
  category: string;
  prompt: string;
  tags: string[];
  thumbnail: string;
}

export const CAMERA_CATEGORIES = [
  '基础运镜',
  '变焦',
  '旋转',
  '视角',
  '航拍',
  '手持',
  '表情',
  '打斗',
];

type PreviewScene = 'portrait' | 'expression' | 'fight';

function portraitScene(subjectX: number, scale: number) {
  return `<g transform="translate(${subjectX} 18) scale(${scale})">
    <ellipse cx="60" cy="39" rx="18" ry="22" fill="#cbd7dc"/>
    <path d="M35 116 Q39 61 60 59 Q84 62 89 116Z" fill="#8295a1"/>
    <path d="M45 70 L31 114 M76 70 L98 112" stroke="#9fb0b9" stroke-width="9" stroke-linecap="round"/>
    <path d="M48 116 L43 158 M77 116 L84 158" stroke="#60717b" stroke-width="11" stroke-linecap="round"/>
    <path d="M49 35 Q59 22 73 35" stroke="#dfe9ec" stroke-width="4" fill="none"/>
  </g>`;
}

function expressionScene(variant: number, accent: string) {
  const mouth = variant % 2 === 0 ? 'M132 120 Q160 138 188 120' : 'M137 125 Q160 113 183 125';
  return `<g>
    <path d="M74 174 Q72 52 160 22 Q248 52 246 174Z" fill="#151c27"/>
    <ellipse cx="160" cy="96" rx="68" ry="78" fill="#b9c7cc"/>
    <path d="M92 86 Q106 22 160 19 Q218 26 229 86 Q201 55 171 53 Q123 51 92 86Z" fill="#e9edf0"/>
    <path d="M116 84 Q132 74 147 84 M173 84 Q190 74 205 84" stroke="#263843" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="133" cy="91" rx="6" ry="8" fill="${accent}"/><ellipse cx="188" cy="91" rx="6" ry="8" fill="${accent}"/>
    <path d="${mouth}" stroke="#7c3b4d" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M153 95 Q158 110 150 114" stroke="#78909a" stroke-width="3" fill="none"/>
    <rect x="102" y="72" width="116" height="40" rx="17" fill="none" stroke="${accent}" stroke-width="2" opacity=".45"/>
  </g>`;
}

function fightScene(variant: number, accent: string) {
  const mirrored = variant % 2 ? -1 : 1;
  return `<g>
    <g transform="translate(68 34) rotate(${-8 * mirrored} 50 70)">
      <circle cx="50" cy="28" r="15" fill="#c8d4d8"/>
      <path d="M32 96 Q34 45 50 43 Q71 46 73 96Z" fill="#3f7187"/>
      <path d="M42 55 L${mirrored > 0 ? 91 : 8} 83 M61 55 L${mirrored > 0 ? 20 : 102} 73" stroke="#9db2bb" stroke-width="8" stroke-linecap="round"/>
      <path d="M42 94 L26 139 M62 94 L82 139" stroke="#506873" stroke-width="10" stroke-linecap="round"/>
    </g>
    <g transform="translate(181 39) rotate(${9 * mirrored} 36 67)">
      <circle cx="36" cy="25" r="14" fill="#d8c8c5"/>
      <path d="M19 92 Q20 43 36 40 Q57 42 61 92Z" fill="#7b405a"/>
      <path d="M28 52 L${mirrored > 0 ? -16 : 77} 79 M48 52 L${mirrored > 0 ? 79 : -7} 69" stroke="#bda7ab" stroke-width="8" stroke-linecap="round"/>
      <path d="M28 90 L16 137 M48 90 L66 137" stroke="#714455" stroke-width="10" stroke-linecap="round"/>
    </g>
    <path d="M106 96 Q160 45 219 96" stroke="${accent}" stroke-width="5" fill="none" opacity=".85"/>
    <path d="M123 104 L199 80" stroke="#fff" stroke-width="2" opacity=".65"/>
    <circle cx="161" cy="91" r="16" fill="none" stroke="${accent}" stroke-width="3" opacity=".55"/>
  </g>`;
}

function cameraThumbnail(variant: number, previewScene: PreviewScene = 'portrait'): string {
  const subjectX = [100, 78, 118, 100][variant % 4] ?? 100;
  const scale = [1, 1.18, 0.82, 1.05][variant % 4] ?? 1;
  const horizon = [90, 82, 104][variant % 3] ?? 90;
  const accent = ['#31d5d1', '#ff4f87', '#7c8dff'][variant % 3] ?? '#31d5d1';
  const subject =
    previewScene === 'expression'
      ? expressionScene(variant, accent)
      : previewScene === 'fight'
        ? fightScene(variant, accent)
        : portraitScene(subjectX, scale);
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#172839"/><stop offset="1" stop-color="#081017"/></linearGradient><linearGradient id="road" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17242b"/><stop offset="1" stop-color="#080b0e"/></linearGradient></defs>
      <rect width="320" height="180" fill="url(#sky)"/><rect y="${horizon}" width="320" height="${180 - horizon}" fill="url(#road)"/>
      <g opacity=".75"><rect x="12" y="30" width="48" height="92" fill="#101b23"/><rect x="260" y="20" width="50" height="106" fill="#101922"/><rect x="22" y="45" width="4" height="34" fill="${accent}"/><rect x="286" y="34" width="3" height="45" fill="#ff315e"/></g>
      <path d="M0 180 L126 ${horizon} M320 180 L194 ${horizon}" stroke="#4d7078" stroke-width="1" opacity=".45"/>
      ${subject}
    </svg>`,
  )}`;
}

function preset(
  id: string,
  title: string,
  category: string,
  prompt: string,
  variant: number,
  previewScene: PreviewScene = 'portrait',
): CameraPreset {
  return {
    id,
    title,
    category,
    prompt,
    tags: [category, title],
    thumbnail: cameraThumbnail(variant, previewScene),
  };
}

export const CAMERA_PRESETS: CameraPreset[] = [
  preset(
    'camera-push-in',
    '镜头前推',
    '基础运镜',
    '镜头稳定向主体前推，逐渐缩短景别并强化主体情绪。',
    0,
  ),
  preset(
    'camera-pull-out',
    '镜头后移',
    '基础运镜',
    '镜头从主体平稳后移，逐步揭示人物所处环境与空间关系。',
    1,
  ),
  preset(
    'camera-zoom-in',
    '变焦推进',
    '变焦',
    '保持机位不动并缓慢拉长焦距，让主体在画面中持续放大。',
    2,
  ),
  preset(
    'camera-zoom-out',
    '变焦拉远',
    '变焦',
    '保持机位不动并缓慢缩短焦距，扩大视野并展示周围环境。',
    3,
  ),
  preset(
    'camera-dolly-zoom',
    '柯克变焦',
    '变焦',
    '镜头后移同时拉长焦距，保持主体大小并制造背景空间压缩感。',
    4,
  ),
  preset('camera-orbit', '环绕拍摄', '旋转', '镜头围绕主体平滑环绕，保持主体位于画面视觉中心。', 5),
  preset('camera-roll', '滚筒旋转', '旋转', '镜头沿光轴平滑滚转，形成强烈的旋转视觉与失重感。', 6),
  preset('camera-pov', '第一视角', '视角', '使用人物第一视角观察场景，运动与人物行动保持同步。', 7),
  preset('camera-drone', '无人机', '航拍', '无人机镜头平稳穿越场景，以高机位展示宏观空间。', 8),
  preset(
    'camera-aerial',
    '高空俯拍',
    '航拍',
    '镜头从高空垂直或大角度俯拍，突出场景结构与人物位置。',
    9,
  ),
  preset(
    'camera-handheld',
    '手持拍摄',
    '手持',
    '使用克制的手持摄影晃动和跟随感，增强现场感与呼吸感。',
    10,
  ),
  preset(
    'camera-pan-horizontal',
    '横向摇摄',
    '基础运镜',
    '摄影机在固定机位上水平摇摄，平稳展示横向环境并跟随主体移动。',
    11,
  ),
  preset(
    'camera-crane',
    '升降镜头',
    '基础运镜',
    '摄影机从低位平稳升高，逐渐揭示人物与场景的纵深关系。',
    12,
  ),
  preset(
    'camera-tracking',
    '平移跟拍',
    '基础运镜',
    '摄影机与移动主体保持平行速度横向跟拍，主体构图稳定，背景产生视差。',
    13,
  ),
  preset(
    'camera-fly-through',
    '穿越推进',
    '视角',
    '镜头快速而平滑地穿过前景物体向场景深处推进，制造强烈空间纵深。',
    14,
  ),
  preset(
    'camera-expression-close',
    '表情特写',
    '表情',
    '切入面部特写并保持镜头稳定，清晰捕捉眼神、嘴角和细微表情变化。',
    15,
    'expression',
  ),
  preset(
    'camera-emotion-push',
    '情绪推近',
    '表情',
    '在人物情绪发生变化时缓慢推近面部，从中景过渡到近景以强化情绪。',
    16,
    'expression',
  ),
  preset(
    'camera-eye-focus',
    '眼神追焦',
    '表情',
    '焦点从面部平滑转移到双眼并轻微推近，突出眼神方向和情绪信息。',
    17,
    'expression',
  ),
  preset(
    'camera-reaction-snap',
    '反应急推',
    '表情',
    '在人物出现惊讶或强烈反应的瞬间快速推近，随后短暂停稳。',
    18,
    'expression',
  ),
  preset(
    'camera-fight-follow',
    '打斗跟拍',
    '打斗',
    '手持摄影机紧跟交战双方移动，保持主要攻击动作清晰并带有适度现场晃动。',
    19,
    'fight',
  ),
  preset(
    'camera-impact-shake',
    '冲击震动',
    '打斗',
    '在拳脚或武器命中的瞬间加入短促镜头震动和轻微快速推近，强化冲击力。',
    20,
    'fight',
  ),
  preset(
    'camera-whip-chase',
    '甩镜追击',
    '打斗',
    '使用快速甩镜从攻击者切换到闪避或反击者，短暂运动模糊后迅速锁定主体。',
    21,
    'fight',
  ),
  preset(
    'camera-duel-orbit',
    '环绕对决',
    '打斗',
    '镜头围绕交战双方快速环绕，维持两人空间关系并增强对峙张力。',
    22,
    'fight',
  ),
  preset(
    'camera-dodge-track',
    '闪避追焦',
    '打斗',
    '镜头跟随人物闪避方向快速横移，持续追焦并在动作结束时平稳停住。',
    23,
    'fight',
  ),
  preset(
    'camera-low-rush',
    '低机位冲刺',
    '打斗',
    '使用贴近地面的低机位快速向前跟随冲刺人物，突出速度、力量与压迫感。',
    24,
    'fight',
  ),
];
