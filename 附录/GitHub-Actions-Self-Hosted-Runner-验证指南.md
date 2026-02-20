# GitHub Actions Self-Hosted Runner 验证指南
## 官方验证工作流与脚本

**最后更新**: 2026年2月20日  
**来源**: GitHub官方文档、actions/runner、actions/runner-container-hooks

---

## 目录
1. [Runner网络连接验证](#Runner网络连接验证)
2. [官方Docker镜像构建和验证工作流](#官方Docker镜像构建和验证工作流)
3. [Runner-Container-Hooks验证示例](#Runner-Container-Hooks验证示例)
4. [Self-Hosted Runner完整测试工作流](#Self-Hosted-Runner完整测试工作流)
5. [Docker容器验证脚本](#Docker容器验证脚本)
6. [故障排查和监控](#故障排查和监控)
7. [官方参考资源](#官方参考资源)

---

## Runner网络连接验证

### 官方验证命令

GitHub official documentation 推荐使用以下命令验证self-hosted runner的网络连接:

```bash
./config.sh --check --url https://github.com/YOUR-ORG/YOUR-REPO --pat ghp_YOUR_PAT_TOKEN
```

**参数说明**:
- `--check`: 启用网络连接检查模式
- `--url`: GitHub仓库或组织URL（格式: `https://github.com/owner/repo`）
- `--pat`: 个人访问令牌（PAT），需要有 `workflow` scope 或 fine-grained token with workflows read/write access

**预期输出**:
```
Checking if Github is reachable...
  Testing connectivity to api.github.com:443 ... PASS
  Testing connectivity to github.com:443 ... PASS
  Testing connectivity to uploads.github.com:443 ... PASS
  Testing connectivity to codeload.github.com:443 ... PASS
  Testing connectivity to github-releases.githubusercontent.com:443 ... PASS
  Testing connectivity to github-cloud.s3.amazonaws.com:443 ... PASS
```

**日志位置**: `_diag/` 目录（runner安装目录下）

---

## 官方Docker镜像构建和验证工作流

### 1. 官方Dockerfile内容

来源: [actions/runner/images/Dockerfile](https://github.com/actions/runner/blob/main/images/Dockerfile)

```dockerfile
# Source: https://github.com/dotnet/dotnet-docker
FROM mcr.microsoft.com/dotnet/runtime-deps:8.0-noble AS build

ARG TARGETOS
ARG TARGETARCH
ARG RUNNER_VERSION
ARG RUNNER_CONTAINER_HOOKS_VERSION=0.7.0
ARG DOCKER_VERSION=29.2.0
ARG BUILDX_VERSION=0.31.1

RUN apt update -y && apt install curl unzip -y

WORKDIR /actions-runner
RUN export RUNNER_ARCH=${TARGETARCH} \
    && if [ "$RUNNER_ARCH" = "amd64" ]; then export RUNNER_ARCH=x64 ; fi \
    && curl -f -L -o runner.tar.gz \
https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-${TARGETOS}-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz \
    && tar xzf ./runner.tar.gz \
    && rm runner.tar.gz

RUN curl -f -L -o runner-container-hooks.zip \
https://github.com/actions/runner-container-hooks/releases/download/v${RUNNER_CONTAINER_HOOKS_VERSION}/actions-runner-hooks-k8s-${RUNNER_CONTAINER_HOOKS_VERSION}.zip \
    && unzip ./runner-container-hooks.zip -d ./k8s \
    && rm runner-container-hooks.zip

RUN curl -f -L -o runner-container-hooks.zip \
https://github.com/actions/runner-container-hooks/releases/download/v0.8.1/actions-runner-hooks-k8s-0.8.1.zip \
    && unzip ./runner-container-hooks.zip -d ./k8s-novolume \
    && rm runner-container-hooks.zip

RUN export RUNNER_ARCH=${TARGETARCH} \
    && if [ "$RUNNER_ARCH" = "amd64" ]; then export DOCKER_ARCH=x86_64 ; fi \
    && if [ "$RUNNER_ARCH" = "arm64" ]; then export DOCKER_ARCH=aarch64 ; fi \
    && curl -fLo docker.tgz \
https://download.docker.com/${TARGETOS}/static/stable/${DOCKER_ARCH}/docker-${DOCKER_VERSION}.tgz \
    && tar zxvf docker.tgz \
    && rm -rf docker.tgz \
    && mkdir -p /usr/local/lib/docker/cli-plugins \
    && curl -fLo /usr/local/lib/docker/cli-plugins/docker-buildx \
"https://github.com/docker/buildx/releases/download/v${BUILDX_VERSION}/buildx-v${BUILDX_VERSION}.linux-${TARGETARCH}" \
    && chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

FROM mcr.microsoft.com/dotnet/runtime-deps:8.0-noble

ENV DEBIAN_FRONTEND=noninteractive
ENV RUNNER_MANUALLY_TRAP_SIG=1
ENV ACTIONS_RUNNER_PRINT_LOG_TO_STDOUT=1
ENV ImageOS=ubuntu24

# 'gpg-agent' and 'software-properties-common' are needed for the 'add-apt-repository' command that follows
RUN apt update -y \
    && apt install -y --no-install-recommends sudo lsb-release gpg-agent software-properties-common curl jq unzip \
    && rm -rf /var/lib/apt/lists/*

# Configure git-core/ppa based on guidance here: https://git-scm.com/download/linux
RUN add-apt-repository ppa:git-core/ppa \
    && apt update -y \
    && apt install -y git \
    && rm -rf /var/lib/apt/lists/*

RUN adduser --disabled-password --gecos "" --uid 1001 runner \
    && groupadd docker --gid 123 \
    && usermod -aG sudo runner \
    && usermod -aG docker runner \
    && echo "%sudo   ALL=(ALL:ALL) NOPASSWD:ALL" > /etc/sudoers \
    && echo "Defaults env_keep += \"DEBIAN_FRONTEND\"" >> /etc/sudoers \
    && chmod 777 /home/runner

WORKDIR /home/runner

COPY --chown=runner:docker --from=build /actions-runner .
COPY --from=build /usr/local/lib/docker/cli-plugins/docker-buildx /usr/local/lib/docker/cli-plugins/docker-buildx

RUN install -o root -g root -m 755 docker/* /usr/bin/ && rm -rf docker

USER runner
```

### 2. 官方Runner CI构建和测试工作流

来源: [actions/runner/.github/workflows/build.yml](https://github.com/actions/runner/blob/main/.github/workflows/build.yml)

```yaml
name: Runner CI

on:
  workflow_dispatch:
  push:
    branches:
    - main
    - releases/*
    paths-ignore:
    - '**.md'
  pull_request:
    branches:
    - '**'
    paths-ignore:
    - '**.md'

permissions:
  contents: read

jobs:
  build:
    strategy:
      matrix:
        runtime: [ linux-x64, linux-arm64, linux-arm, win-x64, win-arm64, osx-x64, osx-arm64 ]
        include:
        - runtime: linux-x64
          os: ubuntu-latest
          devScript: ./dev.sh

        - runtime: linux-arm64
          os: ubuntu-latest
          devScript: ./dev.sh

        - runtime: linux-arm
          os: ubuntu-latest
          devScript: ./dev.sh

        - runtime: osx-x64
          os: macOS-latest
          devScript: ./dev.sh

        - runtime: osx-arm64
          os: macOS-latest
          devScript: ./dev.sh

        - runtime: win-x64
          os: windows-latest
          devScript: ./dev

        - runtime: win-arm64
          os: windows-latest
          devScript: ./dev

    runs-on: ${{ matrix.os }}
    steps:
    - uses: actions/checkout@v6

    # Build runner layout
    - name: Build & Layout Release
      run: |
        ${{ matrix.devScript }} layout Release ${{ matrix.runtime }}
      working-directory: src

    # Run tests
    - name: L0
      run: |
        ${{ matrix.devScript }} test
      working-directory: src
      if: matrix.runtime != 'linux-arm64' && matrix.runtime != 'linux-arm' && matrix.runtime != 'osx-arm64' && matrix.runtime != 'win-arm64'

    # Create runner package tar.gz/zip
    - name: Package Release
      if: github.event_name != 'pull_request'
      run: |
        ${{ matrix.devScript }} package Release ${{ matrix.runtime }}
      working-directory: src

    # Upload runner package tar.gz/zip as artifact
    - name: Publish Artifact
      if: github.event_name != 'pull_request'
      uses: actions/upload-artifact@v6
      with:
        name: runner-package-${{ matrix.runtime }}
        path: |
          _package

  docker:
    strategy:
      matrix:
        os: [ ubuntu-latest, ubuntu-24.04-arm ]
        include:
          - os: ubuntu-latest
            docker_platform: linux/amd64

          - os: ubuntu-24.04-arm
            docker_platform: linux/arm64

    runs-on: ${{ matrix.os }}
    steps:
    - uses: actions/checkout@v6

    - name: Get latest runner version
      id: latest_runner
      uses: actions/github-script@v8
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
        script: |
          const release = await github.rest.repos.getLatestRelease({
            owner: 'actions',
            repo: 'runner',
          });
          const version = release.data.tag_name.replace(/^v/, '');
          core.setOutput('version', version);

    - name: Setup Docker buildx
      uses: docker/setup-buildx-action@v3

    - name: Build Docker image
      uses: docker/build-push-action@v6
      with:
        context: ./images
        load: true
        platforms: ${{ matrix.docker_platform }}
        tags: |
          ${{ github.sha }}:latest
        build-args: |
          RUNNER_VERSION=${{ steps.latest_runner.outputs.version }}

    # 重点: 验证Docker镜像是否可正常运行
    - name: Test Docker image
      run: |
        docker run --rm ${{ github.sha }}:latest ./run.sh --version
```

**关键验证步骤**: `Test Docker image` 步骤运行Docker容器并验证runner版本

---

## Runner-Container-Hooks验证示例

### 1. prepare-job.json 示例

来源: [actions/runner-container-hooks/examples/prepare-job.json](https://github.com/actions/runner-container-hooks/blob/main/examples/prepare-job.json)

```json
{
  "command": "prepare_job",
  "responseFile": "/users/thboop/runner/_work/{guid}.json",
  "state": {},
  "args": {
    "container": {
      "image": "node:22",
      "workingDirectory": "/__w/repo/repo",
      "createOptions": "--cpus 1",
      "environmentVariables": {
        "NODE_ENV": "development"
      },
      "userMountVolumes": [
        {
          "sourceVolumePath": "my_docker_volume",
          "targetVolumePath": "/volume_mount",
          "readOnly": false
        }
      ],
      "systemMountVolumes": [
        {
          "sourceVolumePath": "/var/run/docker.sock",
          "targetVolumePath": "/var/run/docker.sock",
          "readOnly": false
        },
        {
          "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work",
          "targetVolumePath": "/__w",
          "readOnly": false
        },
        {
          "sourceVolumePath": "/Users/thomas/git/runner/_layout/externals",
          "targetVolumePath": "/__e",
          "readOnly": true
        },
        {
          "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_temp",
          "targetVolumePath": "/__w/_temp",
          "readOnly": false
        },
        {
          "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_actions",
          "targetVolumePath": "/__w/_actions",
          "readOnly": false
        },
        {
          "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_tool",
          "targetVolumePath": "/__w/_tool",
          "readOnly": false
        },
        {
          "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_temp/_github_home",
          "targetVolumePath": "/github/home",
          "readOnly": false
        },
        {
          "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_temp/_github_workflow",
          "targetVolumePath": "/github/workflow",
          "readOnly": false
        }
      ],
      "registry": {
        "username": "foo",
        "password": "bar",
        "serverUrl": "https://index.docker.io/v1"
      },
      "portMappings": [
        "80:8080"
      ]
    },
    "services": [
      {
        "contextName": "redis",
        "image": "redis",
        "createOptions": "--cpus 1",
        "entrypoint": null,
        "entryPointArgs": [],
        "environmentVariables": {},
        "userMountVolumes": [
          {
            "sourceVolumePath": "/var/run/docker.sock",
            "targetVolumePath": "/var/run/docker.sock",
            "readOnly": false
          }
        ],
        "portMappings": [
          "8080:80",
          "8088:8080"
        ],
        "registry": {
          "username": "foo",
          "password": "bar",
          "serverUrl": "https://index.docker.io/v1"
        }
      }
    ]
  }
}
```

### 2. run-container-step.json 示例

来源: [actions/runner-container-hooks/examples/run-container-step.json](https://github.com/actions/runner-container-hooks/blob/main/examples/run-container-step.json)

```json
{
  "command": "run_container_step",
  "responseFile": null,
  "state": {
    "network": "github_network_53269bd575974817b43f4733536b200c",
    "container": "82e8219701fe096a35941d869cf8d71af1d943b5d3bdd718850fb87ac3042480",
    "services": {
      "redis": "60972d9aa486605e66b0dad4abb638dc3d9116f566579e418166eedb8abb9105"
    }
  },
  "args": {
    "image": "node:22",
    "dockerfile": null,
    "entryPointArgs": [
      "-e",
      "example-script.sh"
    ],
    "entryPoint": "bash",
    "workingDirectory": "/__w/repo/repo",
    "createOptions": "--cpus 1",
    "environmentVariables": {
      "NODE_ENV": "development"
    },
    "prependPath": [
      "/foo/bar",
      "bar/foo"
    ],
    "userMountVolumes": [
      {
        "sourceVolumePath": "my_docker_volume",
        "targetVolumePath": "/volume_mount",
        "readOnly": false
      }
    ],
    "systemMountVolumes": [
      {
        "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work",
        "targetVolumePath": "/__w",
        "readOnly": false
      },
      {
        "sourceVolumePath": "/Users/thomas/git/runner/_layout/externals",
        "targetVolumePath": "/__e",
        "readOnly": true
      },
      {
        "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_temp",
        "targetVolumePath": "/__w/_temp",
        "readOnly": false
      },
      {
        "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_actions",
        "targetVolumePath": "/__w/_actions",
        "readOnly": false
      },
      {
        "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_tool",
        "targetVolumePath": "/__w/_tool",
        "readOnly": false
      },
      {
        "sourceVolumePath": "//Users/thomas/git/runner/_layout/_work/_temp/_github_home",
        "targetVolumePath": "/github/home",
        "readOnly": false
      },
      {
        "sourceVolumePath": "/Users/thomas/git/runner/_layout/_work/_temp/_github_workflow",
        "targetVolumePath": "/github/workflow",
        "readOnly": false
      }
    ],
    "registry": null,
    "portMappings": [
      "8080:8080"
    ]
  }
}
```

### 3. extension.yaml 示例

来源: [actions/runner-container-hooks/examples/extension.yaml](https://github.com/actions/runner-container-hooks/blob/main/examples/extension.yaml)

```yaml
metadata:
  annotations:
    annotated-by: "extension"
  labels:
    labeled-by: "extension"
spec:
  restartPolicy: Never
  containers:
  - name: $job #  overwrites job container
    env:
    - name: ENV1
      value: "value1"
    imagePullPolicy: Always
    image: "busybox:1.28" # Ignored
    command:
    - sh
    args:
    - -c
    - sleep 50
  - name: $redis # overwrites redis service
    env:
    - name: ENV2
      value: "value2"
    image: "busybox:1.28" # Ignored
    resources:
      requests:
        memory: "1Mi"
        cpu: "1"
      limits:
        memory: "1Gi"
        cpu: "2"
  - name: side-car
    image: "ubuntu:latest" # required
    command:
      - sh
    args:
      - -c
      - sleep 60
```

### 4. Runner-Container-Hooks 构建和测试工作流

来源: [actions/runner-container-hooks/.github/workflows/build.yaml](https://github.com/actions/runner-container-hooks/blob/main/.github/workflows/build.yaml)

```yaml
name: CI - Build & Test
on:
  pull_request:
    branches:
    - '*'
    paths-ignore:
    - '**.md'
  workflow_dispatch:

jobs:
  format-and-lint:
    name: Format & Lint Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
        name: Install dependencies
      - run: npm run bootstrap
        name: Bootstrap the packages
      - run: npm run build-all
        name: Build packages
      - run: npm run format-check
        name: Check formatting
      - name: Check linter
        run: |
          npm run lint
          git diff --exit-code -- . ':!packages/k8s/tests/test-kind.yaml'

  docker-tests:
    name: Docker Hook Tests
    runs-on: ubuntu-latest
    needs: format-and-lint
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
        name: Install dependencies
      - run: npm run bootstrap
        name: Bootstrap the packages
      - run: npm run build-all
        name: Build packages
      - name: Run Docker tests
        run: npm run test --prefix packages/docker

  k8s-tests:
    name: Kubernetes Hook Tests
    runs-on: ubuntu-latest
    needs: format-and-lint
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: sed -i "s|{{PATHTOREPO}}|$(pwd)|" packages/k8s/tests/test-kind.yaml
        name: Setup kind cluster yaml config
      - uses: helm/kind-action@v1.12.0
        with:
          config: packages/k8s/tests/test-kind.yaml
      - run: npm install
        name: Install dependencies
      - run: npm run bootstrap
        name: Bootstrap the packages
      - run: npm run build-all
        name: Build packages
      - name: Run Kubernetes tests
        run: npm run test --prefix packages/k8s
```

---

## Self-Hosted Runner完整测试工作流

### 基础完整测试工作流模板

```yaml
name: Self-Hosted Runner Verification

on:
  workflow_dispatch:
  push:
    branches:
      - main
  schedule:
    # 每天UTC 10:00运行验证
    - cron: '0 10 * * *'

jobs:
  # 第一步: 验证Runner连接
  verify-runner-connectivity:
    name: Verify Runner Connectivity
    runs-on: [self-hosted]
    steps:
      - name: Check Docker Installation
        run: |
          echo "=== Docker Version ==="
          docker --version
          echo "=== Docker Info ==="
          docker info | head -20
          
      - name: Verify Docker Service Running
        run: |
          sudo systemctl status docker

      - name: Check Git Installation
        run: |
          echo "=== Git Version ==="
          git --version

      - name: Verify Network Connectivity
        run: |
          echo "=== Testing GitHub API Connectivity ==="
          curl -I https://api.github.com
          echo ""
          echo "=== Testing GitHub.com Connectivity ==="
          curl -I https://github.com
          echo ""
          echo "=== Testing GitHub Releases Connectivity ==="
          curl -I https://github.com/actions/runner/releases/latest

      - name: Check System Resources
        run: |
          echo "=== CPU Info ==="
          nproc
          echo "=== Memory Info ==="
          free -h
          echo "=== Disk Space ==="
          df -h

      - name: List Available Labels
        run: |
          echo "Runner labels available"
          # 显示runner配置的标签信息

  # 第二步: 简单工作流测试
  test-simple-workflow:
    name: Test Simple Workflow
    runs-on: [self-hosted]
    needs: verify-runner-connectivity
    steps:
      - name: Print Environment Info
        run: |
          echo "=== Environment ==="
          echo "OS: $(uname -s)"
          echo "Hostname: $(hostname)"
          echo "Current User: $(whoami)"
          echo "HOME: $HOME"
          echo "GITHUB_WORKSPACE: $GITHUB_WORKSPACE"

      - name: Basic Shell Commands
        run: |
          echo "=== Testing Basic Commands ==="
          pwd
          ls -la
          echo "SUCCESS: Basic shell commands working"

      - name: Check Node.js Installation
        run: |
          node --version || echo "Node.js not installed"
          npm --version || echo "npm not installed"

  # 第三步: Docker容器测试
  test-docker-containers:
    name: Test Docker Containers
    runs-on: [self-hosted]
    needs: verify-runner-connectivity
    services:
      redis:
        image: redis:7.0
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    steps:
      - name: Test Container Execution
        run: |
          echo "=== Testing Docker Container ==="
          docker run --rm ubuntu:latest uname -a

      - name: Test Container with Volume
        run: |
          mkdir -p /tmp/test-volume
          echo "test data" > /tmp/test-volume/test.txt
          docker run --rm -v /tmp/test-volume:/mnt ubuntu:latest cat /mnt/test.txt

      - name: Test Service Connectivity
        run: |
          echo "=== Testing Redis Service ==="
          redis-cli -h localhost ping || docker exec -it $(docker ps -q) redis-cli ping

      - name: Test Docker Build
        run: |
          cat > /tmp/Dockerfile.test << 'EOF'
          FROM ubuntu:latest
          RUN echo "Docker test image built successfully"
          EOF
          docker build -f /tmp/Dockerfile.test -t test:latest /tmp/
          docker run --rm test:latest echo "Docker build test passed"

  # 第四步: 检查运行日志和诊断
  check-logs-and-diagnostics:
    name: Check Logs and Diagnostics
    runs-on: [self-hosted]
    if: always()  # 总是运行，无论前面的作业是否成功
    steps:
      - name: Check Runner Application Logs
        run: |
          echo "=== Checking Runner Logs ==="
          if [ -d "$HOME/actions-runner/_diag" ]; then
            echo "Recent runner logs:"
            ls -lh $HOME/actions-runner/_diag/ | tail -5
          else
            echo "Diag directory not found"
          fi

      - name: Check System Logs (Linux)
        if: runner.os == 'Linux'
        run: |
          echo "=== Recent systemd logs for runner service ==="
          journalctl -u actions.runner* --no-pager -n 20 || echo "No runner service found"
          
      - name: Docker Diagnostics
        run: |
          echo "=== Docker Inspect ==="
          docker ps -a
          echo ""
          echo "=== Docker Network ==="
          docker network ls

  # 第五步: 最终汇总报告
  summary:
    name: Verification Summary
    runs-on: [self-hosted]
    needs: [verify-runner-connectivity, test-simple-workflow, test-docker-containers]
    if: always()
    steps:
      - name: Print Verification Summary
        run: |
          echo "========================================"
          echo "  Self-Hosted Runner Verification Done"
          echo "========================================"
          echo "✓ Runner connectivity verified"
          echo "✓ Docker containers tested"
          echo "✓ System resources checked"
          echo ""
          echo "Runner is ready for production use!"

      - name: Slack Notification (Optional)
        if: failure()
        run: |
          echo "If configured, send notification to Slack about runner status"
```

---

## Docker容器验证脚本

### 1. Docker容器初始化验证脚本

```bash
#!/bin/bash
# Filename: verify-runner-docker.sh
# Purpose: 验证Docker形式的self-hosted runner部署成功

set -e

echo "=========================================="
echo "  Docker Self-Hosted Runner Verification"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 记录检查结果
PASS_COUNT=0
FAIL_COUNT=0

function check_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASS_COUNT++))
}

function check_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((FAIL_COUNT++))
}

function check_warning() {
    echo -e "${YELLOW}⚠ WARNING${NC}: $1"
}

# 1. 检查Docker是否安装
echo "[1/8] Checking Docker installation..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    check_pass "Docker installed: $DOCKER_VERSION"
else
    check_fail "Docker not found in PATH"
    exit 1
fi

# 2. 检查Docker守护进程
echo "[2/8] Checking Docker daemon..."
if docker ps &> /dev/null; then
    check_pass "Docker daemon is running"
else
    check_fail "Cannot connect to Docker daemon"
    exit 1
fi

# 3. 检查Docker网络
echo "[3/8] Checking Docker networks..."
if docker network ls | grep -q "bridge"; then
    check_pass "Default Docker networks available"
else
    check_fail "Docker networks not properly configured"
fi

# 4. 检查网络连接
echo "[4/8] Testing network connectivity..."
if curl -sf https://api.github.com > /dev/null 2>&1; then
    check_pass "GitHub API is reachable"
else
    check_fail "Cannot reach GitHub API"
fi

if curl -sf https://github.com > /dev/null 2>&1; then
    check_pass "GitHub.com is reachable"
else
    check_fail "Cannot reach GitHub.com"
fi

# 5. 测试基本容器运行
echo "[5/8] Testing basic container execution..."
if docker run --rm alpine:latest echo "Hello from Docker" > /dev/null 2>&1; then
    check_pass "Basic container execution works"
else
    check_fail "Cannot execute containers"
fi

# 6. 测试容器卷挂载
echo "[6/8] Testing volume mounting..."
TEST_DIR=$(mktemp -d)
TEST_FILE="$TEST_DIR/test.txt"
echo "test data" > "$TEST_FILE"

if docker run --rm -v "$TEST_DIR:/data" alpine:latest test -f /data/test.txt 2>&1; then
    check_pass "Volume mounting works"
    rm -rf "$TEST_DIR"
else
    check_fail "Volume mounting failed"
    rm -rf "$TEST_DIR"
fi

# 7. 检查Docker hub连接
echo "[7/8] Testing Docker Hub connectivity..."
if docker pull hello-world > /dev/null 2>&1; then
    check_pass "Can pull images from Docker Hub"
    docker rmi hello-world > /dev/null 2>&1
else
    check_fail "Cannot pull images from Docker Hub"
fi

# 8. 检查git工具
echo "[8/8] Checking git installation..."
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    check_pass "Git installed: $GIT_VERSION"
else
    check_warning "Git not found in PATH (optional for some runners)"
fi

# 打印总结
echo ""
echo "=========================================="
echo "  Verification Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo "Docker self-hosted runner is ready for use."
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Please review the errors above.${NC}"
    exit 1
fi
```

### 2. Runner配置验证脚本

```bash
#!/bin/bash
# Filename: verify-runner-config.sh
# Purpose: 验证runner配置和网络连接

# 使用官方config.sh进行检查
# 此脚本假设runner已被安装在当前目录

if [ ! -f "./config.sh" ]; then
    echo "Error: config.sh not found. Please run this script from the runner directory."
    exit 1
fi

echo "=========================================="
echo "  Runner Configuration Verification"
echo "=========================================="
echo ""

# 获取必要的参数
read -p "Enter GitHub repository URL (https://github.com/owner/repo): " REPO_URL
read -p "Enter Personal Access Token (PAT): " PAT_TOKEN

echo ""
echo "Running official connectivity check..."
echo ""

# 运行官方的网络连接检查
./config.sh --check --url "$REPO_URL" --pat "$PAT_TOKEN"

RESULT=$?

echo ""
echo "=========================================="
if [ $RESULT -eq 0 ]; then
    echo "✓ Connectivity check passed!"
    echo "Runner can reach GitHub successfully."
    echo ""
    echo "Next steps:"
    echo "1. Run: ./config.sh --url $REPO_URL --token <registration-token>"
    echo "2. Start runner: ./run.sh"
else
    echo "✗ Connectivity check failed!"
    echo "Check the error messages above and review:"
    echo "  - Network connectivity"
    echo "  - Firewall rules"
    echo "  - Proxy settings"
    echo "  - TLS/SSL certificates"
    echo ""
    echo "For more details, check logs in: _diag/ directory"
fi
echo "=========================================="

exit $RESULT
```

---

## 故障排查和监控

### 1. 检查Runner服务状态 (Linux)

```bash
# 检查systemd服务状态
sudo systemctl status actions.runner.octo-org-octo-repo.runner01.service

# 查看real-time日志
sudo journalctl -u actions.runner.octo-org-octo-repo.runner01.service -f

# 查看最近20行日志
journalctl -u actions.runner.octo-org-octo-repo.runner01.service --no-pager -n 20

# 查看服务运行的用户
sudo systemctl show -p User actions.runner.octo-org-octo-repo.runner01.service
```

### 2. Docker相关故障排查

```bash
# 检查Docker是否已安装
which docker

# 检查Docker服务状态
sudo systemctl is-active docker.service

# 验证Docker权限
docker ps -a

# 如果权限被拒绝，添加runner用户到docker组
sudo usermod -aG docker runner-user

# 验证Docker network
docker network ls

# 检查Docker socket权限
ls -la /var/run/docker.sock
```

### 3. 查看Runner应用日志

```bash
# 进入runner目录
cd ~/actions-runner

# 查看可用的日志文件
ls -lh _diag/

# 查看最近的runner日志
tail -n 50 _diag/Runner_*.log

# 查看worker日志（特定作业）
tail -n 100 _diag/Worker_*.log
```

### 4. 网络诊断命令

```bash
# 测试GitHub连接
ping -c 3 github.com
nslookup github.com
curl -I https://github.com

# 测试GitHub API
curl -I https://api.github.com

# 测试artifact上传
curl -I https://uploads.github.com

# 使用运行官方检查（如果runner已安装）
cd ~/actions-runner
./config.sh --check --url https://github.com/YOUR-ORG/YOUR-REPO --pat YOUR_PAT
```

---

## 官方参考资源

### GitHub官方文档
1. **Adding self-hosted runners**  
   https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners

2. **Using self-hosted runners in a workflow**  
   https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/using-self-hosted-runners-in-a-workflow

3. **Configuring the self-hosted runner application as a service**  
   https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-runner-application-as-a-service

4. **Monitoring and troubleshooting self-hosted runners**  
   https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/monitoring-and-troubleshooting-self-hosted-runners

5. **Self-hosted runners reference**  
   https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners

### GitHub官方仓库

1. **actions/runner** - GitHub Actions Runner应用  
   - Repository: https://github.com/actions/runner
   - Dockerfile: https://github.com/actions/runner/blob/main/images/Dockerfile
   - Docker Package: https://github.com/orgs/actions/packages/container/package/actions-runner
   - Build Workflow: https://github.com/actions/runner/blob/main/.github/workflows/build.yml

2. **actions/runner-container-hooks** - Docker容器hooks实现  
   - Repository: https://github.com/actions/runner-container-hooks
   - Examples: https://github.com/actions/runner-container-hooks/tree/main/examples
   - Build Tests: https://github.com/actions/runner-container-hooks/blob/main/.github/workflows/build.yaml

3. **actions/starter-workflows** - GitHub Actions工作流模板  
   - Repository: https://github.com/actions/starter-workflows
   - CI Templates: https://github.com/actions/starter-workflows/tree/main/ci

### Linux系统要求

**Debian/Ubuntu系列**:
```bash
# 运行依赖
sudo apt-get install -y curl jq unzip git

# .NET Core依赖（对于runner应用）
sudo apt-get install -y liblttng-ust1 libkrb5-3 zlib1g

# Docker（如需容器支持）
sudo apt-get install -y docker.io
```

**Red Hat/Fedora系列**:
```bash
# 运行依赖
sudo yum install -y curl jq unzip git

# .NET Core依赖
sudo yum install -y lttng-ust openssl-libs krb5-libs zlib libicu

# Docker
sudo yum install -y docker
```

---

## 最佳实践总结

### ✓ 部署检查清单

- [ ] Docker已安装并运行正常
- [ ] 网络连接到GitHub正常（使用 `config.sh --check` 命令验证）
- [ ] Runner用户拥有Docker权限
- [ ] 系统资源充足（CPU、内存、磁盘空间）
- [ ] Git已安装（对于checkout actions）
- [ ] Runner应用日志目录可写
- [ ] Runner作为服务配置（Linux推荐）
- [ ] 防火墙规则允许出站连接到GitHub
- [ ] TLS证书有效且受信任
- [ ] 首个测试workload已成功执行

### ✓ 监控和维护

- 定期检查runner服务状态
- 监控日志文件的异常
- 配置log rotation防止磁盘爆满
- 定期更新runner应用（自动更新默认启用）
- 监控Docker守护进程健康状态
- 检查可用的系统资源（特别是磁盘空间）

### ✓ 故障排查流程

1. 检查runner服务是否运行
2. 验证网络连接（使用官方config.sh --check）
3. 检查Docker容器支持（如适用）
4. 查看runner应用日志
5. 验证权限设置
6. 测试简单工作流

---

**文档版本**: 1.0  
**Last Updated**: 2026年2月20日  
**Source**: GitHub官方文档和开源项目
