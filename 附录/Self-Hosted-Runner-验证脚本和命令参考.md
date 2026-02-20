# Self-Hosted Runner 验证脚本和命令参考

**来源**: GitHub 官方 actions/runner 和 actions/runner-container-hooks  
**更新**: 2026年2月20日

---

## 1. 快速验证命令集

### 1.1 官方网络连接检查 (最重要)

```bash
# 进入runner目录
cd ~/actions-runner

# 执行官方网络检查（替换YOUR-ORG/YOUR-REPO和PAT）
./config.sh --check --url https://github.com/YOUR-ORG/YOUR-REPO --pat ghp_YOUR_PAT_TOKEN

# 预期输出示例:
# ✓ Connecting to github.com ... OK
# ✓ Connecting to api.github.com ... OK
# ✓ Connecting to uploads.github.com ... OK
# etc.
```

### 1.2 Docker快速验证

```bash
# 检查Docker版本
docker --version

# 检查Docker是否运行
docker ps

# 测试基本容器运行
docker run --rm alpine echo "Docker works!"

# 检查Docker网络
docker network ls

# 检查Docker daemon权限
sudo systemctl status docker

# 测试当前用户Docker权限
groups | grep docker
```

### 1.3 系统快速检查

```bash
# 检查CPU核心数
nproc

# 检查可用内存
free -h

# 检查磁盘空间
df -h

# 检查网络连接
ping -c 1 github.com

# 检查DNS解析
nslookup github.com

# 检查重要的GitHub服务连接
curl -I https://api.github.com
curl -I https://uploads.github.com
```

### 1.4 Runner服务状态检查 (Linux systemd)

```bash
# 查看runner service列表
systemctl list-units | grep actions

# 查看特定runner服务详情
sudo systemctl status actions.runner.OWNER-REPO.RUNNER_NAME.service

# 查看runner service最近事件
sudo journalctl -u actions.runner.OWNER-REPO.RUNNER_NAME.service -n 50

# 实时监控runner日志
sudo journalctl -u actions.runner.OWNER-REPO.RUNNER_NAME.service -f

# 查看service运行用户
sudo systemctl show -p User actions.runner.OWNER-REPO.RUNNER_NAME.service
```

### 1.5 Runner应用日志检查

```bash
# 进入runner目录
cd ~/actions-runner

# 列出所有诊断日志
ls -lh _diag/

# 查看最新的runner启动日志
tail -n 100 _diag/Runner_$(ls -t _diag/Runner_*.log | head -1 | grep -oP 'Runner_\K.*').log

# 查看特定作业的执行日志
tail -n 100 _diag/Worker_*.log

# 查看完整的诊断日志流
cat _diag/Runner_*.log | tail -200
```

---

## 2. 完整可执行验证脚本

### 2.1 全面的Runner验证脚本

