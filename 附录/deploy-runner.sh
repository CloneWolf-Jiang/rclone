#!/bin/bash
# ============================================================================
# GitHub Self-hosted Runner - 无人值守部署脚本 v2.331.0
# ============================================================================
# 
# 使用方法：
#   sudo bash deploy-runner.sh --github-url <URL> --token <TOKEN>
#
# 获取 URL 和 Token：
#   1. 访问 GitHub 仓库 -> Settings -> Actions -> Runners
#   2. 点击 "New self-hosted runner"
#   3. 选择 "Linux" -> "x64"
#   4. 页面显示的命令中包含 URL 和 Token（Token 仅显示一次）
#
# 可选参数：
#   --github-url <URL>      GitHub 仓库地址 (必需)
#   --token <TOKEN>         Runner 注册 Token (必需)
#   --runner-name <NAME>    Runner 名称 (默认: 主机名-runner)
#   --work-dir <DIR>        工作目录 (默认: _work)
#   --labels <LABELS>       标签，逗号分隔 (默认: self-hosted,Linux,X64)
#
# 示例：
#   sudo bash deploy-runner.sh \
#     --github-url "https://github.com/username/repo" \
#     --token "XXXXXXXXXXXXXXXXXXXXX"
#
# ============================================================================

set -e

# ============================================================================
# 配置变量
# ============================================================================

GITHUB_URL=""
GITHUB_TOKEN=""
RUNNER_NAME="${HOSTNAME}-runner"
RUNNER_GROUP="Default"
RUNNER_WORK_DIR="_work"
RUNNER_LABELS="self-hosted,Linux,X64"
RUNNER_VERSION="2.331.0"
RUNNER_HOME="/opt/actions-runner"
RUNNER_USER="runner"
RUNNER_GROUP_NAME="runner"

# ============================================================================
# 函数定义
# ============================================================================

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

print_step() {
    echo "[$(date '+%H:%M:%S')] $1"
}

print_success() {
    echo "  ✓ $1"
}

print_info() {
    echo "  ℹ️  $1"
}

print_warning() {
    echo "  ⚠️  $1"
}

print_error() {
    echo "  ✗ $1" >&2
}

# ============================================================================
# 参数解析
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --github-url)
            GITHUB_URL="$2"
            shift 2
            ;;
        --token)
            GITHUB_TOKEN="$2"
            shift 2
            ;;
        --runner-name)
            RUNNER_NAME="$2"
            shift 2
            ;;
        --work-dir)
            RUNNER_WORK_DIR="$2"
            shift 2
            ;;
        --labels)
            RUNNER_LABELS="$2"
            shift 2
            ;;
        --help|-h)
            echo "用法: $0 --github-url <URL> --token <TOKEN> [选项]"
            echo ""
            echo "必需参数："
            echo "  --github-url <URL>    GitHub 仓库地址"
            echo "  --token <TOKEN>       Runner 注册 Token"
            echo ""
            echo "可选参数："
            echo "  --runner-name <NAME>  Runner 名称 (默认: 主机名-runner)"
            echo "  --work-dir <DIR>      工作目录 (默认: _work)"
            echo "  --labels <LABELS>     标签，逗号分隔 (默认: self-hosted,Linux,X64)"
            exit 0
            ;;
        *)
            print_error "未知选项: $1"
            exit 1
            ;;
    esac
done

# ============================================================================
# 验证参数
# ============================================================================

if [[ -z "$GITHUB_URL" ]] || [[ -z "$GITHUB_TOKEN" ]]; then
    print_header "❌ 参数错误"
    print_error "缺少必需参数"
    echo ""
    echo "用法: $0 --github-url <URL> --token <TOKEN>"
    echo ""
    echo "获取 URL 和 Token："
    echo "  1. 访问 GitHub 仓库 -> Settings -> Actions -> Runners"
    echo "  2. 点击 'New self-hosted runner'"
    echo "  3. 选择 'Linux' -> 'x64'"
    echo "  4. 复制显示的 URL 和 Token"
    exit 1
