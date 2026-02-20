# 从裸机方案迁移到 Docker 方案

**日期**: 2026-02-20 | **针对版本**: v3.1 → Docker 方案

## 📋 目录

1. [概述](#概述)
2. [迁移时间表](#迁移时间表)
3. [分步迁移指南](#分步迁移指南)
4. [验证检查清单](#验证检查清单)
5. [回滚计划](#回滚计划)

---

## 概述

### 为什么要迁移？

**裸机方案的问题** (v3.1):

| 问题 | 影响 |
|------|------|
| **多脚本依赖** | apt-get wrapper + JSON 配置 + jq + verify-env + fix-env = 5+ 个脚本 |
| **环境漂移** | 系统更新导致环境变化 |
| **维护复杂** | 修改一个包需要更新 JSON + 可能重建系统 |
| **调试困难** | 难以在本地复现问题 |
| **版本不一致** | 不同时间部署的环境可能不同 |
| **初始化耗时** | 首次部署需要 30+ 分钟 |

**Docker 方案的优势**:

- ✅ **一个 Dockerfile** 定义整个环境
- ✅ **完全隔离** 避免系统环境影响
- ✅ **快速部署** 5 分钟完成镜像构建
- ✅ **容易维护** 修改只需调整 Dockerfile
- ✅ **本地复现** 同样的镜像在任何机器上运行相同
- ✅ **标准化** 由 GitHub 官方推荐的方案

---

## 迁移时间表

```
Phase 1: 准备（1-2 天）
  ├─ 创建 Dockerfile.ci ✓
  ├─ 创建 docker-compose.yml ✓
  ├─ 验证本地构建 ← 你在这里
  └─ 准备工作流文件

Phase 2: 测试（2-3 天）
  ├─ 创建功能分支测试
  ├─ 运行示例工作流
  ├─ 验证构建物
  └─ 对比性能（时间、磁盘）

Phase 3: 上线（1 天）
  ├─ 更新主工作流
  ├─ 监控 CI 日志
  ├─ 验证构建稳定性
  └─ 监理移除必要的裸机脚本

Phase 4: 清理（1 天）
  ├─ 删除旧的 apt-get wrapper
  ├─ 删除 JSON 配置文件
  ├─ 更新文档
  └─ 归档旧的 runner 配置
```

---

## 分步迁移指南

### 阶段 1：准备和本地测试

### Step 1: 验证 Rocky 系统和 Docker 环境

```bash
# 检查操作系统
cat /etc/os-release | grep -E "NAME|VERSION_ID"
# 应显示 Rocky Linux 9.x

# 检查 Docker 是否已安装
docker --version  # 应为 >= 20.10
docker-compose --version  # 应为 >= 2.0

# 如未安装，请参考 Docker 方案部署指南中的「安装 Docker Engine」章节
# 使用清华源进行快速安装

# 检查磁盘空间
df -h | grep -E "/$|/home"  # 至少 10GB 可用

# 测试 Docker 权限
docker run --rm alpine echo "Docker works!"
```

#### Step 1.2: 本地构建镜像

```bash
cd /path/to/rclone

# 构建镜像（首次约 5 分钟）
docker build -f Dockerfile.ci -t rclone-ci:latest .

# 预期输出
# ...
# Step 50/50 : HEALTHCHECK ...
# Successfully built xxxxx
# Successfully tagged rclone-ci:latest
```

#### Step 1.3: 验证镜像

```bash
# 验证环境
docker run --rm rclone-ci:latest verify-ci-env

# 预期输出（✅ 全部成功）
# === CI Environment Verification ===
# ✅ gcc: ...
# ✅ g++: ...
# ...
# ✅ CI ENVIRONMENT VERIFICATION PASSED
```

#### Step 1.4: 本地编译测试

```bash
# 方式 A: 使用 docker-compose（推荐）
docker-compose up -d
docker-compose exec runner bash -c "cd /workspace && make"
docker-compose down

# 方式 B: 直接运行 Docker 容器
docker run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  rclone-ci:latest \
  bash -c "go mod download && make"
```

预期输出应该看到：
```
go build ...
```

#### Step 1.5: 对比编译性能

```bash
# 记录编译时间
time docker run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  rclone-ci:latest \
  make

# 预期时间：5-15 分钟（首次，取决于 Go modules 缓存）
```

### 阶段 2：工作流测试

#### Step 2.1: 创建测试分支

```bash
git checkout -b test/docker-ci
git push origin test/docker-ci
```

#### Step 2.2: 更新工作流文件

**选项 A**：复制提供的示例工作流

```bash
cp .github/workflows/docker-build.yml .github/workflows/build-docker.yml
```

**选项 B**：在现有工作流中添加容器配置

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, docker]
    
    # 添加此部分
    container:
      image: rclone-ci:latest
      options: |
        --cpus 4
        --memory 8g
        -v /dev/fuse:/dev/fuse
        --cap-add SYS_ADMIN
        --security-opt apparmor:unconfined
      env:
        CGO_ENABLED: "1"
    
    # 其余步骤保持不变
```

#### Step 2.3: 验证工作流语法

```bash
# 使用 GitHub CLI 验证（如已安装）
gh workflow list
gh workflow view docker-build.yml

# 或手动检查 YAML 语法
docker run --rm -v "$(pwd):/workspace" mikefarah/yq eval '.jobs' .github/workflows/docker-build.yml
```

#### Step 2.4: 触发工作流测试

```bash
# 提交并推送测试分支
git add .github/workflows/
git commit -m "test: add Docker-based workflow"
git push origin test/docker-ci

# 在 GitHub 网页中查看 Actions 标签页
# 等待工作流完成（约 15-30 分钟）
```

#### Step 2.5: 检查工作流输出

```bash
# 使用 GitHub CLI
gh run list --branch test/docker-ci

# 或在网页中：
# GitHub → Actions → 点击最新的 Run → 查看日志
```

**检查点**：

- [ ] ✅ Step "Verify CI environment" 应全部通过
- [ ] ✅ Step "Build rclone" 应успeful
- [ ] ✅ Artifacts （rclone 二进制）应已上传
- [ ] ✅ 总耗时应 < 30 分钟

### 阶段 3：开始使用（上线）

#### Step 3.1: 备份现有配置

```bash
# 备份旧的脚本和配置（以防需要回滚）
mkdir -p backups
cp /opt/actions-runner/compat-scripts backups/compat-scripts-backup
cp .github/workflows/build.yml backups/build.yml.backup
git tag -a before-docker-migration -m "Backup before Docker migration"
```

#### Step 3.2: 删除裸机脚本（可选但推荐）

```bash
# 只有在确认 Docker 工作流正常后才删除

# 删除 apt-get wrapper
rm -f /usr/bin/apt-get
rm -f /usr/local/bin/apt-get
rm -rf /opt/actions-runner/compat-scripts

# 重启 Runner（使其无法使用旧的脚本）
sudo systemctl restart actions-runner

# Git 中删除相关文件（如有提交）
git rm -r 附录/setup-rocky-9.4-ci-env-*.sh
git commit -m "Remove: obsolete setup scripts (Docker migration)"
```

#### Step 3.3: 更新主工作流

**合并测试分支的更改到 main**：

```bash
# 合并测试分支
git checkout main
git merge test/docker-ci

# 删除测试分支
git branch -d test/docker-ci
git push origin --delete test/docker-ci
```

或直接修改 `.github/workflows/build.yml`：

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
        --security-opt apparmor:unconfined
      env:
        CGO_ENABLED: "1"
    
    steps:
      - uses: actions/checkout@v4
      - run: verify-ci-env
      - run: go mod download
      - run: make
      # ... 其他步骤 ...
```

#### Step 3.4: 监控 CI 日志（48 小时）

```bash
# 使用 GitHub CLI 监控
gh run list --limit 10

# 或在网页中实时查看：
# GitHub → Actions → 查看每次 Run 的日志
```

**关键指标**：

- 编译时间稳定性（应 5-15 分钟）
- 缓存命中率（应 > 90%）
- 失败率（应 < 1%）

### 阶段 4：清理并优化

#### Step 4.1: 更新文档

```bash
# 将新的 Docker 方案设为主要文档
git mv 附录/Docker方案部署指南.md docs/DOCKER_GUIDE.md

# 在 README 中添加 Docker 说明
# 编辑 README.md，添加章节 "Docker CI/CD"
```

#### Step 4.2: 归档旧的文档

```bash
# 归档旧的 setup 脚本文档
mkdir -p docs/archive
mv 附录/*setup*v3*.md docs/archive/
mv 附录/*v3*.md docs/archive/（除非仍有用）
```

#### Step 4.3: 验证清理完成

```bash
# 确保没有遗留的旧脚本
ls -la /opt/actions-runner/compat-scripts 2>/dev/null && echo "⚠️ 旧脚本仍存在" || echo "✅ 旧脚本已清理"

ls -la /usr/bin/apt-get 2>/dev/null && echo "⚠️ apt-get wrapper 仍存在" || echo "✅ apt-get wrapper 已移除"

# 检查 Git 历史（确保提交记录清晰）
git log --oneline -5
```

---

## 验证检查清单

### 本地验证

- [ ] Docker 和 docker-compose 已安装
- [ ] `docker build -f Dockerfile.ci -t rclone-ci:latest .` 成功
- [ ] `docker run --rm rclone-ci:latest verify-ci-env` 全部通过
- [ ] `docker-compose up && docker-compose exec runner make` 成功编译
- [ ] 编译输出的 `rclone` 可执行文件正常运行

### 工作流验证

- [ ] GitHub Actions 工作流已更新（container 配置）
- [ ] 测试分支的工作流成功运行（> 1 次）
- [ ] 编译时间稳定（5-15 分钟）
- [ ] Artifacts 正确上传
- [ ] 测试用例全部通过（如有）

### Runner 验证

- [ ] Runner 标签包含 `docker` （`runs-on: [self-hosted, linux, docker]`）
- [ ] Runner 可成功启动容器
- [ ] 容器内 Go 版本正确（`go version`）
- [ ] 容器有网络访问（能下载 modules）

### 清理验证

- [ ] 旧的 apt-get wrapper 已删除
- [ ] JSON 配置文件已删除（不再需要）
- [ ] 旧的 setup 脚本已备份或删除
- [ ] 文档已更新
- [ ] Git 提交记录清晰

---

## 回滚计划

如果需要回到裸机方案，按以下步骤：

### 快速回滚（< 1 小时）

```bash
# 1. 注释掉 container 配置，恢复旧工作流
git checkout before-docker-migration -- .github/workflows/

# 2. 恢复旧的脚本
cp -r backups/compat-scripts-backup /opt/actions-runner/compat-scripts
chmod +x /opt/actions-runner/compat-scripts/*
ln -sf /opt/actions-runner/compat-scripts/apt-get /usr/bin/apt-get

# 3. 重启 Runner
sudo systemctl restart actions-runner

# 4. 提交更改
git add -A
git commit -m "Revert: back to bare-metal setup"
git push origin main
```

### 完全回滚（30 分钟）

如果旧的环境已被破坏，需要重新部署：

```bash
# 按照原来的 setup-rocky-9.4-ci-env-v3.1.sh 重新执行
sudo bash backups/setup-rocky-9.4-ci-env-v3.1.sh
```

---

## 常见问题

### Q: 迁移后，本地开发是否受影响？

**A**: 不受影响。Docker 方案只影响 CI/CD 流程。本地开发环境（如你的 macOS/Windows）可继续使用现有设置。

### Q: Docker 镜像需要多久更新一次？

**A**: 
- **安全补丁**: 建议每月更新一次（`dnf update -y`）
- **工具版本**: 根据需要（如需更高版本的 Go，修改 Dockerfile）
- **正常使用**: 镜像稳定后无需频繁更新

### Q: 能否在局域网内部署（离线环境）？

**A**: 可以。需要：
1. 在有网络的机器构建镜像
2. 保存镜像：`docker save rclone-ci:latest -o rclone-ci.tar`
3. 在目标机器加载：`docker load -i rclone-ci.tar`

### Q: Docker 镜像占用多少空间？

**A**: 
- **镜像**：~1.5 GB（Rocky 9.4 + Go + 工具）
- **可选缓存**：~2 GB（Go modules + 编译缓存）
- **总计**：~3.5 GB（首次）

### Q: 支持哪些架构（x86_64, ARM64, ...）？

**A**: 当前 Dockerfile 针对 **x86_64（AMD64）**。如需支持其他架构：

```bash
# 使用 docker buildx 支持多平台
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f Dockerfile.ci \
  -t rclone-ci:latest \
  .
```

---

## 延伸阅读

- 📖 [完整部署指南](./Docker方案部署指南.md)
- ⚡ [快速参考](./Docker快速参考.md)
- 🔗 [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- 🐳 [Docker 官方文档](https://docs.docker.com/)
- 🔨 [rclone 构建指南](https://github.com/rclone/rclone#building)

---

**有问题？** 查看 [Docker方案部署指南.md](./Docker方案部署指南.md#故障排查) 中的故障排查部分。

最后更新：2026-02-20
