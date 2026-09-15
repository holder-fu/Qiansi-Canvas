#!/bin/zsh

set -u

REPAIR_MODE=0
if [[ "${1:-}" == "--repair" ]]; then
  REPAIR_MODE=1
fi

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h:h}"
MINIMUM_NODE_VERSION='22.12.0'
cd "$PROJECT_ROOT" || exit 1

pause_terminal() {
  if (( REPAIR_MODE )); then
    return
  fi
  printf '\n按回车键关闭窗口…'
  read -r _ </dev/tty || true
}

fail() {
  printf '\n安装未完成：%s\n' "$1"
  pause_terminal
  exit 1
}

printf '%s\n' '============================================================'
printf '%s\n' '  Qiansi-Canvas macOS 安装程序'
printf '%s\n' '============================================================'
printf '\n'

activate_project_node() {
  if [[ -x "$PROJECT_ROOT/tools/runtime/node/macos/bin/node" ]]; then
    export PATH="$PROJECT_ROOT/tools/runtime/node/macos/bin:$PATH"
  fi
}

node_runtime_ready() {
  command -v node >/dev/null 2>&1 || return 1
  command -v npm >/dev/null 2>&1 || return 1
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'
}

activate_project_node
if ! node_runtime_ready; then
  printf '[1/4] 未检测到 Node.js %s+，正在准备项目专用运行环境…\n' "$MINIMUM_NODE_VERSION"
  zsh "$PROJECT_ROOT/scripts/install-portable-node-macos.zsh" "$PROJECT_ROOT" || fail 'Node.js 自动下载、校验或安装失败。'
  activate_project_node
  node_runtime_ready || fail '项目专用 Node.js 已安装，但无法正常启动。'
else
  printf '%s\n' '[1/4] Node.js 运行环境已就绪。'
fi

NODE_VERSION="$(node -p 'process.versions.node')"
printf '正在使用 Node.js %s。\n' "$NODE_VERSION"

export npm_config_cache="$PROJECT_ROOT/tools/cache/npm"
mkdir -p "$npm_config_cache" || fail '无法创建 tools/cache/npm 依赖缓存目录。'
printf '%s\n' '[2/4] 正在安装项目依赖…'
npm ci --ignore-scripts --no-audit --no-fund --prefer-offline || fail 'npm 依赖安装失败，请检查网络和终端错误信息。'

printf '\n%s\n' '[3/4] 正在生成可直接启动的画布页面…'
npm run build || fail '项目构建失败，请检查上面的错误信息。'

printf '\n%s\n' '[4/4] 正在设置 macOS 启动脚本权限…'
chmod +x \
  "$PROJECT_ROOT/Qiansi-Canvas-macOS.command" \
  "$SCRIPT_DIR/安装Qiansi-Canvas-macOS.command" \
  "$SCRIPT_DIR/打开Qiansi-Canvas-macOS.command" \
  "$SCRIPT_DIR/启动Qiansi-Canvas-macOS.command" \
  "$SCRIPT_DIR/安装CLI工具-macOS.command" 2>/dev/null || true

# 从网络下载的 .command 会被 macOS 打上隔离标志，双击会被 Gatekeeper 拦下。
# 去掉隔离属性，保证双击即可启动（属性不存在时静默忽略）。
xattr -d com.apple.quarantine \
  "$PROJECT_ROOT/Qiansi-Canvas-macOS.command" \
  "$SCRIPT_DIR/安装Qiansi-Canvas-macOS.command" \
  "$SCRIPT_DIR/打开Qiansi-Canvas-macOS.command" \
  "$SCRIPT_DIR/启动Qiansi-Canvas-macOS.command" \
  "$SCRIPT_DIR/安装CLI工具-macOS.command" 2>/dev/null || true

printf '\n%s\n' 'Qiansi-Canvas 已安装完成。'
printf '%s\n' '以后双击“Qiansi-Canvas-macOS.command”即可进入启动中心。'
if (( REPAIR_MODE )); then
  printf '%s\n' '启动中心修复已成功完成。'
  exit 0
fi
printf '\n'
read -r "INSTALL_CLI?是否现在安装或更新 AI CLI 工具？[y/N] " </dev/tty || INSTALL_CLI='n'
if [[ "$INSTALL_CLI" == [Yy] ]]; then
  zsh "$SCRIPT_DIR/安装CLI工具-macOS.command" --no-pause
fi

pause_terminal