fi

# 验证是否为 root
if [[ $EUID -ne 0 ]]; then
    print_header "❌ 权限错误"
    print_error "此脚本需要 root 或 sudo 权限"
    echo ""
    echo "请使用: sudo bash $0 ..."
    exit 1
fi

# ============================================================================
# 主程序开始
# ============================================================================

print_header "🚀 GitHub Actions Runner 部署"

echo "配置信息："
echo "  版本:      $RUNNER_VERSION"
echo "  安装路径:  $RUNNER_HOME"
echo "  Runner用户: $RUNNER_USER"
echo "  Runner名称: $RUNNER_NAME"
echo "  工作目录:  $RUNNER_WORK_DIR"
echo "  GitHub URL: $GITHUB_URL"
echo ""

read -p "是否继续？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

# ============================================================================
# 步骤 1：创建专用用户和组
# ============================================================================

print_step "[1/7] 创建 Runner 专用用户"

if id "$RUNNER_USER" &>/dev/null; then
    print_info "用户 $RUNNER_USER 已存在"
else
    useradd -m -s /bin/bash "$RUNNER_USER"
    print_success "用户已创建"
fi

if getent group "$RUNNER_GROUP_NAME" &>/dev/null; then
    print_info "组 $RUNNER_GROUP_NAME 已存在"
else
    groupadd "$RUNNER_GROUP_NAME"
    usermod -a -G "$RUNNER_GROUP_NAME" "$RUNNER_USER"
    print_success "组已创建"
fi

# 添加 sudo 权限
if ! grep -q "^$RUNNER_USER" /etc/sudoers.d/runner 2>/dev/null; then
    {
        echo "# Allow runner user to run svc.sh without password"
        echo "$RUNNER_USER ALL=(ALL) NOPASSWD: $RUNNER_HOME/svc.sh"
        echo "$RUNNER_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl"
    } > /etc/sudoers.d/runner
    chmod 440 /etc/sudoers.d/runner
    print_success "sudo 权限已配置"
fi

# ============================================================================
# 步骤 2：准备安装目录
# ============================================================================

print_step "[2/7] 准备安装目录"

if [[ -d "$RUNNER_HOME" ]]; then
    print_info "目录 $RUNNER_HOME 已存在"
    
    if [[ -f "$RUNNER_HOME/.runner" ]]; then
        cd "$RUNNER_HOME"
        
        # 尝试停止现有服务
        SERVICE_NAME=$(systemctl list-units --type=service --no-pager 2>/dev/null | grep -o "actions\.runner\.[^ ]*" | head -1)
        if [[ -n "$SERVICE_NAME" ]]; then
            print_info "停止现有 Runner 服务..."
            systemctl stop "$SERVICE_NAME" || true
            sleep 2
        fi
    fi
else
    mkdir -p "$RUNNER_HOME"
    print_success "目录已创建"
fi

chown -R "$RUNNER_USER:$RUNNER_GROUP_NAME" "$RUNNER_HOME"
cd "$RUNNER_HOME"
print_success "目录权限已设置"

# ============================================================================
# 步骤 3：下载 Runner
# ============================================================================

print_step "[3/7] 下载 Runner v$RUNNER_VERSION"

# 清理旧文件
rm -f actions-runner-linux-x64*.tar.gz

DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

if command -v wget &>/dev/null; then
    print_info "使用 wget 下载..."
    if wget --quiet --show-progress "$DOWNLOAD_URL"; then
        print_success "下载完成"
    else
        print_error "下载失败，请检查网络连接"
        echo ""
        echo "下载地址: $DOWNLOAD_URL"
        exit 1
    fi
elif command -v curl &>/dev/null; then
    print_info "使用 curl 下载..."
    if curl -L -O -# "$DOWNLOAD_URL"; then
        print_success "下载完成"
    else
        print_error "下载失败，请检查网络连接"
        exit 1
    fi
else
    print_error "未找到 wget 或 curl"
    exit 1
fi

# ============================================================================
# 步骤 4：解压并安装依赖
# ============================================================================

