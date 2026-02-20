#!/bin/bash
#
# Rocky Linux 9.4/9.7 CI/CD 环境初始化脚本 - v3.2
# 用途: 安装必要的依赖包以支持 rclone 和 amlogic-s9xxx-openwrt 项目
# 修复: 基于官方Rocky仓库配置 (CRB + EPEL)
# 使用: sudo bash setup-rocky-9.4-ci-env-v3.2.sh
#
# 更新历史:
# v1.0 - 初始版本 (PowerTools配置错误)
# v2.1 - 修复包名 (libncurses-devel → ncurses-devel)
# v2.2 - 改进PowerTools错误处理 (实际上仍然错误)
# v3.0 - 使用真实Rocky仓库配置 (PowerTools → CRB, 新增EPEL支持)
# v3.1 - 中心存储+软链接方案 (脚本存储在/opt/actions-runner/compat-scripts/，系统位置使用软链接)
# v3.2 - JSON + jq 配置方案 (用 JSON 替代 Bash 脚本，使用 jq 处理，更易维护)
# v3.2+ - 增强apt-get wrapper: 包名自动转换 (Ubuntu包 → Rocky包，解决GitHub Actions兼容性问题)
# v3.2+ - 环境验证和修复工具 (verify-env/fix-env 便于排查问题)
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

print_header "仓库配置与包管理器更新"

print_info "更新 dnf 缓存..."
dnf clean all -y
dnf makecache -y
print_success "dnf 缓存已更新"

# 启用 CRB 仓库 (Code Ready Builder - Rocky 9 官方标准)
print_info "启用 CRB 仓库..."
if dnf config-manager --set-enabled crb -y 2>/dev/null; then
    print_success "CRB 仓库已启用"
else
    print_warning "CRB 仓库启用失败，继续实行..."
fi

# 安装 EPEL 仓库
print_info "安装 EPEL 仓库..."
if dnf install -y epel-release 2>/dev/null; then
    print_success "EPEL 仓库已安装"
else
    print_warning "EPEL 仓库安装可能失败，继续实行..."
fi

# 更新仓库缓存
print_info "更新仓库缓存..."
dnf makecache -y
print_success "仓库缓存已更新"

# ============================================================================
# 编译工具链安装
# ============================================================================

print_header "安装编译工具链"

# 必需的工具
ESSENTIAL_PACKAGES=(
    "gcc"
    "g++"
    "make"
    "pkg-config"
    "git"
    "curl"
    "wget"
    "tar"
    "gzip"
)

print_info "安装基础工具..."
for pkg in "${ESSENTIAL_PACKAGES[@]}"; do
    if dnf install -y "$pkg" 2>/dev/null; then
        print_success "$pkg 已安装"
    else
        print_warning "$pkg 安装失败"
    fi
done

# ============================================================================
# 开发库安装
# ============================================================================

print_header "安装开发库和头文件"

# 必须的开发库
REQUIRED_LIBS=(
    "python3-devel"
    "zlib-devel"
    "openssl-devel"
    "ncurses-devel"
)

print_info "安装必需的开发库..."
for lib in "${REQUIRED_LIBS[@]}"; do
    if dnf install -y "$lib" 2>/dev/null; then
        print_success "$lib 已安装"
    else
        print_error "$lib 安装失败（必需）"
        exit 1
    fi
done

# ============================================================================
# 可选库安装
# ============================================================================

print_header "安装可选库和工具"

# 可选的库 (如果安装失败不影响整体)
# 注意: 这里使用直接 dnf 调用，必须使用 Rocky 正确的包名（非 Ubuntu 包名）
OPTIONAL_PACKAGES=(
    "libfdt-devel:libfdt development files"
    "fuse3-devel:FUSE 3 development files"
    "btrfs-progs:btrfs filesystem tools"
    "rpm:RPM package manager"
    "nfs-utils:NFS client support"
)

for entry in "${OPTIONAL_PACKAGES[@]}"; do
    pkg="${entry%%:*}"
    desc="${entry##*:}"
    if dnf install -y "$pkg" 2>/dev/null; then
        print_success "$pkg ($desc) 已安装"
    else
        print_warning "$pkg ($desc) 安装失败（可选）"
    fi
done

# ============================================================================
# 可选库 (带有多个候选项)
# ============================================================================

