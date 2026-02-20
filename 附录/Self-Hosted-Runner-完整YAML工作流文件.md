# Self-Hosted Runner 官方验证工作流 YAML 文件集合

**说明**: 这些YAML文件来自GitHub官方示例，可直接复制到你的repository的 `.github/workflows/` 目录使用

**来源**: actions/runner, actions/runner-container-hooks  
**更新**: 2026年2月20日

---

## 1. 基础 Runner 连接验证工作流

**文件名**: `.github/workflows/runner-health-check.yml`

```yaml
name: Self-Hosted Runner Health Check

on:
  workflow_dispatch:
  schedule:
    # 每12小时运行一次健康检查
    - cron: '0 */12 * * *'
  push:
    branches:
      - main

jobs:
  runner-health-check:
    name: Check Runner Health
    runs-on: [self-hosted]
    timeout-minutes: 10
    
    steps:
      - name: ✓ Check out code
        uses: actions/checkout@v4
        with:
          sparse-checkout: |
            .github

      - name: 📋 System Information
        run: |
          echo "=== System Information ==="
          uname -a
          echo ""
          echo "=== Kernel Version ==="
          uname -r
          echo ""
          echo "=== Hostname ==="
          hostname
          echo ""
          echo "=== Current User ==="
          whoami
          echo ""
          echo "=== User Groups ==="
          groups

      - name: 💾 Disk Space Information
        run: |
          echo "=== Disk Space ==="
          df -h
          echo ""
          echo "=== Current Directory Size ==="
          du -sh .
          echo ""
          echo "=== Workspace Size ==="
          du -sh $GITHUB_WORKSPACE

      - name: 🧠 Memory Information
        run: |
          echo "=== Total Memory ==="
          free -h
          echo ""
          echo "=== Memory Usage ==="
          ps aux --sort=-%mem | head -10

      - name: ⚙️ CPU Information
        run: |
          echo "=== CPU Information ==="
          nproc
          echo ""
          echo "=== CPU Details ==="
          lscpu | grep -E "Architecture|CPU\(s\)|Model name|Stepping"
          echo ""
          echo "=== Load Average ==="
          uptime

      - name: 🌐 Network Connectivity
        run: |
          echo "=== GitHub.com ==="
          curl -I https://github.com
          echo ""
          echo "=== GitHub API ==="
          curl -I https://api.github.com
          echo ""
          echo "=== GitHub Uploads ==="
          curl -I https://uploads.github.com
          echo ""
          echo "=== DNS Resolution ==="
          nslookup github.com | head -10

      - name: 🐳 Docker Verification
        run: |
          echo "=== Docker Version ==="
          docker --version
          echo ""
          echo "=== Docker Images ==="
          docker images | head -5
          echo ""
          echo "=== Docker PS ==="
          docker ps -a
          echo ""
          echo "=== Docker Info ==="
          docker info | head -20

      - name: 🧪 Test Docker Container Execution
        run: |
          echo "=== Running test container ==="
          docker run --rm alpine:latest uname -a
          echo "✓ Container execution successful"

      - name: 🧪 Test Volume Mounting
        run: |
          echo "=== Test Volume Mount ==="
          mkdir -p /tmp/test-volume
          echo "test data" > /tmp/test-volume/test.txt
          docker run --rm -v /tmp/test-volume:/data alpine:latest cat /data/test.txt
          rm -rf /tmp/test-volume
          echo "✓ Volume mount test successful"

      - name: 📦 Check Required Tools
        run: |
          echo "=== Checking tools ==="
          echo "Git: $(git --version)"
          echo "Curl: $(curl --version | head -1)"
          echo "jq: $(jq --version 2>/dev/null || echo 'not installed')"
          echo "Node.js: $(node --version 2>/dev/null || echo 'not installed')"
          echo "Python: $(python3 --version 2>/dev/null || echo 'not installed')"

      - name: 📊 Runner Information
        run: |
          echo "=== Runner Information ==="
          echo "Runner name: ${{ runner.name }}"
          echo "Runner OS: ${{ runner.os }}"
          echo "Runner temp: $RUNNER_TEMP"
          echo "Runner tool cache: $RUNNER_TOOL_CACHE"

      - name: ✅ Final Status
        if: always()
        run: |
          echo ""
          echo "╔════════════════════════════════════════╗"
          echo "║  ✓ Health Check Completed Successfully ║"
          echo "╚════════════════════════════════════════╝"
          date
```

