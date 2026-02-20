# Docker Self-Hosted Runner 部署验证指南

> 基于 GitHub 官方标准的 Self-Hosted Runner 验证方案  
> 来源：GitHub Actions Runner 官方文档  
> 更新：2026-02-20

---

## 概述

本指南提供三种方式来验证本地 Docker Self-Hosted Runner 部署是否成功：

1. **本地脚本验证** - 在 Rocky 9.x host 上快速检查（推荐首先使用）
2. **CLI 集成验证** - 通过 docker-ci-commands.sh 脚本进行自动化验证
3. **GitHub Actions 工作流验证** - 在实际 GitHub Actions 环境中验证

---

## 方法 1：本地脚本验证（推荐）

### 快速启动

```bash
cd /path/to/rclone
bash ./附录/verify-docker-runner.sh
```

### 检查项详解

此脚本自动验证以下内容：

#### 第 1 部分：系统环境
- ✓ Rocky Linux 版本检测
- ✓ 内核版本确认
- ✓ sudo 权限检查
- ✓ 主机名和用户信息

#### 第 2 部分：Docker 安装
- ✓ Docker 版本检查
- ✓ Docker 服务状态（systemctl）
- ✓ Docker 守护进程连接性
- ✓ Docker 配置信息

#### 第 3 部分：Docker 功能
- ✓ 容器执行测试（Alpine Linux）
- ✓ 镜像拉取测试（Ubuntu 22.04）
- ✓ 数据卷挂载测试
- ✓ 容器网络连接测试

#### 第 4 部分：编译环境
- ✓ rclone-ci 镜像检查
- ✓ GCC 编译器验证
- ✓ G++ 编译器验证
- ✓ Make 工具验证
- ✓ Go 编译环境验证

#### 第 5 部分：GitHub Actions Runner
- ✓ Runner 目录检测
- ✓ Runner 进程状态
- ✓ Runner 配置文件检查

#### 第 6 部分：GitHub 连接
- ✓ api.github.com 连接测试
- ✓ github.com 连接测试
- ✓ uploads.github.com 连接测试
- ✓ codeload.github.com 连接测试
- ✓ DNS 解析测试

#### 第 7 部分：系统资源
- ✓ CPU 核心数
- ✓ 内存容量和可用空间
- ✓ 磁盘使用率（告警：>90% 失败，>80% 警告）

### 示例输出

```
╔════════════════════════════════════════════════════════════════╗
║   Docker Self-Hosted Runner 本地部署验证                      ║
╚════════════════════════════════════════════════════════════════╝

  第 1 部分：系统环境检查
✓ Rocky Linux 版本 9.4
ℹ 内核版本: 5.14.0-284.18.1.el9_2.x86_64
✓ 主机名: rclone-ci-runner
✓ 当前用户: runner
✓ 具有 sudo 权限 (无密码)

  第 2 部分：Docker 安装和配置
✓ Docker version 29.0.0, build deadbeef
✓ Docker 服务正在运行
✓ Docker 守护进程可访问
ℹ Docker 配置信息:
  Server Version: 29.0.0
  OS: linux
  ...

[... 更多输出 ...]

╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   ✓ Docker Self-Hosted Runner 部署验证成功!                   ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

---

## 方法 2：CLI 集成验证

### 构建和验证 rclone-ci 镜像

```bash
cd /path/to/rclone/附录/Docker
./docker-ci-commands.sh build
```

此命令会：
1. 构建 rclone-ci Docker 镜像
2. 验证镜像中的关键工具（gcc、go）
3. 显示镜像信息和后续步骤

### 快速验证命令

```bash
# 仓库验证
./docker-ci-commands.sh verify

# 运行编译测试
./docker-ci-commands.sh run-make