# fuse 库配置
print_info "配置 FUSE 文件系统支持..."
if modprobe fuse 2>/dev/null; then
    chmod 666 /dev/fuse 2>/dev/null || true
    if [[ -f /etc/fuse.conf ]]; then
        chown root:root /etc/fuse.conf || true
    fi
    print_success "FUSE 支持已配置"
else
    print_warning "FUSE 模块加载失败"
fi

# ============================================================================
# GitHub Actions Runner 权限配置
# ============================================================================

print_header "GitHub Actions Runner 权限配置"

# 为 runner 用户配置 sudoers
RUNNER_USER="runner"
SUDOERS_FILE="/etc/sudoers.d/${RUNNER_USER}"

print_info "配置 ${RUNNER_USER} 用户 sudo 权限..."

if id "${RUNNER_USER}" &>/dev/null 2>&1; then
    # 创建 sudoers 配置 (允许无密码 sudo)
    cat > "${SUDOERS_FILE}" << 'SUDOERS_EOF'
runner ALL=(ALL) NOPASSWD: ALL
SUDOERS_EOF
    
    # 设置正确的权限
    chmod 440 "${SUDOERS_FILE}"
    
    # 验证配置
    if visudo -c -f "${SUDOERS_FILE}" 2>/dev/null; then
        print_success "${RUNNER_USER} sudo 权限已配置"
    else
        print_error "${RUNNER_USER} sudoers 配置无效"
        exit 1
    fi
else
    print_warning "${RUNNER_USER} 用户不存在，跳过权限配置"
fi

# ============================================================================
# GitHub Actions 兼容性 - apt-get wrapper（v3.2 - JSON + jq 改进版）
# ============================================================================

print_header "配置 GitHub Actions 兼容性（apt-get wrapper - v3.2JSON版）"

# 中心存储目录
COMPAT_SCRIPTS_DIR="/opt/actions-runner/compat-scripts"
PACKAGE_MAP_FILE="$COMPAT_SCRIPTS_DIR/package-map.json"
IGNORE_LIST_FILE="$COMPAT_SCRIPTS_DIR/ignore-packages.json"

print_info "创建中心存储目录: $COMPAT_SCRIPTS_DIR"
mkdir -p "$COMPAT_SCRIPTS_DIR"
print_success "中心存储目录已创建"

# ============================================================================
# 步骤 0: 生成或合并 JSON 配置文件（使用 jq）
# ============================================================================
print_info "处理 JSON 配置文件..."

# 定义默认的包名映射表（JSON 格式）
# 包映射规则: 基于 Ubuntu Focal/Jammy 与 Rocky 9.4-9.7 的官方仓库对比
# 数据来源: Ubuntu Official Repos, Rocky Official Repos, EPEL
# 最后更新: 2026-02-20 (基于 Run 22220002065 的实际错误)
DEFAULT_PACKAGE_MAP='{
  "_version": "3.2.1",
  "_comment": "Ubuntu 22.04 LTS (Jammy) → Rocky Linux 9.4+ 包名完整映射表",
  "_maintenance": "脚本执行时会智能合并，保留手动添加的条目，覆盖新增映射项",
  "_last_updated": "2026-02-20 - Added extended mappings based on GitHub Actions workflow failures",
  
  "编译工具链": "--- Ubuntu Build Tools → Rocky ---",
  "gcc": "gcc",
  "g++": "gcc-c++",
  "make": "make",
  "cmake": "cmake",
  "glibc-devel": "glibc-devel",
  
  "包管理工具": "--- Package Management Tools ---",
  "pkg-config": "pkgconf-pkg-config",
  "dpkg": "rpm",
  
  "文件系统和挂载": "--- Filesystem & Mounting (CRITICAL for rclone) ---",
  "fuse3": "fuse3",
  "libfuse-dev": "fuse3-devel",
  "libfuse3-dev": "fuse3-devel",
  "libfuse3-3": "fuse3-libs",
  "fuse": "fuse",
  "nfs-common": "nfs-utils",
  "btrfs-progs": "btrfs-progs",
  "libfdt-dev": "libfdt-devel",
  "libfdt1": "libfdt",
  
  "开发库": "--- Development Libraries ---",
  "python3-dev": "python3-devel",
  "python3-devel": "python3-devel",
  "libssl-dev": "openssl-devel",
  "zlib1g-dev": "zlib-devel",
  "ncurses-dev": "ncurses-devel",
  "libreadline-dev": "readline-devel",
  "libbz2-dev": "bzip2-devel",
  "libsqlite3-dev": "sqlite-devel",
  "libgdbm-dev": "gdbm-devel",
  
  "压缩和存档": "--- Compression & Archive ---",
  "gzip": "gzip",
  "bzip2": "bzip2",
  "xz-utils": "xz",
  "tar": "tar",
  "zip": "zip",
  "unzip": "unzip",
  
  "网络和通信": "--- Networking & Communication ---",
  "curl": "curl",
  "wget": "wget",
  "git": "git",
  "openssh-client": "openssh-clients",
  "openssh-server": "openssh-server",
  
  "系统工具": "--- System Utilities ---",
  "vim": "vim",
  "nano": "nano",
  "htop": "htop",
  "tmux": "tmux",
  "screen": "screen",
  "sudo": "sudo",
  
  "其他": "--- Miscellaneous ---",
  "rpm": "rpm"
}'