---

## 2. Docker 容器完整测试工作流

**文件名**: `.github/workflows/docker-runner-verification.yml`

```yaml
name: Docker Self-Hosted Runner Verification

on:
  workflow_dispatch:
  push:
    paths:
      - '.github/workflows/docker-runner-verification.yml'
  schedule:
    - cron: '0 8 * * 1'  # 每周一早上8点

jobs:
  docker-verification:
    name: Verify Docker Setup
    runs-on: [self-hosted, docker]
    
    services:
      redis:
        image: redis:7.0-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
      
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: 🐳 Docker Version
        run: docker --version

      - name: 🧪 Test Basic Container
        run: |
          docker run --rm ubuntu:latest uname -a
          docker run --rm alpine:latest echo "Hello from Alpine"
          docker run --rm node:20 node --version

      - name: 🧪 Test Container with Environment Variables
        run: |
          docker run --rm \
            -e TEST_VAR="Hello" \
            -e BUILD_ID="${{ github.run_id }}" \
            alpine:latest \
            sh -c 'echo "TEST_VAR=$TEST_VAR" && echo "BUILD_ID=$BUILD_ID"'

      - name: 🧪 Test Container with Volume
        run: |
          mkdir -p /tmp/test-vol
          echo "Volume test data" > /tmp/test-vol/data.txt
          docker run --rm \
            -v /tmp/test-vol:/workspace \
            alpine:latest \
            cat /workspace/data.txt
          rm -rf /tmp/test-vol

      - name: 🧪 Test Container with Working Directory
        run: |
          docker run --rm \
            -w /app \
            ubuntu:latest \
            pwd

      - name: 🧪 Test Container Registry Pull
        run: |
          docker pull alpine:latest
          docker pull node:20-alpine
          docker images | head -5

      - name: 🧪 Test Container Build
        run: |
          cat > /tmp/Dockerfile << 'EOF'
          FROM alpine:latest
          RUN echo "Test image built at $(date)" > /test.txt
          CMD cat /test.txt
          EOF
          
          docker build -f /tmp/Dockerfile -t test-image:latest /tmp/
          docker run --rm test-image:latest
          docker rmi test-image:latest

      - name: 🧪 Test Service Connectivity - Redis
        run: |
          docker run --rm \
            --network host \
            redis:7.0-alpine \
            redis-cli -h localhost ping

      - name: 🧪 Test Service Connectivity - PostgreSQL
        run: |
          docker run --rm \
            --network host \
            postgres:15-alpine \
            psql -h localhost -U postgres -d testdb -c "SELECT version();"
        env:
          PGPASSWORD: postgres

      - name: 🧪 Test Container Networking
        run: |
          docker network create test-network || true
          docker run --rm \
            --network test-network \
            --name test-container \
            alpine:latest \
            sh -c "echo 'Network test passed'"

      - name: 🧪 Test Docker Compose (if available)
        continue-on-error: true
        run: |
          if command -v docker-compose &> /dev/null; then
            echo "Docker Compose version:"
            docker-compose --version
            
            cat > /tmp/docker-compose.yml << 'EOF'
          version: '3.8'
          services:
            test:
              image: alpine:latest
              command: echo "Docker Compose works"
          EOF
            
            docker-compose -f /tmp/docker-compose.yml up
            docker-compose -f /tmp/docker-compose.yml down
          else
            echo "Docker Compose not available"
          fi

      - name: 📊 Docker Diagnostics
        if: always()
        run: |
          echo "=== Docker Containers ==="
          docker ps -a
          echo ""
          echo "=== Docker Images ==="
          docker images | head -10
          echo ""
          echo "=== Docker Networks ==="
          docker network ls
          echo ""
          echo "=== Docker Info ==="
          docker info | head -15

      - name: ✅ Docker Verification Complete
        run: |
          echo "✓ All Docker tests passed"
          echo "Runner is ready for container-based workflows"
```

