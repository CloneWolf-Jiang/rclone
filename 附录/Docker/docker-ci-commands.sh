#!/bin/bash
# Docker CI 常用命令集合
# 用途：快速参考和执行常见任务
# 版本：2.0（含本地环境验证集成）

# ============================================================================
# 预期目录结构
# ============================================================================
# ~/rclone/                             ← 项目根目录
# ├── Dockerfile.ci                     ← 容器镜像定义
# ├── docker-ci-commands.sh             ← 此脚本（在此目录运行）
# ├── Docker/                           ← 文档和验证脚本目录
# │   ├── verify-docker-runner.sh       ← 单独的本地验证脚本
# │   ├── Docker-Runner-部署验证指南.md ← 使用说明文档
# │   └── ...                           ← 其他参考文档
# ├── .github/
# │   └── workflows/
# │       └── docker-runner-verify.yml  ← GitHub Actions 验证工作流
# └── ... （其他项目文件）
#
# 使用方法：
#   cd ~/rclone
#   ./docker-ci-commands.sh build      ← 构建并验证（集成本地环境检查）
#   ./docker-ci-commands.sh run-make   ← 运行编译
#   ./docker-ci-commands.sh verify     ← 验证环境
#
# ============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;35m'
NC='\033[0m'

# ============================================================================
# 帮助信息
# ============================================================================

print_help() {
    cat << 'EOF'
Docker CI 常用命令集合

用法: ./docker-ci-commands.sh <command> [options]

命令:

  # 镜像操作
  build              构建 CI 镜像
  build --no-cache   构建镜像（不使用缓存）
  images             列出 rclone CI 镜像
  inspect            查看镜像详情
  history            查看镜像构建历史
  rm [镜像名]        删除 CI 镜像（留空为 rclone-ci:latest）

  # 容器操作
  run                交互式进入容器
  run-make           运行编译命令
  run-test           运行测试
  verify             验证 CI 环境
  logs               查看容器日志
  stats              实时监控容器资源

  # Compose 操作
  compose-up         启动 docker-compose 环境
  compose-down       停止 docker-compose 环境
  compose-clean      停止并删除所有（包括卷）
  compose-logs       查看 compose 日志
  compose-shell      进入 compose 容器

  # 安装和配置
  setup              安装 Docker Engine（清华源 - Rocky 9.x）
  setup-mirrors      检测和配置 Docker 镜像源（自动选优）

  # 工具命令
  preload-modules    预加载 Go modules（加快后续构建）
  cleanup            清理 Docker 空间（镜像、卷等）
  disk-usage         查看 Docker 磁盘使用情况
  cache-usage        查看构建缓存使用情况（详细）
  cache-clean        清理未使用的构建缓存
  benchmark          性能对比（编译耗时）

  # 开发辅助
  shell              进入容器 Bash
  go-version         查看 Go 版本
  env                显示容器内环境变量

  # Screen 会话（长时间任务）
  screen-build       在 screen 中运行构建（SSH断开后继续运行）
  screen-make        在 screen 中运行编译
  screen-list        列出所有 screen 会话
  screen-attach      连接到指定的 screen 会话

示例:
  ./docker-ci-commands.sh setup              # 首次运行：安装 Docker
  ./docker-ci-commands.sh setup-mirrors      # 配置国内镜像源
  ./docker-ci-commands.sh build              # 构建 rclone-ci 镜像
  ./docker-ci-commands.sh run-make           # 运行编译
EOF
}

# ============================================================================
# 通用函数
# ============================================================================

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

