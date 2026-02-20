#!/bin/bash
#
# Rocky Linux CI/CD apt-get 快速热修复脚本
# 用途: 立即修复 GitHub Actions 中 apt-get 找不到命令的问题
# 使用: sudo bash quick-fix-apt-get.sh
# 
# 问题: v3.0脚本的apt-get包装器在 /usr/local/bin 中，但GitHub Actions
#      运行环境的PATH可能不包含该目录
# 
# 解决: 将apt-get包装器移到 /usr/bin (保证在PATH中)
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}===================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 权限检查
if [[ $EUID -ne 0 ]]; then
    print_error "此脚本必须以 root 用户运行"
    echo "用法: sudo bash $0"
    exit 1
fi

print_header "Rocky Linux apt-get 快速热修复"

# ========== 修复 1: 创建正确位置的apt-get包装器 ==========

print_info "创建 apt-get 包装器（位置: /usr/bin）..."

cat > /usr/bin/apt-get << 'APT_WRAPPER_EOF'
#!/bin/bash
# Rocky Linux 的 apt-get wrapper (v3.1修复)

COMMAND="$1"
shift

case "$COMMAND" in
    update)
        dnf clean all -y && dnf makecache -y
        ;;
    install)
        dnf install -y "$@"
        ;;
    remove|purge)
        dnf remove -y "$@"
        ;;
    autoremove)
        dnf autoremove -y "$@"
        ;;
    clean)
        dnf clean all -y
        ;;
    --version)
        echo "apt-get wrapper v3.1 for Rocky Linux"
        dnf --version
        ;;
    *)
        dnf "$COMMAND" "$@"
        ;;
esac
APT_WRAPPER_EOF

chmod +x /usr/bin/apt-get
print_success "apt-get 包装器已创建在 /usr/bin"

# ========== 修复 2: 创建符号链接作为备份 ==========

print_info "创建备份符号链接..."
if [[ ! -f /usr/local/bin/apt-get ]]; then
    mkdir -p /usr/local/bin
    ln -sf /usr/bin/apt-get /usr/local/bin/apt-get
    print_success "已在 /usr/local/bin 创建符号链接"
else
    # 如果v3.0脚本已创建过，则删除旧版本
    rm -f /usr/local/bin/apt-get
    ln -sf /usr/bin/apt-get /usr/local/bin/apt-get
    print_success "已更新 /usr/local/bin 中的符号链接"
fi

# ========== 修复 3: 验证修复 ==========

print_info "验证修复..."

# 测试apt-get --version
if /usr/bin/apt-get --version &>/dev/null; then
    print_success "apt-get 命令可用"
else
    print_error "apt-get 验证失败"
    exit 1
fi

# 测试which能否找到apt-get
if which apt-get &>/dev/null; then
    apt_path=$(which apt-get)
    print_success "apt-get 路径: $apt_path"
else
    print_error "which apt-get 失败"
    exit 1
fi

# ========== 修复 4: 显示PATH信息 ==========

print_info "当前系统PATH: $PATH"

# 检查 /usr/bin 是否在PATH中
if echo "$PATH" | grep -q "/usr/bin"; then
    print_success "/usr/bin 在PATH中"
else
    print_error "/usr/bin 不在PATH中，需要手动添加"
    exit 1
fi

# ========== 完成 ==========

print_header "修复完成"

echo -e "${GREEN}快速修复总结:${NC}"
echo "✅ apt-get 包装器已创建在 /usr/bin (确保可被found)"
echo "✅ /usr/local/bin/apt-get 符号链接已创建 (兼容性)"
echo "✅ 验证通过: apt-get 命令已可用"
echo ""
echo -e "${YELLOW}下一步:${NC}"
echo "1. 在Rocky runner上执行此脚本: sudo bash quick-fix-apt-get.sh"
echo "2. 重新运行 GitHub Actions 工作流程"
echo "3. 验证 'Install Libraries on Linux' 步骤成功"
echo ""
echo -e "${BLUE}如果仍有问题，可以运行完整的v3.1脚本:${NC}"
echo "sudo bash setup-rocky-9.4-ci-env-v3.1.sh"