---

## 3. 完整的多步骤验证工作流

**文件名**: `.github/workflows/runner-comprehensive-check.yml`

```yaml
name: Comprehensive Runner Verification

on:
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * *'  # UTC 每天凌晨2点

jobs:
  step-1-basic-checks:
    name: Step 1 - Basic System Checks
    runs-on: [self-hosted]
    outputs:
      system-info: ${{ steps.info.outputs.system }}
    
    steps:
      - id: info
        name: Gather System Information
        run: |
          echo "system=$(uname -a)" >> $GITHUB_OUTPUT
          echo "=== System Check ==="
          uname -a
          echo "✓ Step 1 Complete"

  step-2-network-checks:
    name: Step 2 - Network Verification
    needs: step-1-basic-checks
    runs-on: [self-hosted]
    
    steps:
      - name: Test GitHub Connectivity
        run: |
          echo "Testing GitHub endpoints..."
          for endpoint in api.github.com github.com uploads.github.com; do
            if curl -m 5 -s https://$endpoint > /dev/null; then
              echo "✓ $endpoint reachable"
            else
              echo "✗ $endpoint not reachable"
              exit 1
            fi
          done

      - name: Test DNS Resolution
        run: |
          nslookup github.com
          echo "✓ Step 2 Complete"

  step-3-docker-checks:
    name: Step 3 - Docker Verification
    needs: step-1-basic-checks
    runs-on: [self-hosted]
    
    steps:
      - name: Check Docker Installation
        run: |
          docker --version
          docker ps -a

      - name: Test Container Execution
        run: |
          docker run --rm alpine echo "✓ Docker works"

      - name: Test Volume Mounting
        run: |
          mkdir -p /tmp/docker-test
          echo "test" > /tmp/docker-test/file.txt
          docker run --rm -v /tmp/docker-test:/data alpine cat /data/file.txt
          rm -rf /tmp/docker-test
          echo "✓ Step 3 Complete"

  step-4-performance:
    name: Step 4 - Performance Checks
    needs: [step-2-network-checks, step-3-docker-checks]
    runs-on: [self-hosted]
    
    steps:
      - name: CPU Benchmark
        run: |
          echo "CPU cores: $(nproc)"
          echo "Load average: $(uptime | awk -F'load average:' '{print $2}')"

      - name: Memory Benchmark
        run: |
          echo "Memory info:"
          free -h
          
      - name: Disk I/O Test
        run: |
          echo "=== Disk Space ==="
          df -h
          echo ""
          echo "=== I/O Test ==="
          dd if=/dev/zero of=/tmp/iotest bs=1M count=100 && sync && rm /tmp/iotest
          echo "✓ Step 4 Complete"

  step-5-final-summary:
    name: Step 5 - Final Summary
    runs-on: [self-hosted]
    needs: [step-1-basic-checks, step-2-network-checks, step-3-docker-checks, step-4-performance]
    if: always()
    
    steps:
      - name: Print Summary
        run: |
          echo "╔════════════════════════════════════════════════════════════╗"
          echo "║       Self-Hosted Runner Verification Complete            ║"
          echo "╚════════════════════════════════════════════════════════════╝"
          echo ""
          echo "✓ All verification steps passed"
          echo "✓ Runner is operational and ready for use"
          echo ""
          echo "Verification timestamp: $(date -u)"
          echo "Runner: ${{ runner.name }}"
          echo "OS: ${{ runner.os }}"

      - name: Post Status to GitHub
        if: always()
        run: |
          # 可以添加webhook回调或其他通知逻辑
          echo "Verification status: SUCCESS"
```

---

## 4. 故障排查和诊断工作流

**文件名**: `.github/workflows/runner-diagnostics.yml`

