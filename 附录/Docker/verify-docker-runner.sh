#!/bin/bash
# 本地 Docker Self-Hosted Runner 部署验证脚本
# 用途：验证在Rocky 9.x阿上构建的docker runner是否正确部署
# 来源：GitHub官方runner验证指南（改编为Rocky 9.x）
# 最后更新：2026-02-21

set -e

# 错误漂亮捕获：当脚本失败时显示错误信息
error_handler() {
    local line_no=$1
    echo ""
    echo "${RED}================================${NC}"
    echo "${RED}✗ 脚本在第 $line_no 行出错${NC}"
    echo "${RED}================================${NC}"
    echo ""
    echo "提示："
    echo "  1. 检查上述错误信息"
    echo "  2. 查看脚本第 $line_no 行附且的代码"
    echo "  3. 根据错误修正环境后重新运行"
    echo ""
}

trap 'error_handler ${LINENO}' ERR

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;35m'
NC='\033[0m'

# 计数器
TESTS_PASSED=0
TESTS_FAILED=0

# 日志函数
log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((++TESTS_PASSED))
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
    ((++TESTS_FAILED))
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# ============================================================================
# 主验证流程
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Docker Self-Hosted Runner 本地部署验证                      ║"
echo "║   基于: GitHub Actions Runner 官方验证方式                    ║"
echo "║   系统: Rocky 9.x                                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# 第 1 部分：系统信息检查
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "  第 1 部分：系统环境检查"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 检查操作系统
log_info "检查操作系统..."
if grep -q "Rocky" /etc/os-release; then
    ROCKY_VERSION=$(grep VERSION_ID /etc/os-release | cut -d'=' -f2 | tr -d '"')
    log_pass "Rocky Linux 版本 $ROCKY_VERSION"
else
    log_warn "非Rocky Linux系统，某些命令可能不兼容"
fi

# 检查内核
KERNEL_VERSION=$(uname -r)
log_info "内核版本: $KERNEL_VERSION"

# 检查主机名
HOSTNAME=$(hostname)
log_pass "主机名: $HOSTNAME"

# 检查当前用户
CURRENT_USER=$(whoami)
log_pass "当前用户: $CURRENT_USER"

# 检查 sudo 权限
if sudo -n true 2>/dev/null; then
    log_pass "具有 sudo 权限 (无密码)"
else
    log_warn "sudo 需要密码，某些操作可能需要输入密码"
fi

echo ""

# ============================================================================
# 第 2 部分：Docker 安装和配置检查
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "  第 2 部分：Docker 安装和配置"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 检查 Docker 安装
if command -v docker &>/dev/null; then
    DOCKER_VERSION=$(docker --version)
    log_pass "$DOCKER_VERSION"
else
    log_fail "Docker 未安装，请运行: ./docker-ci-commands.sh setup"
    exit 1
fi

# 检查 Docker 服务状态
log_info "检查 Docker 服务状态..."
if systemctl is-active --quiet docker; then
    log_pass "Docker 服务正在运行"
else
    log_fail "Docker 服务未运行"
    log_info "启动 Docker: sudo systemctl start docker"
    exit 1
fi

# 检查 Docker 守护进程
log_info "连接到 Docker 守护进程..."
if docker ps &>/dev/null; then
    log_pass "Docker 守护进程可访问"
else
    log_fail "无法访问 Docker 守护进程"
    log_warn "可能需要将用户添加到 docker 组: sudo usermod -aG docker \$USER"
    exit 1
fi

# 获取 Docker 信息
log_info "Docker 配置信息:"
DOCKER_INFO=$(docker info 2>/dev/null)
echo "$DOCKER_INFO" | grep -E "Server Version|OS|Kernel|CPU" | sed 's/^/  /'

echo ""

# ============================================================================
# 第 3 部分：Docker 功能验证
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "  第 3 部分：Docker 功能验证"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 测试基础容器执行
log_info "测试容器执行..."
if docker run --rm alpine:latest uname -m &>/dev/null; then
    log_pass "容器执行正常"
else
    log_fail "容器执行失败"
fi

# 测试容器镜像拉取
log_info "测试镜像拉取..."
if docker pull ubuntu:22.04 &>/dev/null; then
    log_pass "镜像拉取成功"
else
    log_fail "镜像拉取失败，检查网络连接"
fi

# 测试数据卷挂载
log_info "测试数据卷挂载..."
mkdir -p /tmp/docker-vol-test
echo "测试数据: $(date)" > /tmp/docker-vol-test/test.txt

if docker run --rm -v /tmp/docker-vol-test:/data alpine cat /data/test.txt &>/dev/null; then
    log_pass "数据卷挂载正常"
else
    log_fail "数据卷挂载失败"
fi
rm -rf /tmp/docker-vol-test

# 测试网络连接
log_info "测试容器网络连接..."
if docker run --rm alpine wget -q -O - https://github.com/status | head -1 &>/dev/null; then
    log_pass "容器网络连接正常"
else
    log_warn "容器网络连接可能受限"
fi

echo ""

