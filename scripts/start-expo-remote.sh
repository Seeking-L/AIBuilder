#!/usr/bin/env bash
#
# 在 Linux 云服务器上启动 Expo / Metro，使 Expo Go 能通过公网拉取 manifest 与 bundle。
#
# 原理简述：
# - REACT_NATIVE_PACKAGER_HOSTNAME 会被 Expo CLI 用来生成 manifest 里的资源主机名；
#   若不设置，常见情况是写成 127.0.0.1 或内网 IP，手机上的 Expo Go 无法访问。
# - --host 0.0.0.0 让开发服务器监听所有网卡，外网才能连到 Metro 端口（默认多为 8081）。
#
# 用法（在项目仓库根目录，或通过 npm 调用）：
#   chmod +x scripts/start-expo-remote.sh
#   ./scripts/start-expo-remote.sh
#
# 若服务器公网 IP 变更，可在运行前覆盖环境变量（无需改本文件）：
#   REACT_NATIVE_PACKAGER_HOSTNAME=新IP或域名 ./scripts/start-expo-remote.sh
#

set -euo pipefail

# 解析脚本路径，切换到项目根目录（与 package.json 同级），保证从任意 cwd 调用都正确
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# 默认宣告给 Expo Go 的主机名：仅主机名，不要带 http:// 与端口
# 可被环境变量覆盖，便于换 IP / 换域名而不改脚本
DEFAULT_PACKAGER_HOST="47.122.120.208"
export REACT_NATIVE_PACKAGER_HOSTNAME="${REACT_NATIVE_PACKAGER_HOSTNAME:-${DEFAULT_PACKAGER_HOST}}"

echo "[start-expo-remote] REACT_NATIVE_PACKAGER_HOSTNAME=${REACT_NATIVE_PACKAGER_HOSTNAME}"
echo "[start-expo-remote] 请在 Expo 终端界面选择 LAN（勿选 localhost），并用打印的完整 exp:// 链接打开 Expo Go。"
echo ""

exec npx expo start --host 0.0.0.0 "$@"