```bash
#!/bin/bash
################################################################################
# GitHub Actions Self-Hosted Runner Comprehensive Verification Script
# 官方推荐的Runner验证脚本集合
# 来源: actions/runner 和官方文档
################################################################################

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 计数器
PASS=0
FAIL=0
WARN=0

# 日志函数
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL++)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; ((WARN++)); }

echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  GitHub Actions Self-Hosted Runner Verification Script v2.1       ║"
echo "║  来源: GitHub官方 actions/runner 项目                              ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# 检查是否在runner目录
if [ ! -f "./config.sh" ]; then
    log_fail "Not in runner directory. Please cd to runner directory first."
    exit 1
fi

log_info "Current directory: $(pwd)"
log_info "Runner version: $(./run.sh --version 2>/dev/null || echo 'Unknown')"
echo ""

################################################################################
# SECTION 1: 基础系统检查
################################################################################
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 1: 基础系统检查${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"

log_info "Checking operating system..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_TYPE="Linux"
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        log_pass "Linux distribution: $PRETTY_NAME"
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="macOS"
    log_pass "macOS detected: $(sw_vers -productVersion)"
elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]]; then
    OS_TYPE="Windows"
    log_pass "Windows detected"
else
    log_fail "Unsupported OS: $OSTYPE"
fi

log_info "Checking system resources..."
if command -v free &> /dev/null; then
    TOTAL_MEM=$(free -h | awk '/^Mem:/ {print $2}')
    AVAIL_MEM=$(free -h | awk '/^Mem:/ {print $7}')
    log_pass "Memory: Total=$TOTAL_MEM, Available=$AVAIL_MEM"
fi

if command -v nproc &> /dev/null; then
    CPU_CORES=$(nproc)
    log_pass "CPU cores: $CPU_CORES"
fi

DISK_USE=$(df -h . | awk 'NR==2 {print $5}')
DISK_AVAIL=$(df -h . | awk 'NR==2 {print $4}')
log_pass "Disk usage: $DISK_USE (Available: $DISK_AVAIL)"

################################################################################
# SECTION 2: 必要工具检查
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 2: 必要工具检查${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"

# Git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    log_pass "$GIT_VERSION"
else
    log_warn "Git not installed"
fi

# curl
if command -v curl &> /dev/null; then
    CURL_VERSION=$(curl --version | head -1)
    log_pass "$CURL_VERSION"
else
    log_fail "curl not installed (required)"
fi

# jq (可选)
if command -v jq &> /dev/null; then
    log_pass "jq $(jq --version) installed"
else
    log_warn "jq not installed (optional)"
fi

# Node.js (可选)
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log_pass "Node.js $NODE_VERSION installed"
else
    log_warn "Node.js not installed (optional for JavaScript actions)"
fi

################################################################################
# SECTION 3: Docker检查 (如果需要容器)
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 3: Docker 检查${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"

if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    log_pass "$DOCKER_VERSION"
    
    # 检查Docker daemon
    if docker ps &> /dev/null; then
        log_pass "Docker daemon is running"
        
        # 获取Docker信息
        DOCKER_DRIVER=$(docker info 2>/dev/null | grep "Storage Driver" | awk -F: '{print $2}' | xargs)
        log_pass "Docker storage driver: $DOCKER_DRIVER"
        
        # 检查Docker网络
        if docker network ls | grep -q "bridge"; then
            log_pass "Docker networks configured"
        else
            log_fail "Docker networks not found"
        fi
        
        # 测试容器运行
        if docker run --rm alpine echo "test" > /dev/null 2>&1; then
            log_pass "Can execute Docker containers"
        else
            log_fail "Cannot execute Docker containers"
        fi
    else
        log_fail "Docker daemon not running"
    fi
else
    log_warn "Docker not installed (required for container actions)"
fi

################################################################################
# SECTION 4: 网络连接检查
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 4: 网络连接检查${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"

log_info "Testing GitHub connectivity..."

# 测试主要GitHub站点
ENDPOINTS=(
    "api.github.com:443"
    "github.com:443"
    "uploads.github.com:443"
    "codeload.github.com:443"
    "github-releases.githubusercontent.com:443"
    "github-cloud.s3.amazonaws.com:443"
)

for endpoint in "${ENDPOINTS[@]}"; do
    if timeout 5 bash -c "echo > /dev/tcp/${endpoint}" 2>/dev/null; then
        log_pass "Reachable: $endpoint"
    else
        log_fail "Unreachable: $endpoint"
    fi
done

# DNS resolution test
log_info "Testing DNS resolution..."
if nslookup github.com &> /dev/null; then
    log_pass "DNS resolution working"
else
    log_fail "DNS resolution failed"
fi

################################################################################
# SECTION 5: 官方Runner网络检查 (关键)
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 5: 官方Runner网络连接检查 (最重要)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"

log_warn "⚠️  此步骤需要以下信息:"
echo "   1. GitHub仓库URL: https://github.com/YOUR-ORG/YOUR-REPO"
echo "   2. 个人访问令牌 (PAT): ghp_xxxxxxxxxxxx"
echo ""

read -p "继续执行官方检查? (y/n, 默认n): " do_check
if [[ $do_check == "y" ]]; then
    read -p "Enter GitHub repository URL: " repo_url
    read -sp "Enter Personal Access Token: " pat_token
    echo ""
    
    if [ -n "$repo_url" ] && [ -n "$pat_token" ]; then
        log_info "Running official config.sh --check..."
        if ./config.sh --check --url "$repo_url" --pat "$pat_token"; then
            log_pass "Official connectivity check passed"
        else
            log_fail "Official connectivity check failed - see error messages above"
        fi
    fi
fi

################################################################################
# SECTION 6: 文件和权限检查
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SECTION 6: 文件和权限检查${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"

log_info "Checking runner directory structure..."

REQUIRED_FILES=("config.sh" "run.sh" "config.runner")
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        log_pass "Found: $file"
    else
        log_fail "Missing: $file"
    fi
done

# 检查_diag目录
if [ -d "_diag" ]; then
    log_pass "Diagnostic directory exists"
    DIAG_SIZE=$(du -sh _diag | cut -f1)
    log_info "Diagnostic directory size: $DIAG_SIZE"
else
    log_warn "Diagnostic directory not created yet (normal for new installation)"
fi

# 检查_work目录
if [ -d "_work" ]; then
    log_pass "Work directory exists"
    WORK_SIZE=$(du -sh _work | cut -f1)
    log_info "Work directory size: $WORK_SIZE"
else
    log_warn "Work directory not created yet (normal for new installation)"
fi

################################################################################
# SECTION 7: 服务检查 (Linux systemd)
################################################################################
if [[ "$OS_TYPE" == "Linux" ]]; then
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}SECTION 7: SystemD 服务检查 (Linux)${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"

    if command -v systemctl &> /dev/null; then
        # 查找runner services
        RUNNER_SERVICES=$(systemctl list-units --all | grep "actions.runner" | awk '{print $1}')
        
        if [ -z "$RUNNER_SERVICES" ]; then
            log_warn "No runner services configured as systemd service"
            log_info "To install as service, run: sudo ./svc.sh install"
        else
            log_pass "Found runner services:"
            while IFS= read -r service; do
                if [ -n "$service" ]; then
                    if systemctl is-active --quiet "$service"; then
                        log_pass "  ✓ $service (running)"
                    else
                        log_fail "  ✗ $service (not running)"
                    fi
                fi
            done <<< "$RUNNER_SERVICES"
        fi
    fi
fi

################################################################################
# 最终总结
################################################################################
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}验证总结${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"

TOTAL=$((PASS + FAIL + WARN))
echo ""
echo -e "${GREEN}✓ PASS: $PASS${NC}"
echo -e "${RED}✗ FAIL: $FAIL${NC}"
echo -e "${YELLOW}⚠ WARN: $WARN${NC}"
echo -e "Total checks: $TOTAL"

echo ""
if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ All critical checks passed! Runner is ready for use.${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}✗ Some critical checks failed. Please review the failures above.${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════════${NC}"
    exit 1
fi
```