# ============================================================================
# 第 4 部分：编译环境检查
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "  第 4 部分：rclone CI 编译环境"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 检查是否存在 rclone-ci 镜像
log_info "检查 rclone-ci 镜像..."
if docker images | grep -q rclone-ci; then
    IMAGE_ID=$(docker images | grep rclone-ci | head -1 | awk '{print $3}')
    IMAGE_SIZE=$(docker images | grep rclone-ci | head -1 | awk '{print $7, $8}')
    log_pass "rclone-ci 镜像存在 (ID: $IMAGE_ID, 大小: $IMAGE_SIZE)"
    
    # 验证镜像中的编译工具
    log_info "验证编译工具..."
    
    if docker run --rm rclone-ci:latest gcc --version &>/dev/null; then
        log_pass "gcc 可用"
    else
        log_fail "gcc 不可用"
    fi
    
    if docker run --rm rclone-ci:latest g++ --version &>/dev/null; then
        log_pass "g++ 可用"
    else
        log_fail "g++ 不可用"
    fi
    
    if docker run --rm rclone-ci:latest make --version &>/dev/null; then
        log_pass "make 可用"
    else
        log_fail "make 不可用"
    fi
    
    if docker run --rm rclone-ci:latest go version &>/dev/null; then
        log_pass "Go 编译环境就绪"
    else
        log_fail "Go 环境不可用"
    fi
else
    log_warn "rclone-ci 镜像未找到"
    log_info "构建镜像: ./docker-ci-commands.sh build"
fi

echo ""

# ============================================================================
# 第 5 部分：GitHub Actions Runner 配置检查
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "  第 5 部分：GitHub Actions Runner"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 查找 runner 目录
if [ -d "$HOME/actions-runner" ]; then
    RUNNER_DIR="$HOME/actions-runner"
    log_pass "找到 Runner 目录: $RUNNER_DIR"
    
    # 检查 runner 进程
    if pgrep -f "actions-runner" &>/dev/null; then
        log_pass "Reader 进程正在运行"
    else
        log_warn "Runner 进程未运行，启动命令: cd $RUNNER_DIR && ./run.sh"
    fi
    
    # 检查配置文件
    if [ -f "$RUNNER_DIR/.runner" ]; then
        RUNNER_NAME=$(grep '"agentName"' "$RUNNER_DIR/.runner" 2>/dev/null | cut -d'"' -f4 || echo "unknown")
        log_pass "Runner 已配置: $RUNNER_NAME"
    else
        log_warn "Runner 未配置，运行配置脚本"
    fi
else
    log_warn "Runner 目录未找到 ($HOME/actions-runner)"
    log_info "配置新 Runner:"
    echo "  1. 下载: https://github.com/actions/runner/releases"
    echo "  2. 解压到: ~/actions-runner"
    echo "  3. 运行配置: ./config.sh"
fi

echo ""

# ============================================================================
# 第 6 部分：网络连接检查
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "  第 6 部分：GitHub 网络连接"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 检查 GitHub 端点连接
log_info "测试 GitHub 主要端点..."

endpoints=(
    "api.github.com"
    "github.com"
    "uploads.github.com"
    "codeload.github.com"
)

for endpoint in "${endpoints[@]}"; do
    if timeout 5 curl -s -I https://$endpoint >/dev/null 2>&1; then
        log_pass "$endpoint 可访问"
    else
        log_fail "$endpoint 不可访问"
    fi
done

# DNS 解析测试
log_info "DNS 解析测试..."
if nslookup github.com &>/dev/null; then
    log_pass "DNS 解析正常"
else
    log_fail "DNS 解析失败"
fi

echo ""

# ============================================================================
# 第 7 部分：资源和性能检查
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "  第 7 部分：系统资源"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# CPU 信息
CPU_CORES=$(nproc)
log_pass "CPU 核心数: $CPU_CORES"

# 内存信息
TOTAL_MEM=$(free -h | awk 'NR==2 {print $2}')
AVAILABLE_MEM=$(free -h | awk 'NR==2 {print $7}')
log_pass "内存: 总计 $TOTAL_MEM, 可用 $AVAILABLE_MEM"

# 磁盘空间
ROOT_FREE=$(df -h / | awk 'NR==2 {print $4}')
log_info "根分区剩余空间: $ROOT_FREE"

ROOT_PERCENT=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $ROOT_PERCENT -lt 80 ]; then
    log_pass "磁盘使用率良好 ($ROOT_PERCENT%)"
elif [ $ROOT_PERCENT -lt 90 ]; then
    log_warn "磁盘使用率偏高 ($ROOT_PERCENT%)"
else
    log_fail "磁盘使用率过高 ($ROOT_PERCENT%)，可能临近满载"
fi

echo ""

# ============================================================================
# 最终总结
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo "  验证结果总结"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "  ${GREEN}通过${NC}: $TESTS_PASSED"
echo -e "  ${RED}失败${NC}: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║   ✓ Docker Self-Hosted Runner 部署验证成功!                   ║"
    echo "║                                                                ║"
    echo "║   Runner 已准备好运行 GitHub Actions 工作流                   ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "后续步骤:"
    echo "  1. 构建 rclone-ci 镜像:"
    echo "     ./docker-ci-commands.sh build"
    echo ""
    echo "  2. 运行验证工作流 (通过 GitHub Actions Web UI):"
    echo "     Actions -> docker-runner-verify"
    echo ""
    echo "  3. 或直接测试编译:"
    echo "     ./docker-ci-commands.sh run-make"
    echo ""
    exit 0
else
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                                                                ║"
    echo "║   ⚠ Docker Runner 部署验证有问题                             ║"
    echo "║                                                                ║"
    echo "║   请检查上面标记的失败项目                                    ║"
    echo "║                                                                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi
