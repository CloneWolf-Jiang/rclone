# Docker CI/CD 方案 - 资源总览

**最后更新**: 2026-02-20 | **版本**: Docker 方案 v1.0

## 📌 快速导航

### 🚀 新手入门（Rocky 9.x 系统）
1. **首先：安装 Docker** → [Docker 安装](Docker方案部署指南.md#0️⃣-安装-docker-engine清华源)（使用清华源）
2. **然后：检测镜像源** → [镜像检测脚本](Docker方案部署指南.md#0️⃣-docker-镜像源检测与自动配置)（优化构建速度）
3. **快速开始** → [5 分钟教程](Docker快速参考.md#-快速开始)
4. **详细步骤** → [完整部署指南](Docker方案部署指南.md)

### 🔄 从旧方案迁移
- **从裸机到 Docker** → [迁移指南](迁移指南-从裸机到Docker.md)
- **分步骤迁移地图** → [迁移时间表](迁移指南-从裸机到Docker.md#迁移时间表)

### 🔧 命令和工具
- **常用 Docker 命令** → [docker-ci-commands.sh](../docker-ci-commands.sh)
- **命令速查** → [快速参考 - 命令章节](Docker快速参考.md#-常用命令速查)

### ❓ 遇到问题
- **故障排查** → [部署指南 - 故障排查](Docker方案部署指南.md#故障排查)
- **常见问题** → [迁移指南 - 常见问题](迁移指南-从裸机到Docker.md#常见问题)

---

## 📂 文件结构说明

```
rclone/
├── Dockerfile.ci                     # CI 专用 Dockerfile（Rocky 9.4）
├── docker-compose.yml                # 本地开发用 docker-compose 配置
├── docker-ci-commands.sh             # 常用命令脚本（便捷工具）
├── .github/workflows/
│   └── docker-build.yml              # GitHub Actions 工作流示例
└── 附录/
    ├── Docker方案部署指南.md         # 📖 完整部署文档（推荐阅读）
    ├── Docker快速参考.md             # ⚡ 速查表和常用命令
    ├── 迁移指南-从裸机到Docker.md    # 🔄 从旧方案迁移步骤
    └── Docker_CI资源总览.md          # 📌 本文件
```

---

## 🔑 核心文件说明

### Dockerfile.ci

**用途**: 定义 CI 编译环境

**特点**:
- 基于 Rocky Linux 9.4（生产级发行版）
- 包含 Go 编译环境、所有开发库、FUSE 支持
- 自动运行环境验证（`verify-ci-env`）
- 约 1.5 GB，等效于裸机方案占用的 2-3 GB

**构建**:
```bash
docker build -f Dockerfile.ci -t rclone-ci:latest .
```

### docker-compose.yml

**用途**: 本地开发和测试

**特点**:
- 一键启动完整开发环境
- 自动挂载代码卷、缓存卷、FUSE 设备
- 包含可选的测试 web 服务

**使用**:
```bash
docker-compose up -d
docker-compose exec runner bash
docker-compose down
```

### .github/workflows/docker-build.yml

**用途**: GitHub Actions 工作流配置

**特点**:
- 完整的构建、测试、上传工件流程
- 包含缓存策略（加快后续构建）
- 可选的 lint 和通知 jobs

**集成**:
1. 复制到 `.github/workflows/`
2. 或合并其内容到现有工作流
3. 推送并在 GitHub Actions 中观察运行

### docker-ci-commands.sh

**用途**: 快捷工具脚本

**特点**:
- 封装常用 Docker 命令
- 彩色输出和错误处理
- 包含性能测试、清理、预加载等高级用法

**使用**:
```bash
chmod +x docker-ci-commands.sh
./docker-ci-commands.sh help          # 查看所有命令
./docker-ci-commands.sh build         # 构建镜像
./docker-ci-commands.sh run-make      # 运行编译
./docker-ci-commands.sh compose-up    # 启动 compose
```

---

## 📊 对比：Docker vs 裸机方案

| 指标 | 裸机方案（v3.1） | Docker 方案 |
|------|------------------|-----------|
| **环境定义** | 5+ 个脚本 + JSON 配置 | 1 个 Dockerfile |
| **初次部署** | 30-40 分钟 | 5-10 分钟 |
| **构建耗时**（首次） | 10-15 分钟 | 5-10 分钟*（缓存后） |
| **磁盘占用** | 2-3 GB | 1.5 GB（镜像）+ 缓存 |
| **环境一致性** | ⚠️ 易漂移 | ✅ 完全隔离 |
| **可维护性** | ⚠️ 复杂 | ✅ 简洁 |
| **脚本依赖** | apt-get wrapper, jq | Docker Engine |
| **学习成本** | 高（自定义） | 低（标准方案） |
| **社区支持** | 少 | GitHub 官方支持 |

*首次构建需要下载依赖（Go modules），但缓存后的后续构建可达 2-3 分钟。

---

## 🎯 使用场景

### 场景 1：首次尝试（5 分钟）

```bash
# 1. 构建镜像
docker build -f Dockerfile.ci -t rclone-ci:latest .

# 2. 验证环境
docker run --rm rclone-ci:latest verify-ci-env

# 3. 运行编译
docker run --rm -v "$(pwd)":/workspace -w /workspace rclone-ci:latest make
```

### 场景 2：本地开发（持续工作）

```bash
# 启动环境
docker-compose up -d

# 进入容器
docker-compose exec runner bash

# 编码、构建、测试...

# 停止环境
docker-compose down
```

### 场景 3：GitHub Actions CI（自动运行）

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

### 场景 4：性能优化（预加载缓存）

```bash
# 预热 Go modules 缓存（加快后续构建）
./docker-ci-commands.sh preload-modules

# 查看磁盘使用
./docker-ci-commands.sh disk-usage

# 性能对比测试
./docker-ci-commands.sh benchmark
```

---

## 🛠️ 常见任务速查（Rocky 9.x）

### 系统初始化

```bash
# 1. 通过清华源安装 Docker（一次性）
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 2. 启动 Docker 服务
sudo systemctl start docker && sudo systemctl enable docker

# 3. 配置镜像源（可选但推荐）
# 参考Docker方案部署指南中的镜像检测脚本
```

### 构建和测试

```bash
# 一次性编译
docker run --rm -v "$(pwd)":/workspace -w /workspace rclone-ci:latest make

# 进入容器交互开发
docker run -it -v "$(pwd)":/workspace -w /workspace rclone-ci:latest bash

# 运行测试（在容器内）
go test -v -short ./...
```

### 镜像管理

```bash
# 查看镜像版本
docker images | grep rclone-ci

# 删除旧镜像
docker image rm rclone-ci:latest

# 查看镜像大小
docker image inspect --format='{{.Size}}' rclone-ci:latest | numfmt --to=iec-i --suffix=B

# 保存为文件（离线使用）
docker save rclone-ci:latest -o rclone-ci.tar
```

### 缓存管理

```bash
# 预热缓存（加快后续构建）
docker-compose up -d
docker-compose exec runner go mod download

# 查看缓存卷
docker volume ls | grep go-

# 清理缓存（需要重新下载依赖）
docker volume rm $(docker volume ls -q | grep go-)
```

### 环境验证

```bash
# 快速验证
docker run --rm rclone-ci:latest verify-ci-env

# 详细检查（进入容器）
docker run -it rclone-ci:latest bash
# 然后在容器内运行：
# go version
# gcc --version
# fuse3 -V
```

---

## 📈 迁移快速检查

### ✅ 迁移前（确认已完成）

- [ ] Docker 和 docker-compose 已安装
- [ ] `docker build -f Dockerfile.ci ...` 成功
- [ ] `docker run --rm rclone-ci:latest verify-ci-env` 通过
- [ ] 本地测试编译成功

### ✅ 迁移中（行动项）

- [ ] 创建功能分支测试（`test/docker-ci`）
- [ ] 更新 GitHub Actions 工作流（添加 `container:` 配置）
- [ ] 运行工作流验证（> 1 次）
- [ ] 备份旧配置

### ✅ 迁移后（清理）

- [ ] 削除旧的 apt-get wrapper 脚本
- [ ] 删除 JSON 配置文件
- [ ] 更新文档
- [ ] 监控 CI 日志（48 小时）

详见：[迁移指南](迁移指南-从裸机到Docker.md#验证检查清单)

---

## 🔗 相关资源

### 官方文档
- 🐳 [Docker 官方文档](https://docs.docker.com/)
- 🚀 [Docker Compose 文档](https://docs.docker.com/compose/)
- 🤖 [GitHub Actions 文档](https://docs.github.com/en/actions)
- 🛠️ [rclone 构建指南](https://github.com/rclone/rclone#building)
- 🐧 [Rocky Linux 文档](https://docs.rockylinux.org/)

### 快速链接
- Docker Hub: https://hub.docker.com/r/library/rocky
- GitHub Actions 容器: https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container
- Go 官方文档: https://golang.org/doc/

### 本地文档
- [完整部署指南](Docker方案部署指南.md) - 详细的安装、配置、故障排查
- [快速参考](Docker快速参考.md) - 命令速查和 snippets
- [迁移指南](迁移指南-从裸机到Docker.md) - 从旧方案迁移步骤

---

## 💡 最佳实践建议

### 1. 缓存策略

```bash
# ✅ 预加载缓存（前置工作）
docker-compose up -d
docker-compose exec runner go mod download
docker-compose down

# ✅ GitHub Actions 中使用缓存 Action（加快重复构建）
- uses: actions/cache@v4
  with:
    path: |
      /root/.cache/go-build
      /root/go/pkg/mod
    key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
```

### 2. 版本控制

```bash
# ✅ 使用特定版本标签
docker tag rclone-ci:latest rclone-ci:v1.0.0
docker tag rclone-ci:latest rclone-ci:2026-02-20

# ✅ 推送到私有仓库
docker tag rclone-ci:latest registry.example.com/rclone-ci:latest
docker push registry.example.com/rclone-ci:latest
```

### 3. 监控和日志

```bash
# ✅ 常规监控
docker stats <container>

# ✅ 深度诊断
docker inspect <container> | jq '.[] | {Pid, Id, State, Mounts}'

# ✅ GitHub Actions 中启用调试日志
env:
  RUNNER_DEBUG: true
  ACTIONS_STEP_DEBUG: true
```

### 4. 定期更新

```bash
# ✅ 月度安全更新
docker build -f Dockerfile.ci --no-cache -t rclone-ci:latest .

# ✅ 保存更新日志
git log --oneline -1 > docker-ci-version.txt
```

---

## ❓ 需要帮助？

### 1. 快速问题？
- 查看 [Docker快速参考.md](Docker快速参考.md)
- 使用 `./docker-ci-commands.sh help` 获取命令列表

### 2. 故障排查？
- 参考 [Docker方案部署指南.md#故障排查](Docker方案部署指南.md#故障排查)
- 查看 [迁移指南.md#常见问题](迁移指南-从裸机到Docker.md#常见问题)

### 3. 需要详细步骤？
- 阅读 [Docker方案部署指南.md](Docker方案部署指南.md)（完整覆盖）
- 参考 [迁移指南.md#分步迁移指南](迁移指南-从裸机到Docker.md#分步迁移指南)

### 4. 性能优化？
- 使用 `./docker-ci-commands.sh benchmark` 性能测试
- 参考 [快速参考.md#进阶技巧](Docker快速参考.md#-进阶技巧)

---

## 🎓 学习资源

### 新手路线图

```
Day 1: 基础概念
  ├─ 什么是 Docker？ → Docker 官方文档
  ├─ Dockerfile 基础 → docker build 用法
  └─ 本快速参考

Day 2: 实践应用
  ├─ 构建镜像 → docker-ci-commands.sh build
  ├─ 本地测试 → docker-compose up
  └─ 环境验证 → docker-ci-commands.sh verify

Day 3: CI/CD 集成
  ├─ GitHub Actions 工作流 → .github/workflows/docker-build.yml
  ├─ 缓存策略 → actions/cache
  └─ 构建物上传 → actions/upload-artifact

Day 4: 优化和维护
  ├─ 性能优化 → docker-ci-commands.sh benchmark
  ├─ 镜像管理  → docker image prune, docker save
  └─ 故障排查 → 部署指南故障排查章节
```

---

## 📝 文档维护

| 文档 | 最后更新 | 覆盖内容 |
|------|--------|--------|
| Docker方案部署指南.md | 2026-02-20 | 详细部署、故障排查、最佳实践 |
| Docker快速参考.md | 2026-02-20 | 命令速查、snippets、进阶技巧 |
| 迁移指南-从裸机到Docker.md | 2026-02-20 | 迁移策略、分步指南、检查清单 |
| Docker_CI资源总览.md | 2026-02-20 | 本文件，整体导航 |

---

**版本**: Docker 方案 v1.0 | **更新于**: 2026-02-20 | **状态**: ✅ 正式版本