### 2.2 Docker容器运行验证脚本

```bash
#!/bin/bash
################################################################################
# Docker Self-Hosted Runner Container Verification
# 验证Docker容器形式的runner部署
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

log_pass() { echo -e "${GREEN}[✓]${NC} $1"; ((PASS++)); }
log_fail() { echo -e "${RED}[✗]${NC} $1"; ((FAIL++)); }
log_info() { echo -e "${BLUE}[i]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }

echo "=================================="
echo "  Docker Runner Verification"
echo "=================================="
echo ""

# 1. Docker基础检查
log_info "Checking Docker installation..."
if command -v docker &> /dev/null; then
    log_pass "Docker: $(docker --version)"
else
    log_fail "Docker not installed"
    exit 1
fi

# 2. Docker daemon检查
log_info "Checking Docker daemon..."
if docker ps > /dev/null 2>&1; then
    log_pass "Docker daemon is running"
else
    log_fail "Cannot connect to Docker daemon"
    exit 1
fi

# 3. Docker socket权限
log_info "Checking Docker socket permissions..."
if [ -S /var/run/docker.sock ]; then
    if [ -r /var/run/docker.sock ] && [ -w /var/run/docker.sock ]; then
        log_pass "Docker socket is readable and writable"
    else
        log_warn "Docker socket may have permission issues"
        log_info "Current user: $(whoami)"
        log_info "User groups: $(groups)"
    fi
else
    log_fail "Docker socket not found"
fi

# 4. 基础镜像拉取测试
log_info "Testing image pull..."
if docker pull alpine:latest > /dev/null 2>&1; then
    log_pass "Can pull images from Docker Hub"
    docker rmi alpine:latest > /dev/null 2>&1
else
    log_fail "Cannot pull images from Docker Hub"
fi

# 5. 容器执行测试
log_info "Testing container execution..."
if docker run --rm alpine:latest echo "success" > /dev/null 2>&1; then
    log_pass "Can execute containers"
else
    log_fail "Cannot execute containers"
fi

# 6. 卷挂载测试
log_info "Testing volume mounts..."
TEST_DIR=$(mktemp -d)
echo "test" > "$TEST_DIR/test.txt"
if docker run --rm -v "$TEST_DIR:/mnt" alpine cat /mnt/test.txt > /dev/null 2>&1; then
    log_pass "Volume mounting works"
    rm -rf "$TEST_DIR"
else
    log_fail "Volume mounting failed"
    rm -rf "$TEST_DIR"
fi

# 7. 网络测试
log_info "Testing network in container..."
if docker run --rm alpine sh -c "curl -m 5 https://github.com > /dev/null" 2>&1; then
    log_pass "Network access from container"
else
    log_warn "Network may have issues from container (check firewall)"
fi

# 8. Docker Compose检查（可选）
log_info "Checking Docker Compose..."
if command -v docker-compose &> /dev/null; then
    log_pass "Docker Compose: $(docker-compose --version)"
else
    log_warn "Docker Compose not installed (optional)"
fi

echo ""
echo "=================================="
echo "Results: PASS=$PASS, FAIL=$FAIL"
echo "=================================="

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ All Docker checks passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    exit 1
fi
```

---

## 3. 一键快速验证命令

### 对于Linux用户