# 定义默认的忽略列表（JSON 格式）
# 这些包在 Ubuntu 中存在，但在 Rocky 中不可用或不需要
# 安装时这些包会被跳过，不会传递给 dnf
DEFAULT_IGNORE_LIST='{
  "_version": "3.2.1",
  "_comment": "Rocky Linux 中不可用或不必要的包列表",
  "_maintenance": "脚本执行时会智能合并，保留已有条目，添加新增条目 (自动去重)",
  "_last_updated": "2026-02-20 - Refined based on GitHub Actions Run 22220002065 analysis",
  "ignore": [
    "git-annex",
    "git-annex-remote-rclone",
    "debian-utils",
    "apt",
    "apt-utils",
    "dpkg-dev",
    "update-manager",
    "ubuntu-standard",
    "ubuntu-minimal",
    "apt-transport-https"
  ]
}'

# 函数：使用 jq 智能合并 JSON（保留已有配置）
create_or_merge_json() {
    local new_json=$1
    local file=$2
    local description=$3
    
    if [[ ! -f "$file" ]]; then
        # 文件不存在，创建新文件
        print_info "$description: 首次创建"
        echo "$new_json" | jq '.' > "$file" 2>/dev/null
        chmod 644 "$file"
        print_success "$description 已创建: $file"
    else
        # 文件存在，检查是否需要更新
        local old_version=$(jq -r '._version // "2.0"' "$file" 2>/dev/null)
        local new_version=$(echo "$new_json" | jq -r '._version' 2>/dev/null)
        
        if [[ "$old_version" != "$new_version" ]]; then
            print_info "$description: 检测到版本升级（$old_version → $new_version），执行合并..."
            
            # 备份旧文件
            cp "$file" "$file.bak"
            print_info "已备份旧配置: $file.bak"
            
            # 智能合并：保留旧配置中的实际映射，添加新的模板注释和新增映射
            if [[ "$description" == *"映射表"* ]]; then
                # 对于映射表：保留用户添加的映射，添加新的默认映射
                jq -s '
                    .[0] as $new | .[1] as $old |
                    ($new | to_entries | map(select(.key | startswith("_") | not)) | from_entries) as $new_mappings |
                    ($old | to_entries | map(select(.key | startswith("_") | not)) | from_entries) as $old_mappings |
                    (
                        ($new | to_entries | map(select(.key | startswith("_"))) | from_entries) +
                        ($old_mappings + $new_mappings)
                    )
                ' <(echo "$new_json") "$file" > "$file.tmp" 2>/dev/null && \
                mv "$file.tmp" "$file" && \
                print_success "$description 已更新（保留手动添加的映射）" || \
                print_warning "$description 合并失败，保持旧版本"
            else
                # 对于忽略列表：合并 ignore 数组
                jq -s '
                    .[0] as $new | .[1] as $old |
                    ($new.ignore // []) as $new_ignore |
                    ($old.ignore // []) as $old_ignore |
                    (
                        ($new | to_entries | map(select(.key | startswith("_"))) | from_entries) +
                        {ignore: ($old_ignore + $new_ignore | unique)}
                    )
                ' <(echo "$new_json") "$file" > "$file.tmp" 2>/dev/null && \
                mv "$file.tmp" "$file" && \
                print_success "$description 已更新（合并忽略列表）" || \
                print_warning "$description 合并失败，保持旧版本"
            fi
        else
            print_success "$description 已存在且版本一致，无需更新"
        fi
    fi
}

# 创建或合并 JSON 配置文件
create_or_merge_json "$DEFAULT_PACKAGE_MAP" "$PACKAGE_MAP_FILE" "包名映射表"
create_or_merge_json "$DEFAULT_IGNORE_LIST" "$IGNORE_LIST_FILE" "忽略列表"

print_info "JSON 配置文件处理完成"

print_info "创建 apt-get 转换脚本（支持 JSON 配置 + jq）..."

# 定义 apt-get wrapper 脚本内容
APT_WRAPPER_SCRIPT='#!/bin/bash
# Rocky Linux 的 apt-get wrapper - v3.2 JSON 版本
# 将 apt-get 命令自动转换为 dnf 等价命令
# 核心功能: 命令转换 + 使用 jq 读取 JSON 配置进行包名转换
# 用途: 支持使用 apt-get 的构建脚本在 Rocky Linux 上正常运行
# 存储位置: /opt/actions-runner/compat-scripts/apt-get
# 配置文件: /opt/actions-runner/compat-scripts/package-map.json
# 配置文件: /opt/actions-runner/compat-scripts/ignore-packages.json

# 修复: 使用 readlink -f 获取真实路径，防止 symlink 导致的路径错误
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PACKAGE_MAP_FILE="$SCRIPT_DIR/package-map.json"
IGNORE_LIST_FILE="$SCRIPT_DIR/ignore-packages.json"

# ============================================================================
# 函数：从 JSON 获取包映射
# ============================================================================
get_package_mapping() {
    local package=$1
    if [[ -f "$PACKAGE_MAP_FILE" ]]; then
        # 只输出字符串映射，忽略注释键（以 _ 开头）和 boolean 值
        local result=$(jq -r ".\"$package\" // empty" "$PACKAGE_MAP_FILE" 2>/dev/null)
        # 只输出非空且非 boolean 值的结果
        if [[ -n "$result" && "$result" != "false" && "$result" != "true" && "$result" != "null" ]]; then
            echo "$result"
        fi
    fi
}

# ============================================================================
# 函数：检查包是否在忽略列表中
# ============================================================================
is_package_ignored() {
    local package=$1
    if [[ -f "$IGNORE_LIST_FILE" ]]; then
        jq -e ".ignore | index(\"$package\") != null" "$IGNORE_LIST_FILE" 2>/dev/null
        return $?
    fi
    return 1
}

# ============================================================================
# 函数：转换包名（读取 JSON 配置）
# ============================================================================
convert_package_names() {
    local -a converted_packages=()
    
    for pkg in "$@"; do
        # 跳过以 - 开头的选项参数（如 -y, --no-cache 等）
        if [[ "$pkg" == -* ]]; then
            converted_packages+=("$pkg")
            continue
        fi
        
        # 检查是否在忽略列表中
        if is_package_ignored "$pkg"; then
            continue
        fi
        
        # 获取映射后的包名
        local mapped_pkg=$(get_package_mapping "$pkg")
        if [[ -n "$mapped_pkg" ]]; then
            converted_packages+=("$mapped_pkg")
        else
            # 未映射的包直接通过
            converted_packages+=("$pkg")
        fi
    done
    
    # 输出转换后的包名（以空格分隔）
    echo "${converted_packages[@]}"
}

# 解析参数
COMMAND="$1"
shift

# 诊断模式：显示配置信息
if [[ "$COMMAND" == "config-info" ]]; then
    echo "=== APT-GET WRAPPER CONFIG INFO ==="
    echo "Package Map File: $PACKAGE_MAP_FILE"
    if [[ -f "$PACKAGE_MAP_FILE" ]]; then
        echo "Mappings:"
        jq -r "to_entries[] | select(.key | startswith(\"_\") | not) | \"  \(.key) → \(.value)\"" "$PACKAGE_MAP_FILE" 2>/dev/null | head -20
    else
        echo "  [NOT FOUND]"
    fi
    echo ""
    echo "Ignore List File: $IGNORE_LIST_FILE"
    if [[ -f "$IGNORE_LIST_FILE" ]]; then
        echo "Ignored Packages:"
        jq -r ".ignore[]?" "$IGNORE_LIST_FILE" 2>/dev/null | sed "s/^/  /"
    else
        echo "  [NOT FOUND]"
    fi
    exit 0
fi

case "$COMMAND" in
    update)
        # apt-get update → dnf clean all && dnf makecache
        dnf clean all -y && dnf makecache -y
        exit $?
        ;;
    install)
        # apt-get install -y pkg1 pkg2 → dnf install -y (转换后的包名)
        # 直接处理包名，使用命令替换避免 local 变量问题
        converted=$(convert_package_names "$@")
        if [[ -n "$converted" ]]; then
            dnf install -y $converted
            APT_EXIT_CODE=$?
            case $APT_EXIT_CODE in
                0)   exit 0   ;;
                130) exit 130 ;;
                *)   exit 100 ;;
            esac
        else
            exit 0
        fi
        ;;
    remove|purge)
        # apt-get remove → dnf remove
        # 直接处理，避免 local 变量问题
        converted=$(convert_package_names "$@")
        if [[ -n "$converted" ]]; then
            dnf remove -y $converted
            APT_EXIT_CODE=$?
            case $APT_EXIT_CODE in
                0)   exit 0   ;;
                130) exit 130 ;;
                *)   exit 100 ;;
            esac
        else
            exit 0
        fi
        ;;
    autoremove)
        # apt-get autoremove → dnf autoremove
        dnf autoremove -y
        exit $?
        ;;
    clean)
        # apt-get clean → dnf clean all
        dnf clean all -y
        exit $?
        ;;
    --version)
        # 显示 apt-get wrapper 版本
        echo "apt-get wrapper v3.2 for Rocky Linux (JSON + jq powered)"
        echo "Features: Command translation + JSON package name mapping"
        echo "Config: $PACKAGE_MAP_FILE"
        dnf --version
        ;;
    *)
        # 其他命令直接传递给 dnf
        dnf "$COMMAND" "$@"
        exit $?
        ;;