check_docker() {
    if ! command -v docker &>/dev/null; then
        log_error "Docker 未安装"
        exit 1
    fi
    
    # 检查 Docker 权限
    if ! docker ps &>/dev/null 2>&1; then
        local current_user=$(whoami)
        echo ""
        log_error "Docker 权限检查失败"
        echo ""
        
        # 检查是否是 group 权限问题
        if groups $current_user | grep -q docker; then
            # 用户在 docker group 中，但仍然无法访问（可能是 socket 权限问题）
            log_error "用户 '$current_user' 在 docker group 中，但 Docker socket 权限可能有问题"
            echo "尝试修复："
            echo "  sudo chown root:docker /var/run/docker.sock"
            echo "  sudo chmod 660 /var/run/docker.sock"
        else
            # 用户不在 docker group 中
            log_error "用户 '$current_user' 没有 Docker 访问权限"
            echo ""
            echo "修复步骤（一次性）："
            echo "  1. 将用户添加到 docker group："
            echo "     sudo usermod -aG docker $current_user"
            echo "  2. 刷新 group 成员关系："
            echo "     su - $current_user              # 或 newgrp docker"
            echo "  3. 验证权限："
            echo "     docker ps                       # 应该显示容器列表"
        fi
        echo ""
        exit 1
    fi
}

# ============================================================================
# 镜像操作
# ============================================================================

cmd_build() {
    check_docker
    log_info "开始构建 rclone CI 镜像..."
    echo ""
    
    # ========================================================================
    # 清理遗留容器和镜像
    # ========================================================================
    log_info "清理遗留容器..."
    docker container prune -f &>/dev/null || true
    
    # ========================================================================
    # 本地验证阶段（集成 verify-docker-runner.sh 的检查）
    # ========================================================================
    
    log_info "第 1 步：系统环境检查"
    echo "  ✓ 操作系统: $(uname -s)"
    echo "  ✓ 内核版本: $(uname -r)"
    echo "  ✓ 主机名: $(hostname)"
    echo "  ✓ 当前用户: $(whoami)"
    echo ""
    
    log_info "第 2 步：Docker 环境验证"
    DOCKER_VERSION=$(docker --version)
    echo "  ✓ $DOCKER_VERSION"
    
    if ! systemctl is-active --quiet docker 2>/dev/null; then
        log_warn "Docker 服务未运行，尝试启动..."
        sudo systemctl start docker || { log_error "无法启动 Docker"; exit 1; }
    fi
    echo "  ✓ Docker 服务正在运行"
    echo ""
    
    log_info "第 3 步：Docker 功能测试"
    if docker run --rm alpine:latest uname -m &>/dev/null; then
        echo "  ✓ 容器执行正常"
    else
        log_error "容器执行失败"
        exit 1
    fi
    
    # 测试数据卷挂载
    mkdir -p /tmp/docker-vol-test
    echo "test" > /tmp/docker-vol-test/test.txt
    if docker run --rm -v /tmp/docker-vol-test:/data alpine cat /data/test.txt &>/dev/null; then
        echo "  ✓ 数据卷挂载正常"
    else
        log_error "数据卷挂载失败"
        exit 1
    fi
    rm -rf /tmp/docker-vol-test
    
    # 清理测试镜像（释放空间）- 注释掉以备后用
    # docker image rm alpine:latest 2>/dev/null || true
    
    echo ""
    
    log_info "第 4 步：网络连接检查"
    if timeout 5 curl -s -I https://github.com >/dev/null 2>&1; then
        echo "  ✓ GitHub 连接正常"
    else
        log_warn "  ⚠ GitHub 连接可能受限（镜像拉取时会验证）"
    fi
    echo ""
    
    log_info "第 5 步：系统资源检查"
    CPU_CORES=$(nproc)
    echo "  ✓ CPU 核心数: $CPU_CORES"
    
    TOTAL_MEM=$(free -h 2>/dev/null | awk 'NR==2 {print $2}' || echo "unknown")
    echo "  ✓ 内存容量: $TOTAL_MEM"
    
    ROOT_PERCENT=$(df / 2>/dev/null | awk 'NR==2 {print $5}' | sed 's/%//' || echo "0")
    if [ $ROOT_PERCENT -lt 80 ]; then
        echo "  ✓ 磁盘使用率: ${ROOT_PERCENT}%（正常）"
    elif [ $ROOT_PERCENT -lt 90 ]; then
        log_warn "  ⚠ 磁盘使用率: ${ROOT_PERCENT}%（偏高）"
    else
        log_error "磁盘使用率过高: ${ROOT_PERCENT}%"
        exit 1
    fi
    echo ""
    
    # ========================================================================
    # 环境验证完成，开始构建镜像
    # ========================================================================
    
    log_success "环境验证通过，开始构建镜像..."
    echo ""
    
    local cache_args=""
    if [[ "$1" == "--no-cache" ]]; then
        cache_args="--no-cache"
        log_warn "禁用缓存（首次构建会更慢）"
    fi
    
    # 检查 Dockerfile.ci 是否存在
    if [[ ! -f "Dockerfile.ci" ]]; then
        log_error "Dockerfile.ci 不存在，请确保在项目根目录运行此脚本"
        exit 1
    fi
    
    log_info "构建 Docker 镜像..."
    docker build $cache_args -f Dockerfile.ci -t rclone-ci:latest . && \
        log_success "镜像构建成功: rclone-ci:latest" || \
        { log_error "镜像构建失败"; exit 1; }
    
    log_info "验证镜像功能..."
    if ! docker run --rm --entrypoint /bin/sh rclone-ci:latest -c "gcc --version" > /dev/null 2>&1; then
        log_error "镜像验证失败：gcc 不可用"
        exit 1
    fi
    if ! docker run --rm --entrypoint /bin/sh rclone-ci:latest -c "go version" > /dev/null 2>&1; then
        log_error "镜像验证失败：go 不可用"
        exit 1
    fi
    log_success "镜像功能验证通过"
    echo ""
    
    log_info "镜像信息："
    docker images | grep rclone-ci
    echo ""
    
    log_success "✅ rclone-ci 镜像构建完成！"
    echo ""
    echo "后续步骤："
    echo "  1. 运行编译测试:     ./docker-ci-commands.sh run-make"
    echo "  2. 验证环境:          ./docker-ci-commands.sh verify"
    echo "  3. 交互式容器:        ./docker-ci-commands.sh run"
}

