#!/bin/zsh

set -u
set -o pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h:h}"
cd "$PROJECT_ROOT" || exit 1
CLI_TARGET="${1:-}"
NO_PAUSE="${2:-}"
if [[ "$CLI_TARGET" == '--no-pause' ]]; then
  NO_PAUSE='--no-pause'
  CLI_TARGET=''
fi

if [[ -x "$PROJECT_ROOT/tools/runtime/node/macos/bin/node" ]]; then
  export PATH="$PROJECT_ROOT/tools/runtime/node/macos/bin:$PATH"
fi
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
export npm_config_cache="$PROJECT_ROOT/tools/cache/npm"

pause_terminal() {
  [[ "$NO_PAUSE" == '--no-pause' ]] && return
  printf '\n按回车键关闭窗口…'
  read -r _ </dev/tty || true
}

fail() {
  printf '\nCLI 安装未完成：%s\n' "$1"
  pause_terminal
  exit 1
}

require_base_tools() {
  command -v node >/dev/null 2>&1 || fail '未检测到 Node.js 22.12.0+。'
  command -v npm >/dev/null 2>&1 || fail '未检测到 npm。'
  command -v curl >/dev/null 2>&1 || fail '未检测到 curl。'
}

verify_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$2 安装完成，但终端中找不到命令“$1”。请重新打开终端后检查 PATH。"
  "$1" --version || fail "$2 已安装，但无法正常启动。"
}

verify_volcengine() {
  command -v arkcli >/dev/null 2>&1 || fail 'Ark CLI 安装完成，但终端中找不到命令“arkcli”。请重新打开终端后检查 PATH。'
  arkcli --version || fail 'Ark CLI 已安装，但 arkcli --version 无法正常运行。'
}

install_volcengine() {
  printf '%s\n' '正在安装火山方舟官方 npm 包 @volcengine/ark-cli。'
  printf '%s\n' 'Qiansi-Canvas 不镜像也不维护 Ark CLI 软件包。'
  npm install --global @volcengine/ark-cli@latest || fail 'Ark CLI 安装失败。'
  verify_volcengine
  printf '%s\n' '山火 CLI（火山方舟官方 Ark CLI）安装成功。'
  printf '%s\n' '登录：arkcli auth login volc-sso'
  printf '%s\n' '验证身份：arkcli auth status'
  printf '%s\n' '登录与安装相互独立；未登录不会导致版本验证失败。'
}

install_codex() {
  npm install --global @openai/codex@latest || fail 'Codex CLI 安装失败。'
  verify_command codex 'Codex CLI'
  read -r "LOGIN_CODEX?是否现在登录 Codex？[y/N] " </dev/tty || LOGIN_CODEX='n'
  [[ "$LOGIN_CODEX" == [Yy] ]] && codex login
}

install_antigravity() {
  local installer
  installer="$(mktemp "${TMPDIR:-/tmp}/qiansi-antigravity.XXXXXX")" || fail '无法创建临时安装文件。'
  curl --fail --location --proto '=https' \
    --output "$installer" 'https://antigravity.google/cli/install.sh' || fail 'Antigravity CLI 安装器下载失败。'
  chmod 600 "$installer"
  printf '%s\n' '安全门禁：远程安装器已下载，但不会自动执行。'
  printf '文件：%s\nSHA-256：' "$installer"
  shasum -a 256 "$installer" || true
  printf '%s\n' '请先检查脚本内容并与官方发布的校验值核对；确认可信后再手动执行。'
  printf '%s\n' 'Antigravity CLI 尚未安装。'
  return 0
}

install_gemini() {
  npm install --global @google/gemini-cli@latest || fail 'Gemini CLI 安装失败。'
  verify_command gemini 'Gemini CLI'
  printf '%s\n' '运行 gemini 可完成账号登录。'
}