esac'

# 中心存储步骤 1: 在 /opt/actions-runner/compat-scripts 中创建 apt-get
print_info "创建中心存储脚本: $COMPAT_SCRIPTS_DIR/apt-get"
echo "$APT_WRAPPER_SCRIPT" > "$COMPAT_SCRIPTS_DIR/apt-get"
chmod +x "$COMPAT_SCRIPTS_DIR/apt-get"
print_success "✅ 中心存储脚本已创建"

# 中心存储步骤 2: 在 /usr/bin 创建软链接
print_info "创建 /usr/bin/apt-get 软链接..."
rm -f /usr/bin/apt-get 2>/dev/null || true
ln -sf "$COMPAT_SCRIPTS_DIR/apt-get" /usr/bin/apt-get
print_success "✅ /usr/bin/apt-get 软链接已创建"

# 中心存储步骤 3: 在 /usr/local/bin 创建软链接
print_info "创建 /usr/local/bin/apt-get 软链接..."
mkdir -p /usr/local/bin
rm -f /usr/local/bin/apt-get 2>/dev/null || true
ln -sf "$COMPAT_SCRIPTS_DIR/apt-get" /usr/local/bin/apt-get
print_success "✅ /usr/local/bin/apt-get 软链接已创建"

# 验证
print_info "验证 apt-get wrapper..."

