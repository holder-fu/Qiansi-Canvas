# 画布风格目录

将一个或多个由 Qiansi-Canvas 导出的 `.zip` 画布风格包放在此目录。

然后打开“设置 → 外观 → 本地风格目录”，点击“刷新目录”，即可从列表中自由选择并导入。

此目录只用于风格包；应用不会执行 ZIP 中的脚本或任意 CSS。

内置示例 `Qiansi-macOS-Dark.zip` 可直接在列表中点击安装。1.1.0 版包含经过白名单校验的
macOS 深色窗口、红黄绿控制点、功能图标、风格库、节点、指令框、控件、边框与鼠标指针预设，
不会替换 Qiansi-Canvas 程序文件。

内置示例 `Qiansi-Dream-Pink.zip` 是全局“绯梦紫粉”风格，1.1.0 版使用低亮度灰紫画布与面板、
莓粉强调、柔和分层、圆角卡片、素材库与 3D 导演台适配。清单源文件为
`Qiansi-Dream-Pink.theme.json`，可在项目根目录用以下命令重新生成：

```powershell
node build-canvas-theme-package.mjs data/canvas-themes/Qiansi-Dream-Pink.theme.json data/canvas-themes/Qiansi-Dream-Pink.zip
```
