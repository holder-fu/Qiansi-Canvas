#!/bin/zsh

set -eu

PROJECT_ROOT="${1:-}"
[[ -n "$PROJECT_ROOT" ]] || {
  printf '%s\n' 'Usage: install-portable-node-macos.zsh <project-root>' >&2
  exit 1
}

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd -P)"
NODE_VERSION='22.23.2'
MINIMUM_NODE_MAJOR=22
MINIMUM_NODE_MINOR=12
RUNTIME_ROOT="$PROJECT_ROOT/tools/runtime/node/macos"
RUNTIME_PARENT="${RUNTIME_ROOT:h}"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/qiansi-canvas-node.XXXXXX")"

cleanup() {
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT INT TERM

runtime_ready() {
  local root="$1"
  [[ -x "$root/bin/node" && -x "$root/bin/npm" ]] || return 1
  "$root/bin/node" -e "const [major,minor]=process.versions.node.split('.').map(Number); process.exit(major>${MINIMUM_NODE_MAJOR}||(major===${MINIMUM_NODE_MAJOR}&&minor>=${MINIMUM_NODE_MINOR})?0:1)"
}

if runtime_ready "$RUNTIME_ROOT"; then
  printf '%s\n' "$RUNTIME_ROOT"
  exit 0
fi

if [[ -e "$RUNTIME_ROOT" ]]; then
  printf '项目专用 Node.js 目录不完整：%s\n请只移除该运行环境目录后重新安装。\n' "$RUNTIME_ROOT" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) NODE_ARCH='arm64' ;;
  x86_64) NODE_ARCH='x64' ;;
  *)
    printf '不支持的 macOS 处理器架构：%s\n' "$(uname -m)" >&2
    exit 1
    ;;
esac

ARCHIVE_BASE="node-v${NODE_VERSION}-darwin-${NODE_ARCH}"
ARCHIVE_NAME="${ARCHIVE_BASE}.tar.gz"
RELEASE_ROOT="https://nodejs.org/download/release/v${NODE_VERSION}"
ARCHIVE_PATH="$TEMP_ROOT/$ARCHIVE_NAME"
CHECKSUMS_PATH="$TEMP_ROOT/SHASUMS256.txt"

command -v curl >/dev/null 2>&1 || {
  printf '%s\n' '系统未提供 curl，无法下载 Node.js。' >&2
  exit 1
}
command -v shasum >/dev/null 2>&1 || {
  printf '%s\n' '系统未提供 shasum，无法校验 Node.js。' >&2
  exit 1
}
command -v tar >/dev/null 2>&1 || {
  printf '%s\n' '系统未提供 tar，无法解压 Node.js。' >&2
  exit 1
}

printf '正在下载 Node.js %s（%s）…\n' "$NODE_VERSION" "$NODE_ARCH"
curl --fail --location --proto '=https' --tlsv1.2 \
  --output "$CHECKSUMS_PATH" "$RELEASE_ROOT/SHASUMS256.txt"
curl --fail --location --proto '=https' --tlsv1.2 \
  --output "$ARCHIVE_PATH" "$RELEASE_ROOT/$ARCHIVE_NAME"

EXPECTED_HASH="$(awk -v archive="$ARCHIVE_NAME" '$2 == archive { print $1; exit }' "$CHECKSUMS_PATH")"
[[ ${#EXPECTED_HASH} -eq 64 && "$EXPECTED_HASH" != *[^0-9a-fA-F]* ]] || {
  printf '官方校验清单中没有找到 %s。\n' "$ARCHIVE_NAME" >&2
  exit 1
}
ACTUAL_HASH="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{ print $1 }')"
[[ "${ACTUAL_HASH:l}" == "${EXPECTED_HASH:l}" ]] || {
  printf '%s\n' 'Node.js 下载文件的 SHA-256 校验失败。' >&2
  exit 1
}

tar -xzf "$ARCHIVE_PATH" -C "$TEMP_ROOT"
EXPANDED_ROOT="$TEMP_ROOT/$ARCHIVE_BASE"
runtime_ready "$EXPANDED_ROOT" || {
  printf '%s\n' '下载的 Node.js 运行环境不完整或版本过低。' >&2
  exit 1
}

mkdir -p "$RUNTIME_PARENT"
mv "$EXPANDED_ROOT" "$RUNTIME_ROOT"
runtime_ready "$RUNTIME_ROOT" || {
  printf '%s\n' '项目专用 Node.js 安装后验证失败。' >&2
  exit 1
}

printf '%s\n' "$RUNTIME_ROOT"