if "$COMPAT_SCRIPTS_DIR/apt-get" --version &>/dev/null; then
    print_success "✅ 中心存储脚本可用"
else
    print_warning "⚠️  中心存储脚本验证失败"
fi

if /usr/bin/apt-get --version &>/dev/null; then
    print_success "✅ /usr/bin/apt-get 可用"
else
    print_warning "⚠️  /usr/bin/apt-get 验证失败"
fi

if /usr/local/bin/apt-get --version &>/dev/null; then
    print_success "✅ /usr/local/bin/apt-get 可用"
else
    print_warning "⚠️  /usr/local/bin/apt-get 验证失败"
fi

# 验证 PATH 中能找到
if which apt-get &>/dev/null; then
    apt_path=$(which apt-get)
    print_success "✅ which apt-get: $apt_path"
else
    print_warning "⚠️  which apt-get 未找到（但脚本已创建和链接）"
fi

print_success "GitHub Actions 兼容性配置完成（v3.2 - JSON + jq 版本）"

# ============================================================================
# JSON 配置文件信息输出
# ============================================================================
print_header "JSON 配置文件信息（使用 jq 处理）"
echo -e "${GREEN}配置文件位置:${NC}"
echo "  📄 包名映射表:   $PACKAGE_MAP_FILE"
echo "  📄 忽略列表:     $IGNORE_LIST_FILE"

