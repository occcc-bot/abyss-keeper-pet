#!/usr/bin/env bash
# ==============================================================================
# setup_toolchain.sh — WSL2 用户态免 sudo 交叉编译工具链一键安装脚本
# 安装至 ~/.cargo、~/.rustup、~/.local/llvm、~/.local/bin（绝不调用 sudo）
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$HOME/.local/llvm/bin:$PATH"

echo "[setup_toolchain] === 1. 安装/检查 Rustup & x86_64-pc-windows-msvc target ==="
if ! command -v rustup >/dev/null 2>&1; then
  export RUSTUP_DIST_SERVER="https://rsproxy.cn"
  export RUSTUP_UPDATE_ROOT="https://rsproxy.cn/rustup"
  curl --proto '=https' --tlsv1.2 -sSf https://rsproxy.cn/rustup-init.sh | sh -s -- -y --default-toolchain stable --profile minimal
  export PATH="$HOME/.cargo/bin:$PATH"
fi
rustup --version
rustc --version
cargo --version
rustup target add x86_64-pc-windows-msvc

echo "[setup_toolchain] === 2. 安装/检查 cargo-xwin ==="
if ! command -v cargo-xwin >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install cargo-xwin || cargo install --locked cargo-xwin
  else
    cargo install --locked cargo-xwin
  fi
fi
cargo xwin --version

echo "[setup_toolchain] === 3. 安装/检查用户态 LLVM (clang-cl / lld-link / llvm-lib / llvm-rc) ==="
mkdir -p "$HOME/.local/bin"
if ! command -v clang-cl >/dev/null 2>&1 || ! command -v lld-link >/dev/null 2>&1 || ! command -v llvm-rc >/dev/null 2>&1; then
  LLVM_VER="19.1.7"
  LLVM_TAG="llvmorg-${LLVM_VER}"
  LLVM_TARBALL="LLVM-${LLVM_VER}-Linux-X64.tar.xz"
  LLVM_URL="https://github.com/llvm/llvm-project/releases/download/${LLVM_TAG}/${LLVM_TARBALL}"
  TMP_DIR="$HOME/.cache/keeper-pet-toolchain"
  mkdir -p "$TMP_DIR"
  if [ ! -f "$TMP_DIR/$LLVM_TARBALL" ]; then
    echo "[setup_toolchain] 下载 LLVM ${LLVM_VER} (${LLVM_URL})..."
    curl -fL --retry 3 -o "$TMP_DIR/$LLVM_TARBALL.part" "$LLVM_URL"
    mv "$TMP_DIR/$LLVM_TARBALL.part" "$TMP_DIR/$LLVM_TARBALL"
  fi
  echo "[setup_toolchain] 解压至 $HOME/.local/llvm ..."
  rm -rf "$HOME/.local/llvm"
  mkdir -p "$HOME/.local/llvm"
  tar -xf "$TMP_DIR/$LLVM_TARBALL" -C "$HOME/.local/llvm" --strip-components=1
  for bin in clang clang++ clang-cl lld lld-link llvm-lib llvm-rc llvm-ar llvm-dlltool llvm-mt; do
    if [ -e "$HOME/.local/llvm/bin/$bin" ]; then
      ln -sf "$HOME/.local/llvm/bin/$bin" "$HOME/.local/bin/$bin"
    fi
  done
  rm -f "$TMP_DIR/$LLVM_TARBALL"
fi

echo "[setup_toolchain] === 4. 检查 Python 工具虚拟环境 (.venv: pillow, numpy, scipy) ==="
if [ ! -d "$ROOT/.venv" ]; then
  uv venv "$ROOT/.venv" --python 3.12
  uv pip install --python "$ROOT/.venv/bin/python" pillow numpy scipy
fi

echo "[setup_toolchain] === 5. 最终工具链版本核验 ==="
rustc --version
rustup target list --installed
cargo xwin --version
clang-cl --version | head -n 2
lld-link --version | head -n 2
command -v llvm-rc
echo "[setup_toolchain] ALL READY!"