cmd_images() {
    check_docker
    log_info "列出 rclone CI 镜像..."
    docker images | grep rclone-ci || echo "（未找到镜像，请先运行: ./docker-ci-commands.sh build）"
}

cmd_inspect() {
    check_docker
    log_info "查看镜像详情..."
    if docker image inspect rclone-ci:latest &>/dev/null; then
        docker image inspect rclone-ci:latest | jq .
    else
        log_error "镜像不存在，请先运行: ./docker-ci-commands.sh build"
    fi
}

cmd_history() {
    check_docker
    log_info "查看镜像构建历史..."
    docker history -H rclone-ci:latest
}

cmd_rm() {
    check_docker
    local image_name="${1:-rclone-ci:latest}"
    
    log_info "检查镜像: $image_name"
    if ! docker image inspect "$image_name" &>/dev/null; then
        log_error "镜像不存在: $image_name"
        log_info "可用镜像列表:"
        docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep -i rclone || echo "没有找到与 rclone 相关的镜像"
        echo ""
        log_info "💡 提示："
        echo "  - 首次使用需先构建镜像: ./docker-ci-commands.sh build"
        echo "  - 若删除其他镜像，请指定镜像名: ./docker-ci-commands.sh rm <镜像名>"
        return 1
    fi
    
    log_warn "删除镜像: $image_name"
    if docker image rm -f "$image_name"; then
        log_success "镜像已删除: $image_name"
    else
        log_error "镜像删除失败"
        return 1
    fi
}

# ============================================================================
# 容器操作
# ============================================================================

cmd_run() {
    check_docker
    log_info "启动交互式容器..."
    docker run -it --rm \
        -v "$(pwd)":/workspace \
        -w /workspace \
        rclone-ci:latest \
        bash
}

