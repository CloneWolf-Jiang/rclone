# Docker CI 方案 - 快速参考指南

**系统要求**: Rocky Linux 9.4 - 9.7 | **Docker**: >= 20.10 | **构建时间**: ~5-10 分钟  
**快速链接**: [完整指南](./Docker方案部署指南.md) | [官方 Docker 文档](https://docs.docker.com) | [GitHub Actions 容器文档](https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container)

---

## 🚀 快速开始（4 步 - Rocky 9.x）

```bash
# 0. 确保系统已安装 Docker（清华源）
# 参考「Docker 方案部署指南」中的「安装 Docker Engine」部分

# 1. 构建镜像（首次 5 分钟）
docker build -f Dockerfile.ci -t rclone-ci:latest .

# 2. 验证环境（检查所有依赖）
docker run --rm rclone-ci:latest verify-ci-env

# 3. 运行构建
docker run --rm -v "$(pwd)":/workspace -w /workspace rclone-ci:latest make

# 4. 可选：配置镜像源加速（仅首次需要）
# 参考「Docker 方案部署指南」中的「镜像检测与配置」部分
```

---

## 📦 常用命令速查

### Docker 镜像操作

| 命令 | 说明 |
|------|------|
| `docker build -f Dockerfile.ci -t rclone-ci:latest .` | 构建镜像 |
| `docker images \| grep rclone-ci` | 查看镜像 |
| `docker image rm rclone-ci:latest` | 删除镜像 |
| `docker image inspect rclone-ci:latest` | 查看镜像详情 |
| `docker history rclone-ci:latest` | 查看构建层 |

### Docker 容器操作

| 命令 | 说明 |
|------|------|
| `docker run -it rclone-ci:latest bash` | 交互式运行 |
| `docker run --rm -v "$(pwd)":/workspace rclone-ci:latest make` | 一次性执行 |
| `docker ps -a` | 查看容器列表 |
| `docker logs <container-id>` | 查看日志 |
| `docker exec -it <container-id> bash` | 进入运行中的容器 |

### Docker Compose 操作

| 命令 | 说明 |
|------|------|
| `docker-compose up -d` | 启动环境 |
| `docker-compose exec runner bash` | 进入容器 |
| `docker-compose exec runner verify-ci-env` | 验证环境 |
| `docker-compose logs -f runner` | 查看日志 |
| `docker-compose down` | 停止并移除容器 |
| `docker-compose down -v` | 停止并删除卷 |

---

## 🔧 环境变量配置

### Go 相关

```bash
# 启用 CGO（用于编译 C 库）
export CGO_ENABLED=1

# 设置 Go modules（必需）
export GO111MODULE=on

# 加快编译（详细日志）
export GOFLAGS="-v"

# 高效缓存
export GOCACHE=/root/.cache/go-build
export GOMODCACHE=/root/go/pkg/mod
```

### Rclone 相关

```bash
# 配置文件位置
export RCLONE_CONFIG_DIR=/home/runner/.config/rclone

# 日志级别
export RCLONE_LOG_LEVEL=debug  # 或 info, warn, error
```

### GitHub Actions

```bash
# workspace 路径
export GITHUB_WORKSPACE=/workspace

# 自动设置
${{ github.workspace }}
${{ runner.workspace }}
```

---

## 🐛 快速故障排查

### 镜像构建失败

```bash
# 清空缓存重试
docker builder prune -a
docker build -f Dockerfile.ci --progress=plain -t rclone-ci:latest .

# 检查网络
docker run --rm alpine ping -c 1 8.8.8.8

# 检查 DNSdocker run --rm alpine nslookup github.com
```

### 权限问题

```bash
# 检查用户
docker exec <container-id> whoami  # 应为 runner

# 启用 FUSE 和 sudo
docker run --cap-add SYS_ADMIN --security-opt apparmor:unconfined rclone-ci:latest verify-ci-env
```

### 编译缓存

```bash
# 使用卷缓存（docker-compose 中已配置）
go mod download  # 预热依赖缓存

# 清空缓存
docker volume rm $(docker volume ls -q | grep go-)
```

### FUSE 挂载失败

```bash
# 检查宿主机支持
cat /etc/fuse.conf | grep user_allow_other

# 中载 FUSE 模块
sudo modprobe fuse

# Docker 重启
sudo systemctl restart docker
```

---

## 📝 工作流配置 Snippets

### 最小配置

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, docker]
    container:
      image: rclone-ci:latest
    steps:
      - uses: actions/checkout@v4
      - run: make
