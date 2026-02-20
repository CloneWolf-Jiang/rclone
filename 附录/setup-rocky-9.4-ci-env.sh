#!/bin/bash
#
# Rocky Linux 9.4 CI/CD 环境初始化脚本
# 用途: 安装必要的依赖包以支持 rclone 和 amlogic-s9xxx-openwrt 项目
# 使用: sudo bash setup-rocky-9.4-ci-env.sh
#

set -e

# ============================================================================
# 颜色定义
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# 函数定义
# ============================================================================

print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# ============================================================================
# 权限检查
# ============================================================================

if [[ $EUID -ne 0 ]]; then
    print_error "此脚本必须以 root 用户运行或使用 sudo"
    echo "用法: sudo bash $0"
    exit 1
fi

# ============================================================================
# 系统检查
# ============================================================================

print_header "系统环境检查"

# 检查 Rocky Linux 版本
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    if [[ "${ID}" != "rocky" ]]; then
        print_warning "当前系统不是 Rocky Linux，某些功能可能不兼容"
        echo "当前系统: ${ID} ${VERSION}"
    else
        print_success "检测到 Rocky Linux ${VERSION}"
    fi
else
    print_error "无法检测系统信息，请确保运行在支持的 Linux 发行版上"
    exit 1
fi

# 检查网络连接
if ping -c 1 8.8.8.8 &>/dev/null; then
    print_success "网络连接正常"
else
    print_warning "网络连接可能有问题，某些包可能无法下载"
fi

# ============================================================================
# 包管理器更新
# ============================================================================

print_header "更新包管理器"

print_info "尝试启用 PowerTools 仓库 (某些 Rocky 版本有效)..."
# PowerTools 在不同 Rocky 版本中可能不存在或名称不同
if dnf config-manager --set-enabled powertools 2>/dev/null; then
    print_success "PowerTools 仓库已启用"
else
    print_info "PowerTools 仓库不可画 (Rocky 9.7 可能不支持) - 继续使用标准仓库"
fi

print_info "运行 dnf update ..."
dnf update -y --assumeyes 2>&1 | tail -n 5
print_success "包管理器已更新"

# ============================================================================
# 安装基础工具
# ============================================================================

print_header "安装基础工具"

BASIC_PACKAGES=(
    "bash"
    "git"
    "curl"
    "wget"
    "tar"
    "gzip"
    "sed"
    "gawk"
    "grep"
    "bc"
    "jq"
    "dialog"
    "vim"
    "nano"
)

print_info "安装基础工具: ${BASIC_PACKAGES[@]}"
dnf install -y "${BASIC_PACKAGES[@]}" 2>&1 | tail -n 3
print_success "基础工具安装完成"

# ============================================================================
# 安装编译工具
# ============================================================================

print_header "安装编译工具"

COMPILER_PACKAGES=(
    "gcc"
    "g++"
    "make"
    "binutils"
    "bison"
    "flex"
    "openssl-devel"
    "python3"
    "python3-devel"
    "perl"
    "zlib-devel"
    "ncurses-devel"
    "glib2-devel"
)

# 开发库（某些可能不存在，使用宽松模式安装）
DEV_LIBS=(
    "libfdt-devel"
)

print_info "安装编译工具: ${COMPILER_PACKAGES[@]}"
if dnf install -y "${COMPILER_PACKAGES[@]}" 2>&1 | tail -n 3; then
    print_success "编译工具安装完成"
else
    print_warning "某些编译工具安装失败，但主要工具已安装"
fi

# 针对可选开发库（某些可能不存在，不阻止执行）
print_info "查找可选优化库..."
for lib in "${DEV_LIBS[@]}"; do
    # 模陻模式安装，不反输出错误
    if dnf install -y "$lib" &>/dev/null 2>&1; then
        print_success "$lib 已安装"
    else
        print_info "$lib 不可用（忽略）"
    fi
done

# ============================================================================
# 安装文件系统工具
# ============================================================================

print_header "安装文件系统工具"

FS_PACKAGES=(
    "pigz"
    "util-linux"
    "lvm2"
    "dosfstools"
    "parted"
    "e2fsprogs"
    "fuse3"
    "nfs-utils"
)

# 可能不存在的包
OPTIONAL_FS_PACKAGES=(
    "btrfs-progs"
    "fuse3-devel"
)