cmd_run_make() {
    check_docker
    log_info "运行编译命令..."
    docker run --rm \
        -v "$(pwd)":/workspace \
        -w /workspace \
        rclone-ci:latest \
        bash -c "go mod download && make"
}

cmd_run_test() {
    check_docker
    log_info "运行测试命令..."
    docker run --rm \
        -v "$(pwd)":/workspace \
        -w /workspace \
        rclone-ci:latest \
        bash -c "go mod download && go test -v -short ./..."
}

cmd_verify() {
    check_docker
    log_info "验证 CI 环境..."
    docker run --rm --entrypoint /bin/sh rclone-ci:latest -c "gcc --version && g++ --version && go version && echo '✅ CI 环境验证通过'"
}

cmd_logs() {
    local container_id=$(docker ps -ql)
    if [[ -z "$container_id" ]]; then
        log_warn "没有运行中的容器"
        return
    fi
    log_info "查看容器日志..."
    docker logs -f "$container_id"
}

cmd_stats() {
    local container_id=$(docker ps -ql)
    if [[ -z "$container_id" ]]; then
        log_warn "没有运行中的容器"
        return
    fi
    log_info "监控容器资源...（按 Ctrl+C 退出）"
    docker stats --no-stream "$container_id" || docker stats "$container_id"
}

# ============================================================================
# Docker Compose 操作
# ============================================================================

cmd_compose_up() {
    if ! command -v docker-compose &>/dev/null; then
        log_error "docker-compose 未安装"
        exit 1
    fi
    log_info "启动 docker-compose 环境..."
    docker-compose up -d && \
        log_success "环境已启动" || \
        { log_error "启动失败"; exit 1; }
}

cmd_compose_down() {
    if ! command -v docker-compose &>/dev/null; then
        log_error "docker-compose 未安装"
        exit 1
    fi
    log_info "停止 docker-compose 环境..."
    docker-compose down && \
        log_success "环境已停止" || \
        log_warn "停止失败（可能已停止）"
}

cmd_compose_clean() {
    if ! command -v docker-compose &>/dev/null; then
        log_error "docker-compose 未安装"
        exit 1
    fi
    log_warn "停止并删除所有容器和卷（不可恢复）..."
    read -p "确认？(yes/no): " confirm
    if [[ "$confirm" == "yes" ]]; then
        docker-compose down -v && \
            log_success "清理完成" || \
            log_warn "清理失败"
    else
        log_warn "已取消"
    fi
}

cmd_compose_logs() {
    if ! command -v docker-compose &>/dev/null; then
        log_error "docker-compose 未安装"
        exit 1
    fi
    log_info "查看 compose 日志...（按 Ctrl+C 退出）"
    docker-compose logs -f runner
}

cmd_compose_shell() {
    if ! command -v docker-compose &>/dev/null; then
        log_error "docker-compose 未安装"
        exit 1
    fi
    log_info "进入 compose 容器..."
    docker-compose exec runner bash
}

# ============================================================================
# 安装和配置
# ============================================================================