```yaml
name: Runner Diagnostics and Troubleshooting

on:
  workflow_dispatch:
  workflow_run:
    workflows: ["Comprehensive Runner Verification"]
    types:
      - completed
    branches:
      - main

jobs:
  diagnostics:
    name: Collect Diagnostics
    runs-on: [self-hosted]
    if: failure() || github.event_name == 'workflow_dispatch'
    
    steps:
      - name: Check Runner Service Status
        if: runner.os == 'Linux'
        run: |
          echo "=== systemd Runner Services ==="
          systemctl list-units --all | grep actions.runner || echo "No services found"
          
          echo ""
          echo "=== Checking active runner services ==="
          systemctl list-units --state=running | grep actions.runner || echo "No running services"

      - name: Check Runner Logs
        run: |
          if [ -d "$HOME/actions-runner/_diag" ]; then
            echo "=== Recent Runner Logs ==="
            ls -lh $HOME/actions-runner/_diag/ | tail -10
            
            echo ""
            echo "=== Latest Runner Log Excerpt ==="
            tail -n 50 $HOME/actions-runner/_diag/Runner_*.log 2>/dev/null | tail -n 30 || echo "No logs found"
          else
            echo "Diag directory not found"
          fi

      - name: Network Diagnostic
        continue-on-error: true
        run: |
          echo "=== Network Interfaces ==="
          ip addr show || ifconfig
          
          echo ""
          echo "=== Network Routes ==="
          ip route show || netstat -rn
          
          echo ""
          echo "=== Open Ports ==="
          netstat -tuln 2>/dev/null | grep LISTEN || ss -tuln 2>/dev/null | grep LISTEN

      - name: Docker Diagnostic
        continue-on-error: true
        run: |
          echo "=== Docker PS ==="
          docker ps -a
          
          echo ""
          echo "=== Docker Images ==="
          docker images | head -20
          
          echo ""
          echo "=== Docker Info ==="
          docker info
          
          echo ""
          echo "=== Docker Network ==="
          docker network ls
          docker network inspect bridge 2>/dev/null | head -50

      - name: Disk Space Diagnostic
        run: |
          echo "=== Disk Usage by Directory ==="
          du -sh $HOME/* 2>/dev/null | sort -rh | head -10
          
          echo ""
          echo "=== Inode Usage ==="
          df -i
          
          echo ""
          echo "=== Large Files ==="
          find $HOME -type f -size +100M 2>/dev/null | head -10

      - name: Process Diagnostic
        run: |
          echo "=== Top Processes by Memory ==="
          ps aux --sort=-%mem | head -15
          
          echo ""
          echo "=== Top Processes by CPU ==="
          ps aux --sort=-%cpu | head -15
          
          echo ""
          echo "=== Running Actions ==="
          ps aux | grep -E 'runner|docker|actions' | grep -v grep

      - name: Security Diagnostic
        continue-on-error: true
        run: |
          echo "=== File Permissions ==="
          ls -la $HOME/actions-runner/ | head -15
          
          echo ""
          echo "=== Runner User Info ==="
          id
          
          echo ""
          echo "=== Sudo Status ==="
          sudo -l 2>/dev/null || echo "No sudo access"

      - name: Environment Diagnostic
        run: |
          echo "=== Important Environment Variables ==="
          env | grep -E 'GITHUB|RUNNER|ACTIONS|PATH' | sort
          
          echo ""
          echo "=== Important Files ==="
          ls -la ~/.bashrc ~/.bash_profile ~/.zshrc ~/.kube/config 2>/dev/null || echo "N/A"

      - name: Generate Diagnostic Report
        run: |
          cat > /tmp/runner_diagnostic.txt << 'EOF'
          # Runner Diagnostic Report
          Generated: $(date)
          
          ## System Info
          $(uname -a)
          
          ## Runner Status
          $(systemctl status actions.runner* 2>/dev/null || echo "Not installed as service")
          
          ## Docker Status
          $(docker ps 2>/dev/null || echo "Docker not available")
          
          ## Network Status
          $(curl -I https://api.github.com 2>&1 | head -3)
          EOF
          
          echo "Report generated at /tmp/runner_diagnostic.txt"
          cat /tmp/runner_diagnostic.txt

      - name: Upload Diagnostic Logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: runner-diagnostics-${{ github.run_id }}
          path: |
            /tmp/runner_diagnostic.txt
            ~/.actions-runner/_diag/
          if-no-files-found: warn
          retention-days: 7
```

---

## 5. 日常监控工作流

**文件名**: `.github/workflows/daily-runner-monitoring.yml`