echo -e "\n${GREEN}当前映射关系:${NC}"
if [[ -f "$PACKAGE_MAP_FILE" ]]; then
    jq -r 'to_entries[] | select(.key | startswith("_") | not) | "  \(.key) → \(.value)"' "$PACKAGE_MAP_FILE" 2>/dev/null | head -10
else
    echo "  (映射表未找到)"
fi

echo -e "\n${GREEN}当前忽略包:${NC}"
if [[ -f "$IGNORE_LIST_FILE" ]]; then
    jq -r '.ignore[]?' "$IGNORE_LIST_FILE" 2>/dev/null | sed 's/^/  /' 
else
    echo "  (忽略列表未找到)"
fi

echo -e "\n${YELLOW}维护说明 - 编辑 JSON 配置:${NC}"
echo "  1️⃣  编辑包名映射表:"
echo "     $PACKAGE_MAP_FILE"
echo "     格式: { \"ubuntu包名\": \"rocky包名\", ... }"
echo "     例: { \"libfuse-dev\": \"fuse3-devel\" }"
echo ""
echo "  2️⃣  编辑忽略列表:"  
echo "     $IGNORE_LIST_FILE"
echo "     格式: { \"ignore\": [\"package1\", \"package2\", ...] }"
echo ""
echo "  3️⃣  验证 JSON 格式 (手动编辑后):"
echo "     jq . $PACKAGE_MAP_FILE"
echo "     jq . $IGNORE_LIST_FILE"
echo ""
echo "  4️⃣  查看 apt-get wrapper 配置:"
echo "     /opt/actions-runner/compat-scripts/apt-get config-info"
echo ""
echo "  5️⃣  再次运行此脚本时，配置文件将被保留（JSON 智能合并）"

# ============================================================================
# 系统信息输出
# ============================================================================

print_header "安装完成，系统信息总结"

echo -e "${GREEN}已启用的仓库:${NC}"
dnf repolist enabled 2>/dev/null | grep -E "^(appstream|baseos|crb|epel|extras)" || true

echo -e "\n${GREEN}关键工具验证:${NC}"
for tool in gcc g++ make pkg-config git curl dnf python3; do
    if command -v "$tool" &>/dev/null; then
        version=$($tool --version 2>&1 | head -n1)
        print_success "$tool: $version"
    else
        print_error "$tool: 未找到"
    fi
done

echo -e "\n${GREEN}关键库文件验证:${NC}"
libs=(
    "/usr/include/fuse.h:FUSE支持"
    "/usr/include/zlib.h:zlib支持"
    "/usr/include/openssl/ssl.h:OpenSSL支持"
    "/usr/include/ncurses.h:ncurses支持"
)
for lib_entry in "${libs[@]}"; do
    lib_file="${lib_entry%%:*}"
    lib_desc="${lib_entry##*:}"
    if [[ -f "$lib_file" ]]; then
        print_success "$lib_desc"
    else
        print_warning "$lib_desc: 未找到"
    fi
done

echo -e "\n${GREEN}系统资源:${NC}"
cpu_count=$(nproc)
mem_total=$(free -h | awk '/^Mem:/ {print $2}')
disk_usage=$(df -h / | awk 'NR==2 {print $2}')
echo "CPU 核心数: $cpu_count"
echo "总内存: $mem_total"
echo "根分区大小: $disk_usage"

# ============================================================================
# 环境验证和修复命令的创建（便于后续快速修复）
# ============================================================================

print_header "创建环境验证和修复工具"