install_dreamina() {
  local installer
  installer="$(mktemp "${TMPDIR:-/tmp}/qiansi-dreamina.XXXXXX")" || fail '无法创建临时安装文件。'
  curl --fail --location --proto '=https' \
    --output "$installer" 'https://jimeng.jianying.com/cli' || fail 'Dreamina CLI 安装器下载失败。'
  chmod 600 "$installer"
  printf '%s\n' '安全门禁：远程安装器已下载，但不会自动执行。'
  printf '文件：%s\nSHA-256：' "$installer"
  shasum -a 256 "$installer" || true
  printf '%s\n' '项目未内置官方固定哈希；请先检查脚本并从即梦官方渠道核验，再手动执行。'
  printf '%s\n' 'Dreamina / 即梦 CLI 尚未安装。'
  return 0
}

install_workbuddy() {
  npm install --global @tencent-ai/codebuddy-code@latest || fail 'WorkBuddy CLI 安装失败。'
  if command -v codebuddy >/dev/null 2>&1; then
    codebuddy --version || fail 'WorkBuddy CLI 已安装，但无法正常启动。'
  elif command -v cbc >/dev/null 2>&1; then
    cbc --version || fail 'WorkBuddy CLI 已安装，但无法正常启动。'
  else
    fail 'WorkBuddy CLI 安装完成，但找不到 codebuddy 或 cbc 命令。'
  fi
  printf '%s\n' '运行 codebuddy 可完成账号登录。'
}

install_bailian() {
  npm install --global bailian-cli || fail '百炼 CLI 安装失败。'
  if command -v bl >/dev/null 2>&1; then
    bl --version || fail '百炼 CLI 已安装，但无法正常启动。'
  elif command -v bailian >/dev/null 2>&1; then
    bailian --version || fail '百炼 CLI 已安装，但无法正常启动。'
  else
    fail '百炼 CLI 安装完成，但找不到 bl 或 bailian 命令。'
  fi
  printf '%s\n' '运行 bl auth login --console 可完成账号登录。'
}

install_all() {
  install_volcengine
  install_codex
  install_antigravity
  install_gemini
  install_dreamina
  install_workbuddy
  install_bailian
}

require_base_tools

case "$CLI_TARGET" in
  --arkcli|--volcengine) install_volcengine; pause_terminal; exit 0 ;;
  --codex) install_codex; pause_terminal; exit 0 ;;
  --gemini) install_gemini; pause_terminal; exit 0 ;;
  '') ;;
  *) fail '不支持的 CLI 安装目标。' ;;
esac

printf '%s\n' '============================================================'
printf '%s\n' '  Qiansi-Canvas macOS CLI 工具安装器'
printf '%s\n' '============================================================'
printf '%s\n' '  [1] 山火 CLI（火山方舟官方 Ark CLI）'
printf '%s\n' '  [2] 安装或更新 OpenAI Codex CLI'
printf '%s\n' '  [3] 下载 Google Antigravity 官方安装器（需人工核验）'
printf '%s\n' '  [4] 安装或更新 Gemini CLI'
printf '%s\n' '  [5] 下载 Dreamina / 即梦安装器（需人工核验）'
printf '%s\n' '  [6] 安装或更新 WorkBuddy CLI'
printf '%s\n' '  [7] 安装或更新阿里云百炼 CLI'
printf '%s\n' '  [8] 安装可验证的 CLI，并下载需人工核验的安装器'
printf '%s\n' '  [0] 退出'
printf '\n'
read -r "CLI_CHOICE?请选择：[0-8] " </dev/tty || CLI_CHOICE='0'

case "$CLI_CHOICE" in
  1) install_volcengine ;;
  2) install_codex ;;
  3) install_antigravity ;;
  4) install_gemini ;;
  5) install_dreamina ;;
  6) install_workbuddy ;;
  7) install_bailian ;;
  8) install_all ;;
  0) ;;
  *) fail '选项无效，请重新运行安装器。' ;;
esac

printf '\n%s\n' 'CLI 工具处理完成。启动 Qiansi-Canvas 后可在“设置 → AI 模型与 API”中检查状态。'
pause_terminal