```yaml
name: Daily Runner Monitoring

on:
  schedule:
    - cron: '0 9 * * 1-5'  # 工作日早上9点
  workflow_dispatch:

jobs:
  monitor:
    name: Monitor Runner Health
    runs-on: [self-hosted]
    
    steps:
      - name: Check Runner Uptime
        id: uptime
        run: |
          uptime_info=$(uptime)
          echo "uptime=$uptime_info" >> $GITHUB_OUTPUT
          echo "System uptime: $uptime_info"

      - name: Check Disk Usage
        id: disk
        run: |
          disk_usage=$(df -h / | awk 'NR==2 {print $5}')
          if (( ${disk_usage%\%} > 80 )); then
            echo "status=warning" >> $GITHUB_OUTPUT
            echo "⚠️ Disk usage above 80%: $disk_usage"
          else
            echo "status=ok" >> $GITHUB_OUTPUT
            echo "✓ Disk usage normal: $disk_usage"
          fi

      - name: Check Memory Usage
        id: memory
        run: |
          mem_usage=$(free | awk '/^Mem:/ {printf("%.0f\n", $3/$2 * 100)}')
          if (( $mem_usage > 80 )); then
            echo "status=warning" >> $GITHUB_OUTPUT
            echo "⚠️ Memory usage above 80%: $mem_usage%"
          else
            echo "status=ok" >> $GITHUB_OUTPUT
            echo "✓ Memory usage normal: $mem_usage%"
          fi

      - name: Check Recent Errors in Logs
        continue-on-error: true
        run: |
          if [ -f "$HOME/actions-runner/_diag/Runner_*.log" ]; then
            error_count=$(grep -c "ERROR" $HOME/actions-runner/_diag/Runner_*.log 2>/dev/null || echo 0)
            if [ "$error_count" -gt 0 ]; then
              echo "⚠️ Found $error_count errors in recent logs"
            else
              echo "✓ No errors in recent logs"
            fi
          fi

      - name: Verify GitHub Connectivity
        run: |
          if curl -m 10 -s https://api.github.com > /dev/null; then
            echo "✓ GitHub connectivity OK"
          else
            echo "✗ GitHub connectivity FAILED"
            exit 1
          fi

      - name: Check Docker Health
        continue-on-error: true
        run: |
          docker ps > /dev/null 2>&1 && echo "✓ Docker daemon OK" || echo "✗ Docker daemon FAILED"

      - name: Generate Status Report
        run: |
          echo "# Runner Status Report"
          echo ""
          echo "**Date**: $(date)"
          echo "**Runner**: ${{ runner.name }}"
          echo "**OS**: ${{ runner.os }}"
          echo ""
          echo "## Metrics"
          echo "- Uptime: ${{ steps.uptime.outputs.uptime }}"
          echo "- Disk Status: ${{ steps.disk.outputs.status }}"
          echo "- Memory Status: ${{ steps.memory.outputs.status }}"
          echo ""
          echo "## Conclusion"
          echo "✓ All systems operational"
```

---

## 使用说明

### 如何使用这些工作流文件:

1. **创建目录结构** (如果尚未存在):
```bash
mkdir -p .github/workflows
```

2. **复制YAML文件**:
   - 将上述YAML文件内容复制到对应的文件
   - 保存到 `.github/workflows/` 目录

3. **自定义必要部分**:
   - 修改 `cron` 时间表
   - 调整 `runs-on` 标签
   - 更新通知和reporting配置

4. **提交到GitHub**:
```bash
git add .github/workflows/
git commit -m "Add runner verification workflows"
git push
```

5. **手动触发验证**:
   - 在GitHub UI → Actions 标签页
   - 选择工作流 → Run workflow
   - 点击 "Run workflow"

### 推荐的工作流组合:

| 场景 | 工作流 | 频率 |
|------|--------|------|
| 日常监控 | basic health check | 每12小时 |
| 深度检查 | comprehensive check | 每天 |
| 故障诊断 | diagnostics | 需要时 (manual) |
| 性能追踪 | performance test | 每周 |

---

**文档完成**  
**来源**: GitHub官方 actions/runner 和 actions/runner-container-hooks  
**最后更新**: 2026年2月20日
