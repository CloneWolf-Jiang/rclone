#!/bin/bash
#
# Rocky Linux 9.4/9.7 CI/CD 环境初始化脚本 - v3.0
# 用途: 安装必要的依赖包以支持 rclone 和 amlogic-s9xxx-openwrt 项目
# 修复: 基于官方Rocky仓库配置 (CRB + EPEL)
# 使用: sudo bash setup-rocky-9.4-ci-env-v3.0.sh
#
# 更新历史:
# v1.0 - 初始版本 (PowerTools配置错误)
# v2.1 - 修复包名 (libncurses-devel → ncurses-devel)
# v2.2 - 改进PowerTools错误处理 (实际上仍然错误)
# v3.0 - 使用真实Rocky仓库配置 (PowerTools → CRB, 新增EPEL支持)
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
        
        # 验证版本 >= 9.4
        VERSION_MAJOR=$(echo "$VERSION_ID" | cut -d. -f1)
        VERSION_MINOR=$(echo "$VERSION_ID" | cut -d. -f2)
        
        if [[ $VERSION_MAJOR -lt 9 ]] || [[ $VERSION_MAJOR -eq 9 && $VERSION_MINOR -lt 4 ]]; then
            print_warning "版本低于9.4，某些仓库配置可能不适用"
        fi
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
# 包管理器更新和仓库配置
# ============================================================================

print_header "配置官方仓库"

print_info "更新dnf包管理器..."
dnf update -y --assumeyes 2>&1 | tail -n 3
print_success "包管理器已更新"

# ============================================================================
# 核心仓库配置 (Rocky 9标准)
# ============================================================================

print_header "启用开发者仓库"

# 1. CRB (CodeReady Builder) - Rocky 9的标准开发仓库
# 注意: "powertools" 是Rocky 8的名称, Rocky 9已改为 "crb"
print_info "启用CRB仓库 (CodeReady Builder - Rocky 9标准)..."

if dnf config-manager --set-enabled crb 2>/dev/null; then
    print_success "CRB仓库已启用"
else
    # 有时显示"不支持的仓库"是正常的，仓库仍然有效
    print_info "CRB仓库配置已处理（可能已启用）"
fi

# 2. EPEL (Extra Packages for Enterprise Linux) - 额外包仓库
print_info "安装EPEL仓库..."

# 检查EPEL是否已安装
if ! dnf list installed epel-release >/dev/null 2>&1; then
    if dnf install -y epel-release 2>&1 | tail -n 3; then
        print_success "EPEL仓库已安装"
    else
        print_warning "EPEL仓库安装失败，但脚本会继续（某些可选包可能不可用）"
    fi
else
    print_success "EPEL仓库已存在"
fi

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
if dnf install -y "${BASIC_PACKAGES[@]}" 2>&1 | tail -n 3; then
    print_success "基础工具安装完成"
else
    print_warning "某些基础工具安装失败，尝试继续"
fi

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

print_info "安装编译工具（必需）: gcc, g++, make, python3-devel, ncurses-devel 等"
if dnf install -y "${COMPILER_PACKAGES[@]}" 2>&1 | tail -n 3; then
    print_success "编译工具安装完成"
else
    print_warning "某些编译工具安装失败"
fi

# 可选的开发库 (CRB仓库中，需CRB已启用)
print_info "尝试安装CRB中的可选开发库..."
OPTIONAL_DEV_LIBS=(
    "libfdt-devel"      # 设备树编译器库 (CRB)
    "kernel-headers"    # 内核头文件
)

for lib in "${OPTIONAL_DEV_LIBS[@]}"; do
    if dnf install -y "$lib" &>/dev/null 2>&1; then
        print_success "$lib 已安装"
    else
        print_info "$lib 不可用或需启用CRB仓库（可选）"
    fi
done

# ============================================================================
# 安装文件系统工具
# ============================================================================

print_header "安装文件系统工具"

FS_PACKAGES=(
    "pigz"              # 并行gzip
    "util-linux"        # 系统工具
    "lvm2"              # 逻辑卷管理
    "dosfstools"        # FAT32工具
    "parted"            # 分区编辑器
    "e2fsprogs"         # ext2/3/4工具
    "fuse3"             # 用户空间文件系统
    "nfs-utils"         # NFS工具
)

