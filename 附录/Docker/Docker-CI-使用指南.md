# Docker CI 构建工作流使用指南

## 概述

新创建的 `build-docker-ci.yml` 工作流可以在self-hosted Docker runner上构建rclone项目。

## 触发方式

### 方式1：推送到main分支（自动触发）

```bash
git push origin main
```

工作流将**自动触发**，开始构建三个平台的版本。

### 方式2：手动触发（推荐用于测试）

在GitHub网页上：
1. 打开 Actions 标签
2. 找到 "Build rclone with Docker CI" 工作流
3. 点击 "Run workflow" 按钮
4. 选择分支：`main`
5. 选择构建类型：
   - `quick` - 快速构建（跳过tests）
   - `full` - 完整构建（运行tests）
   - `debug` - 调试构建（详细输出）
6. 点击 "Run workflow"

### 方式3：定时构建（每天10:00 UTC）

工作流已配置每天10:00 UTC自动执行一次全量构建。

## 工作流步骤

```
┌─────────────────────────┐
│ verify-runner           │  验证self-hosted runner环境
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ build-docker (matrix)   │  
├─────────────────────────┤
│ - linux-amd64 (并行)    │
│ - linux-arm64 (并行)    │  编译三个平台版本
│ - linux-386   (并行)    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ build-summary           │  显示构建总结
└─────────────────────────┘
```

## 每个Job的动作

### 1️⃣ verify-runner - 验证runner环境

```bash
✓ 系统信息
✓ Docker版本和状态
✓ 可用资源（CPU、内存、磁盘）
```

**失败原因：**
- Docker group权限不足 → 需要执行：`sudo usermod -aG docker runner`
- Docker服务未启动 → 需要执行：`sudo systemctl start docker`
- 磁盘空间不足 → 需要清理磁盘

### 2️⃣ build-docker - 构建rclone

对每个平台目标（linux-amd64, linux-arm64, linux-386）执行：

```bash
1. 检查Docker镜像（build-artifacts）
2. 编译rclone（Build Compile）
3. 运行测试（Run Tests）
4. 创建artifacts（Create Build Artifact）
5. 上传构建成果（Upload Artifacts）
6. 清理缓存（Clean Up）
```

### 3️⃣ build-summary - 构建总结

显示整体构建状态和如何下载构建成果。

## 查看构建结果

### 在GitHub网页上

1. 打开 Actions 标签
2. 点击最新的 "Build rclone with Docker CI" 运行
3. 查看各个job的执行情况
4. 点击 "Artifacts" 下载编译成果

### 构建成果包含

```
build-artifacts/
├── rclone-linux-amd64          # 64位Linux可执行文件
├── rclone-linux-arm64          # ARM64可执行文件
├── rclone-linux-386            # 32位Linux可执行文件
└── BUILD_INFO.txt              # 构建信息
```

## Docker Runner工作流

```
┌─ GitHub Actions Trigger ───────────────────────┐
│                                                 │
│  workflow: build-docker-ci.yml                  │
│  runs-on: [self-hosted, docker]                 │
│                                                 │
└──────────────────┬────────────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │ Rocky 9.4 Self-Hosted Runner     │
    ├──────────────────────────────────┤
    │ Runner User: runner              │
    │ Docker Installed: YES            │
    │ Docker Group: runner user added  │
    └──────────────────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────┐
    │ Docker Engine                    │
    ├──────────────────────────────────┤
    │ runs-on: [self-hosted, docker]   │
    │ executes in container            │
    │ all build tools available        │
    └──────────────────────────────────┘
```

## 预期行为

### 首次运行

⏱️ 时间：约 60-90 分钟

```
1. 验证runner环境        ✓ ~2分钟
2. 构建Docker镜像        ✓ ~10分钟
3. 编译rclone (3个平台)   ✓ ~40-60分钟 (并行)
4. 运行测试              ✓ ~10-20分钟
5. 上传artifacts         ✓ ~5分钟
6. 总结                  ✓ ~1分钟
```

### 后续运行

⏱️ 时间：约 30-45 分钟（使用Docker缓存）