cmd_setup() {
    log_warn "开始安装 Docker Engine (清华源 - Rocky 9.x)..."
    
    # 检查系统
    if ! command -v dnf &>/dev/null; then
        log_error "此脚本仅支持 Rocky 9.x 系统（使用 dnf）"
        exit 1
    fi
    
    log_info "第 1 步：移除旧版本 Docker（如果存在）"
    sudo dnf remove -y docker-ce docker-ce-cli containerd.io docker-compose-plugin &>/dev/null || true
    log_success "旧版本检查完毕"
    
    log_info "第 2 步：安装基础依赖"
    sudo dnf install -y \
        yum-utils \
        device-mapper-persistent-data \
        lvm2 \
        curl \
        bind-utils \
        jq \
        screen
    
    log_info "第 3 步：添加清华源"
    sudo dnf config-manager --add-repo \
        https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/centos/docker-ce.repo
    
    log_info "第 4 步：修改 repo 优化清华源路径"
    sudo sed -i 's|https://download.docker.com|https://mirrors.tuna.tsinghua.edu.cn/docker-ce|g' \
        /etc/yum.repos.d/docker-ce.repo
    
    log_info "第 5 步：更新 dnf 缓存"
    sudo dnf makecache
    
    log_info "第 6 步：安装 Docker Engine 最新版本"
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    log_info "第 7 步：启动 Docker 服务"
    sudo systemctl start docker && log_success "已启动 Docker" || log_error "启动失败"
    sudo systemctl enable docker && log_success "已设置开机自启" || log_error "设置失败"
    
    log_info "第 8 步：验证安装"
    sudo docker --version
    sudo docker info
    
    log_success "✅ Docker 安装完成！"
    echo ""
    log_warn "💡 配置 sudo-free 权限（可选但推荐）："
    local current_user=$(whoami)
    echo -e "${YELLOW}执行以下命令:${NC}"
    echo -e "${YELLOW}    sudo usermod -aG docker $current_user${NC}"
    echo -e "${YELLOW}    newgrp docker${NC}"
    echo ""
    echo -e "${YELLOW}完成后可以验证:${NC}"
    echo -e "${YELLOW}    docker run hello-world${NC}"
}