```

### 完整配置（标准）

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, docker]
    container:
      image: rclone-ci:latest
      options: |
        --cpus 4
        --memory 8g
        -v /dev/fuse:/dev/fuse
        --cap-add SYS_ADMIN
      env:
        CGO_ENABLED: "1"
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - run: verify-ci-env
      - run: go mod download
      - run: make
      - uses: actions/upload-artifact@v4
        if: success()
        with:
          name: rclone-binary
          path: rclone
```

### 缓存优化

```yaml
- uses: actions/cache@v4
  with:
    path: |
      /root/.cache/go-build
      /root/go/pkg/mod
    key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
```

---

## 🎯 对比速览

### 构建时间

```ini
裸机方案：~40-50 分钟
  - 环境初始化: ~30 min
  - 缓存加热: ~15 min
  - 实际编译: ~5 min

Docker 方案：~10-15 分钟
  - 容器启动: ~1 sec （如果镜像已缓存）
  - 实际编译: ~5 min
  - 缓存复用: 之前构建的缓存可立即使用
```

### 磁盘占用

```ini
裸机方案：~2-3 GB
  - 系统库: ~1 GB
  - Go modules: ~500 MB
  - 其他依赖: ~500 MB

Docker 镜像：~1.5 GB
  - Rocky 基础: ~0.8 GB
  - Go + 依赖: ~0.5 GB
  - 开发工具: ~0.2 GB
```

---

## 📚 进阶技巧

### 多阶段构建

```dockerfile
FROM rocky:9.4 AS builder
# ... 构建环境 ...

FROM rocky:9.4 AS runtime
COPY --from=builder /usr/local/bin/rclone /usr/local/bin/
# ... 运行环境 ...
```

### 私有 Docker 仓库

```bash
# 构建标签
docker tag rclone-ci:latest your-registry/rclone-ci:latest

# 推送
docker login your-registry
docker push your-registry/rclone-ci:latest

# 使用
container:
  image: your-registry/rclone-ci:latest
```

### 本地镜像缓存

```bash
# 保存镜像
docker save rclone-ci:latest -o rclone-ci.tar

# 加载镜像
docker load -i rclone-ci.tar
```

### 跨平台构建（如需支持 ARM）

```bash
# 安装 buildx（Docker 19.03+）
docker buildx create --use

# 构建多平台镜像
docker buildx build \
  -f Dockerfile.ci \
  -t rclone-ci:latest \
  --platform linux/amd64,linux/arm64 \
  --push \
  .
```

---

## ⚙️ GitHub Actions Runner 部署

### 方案 A：Runner 在宿主机，Job 在容器中（✅ 推荐）

```bash
# 1. 注册 runner（按 GitHub 指引）
./config.sh --url https://github.com/{owner}/{repo} --token {TOKEN}

# 2. 启动 runner
./run.sh
```

然后工作流中：
```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, docker]
    container:
      image: rclone-ci:latest
```

### 方案 B：Runner 和 Job 都在容器中

```yaml
# docker-compose.yml
services:
  runner:
    image: rclone-ci:latest
    volumes:
      - /opt/github-actions-runner:/home/runner/actions-runner
      - /var/run/docker.sock:/var/run/docker.sock
    entrypoint: /home/runner/actions-runner/run.sh
```

---

## 🔐 安全最佳实践

### 仓库 Secrets 使用

```yaml
# 工作流中安全地使用 Secrets
env:
  DOCKER_REGISTRY_PASSWORD: ${{ secrets.DOCKER_REGISTRY_PASSWORD }}

steps:
  - run: echo "$DOCKER_REGISTRY_PASSWORD" | docker login -u myuser --password-stdin
```

### 镜像扫描（可选）

```bash
# 使用 Trivy 扫描镜像漏洞
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image rclone-ci:latest
```

---

## 📞 需要帮助？

1. **查看完整文档**: [Docker方案部署指南.md](./Docker方案部署指南.md)
2. **检查环境**: `docker run rclone-ci:latest verify-ci-env`
3. **查看日志**: `docker logs <container-id>` 或工作流日志
4. **官方文档**:
   - [Docker Documentation](https://docs.docker.com/)
   - [GitHub Actions Containers](https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container)
   - [rclone Build Guide](https://github.com/rclone/rclone#building)

---

**最后更新**: 2026-02-20 | **版本**: 1.0 Docker 方案