print_step "[4/7] 解压 Runner"

if tar tzf "actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" &>/dev/null; then
    tar xzf "actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
    chown -R "$RUNNER_USER:$RUNNER_GROUP_NAME" "$RUNNER_HOME"
    print_success "解压完成"
else
    print_error "文件损坏或不是 gzip 格式"
    rm -f "actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
    exit 1
fi

# ============================================================================
# 步骤 5：安装依赖
# ============================================================================

print_step "[5/7] 安装依赖"

if [[ -f "bin/installdependencies.sh" ]]; then
    chmod +x "bin/installdependencies.sh"
    bash "bin/installdependencies.sh"
    print_success "依赖安装完成"
else
    print_warning "未找到 installdependencies.sh，跳过"
fi

# ============================================================================
# 步骤 6：配置 Runner（非交互式）
# ============================================================================

print_step "[6/7] 配置 Runner"

# 切换到 runner 用户执行配置
su - "$RUNNER_USER" << EOF
cd "$RUNNER_HOME"

# 如果已有配置，先删除
rm -f .runner .credentials .credentials_rsaparams

# 运行配置（无需交互）
./config.sh \
    --url "$GITHUB_URL" \
    --token "$GITHUB_TOKEN" \
    --name "$RUNNER_NAME" \
    --runnergroup "$RUNNER_GROUP" \
    --work "$RUNNER_WORK_DIR" \
    --labels "$RUNNER_LABELS" \
    --unattended \
    --replace

echo "  配置完成"
EOF

if [[ -f "$RUNNER_HOME/.runner" ]]; then
    print_success "Runner 已配置"
else
    print_error "配置失败，请检查 URL 和 Token"
    exit 1
fi

# ============================================================================
# 步骤 7：安装并启动服务
# ============================================================================

print_step "[7/7] 安装并启动服务"

cd "$RUNNER_HOME"

# 安装服务
su - "$RUNNER_USER" -c "cd $RUNNER_HOME && ./svc.sh install"
print_success "服务已安装"

# 启用服务开机自启
SERVICE_NAME=$(systemctl list-units --type=service --no-pager 2>/dev/null | grep -o "actions\.runner\.[^ ]*" | head -1)
if [[ -n "$SERVICE_NAME" ]]; then
    systemctl enable "$SERVICE_NAME"
    print_success "服务已启用开机自启"
fi

# 启动服务
systemctl start "$SERVICE_NAME"
sleep 3

# 检查服务状态
if systemctl is-active --quiet "$SERVICE_NAME"; then
    print_success "Runner 服务已启动"
else
    print_error "Runner 服务启动失败"
    echo ""
    echo "检查日志："
    systemctl status "$SERVICE_NAME" --no-pager || true
    echo ""
    echo "详细日志："
    journalctl -u "$SERVICE_NAME" -n 30 || true
    exit 1
fi

# ============================================================================
# 部署完成
# ============================================================================

print_header "✅ 部署成功！"

echo "Runner 信息："
echo "  • 名称:     $RUNNER_NAME"
echo "  • 用户:     $RUNNER_USER"
echo "  • 路径:     $RUNNER_HOME"
echo "  • 服务:     $SERVICE_NAME"
echo "  • 状态:     运行中"
echo ""

echo "后续操作："
echo "  1. 访问 GitHub 仓库 Settings -> Actions -> Runners"
echo "     确认 '$RUNNER_NAME' 显示为 'Idle'"
echo ""
echo "  2. 常用命令："
echo "     # 查看服务状态"
echo "     systemctl status $SERVICE_NAME"
echo ""
echo "     # 查看实时日志"
echo "     journalctl -u $SERVICE_NAME -f"
echo ""
echo "     # 停止服务"
echo "     sudo systemctl stop $SERVICE_NAME"
echo ""
echo "     # 重启服务"
echo "     sudo systemctl restart $SERVICE_NAME"
echo ""

echo "🎉 现在可以在 GitHub 发起 CI/CD 任务，Runner 会自动执行！"
echo ""
