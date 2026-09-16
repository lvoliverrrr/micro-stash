#!/usr/bin/env bash
# PartVault · 电子元件收纳管理系统 —— Linux / macOS 启动脚本
set -euo pipefail

cd "$(dirname "$0")"

echo
echo "  =========================================================="
echo "    PartVault  ·  电子元件收纳管理系统"
echo "  =========================================================="
echo

# ---------- 1. 找 Node.js ----------
NODE_EXE="$(command -v node || true)"
if [ -z "$NODE_EXE" ]; then
  cat <<'EOF'
  [X] 没有找到 Node.js。
      请先安装 Node.js 22.5 或更高版本： https://nodejs.org/
      macOS 也可以：  brew install node
EOF
  exit 1
fi

# ---------- 2. 检查版本 >= 22.5 ----------
VER="$("$NODE_EXE" -v)"            # 形如 v22.22.2
MAJ="$(echo "$VER" | sed 's/^v//' | cut -d. -f1)"
MIN="$(echo "$VER" | sed 's/^v//' | cut -d. -f2)"
if [ "$MAJ" -lt 22 ] || { [ "$MAJ" -eq 22 ] && [ "$MIN" -lt 5 ]; }; then
  echo "  [X] Node.js 版本太低（当前 $VER），需要 >= 22.5（内置 node:sqlite）。"
  exit 1
fi

# ---------- 3. 数据目录 ----------
#  WSL 的 /mnt/c 与 \\wsl.localhost 走 9p，SQLite 拿不到文件锁；
#  这里默认放到用户 home 下，保证能锁能写。
if [ -z "${PV_DATA_DIR:-}" ]; then
  export PV_DATA_DIR="${HOME}/.partvault"
fi

echo "  Node.js   : $NODE_EXE ($VER)"
echo "  数据目录  : $PV_DATA_DIR"
echo
echo "  浏览器将自动打开 http://127.0.0.1:7788/"
echo "  想停止服务：按 Ctrl + C"
echo

exec "$NODE_EXE" --no-warnings "$(pwd)/server.js" --port 7788 --open
