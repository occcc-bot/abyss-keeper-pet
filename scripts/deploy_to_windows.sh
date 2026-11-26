#!/usr/bin/env bash
# ==============================================================================
# deploy_to_windows.sh — 将 WSL2 交叉编译产出的原生 keeper-pet.exe 同步至 Windows 本地目录
# 用法:
#   ./scripts/deploy_to_windows.sh           # 同步部署至 Windows AppData\Local\KeeperPet\
#   ./scripts/deploy_to_windows.sh --launch  # 同步后直接从 WSL 拉起 Windows 桌面宠物预览
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXE_SRC="$ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/keeper-pet.exe"

if [ ! -f "$EXE_SRC" ]; then
  echo "[deploy_to_windows] 未找到 $EXE_SRC，请先运行 npm run build:win !" >&2
  exit 1
fi

# 自动探测 Windows 用户名（排除系统目录）
WIN_USER="${WIN_USER:-}"
if [ -z "$WIN_USER" ]; then
  for d in /mnt/c/Users/*; do
    base="$(basename "$d")"
    case "$base" in
      Public|Default|"Default User"|"All Users"|TEMP|desktop.ini|CodexSandboxOffline) continue ;;
      *)
        if [ -d "$d/AppData/Local" ]; then
          WIN_USER="$base"
          break
        fi
        ;;
    esac
  done
fi

if [ -z "$WIN_USER" ]; then
  echo "[deploy_to_windows] 无法自动识别 Windows 用户目录，请显式传入 WIN_USER=<你的Windows用户名>。" >&2
  exit 1
fi

DEST_DIR="/mnt/c/Users/$WIN_USER/AppData/Local/KeeperPet"
mkdir -p "$DEST_DIR"
cp -f "$EXE_SRC" "$DEST_DIR/keeper-pet.exe"

cat > "$DEST_DIR/启动深渊饲主魔王城.bat" <<'EOF'
@echo off
cd /d "%~dp0"
start "" "%~dp0keeper-pet.exe"
EOF

WIN_PATH="C:\\Users\\${WIN_USER}\\AppData\\Local\\KeeperPet\\keeper-pet.exe"
echo "[deploy_to_windows] 部署完成!"
echo "  WSL 路径: $DEST_DIR/keeper-pet.exe"
echo "  Windows 路径: $WIN_PATH"
ls -lh "$DEST_DIR/keeper-pet.exe"
file "$DEST_DIR/keeper-pet.exe"

if [[ "${1:-}" == "--launch" ]]; then
  echo "[deploy_to_windows] 正在拉起 Windows 原生桌宠..."
  cmd.exe /C start "" "$WIN_PATH" >/dev/null 2>&1 || true
fi