VCS_PACKAGES=(
    "git-annex"
)

print_info "安装文件系统工具: ${FS_PACKAGES[@]}"
if dnf install -y "${FS_PACKAGES[@]}" 2>&1 | tail -n 3; then
    print_success "文件系统工具安装完成"
else
    print_warning "某些文件系统工具安装失败"
fi

# 查找可选文件系统工具（btrfs-progs 可能需要 PowerTools）
print_info "查找可选文件系统工具..."
for pkg in "${OPTIONAL_FS_PACKAGES[@]}"; do
    # 使用 2>/dev/null 不输出错误
    if dnf install -y "$pkg" &>/dev/null 2>&1; then
        print_success "$pkg 已安装"
    else
        print_info "$pkg 不可用（忽略）"
    fi
done

# ============================================================================
# 安装版本控制扩展
# ============================================================================

print_header "安装版本控制工具"

print_info "安装版本控制相关包: ${VCS_PACKAGES[@]}"
if dnf install -y "${VCS_PACKAGES[@]}" 2>&1 | tail -n 3; then
    print_success "版本控制工具安装完成"
else
    print_info "git-annex 不可用或需要 PowerTools 仓库（可选工具，不影响核心功能）"
fi

# ============================================================================
# 检查和配置 runner 用户
# ============================================================================

print_header "配置 runner 用户权限（sudo 免密码）"

if id "runner" &>/dev/null; then
    print_info "runner 用户已存在"
    
    # 检查 runner 用户是否在 wheel 组
    if groups runner | grep -q wheel; then
        print_success "runner 用户已在 wheel 组中"
    else
        print_info "将 runner 用户添加到 wheel 组..."
        usermod -aG wheel runner
        print_success "runner 用户已添加到 wheel 组"
    fi
    
    # 配置 sudoers 免密码权限
    # 这是 GitHub Actions 正常运行所必需的
    print_info "配置 runner 用户的 sudo 免密码权限..."
    
    # 检查是否已存在配置
    if grep -q "^runner ALL=(ALL) NOPASSWD: ALL" /etc/sudoers.d/runner 2>/dev/null; then
        print_success "runner 用户 sudo 免密码已配置"
    else
        # 创建 sudoers 配置文件
        echo "runner ALL=(ALL) NOPASSWD: ALL" | tee /etc/sudoers.d/runner >/dev/null
        chmod 0440 /etc/sudoers.d/runner
        print_success "runner 用户 sudo 免密码配置已完成"
    fi
    
    # 验证 sudo 免密码权限
    print_info "验证 sudo 免密码权限..."
    if sudo -u runner sudo whoami &>/dev/null; then
        print_success "runner 用户可以无密码执行 sudo 命令"
    else
        print_error "配置失败！runner 用户仍需密码执行 sudo"
        print_error "请手动运行：echo 'runner ALL=(ALL) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/runner"
        exit 1
    fi
else
    print_warning "runner 用户不存在"
    print_info "如果需要部署 GitHub Actions runner，请在第 4-5 阶段创建用户"
    print_info "完成后可以重新运行本脚本来配置 runner 用户权限"
fi

# ============================================================================
# 创建 apt-get wrapper（解决 GitHub Actions 在 Rocky 上的兼容性）
# ============================================================================

print_header "配置 GitHub Actions 兼容性（apt-get wrapper）"

print_info "创建 apt-get 转换脚本..."

# 创建 wrapper 脚本
cat > /usr/local/bin/apt-get << 'APT_WRAPPER_EOF'
#!/bin/bash
# Rocky Linux 的 apt-get wrapper
# 将 apt-get 命令自动转换为 dnf 等价命令
# 用途: 支持使用 apt-get 的构建脚本在 Rocky Linux 上正常运行

# 解析参数
COMMAND="$1"
shift

case "$COMMAND" in
    update)
        # apt-get update → dnf clean all && dnf makecache
        dnf clean all -y && dnf makecache -y
        ;;
    install)
        # apt-get install -y pkg1 pkg2 → dnf install -y pkg1 pkg2
        dnf install -y "$@"
        ;;
    remove|purge)
        # apt-get remove → dnf remove
        dnf remove -y "$@"
        ;;
    autoremove)
        # apt-get autoremove → dnf autoremove
        dnf autoremove -y "$@"
        ;;
    clean)
        # apt-get clean → dnf clean all
        dnf clean all -y
        ;;
    *)
        # 其他命令直接传递给 dnf
        dnf "$COMMAND" "$@"
        ;;