```
1. Docker镜像命中缓存    ✓ ~1分钟
2. 编译rclone           ✓ ~20-30分钟 (并行)
3. 运行测试            ✓ ~5-10分钟
4. 上传artifacts       ✓ ~5分钟
5. 总结                ✓ ~1分钟
```

## 常见问题和解决方案

### 问题1：权限拒绝错误

```
Error response from daemon: Got permission denied while trying to connect to Docker daemon
```

**解决方案：**

在Rocky 9.4上执行（一次性）：

```bash
sudo usermod -aG docker runner
su - runner
docker ps  # 验证权限
```

### 问题2：Docker镜像构建失败

```
ERROR: failed to build rclone-ci image
```

**解决方案：**

1. 手动构建并检查错误：
   ```bash
   cd /path/to/rclone
   ./附录/Docker/docker-ci-commands.sh build
   ```

2. 检查Dockerfile.ci是否存在
3. 检查磁盘空间是否足够（至少30GB）

### 问题3：编译超时

```
Error: Job timed out
```

**解决方案：**

1. 增加timeout（在yml中修改 `timeout-minutes: 120`）
2. 检查Rocky 9.4机器性能
3. 减少并行job数量

### 问题4：缓存命中率低

**症状：** 每次构建都很慢

**解决方案：**

1. 检查缓存是否正确配置
2. 运行：`./附录/Docker/docker-ci-commands.sh cache-usage`
3. 清理旧缓存：`./附录/Docker/docker-ci-commands.sh cache-clean`

## 性能优化建议

### 1. 启用Docker BuildKit

```bash
# 在Rocky 9.4上执行
export DOCKER_BUILDKIT=1

# 或永久配置
echo '{"features": {"buildkit": true}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

### 2. 预加载Go modules

```bash
cd /path/to/rclone
./附录/Docker/docker-ci-commands.sh preload-modules
```

### 3. 监控资源使用

运行时查看：

```bash
./附录/Docker/docker-ci-commands.sh stats
```

## 维护self-hosted runner

### 定期检查

```bash
# 查看runner状态
ps aux | grep runsvc

# 查看runner日志
tail -f /opt/actions-runner/_diag/Runner_*.log

# 检查磁盘空间
df -h
```

### 清理Docker资源

```bash
cd /path/to/rclone

# 清理未使用的镜像和卷
./附录/Docker/docker-ci-commands.sh cleanup

# 查看磁盘使用
./附录/Docker/docker-ci-commands.sh disk-usage

# 清理构建缓存
./附录/Docker/docker-ci-commands.sh cache-clean
```

### 定期更新

```bash
# 更新Docker Engine
sudo dnf update docker-ce docker-ce-cli

# 重启runner
systemctl restart actions-runner  # 作为service运行时
# 或手动停止/启动
```

## 下一步

### 1. 确保前置条件

✅ Rocky 9.4已安装Docker
✅ Docker group权限已配置
✅ runner用户可以运行docker命令
✅ 磁盘空间≥50GB

### 2. 首次运行

在GitHub网页上手动触发workflow：

Actions → Build rclone with Docker CI → Run workflow

### 3. 验证构建成果

1. 等待workflow完成
2. 下载artifacts
3. 验证可执行文件：
   ```bash
   chmod +x rclone-linux-amd64
   ./rclone-linux-amd64 version
   ```

### 4. 后续维护

- ✅ 定期检查runner日志
- ✅ 监控磁盘空间
- ✅ 更新Docker镜像
- ✅ 清理旧artifacts

## 支持的平台

| 平台 | 目标 | 状态 |
|------|------|------|
| Linux 64-bit | linux-amd64 | ✅ 支持 |
| Linux ARM64 | linux-arm64 | ✅ 支持 |
| Linux 32-bit | linux-386 | ✅ 支持 |
| macOS | 需要separate workflow | ⏳ 计划中 |
| Windows | 需要separate workflow | ⏳ 计划中 |

## 反馈和改进

如果workflow出现问题，请检查：

1. 日志中的详细错误信息
2. runner的系统资源
3. Docker daemon状态
4. 网络连接（拉取镜像依赖网络）

---

**最后更新：** 2026-02-21
**工作流文件：** `.github/workflows/build-docker-ci.yml`
**Docker脚本：** `附录/Docker/docker-ci-commands.sh`