cmd_setup_mirrors() {
    check_docker
    log_warn "检测和配置 Docker 镜像源（自动选优）..."
    
    # 创建临时目录
    local temp_dir=$(mktemp -d)
    local results_file="$temp_dir/mirror_results.csv"
    
    log_info "测试镜像源响应时间和可用性..."
    echo "Mirror,HTTP_Code,Status,Time(s),Size(KB),Reachable" > "$results_file"
    
    # 定义镜像源列表（仅保留实际可用的源）
    # 2026-02-20 验证：仅这3个源在中国大陆可用
    local mirrors=(
        "https://mirrors.aliyun.com"
        "https://docker.mirrors.ustc.edu.cn"
        "https://hub-mirror.c.163.com"
    )
    
    # HTTP 状态码映射
    declare -A status_desc=(
        [000]="无法连接"
        [200]="正常访问"
        [301]="永久重定向"
        [302]="临时重定向"
        [401]="需要认证"
        [403]="禁止访问"
        [404]="不存在"
        [500]="服务器错误"
        [503]="服务不可用"
    )
    
    local valid_mirrors=()
    
    for mirror in "${mirrors[@]}"; do
        log_info "  🔍 测试: $mirror"
        
        # 改进的 curl 命令：跟随重定向、设置总超时、获取HTTP码+耗时+下载大小
        local response=$(curl -sS -L --max-time 10 -o /dev/null -w "%{http_code},%{time_total},%{size_download}" --connect-timeout 5 "$mirror" 2>/dev/null || echo "000,0,0")
        
        # 解析返回值
        local http_code=$(echo "$response" | cut -d',' -f1)
        local time_total=$(echo "$response" | cut -d',' -f2)
        local size_download=$(echo "$response" | cut -d',' -f3)
        
        # 转换大小为 KB
        local size_kb=$((size_download / 1024))
        [[ $size_kb -lt 0 ]] && size_kb=0
        
        # 获取状态描述
        local status_text="${status_desc[$http_code]}"
        [[ -z "$status_text" ]] && status_text="未知状态($http_code)"
        
        # 记录结果
        echo "$mirror,$http_code,$status_text,$time_total,${size_kb}KB,$([[ "$http_code" == "200" ]] && echo "YES" || echo "NO")" >> "$results_file"
        
        # 如果响应 200，添加到有效镜像列表
        if [[ "$http_code" == "200" ]]; then
            valid_mirrors+=("$mirror")
            log_success "  ✓ $mirror (响应: $status_text, 耗时: ${time_total}s, 大小: ${size_kb}KB)"
        else
            log_warn "  ✗ $mirror (响应: $status_text, 耗时: ${time_total}s)"
        fi
    done
    
    if [[ ${#valid_mirrors[@]} -eq 0 ]]; then
        log_error "无法找到可用的镜像源"
        rm -rf "$temp_dir"
        exit 1
    fi
    
    log_success "🎯 找到 ${#valid_mirrors[@]} 个可用镜像源"
    
    log_info "配置 /etc/docker/daemon.json..."
    
    # 构建镜像列表 JSON 格式
    local mirrors_json="["
    for i in "${!valid_mirrors[@]}"; do
        mirrors_json+="\"${valid_mirrors[$i]}\""
        if [[ $i -lt $((${#valid_mirrors[@]} - 1)) ]]; then
            mirrors_json+=", "
        fi
    done
    mirrors_json+="]"
    
    # 创建或更新 daemon.json
    if [[ ! -f /etc/docker/daemon.json ]]; then
        sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
    "registry-mirrors": $mirrors_json
}
EOF
    else
        # 使用 jq 或 sed 更新现有文件
        if command -v jq &>/dev/null; then
            sudo jq ".\"registry-mirrors\" = $mirrors_json" /etc/docker/daemon.json | sudo tee /etc/docker/daemon.json.tmp > /dev/null
            sudo mv /etc/docker/daemon.json.tmp /etc/docker/daemon.json
        else
            log_warn "⚠️  jq 未安装，使用文本编辑"
            sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak
            # 逃避 mirrors_json 中的特殊字符
            local escaped_json=$(echo "$mirrors_json" | sed 's/[\/&]/\\&/g')
            sudo sed -i 's|"registry-mirrors": \[.*\]|"registry-mirrors": '"$escaped_json"'|g' /etc/docker/daemon.json
        fi
    fi
    
    log_info "重启 Docker 服务..."
    sudo systemctl daemon-reload && log_success "已重载配置" || log_error "重载失败"
    sudo systemctl restart docker && log_success "已重启 Docker" || log_error "重启失败"
    
    log_info "验证配置..."
    sudo docker info | grep -A 2 "Registry Mirrors"
    
    log_success "✅ 镜像源配置完成！"
    log_info "测试结果已保存: $results_file"
    echo ""
    log_info "配置的镜像源列表（${#valid_mirrors[@]} 个）："
    for mirror in "${valid_mirrors[@]}"; do
        echo -e "  ${GREEN}✓${NC} $mirror"
    done
    echo ""
    log_info "详细测试报告："
    cat "$results_file"
}

# ============================================================================
# 工具命令
# ============================================================================

cmd_preload_modules() {
    check_docker
    log_info "预加载 Go modules（这可能需要几分钟）..."
    docker run --rm \
        -v "$(pwd)":/workspace \
        -w /workspace \
        rclone-ci:latest \
        bash -c "echo '下载 modules...' && go mod download && echo '✅ 预加载完成'"
}

cmd_cleanup() {
    check_docker
    log_warn "清理 Docker 冗余数据（未使用的镜像、卷、网络）..."
    log_info "这不会删除 rclone-ci 镜像"
    
    echo ""
    log_info "清理未使用的镜像..."
    docker image prune -f --filter "label!=keep=true"
    
    log_info "清理未使用的卷..."
    docker volume prune -f
    
    log_info "清理未使用的网络..."
    docker network prune -f
    
    docker builder prune -f
    
    log_success "清理完成！"
}

cmd_disk_usage() {
    check_docker
    log_info "Docker 磁盘使用情况..."
    echo ""
    docker system df
}

cmd_cache_usage() {
    check_docker
    log_info "构建缓存详细信息..."
    echo ""
    
    # 检查 docker buildx 是否可用
    if ! command -v docker &>/dev/null || ! docker buildx ls &>/dev/null 2>&1; then
        log_warn "注：使用 'docker system df' 显示总体信息"
        echo ""
        docker system df
        echo ""
        log_info "尝试 'docker buildx du' 需要 Docker BuildKit 支持..."
        return
    fi
    
    log_info "总体磁盘使用："
    docker system df
    echo ""
    
    log_info "构建缓存详情（按大小降序）："
    if docker buildx du 2>/dev/null | grep -q "^ID"; then
        docker buildx du | tail -n +2 | sort -k3 -hr
        echo ""
        log_info "说明："
        echo "  - ID: 缓存层唯一标识（例：xbtjcctlg7r8hp6y6ygilevp7）"
        echo "  - RECLAIMABLE: true = 未使用（可清理），false = 使用中"
        echo "  - SIZE: 缓存大小"
        echo "  - LAST ACCESSED: 最后使用时间"
        echo ""
        log_warn "⚠️  说明：无法直接查看是哪个构建步骤的缓存或是否来自失败构建"
        echo "          但可以通过重新构建来验证缓存是否命中"
    else
        log_warn "docker buildx du 不可用，显示基本信息："
        docker system df
    fi
}

cmd_cache_clean() {
    check_docker
    log_warn "清理未使用的构建缓存..."
    echo ""
    
    log_info "当前缓存空间占用："
    docker system df | grep "Build Cache"
    echo ""
    
    log_warn "执行清理（删除所有未使用的缓存）..."
    docker buildx prune -f --all
    
    echo ""
    log_info "清理后缓存空间占用："
    docker system df | grep "Build Cache"
    echo ""
    
    log_success "✅ 缓存清理完成！"
}

cmd_benchmark() {
    check_docker
    log_warn "编译性能对比测试（需要一些时间）..."
    
    log_info "第 1 次编译（热缓存）..."
    time docker run --rm \
        -v "$(pwd)":/workspace \
        -w /workspace \
        rclone-ci:latest \
        bash -c "go mod download && make"
    
    echo ""
    log_info "第 2 次编译（缓存命中）..."
    time docker run --rm \
        -v "$(pwd)":/workspace \
        -w /workspace \
        rclone-ci:latest \
        bash -c "make"
}

# ============================================================================
# 开发辅助
# ============================================================================

cmd_shell() {
    check_docker
    log_info "进入容器 Bash..."
    docker run -it --rm \
        -v "$(pwd)":/workspace \
        -w /workspace \
        rclone-ci:latest \
        bash
}

cmd_go_version() {
    check_docker
    log_info "查看 Go 版本..."
    docker run --rm --entrypoint /bin/sh rclone-ci:latest -c "go version"
}

cmd_env() {
    check_docker
    log_info "显示容器内环境变量..."
    docker run --rm --entrypoint /bin/sh rclone-ci:latest -c "env | sort"
}

# ============================================================================
# Screen 会话命令
# ============================================================================

check_screen() {
    if ! command -v screen &>/dev/null; then
        log_error "screen 未安装"
        echo ""
        echo "安装 screen："
        echo "  sudo dnf install screen          # Rocky/CentOS"
        echo "  sudo apt install screen          # Ubuntu/Debian"
        echo ""
        exit 1
    fi
}

cmd_screen_build() {
    check_screen
    check_docker
    
    local session_name="rclone-build-$(date +%s)"
    
    log_info "在 screen 会话中运行构建..."
    echo "Session Name: $session_name"
    echo ""
    echo "Screen 快捷键："
    echo "  Ctrl + A, D  - 脱离 screen（保持运行）"
    echo "  Ctrl + C     - 停止构建"
    echo ""
    echo "后续连接："
    echo "  screen -r $session_name"
    echo ""
    
    screen -S "$session_name" -d -m bash -c "cd $(pwd) && ./docker-ci-commands.sh build"
    
    log_success "构建已在后台启动"
    echo ""
    log_info "监控构建进度："
    echo "  screen -r $session_name"
    echo ""
    log_info "列出所有会话："
    echo "  screen -ls"
}

cmd_screen_make() {
    check_screen
    check_docker
    
    local session_name="rclone-make-$(date +%s)"
    
    log_info "在 screen 会话中运行编译..."
    echo "Session Name: $session_name"
    echo ""
    echo "Screen 快捷键："
    echo "  Ctrl + A, D  - 脱离 screen（保持运行）"
    echo "  Ctrl + C     - 停止编译"
    echo ""
    echo "后续连接："
    echo "  screen -r $session_name"
    echo ""
    
    screen -S "$session_name" -d -m bash -c "cd $(pwd) && ./docker-ci-commands.sh run-make"
    
    log_success "编译已在后台启动"
    echo ""
    log_info "监控编译进度："
    echo "  screen -r $session_name"
    echo ""
    log_info "列出所有会话："
    echo "  screen -ls"
}

cmd_screen_list() {
    check_screen
    
    log_info "列出所有 screen 会话..."
    echo ""
    
    if screen -ls | grep -q "socket"; then
        screen -ls
    else
        log_warn "没有运行中的 screen 会话"
    fi
    
    echo ""
    log_info "连接到会话："
    echo "  screen -r <session-name>"
    echo ""
    log_info "结束会话："
    echo "  screen -X -S <session-name> quit"
}

cmd_screen_attach() {
    check_screen
    
    if [[ -z "$1" ]]; then
        log_error "请指定会话名"
        echo ""
        log_info "可用会话："
        screen -ls 2>/dev/null | grep -E "^\s" || log_warn "没有运行中的会话"
        echo ""
        echo "用法: $0 screen-attach <session-name>"
        exit 1
    fi
    
    log_info "连接到 screen 会话: $1"
    screen -r "$1"
}

# ============================================================================
# 主程序
# ============================================================================

main() {
    local cmd="${1:-help}"
    
    case "$cmd" in
        # 安装和配置
        setup)
            cmd_setup
            ;;
        setup-mirrors)
            cmd_setup_mirrors
            ;;
        
        # 镜像
        build)
            cmd_build "$2"
            ;;
        images)
            cmd_images
            ;;
        inspect)
            cmd_inspect
            ;;
        history)
            cmd_history
            ;;
        rm)
            cmd_rm
            ;;
        
        # 容器
        run)
            cmd_run
            ;;
        run-make)
            cmd_run_make
            ;;
        run-test)
            cmd_run_test
            ;;
        verify)
            cmd_verify
            ;;
        logs)
            cmd_logs
            ;;
        stats)
            cmd_stats
            ;;
        
        # Compose
        compose-up)
            cmd_compose_up
            ;;
        compose-down)
            cmd_compose_down
            ;;
        compose-clean)
            cmd_compose_clean
            ;;
        compose-logs)
            cmd_compose_logs
            ;;
        compose-shell)
            cmd_compose_shell
            ;;
        
        # 工具
        preload-modules)
            cmd_preload_modules
            ;;
        cleanup)
            cmd_cleanup
            ;;
        disk-usage)
            cmd_disk_usage
            ;;
        cache-usage)
            cmd_cache_usage
            ;;
        cache-clean)
            cmd_cache_clean
            ;;
        benchmark)
            cmd_benchmark
            ;;
        
        # 开发辅助
        shell)
            cmd_shell
            ;;
        go-version)
            cmd_go_version
            ;;
        env)
            cmd_env
            ;;
        
        # Screen 会话
        screen-build)
            cmd_screen_build
            ;;
        screen-make)
            cmd_screen_make
            ;;
        screen-list)
            cmd_screen_list
            ;;
        screen-attach)
            cmd_screen_attach "$2"
            ;;
        
        # 帮助
        help|-h|--help)
            print_help
            ;;
        
        *)
            log_error "未知命令: $cmd"
            echo ""
            print_help
            exit 1
            ;;
    esac
}

main "$@"