# 创建 verify-env 脚本（验证环境完整性）
cat > "$COMPAT_SCRIPTS_DIR/verify-env" << 'VERIFY_SCRIPT'
#!/bin/bash
# 验证 Rocky Linux CI 环境完整性

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Rocky Linux CI Environment Verification ==="
echo ""

# 检查关键库
echo "Checking required libraries..."
required_packages=(
    "fuse3-devel:FUSE development"
    "pkgconf-pkg-config:Package config"
    "nfs-utils:NFS utilities"
    "gcc:GNU C Compiler"
    "gcc-c++:GNU C++ Compiler"
    "python3-devel:Python development"
    "openssl-devel:OpenSSL development"
    "zlib-devel:zlib development"
    "ncurses-devel:ncurses development"
)

failed_packages=()
for entry in "${required_packages[@]}"; do
    pkg="${entry%%:*}"
    desc="${entry##*:}"
    if rpm -q "$pkg" &>/dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} $desc ($pkg)"
    else
        echo -e "${RED}❌${NC} $desc ($pkg) - MISSING"
        failed_packages+=("$pkg")
    fi
done

# 检查工具
echo ""
echo "Checking required tools..."
tools=(
    "gcc"
    "g++"
    "make"
    "pkg-config"
    "git"
    "curl"
    "jq"
    "dnf"
    "python3"
)

tools_failed=0
for cmd in "${tools[@]}"; do
    if command -v "$cmd" &>/dev/null; then
        version=$($cmd --version 2>&1 | head -n1 | cut -d' ' -f1-3)
        echo -e "${GREEN}✅${NC} $cmd: $version"
    else
        echo -e "${RED}❌${NC} $cmd - NOT FOUND"
        ((tools_failed++))
    fi
done

# 检查 apt-get wrapper
echo ""
echo "Checking apt-get wrapper..."
if [[ -x /usr/bin/apt-get ]]; then
    echo -e "${GREEN}✅${NC} /usr/bin/apt-get is executable"
else
    echo -e "${RED}❌${NC} /usr/bin/apt-get not found or not executable"
fi

if [[ -x /usr/local/bin/apt-get ]]; then
    echo -e "${GREEN}✅${NC} /usr/local/bin/apt-get is executable"
else
    echo -e "${RED}❌${NC} /usr/local/bin/apt-get not found or not executable"
fi

# JSON 配置检查
echo ""
echo "Checking JSON configuration files..."
COMPAT_SCRIPTS_DIR="/opt/actions-runner/compat-scripts"
if [[ -f "$COMPAT_SCRIPTS_DIR/package-map.json" ]]; then
    if jq . "$COMPAT_SCRIPTS_DIR/package-map.json" &>/dev/null 2>&1; then
        count=$(jq 'to_entries | map(select(.key | startswith("_") | not)) | length' "$COMPAT_SCRIPTS_DIR/package-map.json" 2>/dev/null)
        echo -e "${GREEN}✅${NC} package-map.json ($count mappings)"
    else
        echo -e "${RED}❌${NC} package-map.json is invalid JSON"
    fi
else
    echo -e "${RED}❌${NC} package-map.json not found"
fi

if [[ -f "$COMPAT_SCRIPTS_DIR/ignore-packages.json" ]]; then
    if jq . "$COMPAT_SCRIPTS_DIR/ignore-packages.json" &>/dev/null 2>&1; then
        count=$(jq '.ignore | length' "$COMPAT_SCRIPTS_DIR/ignore-packages.json" 2>/dev/null)
        echo -e "${GREEN}✅${NC} ignore-packages.json ($count ignored packages)"
    else
        echo -e "${RED}❌${NC} ignore-packages.json is invalid JSON"
    fi
else
    echo -e "${RED}❌${NC} ignore-packages.json not found"
fi

