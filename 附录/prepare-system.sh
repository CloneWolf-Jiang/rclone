#!/bin/bash
# ============================================================================
# GitHub Self-hosted Runner - 系统基础配置脚本
# 用途：初始化 Rocky Linux 9 系统环境
# 执行权限：需要 root 或 sudo
# ============================================================================

set -e

echo "=========================================="
echo "系统基础配置初始化"
echo "=========================================="

# 配置网络（如果尚未配置）
echo "[1/4] 配置网络..."

for iface in $(ls /sys/class/net/ | grep -v lo); do
    if ! nmcli connection show | grep -q "$iface"; then
        nmcli connection add con-name "$iface" ifname "$iface" type ethernet
        echo "  ✓ 已添加网络连接: $iface"
    fi
done

# 激活网络连接
nmcli networking on
sleep 2

# 禁用 SELinux（立即生效）
echo "[2/4] 禁用 SELinux..."
if command -v setenforce &> /dev/null; then
    setenforce 0
    echo "  ✓ SELinux 已禁用（临时）"
    
    # 永久禁用
    if [[ -f /etc/selinux/config ]]; then
        sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
        echo "  ✓ SELinux 已禁用（永久）"
    fi
else
    echo "  ℹ️  SELinux 未安装，跳过"
fi

# 系统更新和基础依赖
echo "[3/4] 更新系统并安装基础工具..."
yum update -y > /dev/null 2>&1
yum install -y wget curl git tar gzip > /dev/null 2>&1
echo "  ✓ 系统更新完成"

# 可选：配置 yum 源加速（国内用户可开启）
echo "[4/4] 配置完成概览..."

echo ""
echo "=========================================="
echo "✅ 基础环境已准备完毕"
echo "=========================================="
echo ""
echo "下一步："
echo "  1. 访问 GitHub 仓库 Settings -> Actions -> Runners"
echo "  2. 点击 'New self-hosted runner'"
echo "  3. 选择 'Linux' -> 'x64'"
echo "  4. 获取 URL 和 Token"
echo "  5. 运行部署脚本："
echo "     sudo bash deploy-runner.sh --github-url <URL> --token <TOKEN>"
echo ""
