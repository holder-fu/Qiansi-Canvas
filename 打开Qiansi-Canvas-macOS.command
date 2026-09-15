#!/bin/zsh

set -u

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="$SCRIPT_DIR"
NODE="$PROJECT_ROOT/tools/runtime/node/macos/bin/node"
cd "$PROJECT_ROOT" || exit 1

pause_terminal() {
  printf '\n按回车键关闭窗口…'
  read -r _ </dev/tty || true
}

fail() {
  printf '\n启动失败：%s\n' "$1"
  pause_terminal
  exit 1
}

if [[ ! -x "$NODE" ]]; then
  if [[ -f "$PROJECT_ROOT/portable-release.json" ]]; then
    fail '绿色运行环境缺失，请重新获取适合当前 Mac 架构的完整安装包。'
  fi
  NODE="$(command -v node || true)"
  [[ -n "$NODE" ]] || fail '源码目录未检测到 Node.js，请先运行安装程序。'
fi

"$NODE" -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)' || fail '需要 Node.js 22.12.0 或更高版本。'
[[ -f "$PROJECT_ROOT/qiansi-launcher.mjs" ]] || fail '缺少 Qiansi-Canvas 启动中心。'

"$NODE" "$PROJECT_ROOT/qiansi-launcher.mjs"
RESULT=$?
if (( RESULT != 0 )); then
  printf '\nQiansi-Canvas 已停止（退出码：%s）。\n' "$RESULT"
  pause_terminal
fi
exit "$RESULT"