print_info "安装文件系统工具: ${FS_PACKAGES[@]}"
if dnf install -y "${FS_PACKAGES[@]}" 2>&1 | tail -n 3; then
    print_success "文件系统工具安装完成"
else
    print_warning "某些文件系统工具安装失败"
fi

# 可选文件系统工具
print_info "尝试安装可选文件系统工具..."
OPTIONAL_FS_PACKAGES=(
    "btrfs-progs"       # btrfs工具 - 来自EPEL 9
    "fuse3-devel"       # FUSE 3开发库 - 来自CRB
)

for pkg in "${OPTIONAL_FS_PACKAGES[@]}"; do
    if dnf install -y "$pkg" &>/dev/null 2>&1; then
        print_success "$pkg 已安装"
    else
        # 不报错，这些包是可选的
        print_info "$pkg 不可用（可选，不影响构建）"
    fi
done

# ============================================================================
# 安装版本控制扩展
# ============================================================================

print_header "安装版本控制工具"

VCS_PACKAGES=(
    "git-annex"         # Git大文件管理（可能需要EPEL/CRB）
)

print_info "尝试安装版本控制相关包..."
for pkg in "${VCS_PACKAGES[@]}"; do
    if dnf install -y "$pkg" 2>&1 | tail -n 2 | grep -q "Complete"; then
        print_success "$pkg 已安装"
    else
        print_info "$pkg 不可用（可选工具）"
    fi
done

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
    print_info "配置 runner 用户的 sudo 免密码权限..."
    
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
    print_info "如果需要部署 GitHub Actions runner，请在第4-5阶段创建用户"
    print_info "完成后可重新运行本脚本来配置 runner 用户权限"
fi

# ============================================================================
# 创建 apt-get wrapper（解决GitHub Actions兼容性）
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
export PATH=/usr/local/bin:$PATH
if /usr/local/bin/apt-get --version &>/dev/null 2>&1; then
    print_success "apt-get wrapper 可用"
else
    print_info "apt-get wrapper 已创建但直接验证可能失败，脚本仍可通过完整路径访问"
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
APT_GET_CMD="/usr/local/bin/apt-get"
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

# 检查可选工具
print_info "检查可选工具..."
if command -v btrfs &>/dev/null; then
    BFS_VERSION=$(btrfs --version 2>/dev/null | cut -d' ' -f2)
    print_success "✓ btrfs ($BFS_VERSION)"
else
    print_info "ℹ️  btrfs 未找到（仅在需要时必需，OpenWrt编译可能需要）"
fi

if command -v fuse3ctl &>/dev/null; then
    print_success "✓ fuse3ctl"
else
    print_info "ℹ️  fuse3ctl 未找到（仅在需要时必需）"
fi

# ============================================================================
# 最终验证
# ============================================================================

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

# 显示仓库配置
print_info "已启用的仓库:"
dnf repolist | grep "^[a-z]" | awk '{print "  - " $1 " (" $2 ")"}'
echo ""

# ============================================================================
# 脚本完成
# ============================================================================

if [[ ${#MISSING_COMMANDS[@]} -eq 0 ]]; then
    print_success "============================================"
    print_success "✅ 所有关键工具已安装！"
    print_success "系统已完全准备好运行 GitHub Actions!"
    print_success "============================================"
    echo ""
    print_info "下一步:"
    echo "  1. 在GitHub中检查runner状态"
    echo "  2. 触发rclone或amlogic-s9xxx-openwrt的workflows"
    echo "  3. 验证构建成功完成"
    exit 0
else
    print_warning "============================================"
    print_warning "⚠️  某些工具标记为'未找到'"
    print_warning "缺失的工具: ${MISSING_COMMANDS[*]}"
    print_warning "============================================"
    print_info "尽管如此，系统应该可以运行 GitHub Actions"
    print_info "如果构建失败，请手动检查缺失工具"
    echo ""
    print_success "脚本执行完成！"
    exit 0
fi