# 进入交互式容器
./docker-ci-commands.sh run
```

---

## 方法 3：GitHub Actions 工作流验证

### 工作流文件位置

```
.github/workflows/docker-runner-verify.yml
```

### 通过 GitHub Web UI 运行

1. 进入 GitHub 仓库的 **Actions** 标签
2. 选择左侧 **"Docker Runner Deployment Verification"** 工作流
3. 点击 **"Run workflow"**
4. 选择分支并点击 **"Run workflow"**

### 通过命令行触发 (需要 gh CLI)

```bash
gh workflow run docker-runner-verify.yml --ref main
```

### 工作流检查项

#### 基础验证
- 系统信息（OS、内核、主机名、用户）
- Docker 版本和状态
- Docker 运行时功能

#### Docker 功能测试
- 容器执行
- 卷挂载
- 网络连接

#### rclone CI 验证
- 镜像存在性检查
- 编译工具（gcc、g++）检查
- Go 环境检查

#### GitHub Actions 环境
- Runner 环境变量
- GitHub API 连接性

#### 资源检查
- 磁盘空间
- 内存可用量
- CPU 信息

---

## 验证流程建议

### 首次部署验证

1. **本地检查**（5-10 分钟）
   ```bash
   bash 附录/verify-docker-runner.sh
   ```
   确保所有项均通过 ✓

2. **构建 rclone-ci 镜像**（10-20 分钟）
   ```bash
   cd 附录/Docker
   ./docker-ci-commands.sh build
   ```
   确保镜像构建和功能验证成功

3. **GitHub Actions 工作流**（通过 Web UI）
   - 创建测试提交或手动触发工作流
   - 验证工作流能否成功运行

### 定期维护检查

部署后，定期运行验证：

```bash
# 每周检查（添加到 cron）
0 8 * * 1 /path/to/rclone/附录/verify-docker-runner.sh >> ~/docker-runner-verify.log

# GitHub Actions 自动化（已内置）
# docker-runner-verify.yml 设定为每 12 小时自动运行
```

---

## 常见问题排查

### 1. Docker 守护进程无法访问

**问题**
```
✗ Docker 守护进程可访问
```

**解决方案**
```bash
# 添加用户到 docker 组
sudo usermod -aG docker $USER
newgrp docker

# 验证
docker ps
```

### 2. rclone-ci 镜像不存在

**问题**
```
⚠ rclone-ci 镜像未找到
```

**解决方案**
```bash
cd 附录/Docker
./docker-ci-commands.sh build
```

### 3. GitHub 连接失败

**问题**
```
✗ api.github.com 不可访问
```

**检查网络**
```bash
# 检查 DNS
nslookup github.com

# 检查路由
traceroute github.com

# 检查防火墙
sudo firewall-cmd --list-all

# 测试 HTTPS 端口
nc -zv api.github.com 443
```

### 4. 磁盘空间不足

**问题**
```
✗ 磁盘使用率过高 (95%)
```

**清理空间**
```bash
# 清理 Docker 未使用的资源
docker system prune -a

# 清理旧的日志
sudo journalctl --vacuum=500M
```

### 5. 内存不足警告

**问题**
```
⚠ 内存容量较小
```

**建议**
- rclone 编译需要至少 2GB 可用内存
- 检查其他占用内存的进程
- 考虑增加 swap 空间

---

## 验证成功后

### 后续配置步骤

1. **启动 GitHub Actions Runner**
   ```bash
   cd ~/actions-runner
   ./run.sh
   ```

2. **测试工作流**
   - 在仓库中创建简单的工作流
   - 验证能否在 runner 上执行

3. **监控运行器状态**
   ```bash
   # 查看 runner 日志
   tail -f ~/actions-runner/_diag/Runner_*.log
   
   # 检查 runner 进程
   ps aux | grep actions-runner
   ```

### 定期维护

```bash
# 每月检查 runner 状态
/path/to/rclone/附录/verify-docker-runner.sh

# 更新 Docker 和 runner
sudo dnf update docker-ce
# 重新启动 runner
```

---

## 官方参考资源

- [GitHub Actions Runner](https://github.com/actions/runner)
- [Self-Hosted Runners](https://docs.github.com/en/actions/hosting-your-own-runners)
- [Adding Self-Hosted Runners](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners)
- [Runner Container Hooks](https://github.com/actions/runner-container-hooks)

---

## 更新日志

| 日期 | 变更 | 备注 |
|------|------|------|
| 2026-02-20 | 初版创建 | 基于GitHub官方文档 |

---

**生成日期**: 2026-02-20  
**系统**: Rocky 9.x  
**Docker**: 29.x+  
**GitHub Actions Runner**: 2.331+