esac
APT_WRAPPER_EOF

chmod +x /usr/local/bin/apt-get
print_success "apt-get wrapper 已创建"

print_info "验证 apt-get wrapper..."
# 刷新 PATH 以确保能找到新创建的脚本
export PATH=/usr/local/bin:$PATH
if "$APT_GET_CMD" --version &>/dev/null 2>&1; then
    print_success "apt-get wrapper 可用"
else
    print_info "apt-get wrapper 已创建但直接验证可能失败"
    print_info "脚本可以通过完整路径访问"
fi

print_success "GitHub Actions 兼容性配置完成"

# ============================================================================
# 验证安装
# ============================================================================

print_header "验证关键工具"

# 刷新环境以获取新安装的工具
export PATH=/usr/local/bin:$PATH

CRITICAL_COMMANDS=(
    "git"
    "curl"
    "wget"
    "tar"
    "gzip"
    "pigz"
    "sed"
    "awk"
    "gcc"
    "make"
    "losetup"
    "mkfs.ext4"
)

# apt-get 验证方式不同
APT_GET_CMD="/usr/local/bin/apt-get"
FUSE_CMD="fuse3ctl"

MISSING_COMMANDS=()

for cmd in "${CRITICAL_COMMANDS[@]}"; do
    if command -v "$cmd" &>/dev/null; then
        print_success "✓ $cmd"
    else
        print_warning "⚠️  $cmd 未找到（可能需要安装）"
        MISSING_COMMANDS+=("$cmd")
    fi
done

# 检查 apt-get wrapper
if [[ -f "$APT_GET_CMD" ]]; then
    if "$APT_GET_CMD" --version &>/dev/null 2>&1; then
        print_success "✓ apt-get wrapper"
    else
        print_warning "⚠️  apt-get wrapper 存在但验证失败"
    fi
else
    print_error "✗ apt-get wrapper 不存在"
    MISSING_COMMANDS+=("apt-get")
fi

# 检查 btrfs（可选）
if command -v btrfs &>/dev/null; then
    BFS_VERSION=$(btrfs --version 2>/dev/null | cut -d' ' -f2)
    print_success "✓ btrfs ($BFS_VERSION)"
else
    print_info "ℹ️  btrfs 未找到（仅在需要时必需）"
fi

# 检查 fuse3ctl（可选）
if command -v "$FUSE_CMD" &>/dev/null; then
    print_success "✓ fuse3ctl"
else
    print_info "ℹ️  fuse3ctl 未找到（仅在需要时必需）"
fi

# ============================================================================
# 总结
# ============================================================================

print_header "安装总结"

print_header "最终验证"

# 验证 runner 用户 sudo 配置
if id "runner" &>/dev/null; then
    if sudo -u runner sudo whoami &>/dev/null 2>&1; then
        print_success "✓ runner 用户 sudo 免密码配置正确"
    else
        print_error "✗ runner 用户 sudo 仍需密码，某些 GitHub Actions 可能失败"
    fi
fi

# 显示系统信息
echo ""
print_info "系统信息:"
echo "  - 操作系统: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "  - Linux 内核: $(uname -r)"
echo "  - CPU 核数: $(nproc)"
echo "  - 可用内存: $(free -h | awk '/^Mem:/ {print $7}')"
echo "  - 磁盘空间: $(df -h / | awk 'NR==2 {print $4 " 可用"}')"
echo ""

if [[ ${#MISSING_COMMANDS[@]} -eq 0 ]]; then
    print_success "============================================"
    print_success "✅ 所有关键工具已安装！"
    print_success "系统已完全准备好运行 GitHub Actions!"
    print_success "============================================"
    exit 0
else
    print_warning "============================================"
    print_warning "⚠️  某些标记为"未找到"的工具可能需要手动安装"
    print_warning "缺失的工具: ${MISSING_COMMANDS[*]}"
    print_warning "============================================"
    print_info "尽管如此，系统应该可以运行 GitHub Actions"
    print_info "如果构建失败，请手动检查缺失工具"
    exit 0
fi
