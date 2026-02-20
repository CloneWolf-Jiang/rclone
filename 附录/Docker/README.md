# Docker CI 方案 - 文件使用说明

**整理日期**: 2026-02-20  
**系统要求**: Rocky Linux 9.4 - 9.7 （！已不需要 apt-get wrapper 或任何 JSON 配置文件）  
**Docker 需求**: >= 20.10 (推荐使用清华源安装)

## 📂 文件位置

所有 Docker 相关文件已整理到 `附录/Docker` 目录下：

```
附录/Docker/
├── Dockerfile.ci                # CI 专用 Docker 镜像定义
├── docker-compose.yml           # 本地开发 docker-compose 配置
├── docker-ci-commands.sh        # 便捷工具脚本
├── docker-build.yml             # GitHub Actions 工作流配置
├── Docker方案部署指南.md         # 完整部署文档
├── Docker快速参考.md            # 速查表
├── 迁移指南-从裸机到Docker.md   # 迁移步骤
└── Docker_CI资源总览.md         # 资源导航
```

---

## 🔧 使用方法

### 方法 1：在项目根目录创建符号链接（推荐）

```bash
# Windows PowerShell (管理员权限)
cd H:\rClone\rclone

# 创建符号链接指向 Docker 文件
New-Item -ItemType SymbolicLink -Path "Dockerfile.ci" `
  -Target "附录\Docker\Dockerfile.ci" -Force

New-Item -ItemType SymbolicLink -Path "docker-compose.yml" `
  -Target "附录\Docker\docker-compose.yml" -Force

New-Item -ItemType SymbolicLink -Path "docker-ci-commands.sh" `
  -Target "附录\Docker\docker-ci-commands.sh" -Force

# Linux/macOS (Bash)
cd /path/to/rclone
ln -sf 附录/Docker/Dockerfile.ci Dockerfile.ci
ln -sf 附录/Docker/docker-compose.yml docker-compose.yml
ln -sf 附录/Docker/docker-ci-commands.sh docker-ci-commands.sh
```

**优势**: 
- 保持项目整洁（单点访问）
- Docker 命令可直接使用
- 文件集中管理

### 方法 2：直接复制文件到根目录

```bash
# Windows PowerShell
cp 附录\Docker\Dockerfile.ci .\
cp 附录\Docker\docker-compose.yml .\
cp 附录\Docker\docker-ci-commands.sh .\

# Linux/macOS (Bash)
cp 附录/Docker/Dockerfile.ci ./
cp 附录/Docker/docker-compose.yml ./
cp 附录/Docker/docker-ci-commands.sh ./
```

**优势**: 
- 不需要符号链接
- 便于版本控制

### 方法 3：使用完整路径

```bash
# 直接从附录/Docker 目录使用

# 构建镜像
docker build -f 附录/Docker/Dockerfile.ci -t rclone-ci:latest .

# 启动 compose
docker-compose -f 附录/Docker/docker-compose.yml up -d

# 运行脚本
bash 附录/Docker/docker-ci-commands.sh help
```

## 🚀 快速开始 - Rocky 9.x 部署（不需要 apt-get wrapper！）

### 一次性初始化（仅需一次）

**旧方案完全淘汰 - 不再需要 apt-get wrapper、JSON 配置或 jq 依赖**

```bash
# Step 1: 安装 Docker（一次性，使用清华源快速部署）
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl start docker && sudo systemctl enable docker

# Step 2: 验证 Docker（确保正确安装）
docker --version && docker-compose --version

# Step 3: 配置镜像源（可选但推荐 - 加速构建）
# 下载检测脚本并运行，会自动配置最优镜像
# 详见：Docker方案部署指南 -> Docker 镜像源检测与自动配置
```

### Step 2: 设置项目文件（选择一种方法）

**推荐使用符号链接（方法 1）**

```bash
# Windows (管理员 PowerShell)
New-Item -ItemType SymbolicLink -Path "Dockerfile.ci" `
  -Target "附录\Docker\Dockerfile.ci" -Force
New-Item -ItemType SymbolicLink -Path "docker-compose.yml" `
  -Target "附录\Docker\docker-compose.yml" -Force
New-Item -ItemType SymbolicLink -Path "docker-ci-commands.sh" `
  -Target "附录\Docker\docker-ci-commands.sh" -Force
```

### Step 2: 构建镜像

```bash
docker build -f Dockerfile.ci -t rclone-ci:latest .
```

### Step 3: 验证环境

```bash
docker run --rm rclone-ci:latest verify-ci-env
```

### Step 4: 开始使用

```bash
# 本地开发
docker-compose up -d
docker-compose exec runner bash
docker-compose down

# 或使用脚本工具
bash docker-ci-commands.sh help
bash docker-ci-commands.sh build
bash docker-ci-commands.sh verify
```

---

## 🔗 工作流配置

### 使用新位置的工作流文件

创建或更新 `.github/workflows/docker-build.yml`:

**选项 A: 复制内容**
```bash
cp 附录/Docker/docker-build.yml .github/workflows/
```

**选项 B: 从附录引用**（更推荐，便于维护）
```bash
# 如果 GitHub Actions 支持相对路径（通常支持）
# 在工作流中使用
```