```bash
# 完整检查流程
cd ~/actions-runner && \
echo "=== 系统信息 ===" && \
uname -a && \
echo "" && \
echo "=== Docker状态 ===" && \
docker ps && \
echo "" && \
echo "=== 网络连接 ===" && \
curl -I https://api.github.com && \
echo "" && \
echo "=== Runner状态 ===" && \
./run.sh --version
```

### 对于macOS用户

```bash
# macOS完整检查
cd ~/actions-runner && \
/usr/bin/sw_vers && \
echo "---" && \
docker --version && \
echo "---" && \
curl -I https://api.github.com && \
echo "---" && \
./run.sh --version
```

### 对于Windows用户 (PowerShell)

```powershell
# Windows PowerShell检查
cd "$env:USERPROFILE\actions-runner"
Write-Host "=== 系统信息 ==="
[System.Environment]::OSVersion
Write-Host "=== Docker 状态 ==="
docker ps
Write-Host "=== 网络连接 ==="
(Invoke-WebRequest -Uri https://api.github.com -Method Head).StatusCode
Write-Host "=== Runner版本 ==="
.\run.cmd --version
```

---

## 4. 官方示例工作流

### 基础健康检查工作流

```yaml
name: Runner Health Check

on:
  workflow_dispatch:
  schedule:
    - cron: '0 */6 * * *'  # 每6小时运行一次

jobs:
  health-check:
    runs-on: [self-hosted]
    steps:
      - name: System Info
        run: |
          echo "=== System Info ==="
          uname -a
          
      - name: Docker Status
        run: |
          echo "=== Docker Status ==="
          docker ps
          docker images | head
          
      - name: Network Check
        run: |
          echo "=== Network Check ==="
          curl -I https://api.github.com
          
      - name: Disk Space
        run: |
          echo "=== Disk Space ==="
          df -h
          
      - name: Memory Status
        run: |
          echo "=== Memory Status ==="
          free -h || vm_stat
          
      - name: Test Workflow
        run: echo "✓ Workflow execution successful"
```

---

## 5. 常见问题快速诊断

### "Cannot connect to Docker daemon"

```bash
# 检查Docker服务
sudo systemctl status docker

# 启动Docker服务
sudo systemctl start docker

# 添加用户到docker组
sudo usermod -aG docker runner

# 重新登录或:
newgrp docker

# 测试
docker ps
```

### "Permission denied while trying to connect to the Docker daemon socket"

```bash
# 检查socket权限
ls -la /var/run/docker.sock

# 修复权限
sudo chmod 666 /var/run/docker.sock

# 或添加runner到docker组 (推荐)
sudo usermod -aG docker runner-username
```

### "Network error: cannot download actions"

```bash
# 检查网络连接
ping -c 1 github.com

# 测试DNS
nslookup github.com

# 检查代理设置
echo $HTTP_PROXY
echo $HTTPS_PROXY

# 运行官方检查
./config.sh --check --url https://github.com/YOUR-ORG/YOUR-REPO --pat YOUR_PAT
```

### "Runner service not starting"

```bash
# 检查service状态
sudo systemctl status actions.runner.*

# 查看service日志
sudo journalctl -u actions.runner* -n 100

# 重启服务
sudo systemctl restart actions.runner*

# 检查权限
ls -la _diag/ _work/
```

---

## 6. 性能测试工作流

```yaml
name: Runner Performance Test

on: [workflow_dispatch]

jobs:
  performance:
    runs-on: [self-hosted]
    steps:
      - name: CPU Test
        run: |
          echo "Running CPU benchmark..."
          time for i in {1..1000}; do echo $((2**$i)) > /dev/null; done
          
      - name: Memory Test
        run: |
          echo "Memory allocation test..."
          dd if=/dev/zero of=/tmp/test.bin bs=1M count=512
          rm /tmp/test.bin
          
      - name: Disk I/O Test
        run: |
          echo "Disk I/O test..."
          time dd if=/dev/zero of=/tmp/test.bin bs=1M count=100 && sync
          rm /tmp/test.bin
          
      - name: Docker Performance
        run: |
          echo "Docker pull speed test..."
          time docker pull ubuntu:latest
```

---

## 参考资源链接

| 资源 | 链接 |
|------|------|
| Runner发布 | https://github.com/actions/runner/releases |
| Runner文档 | https://docs.github.com/en/actions/hosting-your-own-runners |
| Container Hooks | https://github.com/actions/runner-container-hooks |
| Official Docker Image | https://github.com/orgs/actions/packages/container/package/actions-runner |
| 故障排查 | https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/monitoring-and-troubleshooting-self-hosted-runners |

---

**最后更新**: 2026年2月20日  
**来源**: GitHub官方文档和开源项目
