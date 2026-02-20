# Docker 方案：GitHub Actions Runner 部署指南

**最后更新：2026-02-20**

## 📋 目录

1. [概述](#概述)
2. [方案对比](#方案对比)
3. [快速开始](#快速开始)
4. [生产部署](#生产部署)
5. [故障排查](#故障排查)
6. [最佳实践](#最佳实践)

---

## 概述

此方案使用 **Docker 容器**替代之前的裸机 Runner 方案，解决环境差异问题。

### 核心优势

| 方面 | 裸机方案 | Docker方案 |
|------|-------|----------|
| **环境一致性** | ❌ 依赖系统环境 | ✅ 完全隔离 |
| **复杂度** | ❌ 多个 wrapper 脚本 | ✅ 单个 Dockerfile |
| **可维护性** | ❌ 版本漂移风险 | ✅ 版本固定 |
| **可重现性** | ❌ 难以复现 | ✅ 完全可重现 |
| **快速部署** | ❌ ~30 分钟 | ✅ ~5 分钟 |
| **隔离性** | ❌ 共享主机资源 | ✅ 容器隔离 |

---

## 方案对比

### 裸机方案（v3.1 - 旧）

```ini
宿主机 (Rocky 9)
├── 系统依赖（需要逐个 dnf install）
├── apt-get wrapper 脚本
├── JSON 配置文件
├── jq 依赖
└── 问题：环境漂移，脚本复杂，难以维护
```

### Docker 方案（推荐）

```ini
Docker 镜像 (基于 Rocky 9.4)
├── 系统依赖（Dockerfile 中定义）
├── Go 编译环境
├── GitHub Actions 友好
└── 优势：一致性，简洁，易维护
```

---

## 快速开始

### 前置条件

- **操作系统**: Rocky Linux 9.4 - 9.7（推荐） 或其他 RHEL 兼容系统
- **Docker Engine** >= 20.10（通过清华源安装，见下文）
- **Docker Compose** >= 2.0（通常与 Docker Engine 一起安装）
- 至少 **5GB** 可用磁盘空间（镜像 + 编译缓存）

### 0️⃣ 安装 Docker Engine（清华源）

在 Rocky Linux 9.x 系统上使用清华源安装最新的 Docker-CE：

```bash
# 1. 移除旧版本 Docker（如有）
sudo dnf remove docker docker-client docker-client-latest docker-common -y 2>/dev/null || true

# 2. 安装必要工具
sudo dnf install -y dnf-plugins-core

# 3. 配置清华源
sudo dnf config-manager --add-repo https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/centos/docker-ce.repo

# 4. 安装 Docker CE 和 Compose
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. 启动并启用 Docker 服务
sudo systemctl start docker && sudo systemctl enable docker

# 6. 验证安装
docker --version && docker-compose --version
```

### 0️⃣ Docker 镜像源检测与自动配置

使用以下脚本自动检测可用镜像源，并配置最佳源：

```bash
#!/usr/bin/env bash
set -euo pipefail

OUT="mirror_check_$(date +%Y%m%d_%H%M%S).csv"
echo "mirror,endpoint,http_code,time_total,size_download" > "$OUT"

mirrors=(
  "https://docker.mirrors.ustc.edu.cn"
  "https://hub-mirror.c.163.com"
  "https://registry.docker-cn.com"
  "https://mirrors.aliyun.com"
  "https://hub-mirror.baidubce.com"
)

endpoints=("" "/v2/" "/_ping")

for m in "${mirrors[@]}"; do
  for e in "${endpoints[@]}"; do
    url="${m%/}${e}"
    out=$(curl -sS -L --max-time 10 --connect-timeout 5 -w "%{http_code},%{time_total},%{size_download}" -o /dev/null "$url" 2>/dev/null) || out="000,0,0"
    echo "$m,$e,$out" >> "$OUT"
    http_code=$(echo $out | cut -d, -f1)
    [ "$http_code" = "200" ] && echo "✅ $url: $http_code"
  done
done

good_mirror=$(grep ',200,' "$OUT" | head -1 | cut -d, -f1)
if [ -n "$good_mirror" ]; then
  echo "选择镜像源: $good_mirror"
  sudo mkdir -p /etc/docker
  sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "registry-mirrors": ["$good_mirror"],
  "log-driver": "json-file",
  "log-opts": {"max-size": "10m", "max-file": "3"}
}
EOF
  sudo systemctl daemon-reload && sudo systemctl restart docker
fi
```

### 1️⃣ 本地测试（使用 Docker Compose）

```bash
# 进入项目根目录
cd /path/to/rclone

# 启动 CI 环境（首次会拉取镜像，需要几分钟）
docker-compose up -d

# 验证环境
docker-compose exec runner verify-ci-env

# 进入容器进行交互使用
docker-compose exec runner bash

# 查看容器日志
docker-compose logs -f runner

# 停止环境
docker-compose down -v
```

### 2️⃣ 构建镜像

```bash
# 构建 CI 镜像（基于 Rocky 9.4，首次需要 3-5 分钟）
docker build -f Dockerfile.ci -t rclone-ci:latest .

# 验证镜像（运行环境验证脚本）
docker run --rm rclone-ci:latest verify-ci-env

# 查看镜像信息
docker images | grep rclone-ci

# 查看镜像构建历史
docker history rclone-ci:latest
```

### 3️⃣ 运行容器

```bash
# 方式一：交互式运行（开发调试）
docker run -it --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  rclone-ci:latest bash

# 方式二：一次性执行命令
docker run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  rclone-ci:latest \
  bash -c "go version && make test"
```

---

## 生产部署

### 方案 A：Runner 机器使用 Docker（完全容器化）

此方案将 GitHub Actions Runner 本身也运行在容器中。

#### 架构

```
宿主机 (Rocky 9)
  └── Docker Engine
      └── Runner 容器（rclone-ci:latest）
          ├── 编译 Go 代码
          ├── 运行测试
          └── 生成构建物
```

#### 步骤

**Step 1: 注册 GitHub Actions Runner（如未进行）**

在 GitHub 仓库设置中获取注册令牌，然后在宿主机执行：

```bash
# 创建 runner 目录
mkdir -p /opt/github-actions-runner
cd /opt/github-actions-runner

# 下载 runner（替换版本为最新版）
curl -o actions-runner-linux-x64.tar.gz \
  -L https://github.com/actions/runner/releases/download/v2.XX.Y/actions-runner-linux-x64.tar.gz

tar xzf actions-runner-linux-x64.tar.gz

# 注册 runner（仅第一次）
./config.sh --url https://github.com/{owner}/{repo} --token {TOKEN}

# 启动 runner 服务
./run.sh
```

**Step 2: 使用 Docker Compose 运行 Runner**

创建 `docker-compose.runner.yml`：

```yaml
version: '3.8'

services:
  actions-runner:
    image: rclone-ci:latest
    container_name: github-actions-runner
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # 允许访问主机 Docker
      - /opt/github-actions-runner:/home/runner/actions-runner
      - ./:/workspace
    working_dir: /home/runner/actions-runner
    cap_add:
      - SYS_ADMIN
    security_opt:
      - apparmor:unconfined
    devices:
      - /dev/fuse:/dev/fuse
    restart: always
    entrypoint: ./run.sh
```

启动：

```bash
docker-compose -f docker-compose.runner.yml up -d
```

### 方案 B：Runner 在宿主机，Job 在容器中（推荐混合方案）

此方案将 Runner 保持在宿主机，但每个 Job 在容器中执行。

#### 优势

- Runner 本身稳定、易管理
- Job 执行环境一致、可预测
- 最灵活的方案

#### 工作流配置

修改 GitHub Actions 工作流文件：

```yaml
name: Build rclone
on: [push]

jobs:
  build:
    runs-on: [self-hosted, linux, docker]
    container:
      image: rclone-ci:latest
      options: --cpus 4 --memory 8g
      volumes:
        - /dev/fuse:/dev/fuse
      env:
        CGO_ENABLED: "1"
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Verify CI environment
        run: verify-ci-env
      
      - name: Download dependencies
        run: go mod download
      
      - name: Build rclone
        run: make
      
      - name: Run tests
        run: make test
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        if: success()
        with:
          name: rclone-binary
          path: rclone
          retention-days: 30
```

**关键配置说明**：

| 字段 | 说明 |
|------|------|
| `container.image` | 使用的 Docker 镜像 |
| `container.options` | Docker run 选项（CPU/内存限制） |
| `container.volumes` | 挂载 FUSE 设备（支持文件系统操作） |
| `container.env` | 容器内环境变量 |

---

## 故障排查

### 问题 1: 镜像构建失败

**症状**: `docker build -f Dockerfile.ci ...` 返回错误

**排查步骤**:

```bash
# 1. 检查网络连接
ping 8.8.8.8

# 2. 增加 Docker 构建日志详度
docker build -f Dockerfile.ci --progress=plain -t rclone-ci:latest .

# 3. 检查 DNS 设置
docker run --rm busybox nslookup github.com

# 4. 清理 Docker 缓存后重试
docker builder prune -a
docker build -f Dockerfile.ci -t rclone-ci:latest .
```

### 问题 2: 容器运行时权限不足

**症状**: `Permission denied` 或 `operation not permitted`

**解决方案**:

```bash
# 检查用户权限
id runner  # 应看到 runner 用户信息

# 确保容器启动选项正确
docker run --rm \
  --cap-add SYS_ADMIN \
  --security-opt apparmor:unconfined \
  --device /dev/fuse \
  rclone-ci:latest verify-ci-env
```

### 问题 3: 编译速度缓慢

**症状**: `go build` 或 `make` 命令耗时过长

**优化方案**:

```bash
# 1. 使用 Docker Compose 中定义的卷缓存
docker-compose up -d

# 2. 预热 Go modules 缓存
docker-compose exec runner go mod download

# 3. 使用多核编译
docker run --rm \
  -e GOMAXPROCS=8 \
  rclone-ci:latest \
  bash -c "go build -p 8"
```

### 问题 4: FUSE 挂载失败

**症状**: `mount: permission denied` 或 `device not ready`

**解决**:

```bash
# 检查宿主机 FUSE 支持
cat /etc/fuse.conf  # 应包含 user_allow_other

# 加载 FUSE 模块
sudo modprobe fuse

# 重启 Docker
sudo systemctl restart docker
```

---

## 最佳实践

### 1. 镜像大小优化

当前 Dockerfile 可能产生 **~1GB** 的镜像，可以进一步优化：

```dockerfile
# 方案：多阶段构建（可选）
FROM rocky:9.4 AS base
# ... 安装基础依赖 ...

FROM base AS builder
# ... 安装开发工具 ...

FROM base
# ... 只复制必需的文件 ...
```

### 2. 缓存策略

**利用 Docker 层缓存加快构建**:

```dockerfile
# ✅ 好的做法：按频率变化排序图层
RUN dnf update -y  # 根包管理器
RUN dnf install -y gcc git  # 不常变化
COPY go.mod go.sum ./  # 频繁变化
RUN go mod download  # 频繁变化
COPY . .  # 每次变化
```

### 3. 安全性最佳实践

```bash
# ✅ 使用特定版本标签
docker run rclone-ci:v1.0.0  # ✅ 好

docker run rclone-ci:latest  # ⚠️  不推荐用于生产
```

### 4. 监控和日志

```bash
# 查看容器日志
docker logs github-actions-runner

# 实时监控
docker stats github-actions-runner

# 进入容器排查
docker exec -it github-actions-runner bash
```

### 5. 更新镜像

```bash
# 定期重建镜像（获取系统安全补丁）
docker build -f Dockerfile.ci --no-cache -t rclone-ci:latest .

# 推送到私有仓库（可选）
docker tag rclone-ci:latest your-registry/rclone-ci:latest
docker push your-registry/rclone-ci:latest
```

---

## 从裸机迁移到 Docker

### 迁移清单

- [ ] 构建 `Dockerfile.ci` 镜像
- [ ] 本地测试：`docker-compose up && verify-ci-env`
- [ ] 更新 GitHub Actions 工作流文件（添加 `container:` 配置）
- [ ] 删除旧的 apt-get wrapper 脚本（不再需要）
- [ ] 删除 JSON 配置文件（在 Dockerfile 中）
- [ ] 验证 CI 流程正常运行
- [ ] 监控日志，确保没有隐藏问题
- [ ] （可选）删除旧的 Runner 并重新注册为 Docker 版本

### 回滚计划

如果需要回滚到裸机方案：

```bash
# 保留旧的设置（以防需要）
git checkout HEAD -- .  # 恢复所有文件
```

---

## 相关资源

- [Docker Documentation](https://docs.docker.com/)
- [GitHub Actions - Running jobs in a container](https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container)
- [GitHub Actions - Using self-hosted runners](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners)
- [rclone Installation](https://rclone.org/install/)
- [Rocky Linux](https://rockylinux.org/)

---

## 支持反馈

如遇到问题，请：

1. 运行 `verify-ci-env` 检查环境
2. 查看 [故障排查](#故障排查) 部分
3. 检查工作流日志：GitHub → Actions → 点击 Job → 查看日志
4. 提交 Issue 时附带日志文件