**选项 C: 直接编辑**
```yaml
# .github/workflows/build.yml
jobs:
  build:
    runs-on: [self-hosted, linux, docker]
    container:
      image: rclone-ci:latest
    steps:
      - uses: actions/checkout@v4
      - run: make
```

---

## 📚 文档导航

| 文件 | 说明 |
|------|------|
| **Docker方案部署指南.md** | 📖 详细部署、故障排查、最佳实践 |
| **Docker快速参考.md** | ⚡ 速查表、常用命令、代码片段 |
| **迁移指南-从裸机到Docker.md** | 🔄 从旧方案迁移的分步指南 |
| **Docker_CI资源总览.md** | 📌 资源索引和导航 |

---

## 🎯 推荐的文件组织方式

### 最优方案：符号链接 + 附录集中管理

```
rclone/
├── Dockerfile.ci → 附录/Docker/Dockerfile.ci (符号链接)
├── docker-compose.yml → 附录/Docker/docker-compose.yml (符号链接)
├── docker-ci-commands.sh → 附录/Docker/docker-ci-commands.sh (符号链接)
├── 附录/
│   └── Docker/
│       ├── Dockerfile.ci (源文件)
│       ├── docker-compose.yml (源文件)
│       ├── docker-ci-commands.sh (源文件)
│       ├── docker-build.yml
│       └── *.md (文档)
└── .github/workflows/
    └── docker-build.yml (源文件或副本)
```

**优势**:
- ✅ 源文件集中管理（附录/Docker）
- ✅ 使用很方便（根目录可直接访问）
- ✅ 易于版本控制
- ✅ 易于维护

---

## ✨ 快速命令参考

### Windows (PowerShell)

```powershell
# 创建符号链接
New-Item -ItemType SymbolicLink -Path "Dockerfile.ci" `
  -Target "附录\Docker\Dockerfile.ci" -Force

# 构建镜像
docker build -f Dockerfile.ci -t rclone-ci:latest .

# 启动容器
docker-compose up -d

# 进入容器
docker-compose exec runner bash

# 停止容器
docker-compose down
```

### Linux/macOS (Bash)

```bash
# 创建符号链接
ln -sf 附录/Docker/Dockerfile.ci Dockerfile.ci
ln -sf 附录/Docker/docker-compose.yml docker-compose.yml
ln -sf 附录/Docker/docker-ci-commands.sh docker-ci-commands.sh

# 构建镜像
docker build -f Dockerfile.ci -t rclone-ci:latest .

# 启动容器
docker-compose up -d

# 进入容器
docker-compose exec runner bash

# 停止容器
docker-compose down

# 使用工具脚本
chmod +x docker-ci-commands.sh
./docker-ci-commands.sh help
./docker-ci-commands.sh build
./docker-ci-commands.sh verify
```

---

## ⚙️ Git 配置建议

如果使用符号链接，建议在 `.gitignore` 中配置：

```gitignore
# 符号链接指向的实体文件将被版本控制
# 根目录的符号链接本身通常不需要提交

# 如果需要忽略根目录的 Docker 文件（使用符号链接时）
# Dockerfile.ci
# docker-compose.yml
# docker-ci-commands.sh
```

或者提交符号链接：

```bash
# 确保 Git 追踪符号链接
git config core.symlinks true
git add Dockerfile.ci docker-compose.yml docker-ci-commands.sh
git commit -m "Add: symlinks to Docker files in 附录/Docker"
```

---

## 📖 后续步骤

### 1️⃣ 立即使用

按照上面的快速开始步骤，选择你的首选方法（建议方法 1）。

### 2️⃣ 了解详细信息

阅读 `附录/Docker/Docker方案部署指南.md` 了解完整配置。

### 3️⃣ 集成 CI/CD

按照 `附录/Docker/迁移指南-从裸机到Docker.md` 集成到 GitHub Actions。

### 4️⃣ 速查参考

需要快速查找命令时，参考 `附录/Docker/Docker快速参考.md`。

---

## 💡 常见问题

### Q: 符号链接不适用于我的环境，怎么办？

**A**: 使用方法 2（直接复制）:
```bash
copy 附录\Docker\Dockerfile.ci .\
copy 附录\Docker\docker-compose.yml .\
copy 附录\Docker\docker-ci-commands.sh .\
```

### Q: 文件副本不同步怎么办？

**A**: 
- 使用符号链接（自动同步）
- 或定期使用方法 2 更新文件

### Q: 工作流文件应该在哪里？

**A**: 
- 源文件: `附录/Docker/docker-build.yml`
- 使用位置: `.github/workflows/docker-build.yml`
- 复制或引用即可

---

## 🔄 文件同步

如果修改了 `附录/Docker` 中的源文件，需要同步到根目录：

```bash
# Windows (复制)
copy 附录\Docker\Dockerfile.ci .\

# Linux/macOS (如使用符号链接，无需手动同步)
# 符号链接会自动反映源文件的变化
```

---

**版本**: 1.0 | **更新于**: 2026-02-20 | **状态**: ✅ 就绪

需要帮助？参考 `附录/Docker/Docker_CI资源总览.md` 的导航指南。