# 总结
echo ""
total_failed=$((${#failed_packages[@]} + tools_failed))
if [[ $total_failed -gt 0 ]]; then
    echo -e "${RED}❌ VERIFICATION FAILED${NC} - $total_failed issues found:"
    if [[ ${#failed_packages[@]} -gt 0 ]]; then
        echo ""
        echo "Missing packages:"
        for pkg in "${failed_packages[@]}"; do
            echo "   - $pkg"
        done
        echo ""
        echo "Run: sudo dnf install -y ${failed_packages[@]}"
    fi
    exit 1
else
    echo -e "${GREEN}✅ VERIFICATION PASSED${NC} - Environment is complete"
    exit 0
fi
VERIFY_SCRIPT

chmod +x "$COMPAT_SCRIPTS_DIR/verify-env"
print_success "✅ verify-env 脚本已创建"

# 创建 fix-env 脚本（修复缺失的库）
cat > "$COMPAT_SCRIPTS_DIR/fix-env" << 'FIX_SCRIPT'
#!/bin/bash
# 修复缺失的库或工具

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Fixing Rocky Linux CI Environment ===${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 运行验证
if "$SCRIPT_DIR/verify-env"; then
    echo -e "\n${GREEN}✅ Environment is already complete${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Installing missing packages...${NC}"
echo ""

# 检查缺失的库
missing_packages=()
required_packages=(
    "fuse3-devel"
    "pkgconf-pkg-config"
    "nfs-utils"
    "gcc"
    "gcc-c++"
    "python3-devel"
    "openssl-devel"
    "zlib-devel"
    "ncurses-devel"
)

for pkg in "${required_packages[@]}"; do
    if ! rpm -q "$pkg" &>/dev/null 2>&1; then
        missing_packages+=("$pkg")
        echo -e "${YELLOW}⚠️${NC}  Will install: $pkg"
    fi
done

if [[ ${#missing_packages[@]} -gt 0 ]]; then
    echo ""
    echo -e "${BLUE}Running:${NC} sudo dnf install -y ${missing_packages[@]}"
    echo ""
    sudo dnf install -y "${missing_packages[@]}"
    echo ""
    echo -e "${GREEN}✅ Installation complete${NC}"
else
    echo -e "${GREEN}✅ All required packages are already installed${NC}"
fi

# 重新验证
echo ""
echo -e "${BLUE}Re-verifying environment...${NC}"
"$SCRIPT_DIR/verify-env"
FIX_SCRIPT

chmod +x "$COMPAT_SCRIPTS_DIR/fix-env"
print_success "✅ fix-env 脚本已创建"

# 创建符号链接到 PATH（便于用户直接调用）
ln -sf "$COMPAT_SCRIPTS_DIR/verify-env" /usr/local/bin/verify-rocky-ci-env 2>/dev/null || true
ln -sf "$COMPAT_SCRIPTS_DIR/fix-env" /usr/local/bin/fix-rocky-ci-env 2>/dev/null || true

if [[ -x /usr/local/bin/verify-rocky-ci-env ]]; then
    print_success "✅ verify-rocky-ci-env 命令已创建"
else
    print_warning "⚠️  verify-rocky-ci-env 创建失败"
fi

if [[ -x /usr/local/bin/fix-rocky-ci-env ]]; then
    print_success "✅ fix-rocky-ci-env 命令已创建"
else
    print_warning "⚠️  fix-rocky-ci-env 创建失败"
fi

# ============================================================================
# 脚本执行完成
# ============================================================================

print_header "脚本执行完成"
echo -e "${GREEN}Rocky Linux 9.4/9.7 CI/CD 环境已准备完毕！${NC}"

echo -e "\n${YELLOW}📋 快速命令参考:${NC}"
echo ""
echo "1️⃣  验证环境完整性:"
echo "   verify-rocky-ci-env"
echo "   或"
echo "   /opt/actions-runner/compat-scripts/verify-env"
echo ""
echo "2️⃣  修复缺失的库:"
echo "   fix-rocky-ci-env"
echo "   或"
echo "   /opt/actions-runner/compat-scripts/fix-env"
echo ""
echo "3️⃣  查看 apt-get wrapper 配置:"
echo "   apt-get config-info"
echo ""

echo -e "${YELLOW}📝 下一步:${NC}"
echo "1. 验证 GitHub Actions 工作流程执行"
echo "2. 监控构建日志，确认没有依赖相关的错误"
echo "3. 如环境问题，运行: verify-rocky-ci-env"
echo "4. 若需修复缺失库，运行: fix-rocky-ci-env"
echo ""

echo -e "${YELLOW}📚 更多帮助:${NC}"
echo "• README-v3.2.md - 完整的安装和使用指南"
echo "• 快速参考-JSON配置.md - jq 命令查询"
echo "• 补充兼容性分析报告.md - 与 GitHub Actions workflows 的集成说明"
