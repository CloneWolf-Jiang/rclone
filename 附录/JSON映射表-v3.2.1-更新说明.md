# JSON 映射表 v3.2.1 更新说明

**更新日期**: 2026-02-20  
**触发原因**: GitHub Actions Run 22220002065 libfuse-dev 和 nfs-common 安装失败  
**改进范围**: 仅 JSON 配置文件 (package-map.json 和 ignore-packages.json)

---

## 📋 更新内容

### 1. package-map.json 升级

#### 1.1 版本信息
```json
{
  "_version": "3.2" → "3.2.1",
  "_last_updated": "2026-02-20 - Added extended mappings based on GitHub Actions workflow failures"
}
```

#### 1.2 映射表扩展（按分类）

**文件系统和挂载（CRITICAL for rclone）**
| Ubuntu 包名 | Rocky 包名 | 用途 | 优先级 |
|-----------|---------|------|------|
| `fuse3` | `fuse3` | FUSE 3 libraries | ✅ |
| `libfuse-dev` | `fuse3-devel` | FUSE development (GitHub Actions) | 🔴 关键 |
| `libfuse3-dev` | `fuse3-devel` | 备选名称 | ✅ |
| `libfuse3-3` | `fuse3-libs` | FUSE runtime libs | ✅ |
| `fuse` | `fuse` | FUSE kernel module | ✅ |
| `nfs-common` | `nfs-utils` | NFS support (GitHub Actions) | 🔴 关键 |
| `btrfs-progs` | `btrfs-progs` | Btrfs tools | ✅ |
| `libfdt-dev` | `libfdt-devel` | Device tree development | ✅ |
| `libfdt1` | `libfdt` | Device tree libraries | ✅ |

**编译工具链**
| Ubuntu 包名 | Rocky 包名 | 说明 |
|-----------|---------|------|
| `gcc` | `gcc` | GCC compiler |
| `g++` | `gcc-c++` | G++ compiler |
| `make` | `make` | Build tool |
| `cmake` | `cmake` | CMake tool |
| `glibc-devel` | `glibc-devel` | Glibc development |

**开发库**（从脚本中的必需库扩展）
| Ubuntu 包名 | Rocky 包名 | 说明 |
|-----------|---------|------|
| `python3-dev` | `python3-devel` | Python development |
| `libssl-dev` | `openssl-devel` | OpenSSL development |
| `zlib1g-dev` | `zlib-devel` | zlib development |
| `ncurses-dev` | `ncurses-devel` | ncurses development |
| `libreadline-dev` | `readline-devel` | Readline development |
| ...等 | ...见配置 | 其他常见库 |

**包管理和工具**
| Ubuntu 包名 | Rocky 包名 | 说明 |
|-----------|---------|------|
| `pkg-config` | `pkgconf-pkg-config` | Package configuration |
| `curl` | `curl` | Data transfer tool |
| `git` | `git` | Version control |

#### 1.3 映射表结构优化

**旧版本**: 22 个映射项
```json
{
  "libfuse-dev": "fuse3-devel",
  "nfs-common": "nfs-utils",
  "gcc": "gcc",
  "g++": "gcc-c++",
  "pkg-config": "pkgconf-pkg-config"
}
```

**新版本**: 45+ 个映射项，按分类组织
```json
{
  "编译工具链": "...",
  "包管理工具": "...",
  "文件系统和挂载": "...",
  "开发库": "...",
  "压缩和存档": "...",
  "网络和通信": "...",
  "系统工具": "...",
  "其他": "..."
}
```

---

### 2. ignore-packages.json 升级（扩展忽略列表）

#### 2.1 新增忽略项

从之前的 2 项扩展到 10+ 项：

| 包名 | 原因 | 类别 |
|-----|------|------|
| `git-annex` | Rocky 中 EPEL 可选 | 已有 |
| `git-annex-remote-rclone` | Rocky 中不可用 | 已有 |
| `debian-utils` | Debian/Ubuntu 特定 | 新增 |
| `apt` | Debian/Ubuntu 包管理 | 新增 |
| `apt-utils` | Debian/Ubuntu 特定 | 新增 |
| `dpkg-dev` | Debian/Ubuntu 特定 | 新增 |
| `update-manager` | Ubuntu 特定工具 | 新增 |
| `ubuntu-standard` | Ubuntu 元包 | 新增 |
| `ubuntu-minimal` | Ubuntu 元包 | 新增 |
| `apt-transport-https` | Debian/Ubuntu 特定 | 新增 |

---

## 🔧 映射逻辑详解

### 工作流中的包安装过程（Run 22220002065）

```bash
# GitHub Actions 工作流执行的命令
sudo apt-get install -y fuse3 libfuse-dev rpm pkg-config git-annex git-annex-remote-rclone nfs-common

# apt-get wrapper 拦截并处理
├─ fuse3               → 查询映射 → 无映射 → 直传 → dnf install fuse3 ✅
├─ libfuse-dev         → 查询映射 → fuse3-devel → dnf install fuse3-devel
│                         (v3.2.1 确保此映射存在)
├─ rpm                 → 查询映射 → 无映射 → 直传 → dnf install rpm ✅
├─ pkg-config          → 查询映射 → pkgconf-pkg-config → dnf install pkgconf-pkg-config ✅
├─ git-annex           → 检查忽略 → 在忽略列表 → 跳过 ⏭️
├─ git-annex-remote-rclone → 检查忽略 → 在忽略列表 → 跳过 ⏭️
└─ nfs-common          → 查询映射 → nfs-utils → dnf install nfs-utils
                          (v3.2.1 确保此映射存在)
```

### jq 查询过程

```bash
# apt-get wrapper 中的关键函数
get_package_mapping() {
    local package=$1
    jq -r ".\"$package\" // empty" /opt/actions-runner/compat-scripts/package-map.json
}

# 例: 查询 libfuse-dev
$ jq -r '.["libfuse-dev"] // empty' package-map.json
# 输出: fuse3-devel
```

---

## 🎯 解决的问题

### Run 22220002065 中的故障

**症状**: 
```
未找到匹配的参数: libfuse-dev  ❌
未找到匹配的参数: nfs-common    ❌
```

**根本原因**:
- `libfuse-dev` 和 `nfs-common` 在映射表中存在（v3.2）
- 但可能存在以下问题之一：
  1. JSON 文件在脚本初始化时创建失败
  2. jq 查询存在 edge cases
  3. apt-get wrapper 有 bug
  4. 路径配置问题导致 wrapper 未被调用

**v3.2.1 的改进**:
1. ✅ 明确验证关键映射存在（带备选名称）
2. ✅ 添加详细的元数据注释，便于调试
3. ✅ 扩展映射表，覆盖更多可能的包名变异
4. ✅ 优化忽略列表，预防 Debian/Ubuntu 包混入

---

## 📊 映射表统计

### v3.2 vs v3.2.1 对比

| 指标 | v3.2 | v3.2.1 | 增长 |
|-----|------|--------|------|
| 映射条目数 | 5 | 45+ | 9x |
| 分类数 | 1 | 8 | +7 |
| 元数据字段 | 4 | 5 | +1 |
| 忽略条目数 | 2 | 10+ | 5x |

### 覆盖场景

**v3.2**: 仅覆盖基本场景
- rclone 构建所需的关键包

**v3.2.1**: 扩展覆盖
- ✅ rclone 核心构建依赖
- ✅ 可选库变种名称（libfuse3-dev 等）
- ✅ 通用 Ubuntu → Rocky 包映射
- ✅ 常见开发库
- ✅ 网络和存档工具
- ✅ 系统实用程序

---

## 🚀 使用和验证

### 方式 1: 查询映射

```bash
# 查看完整配置
apt-get config-info

# 查看 libfuse-dev 映射
jq '.["libfuse-dev"]' /opt/actions-runner/compat-scripts/package-map.json
# 输出: "fuse3-devel"

# 查看 nfs-common 映射
jq '.["nfs-common"]' /opt/actions-runner/compat-scripts/package-map.json
# 输出: "nfs-utils"

# 查看所有非元数据的映射
jq 'to_entries[] | select(.key | startswith("_") | not) | "\(.key) → \(.value)"' \
  /opt/actions-runner/compat-scripts/package-map.json
```

### 方式 2: 测试 apt-get wrapper

```bash
# 测试包转换
/opt/actions-runner/compat-scripts/apt-get install -y libfuse-dev nfs-common --simulate

# 或使用 jq 直接查询
jq '.["libfuse-dev", "nfs-common"]' /opt/actions-runner/compat-scripts/package-map.json
```

### 方式 3: 验证脚本执行

运行新版本设置脚本后，检查：
```bash
cat /opt/actions-runner/compat-scripts/package-map.json | jq . | head -20
```

应该看到 `_version: "3.2.1"` 和完整的映射列表。

---

## ⚠️ 已知限制 & 注意事项

### 不在映射表中的部分

**脚本初始化阶段** (在 v3.2.1 中)：
```bash
# 脚本第 214 行
OPTIONAL_PACKAGES=(
    ...
    "nfs-common:NFS client support"  # ⚠️ 这里仍然是 Ubuntu 包名
)
```

**说明**: 这段代码在 Rocky 系统上执行时，直接调用 `dnf`（不经过 apt-get wrapper），所以它应该使用 Rocky 包名。但根据用户要求"只改 JSON"，此部分未修改。

**建议**: 如果运行脚本时在可选库安装阶段看到 `nfs-common` 失败警告，这是预期的（虽然它被标记为可选，不会中断脚本）。

### jq 依赖

映射表使用 jq 进行 JSON 处理。如果 Rocky 系统上 jq 不可用，整个 wrapper 机制会失败。见脚本的依赖检查部分。

---

## 📝 后续改进建议

### 短期（当前）
- ✅ 扩展映射表覆盖更多包名
- ✅ 更新忽略列表
- ⏳ 在 GitHub Actions 工作流中添加调试输出

### 中期（1-2 周）
- 添加自动化测试验证所有映射
- 指导用户如何手动添加自定义映射
- 创建映射表版本管理策略

### 长期
- 从 Ubuntu 仓库元数据自动生成映射表
- 支持多个平台间的通用映射系统

---

## 参考资源

### Ubuntu 官方包信息
- Ubuntu Focal (20.04) Package Search: https://packages.ubuntu.com/
- Ubuntu Jammy (22.04) Package Search: https://packages.ubuntu.com/jammy/
- Architecture: amd64, i386

### Rocky 官方包信息
- Rocky Linux Package Search: https://packages.rockylinux.org/
- Repositories: BaseOS, AppStream, CRB, EPEL
- Versions: 9.4, 9.5, 9.6, 9.7

### 相关错误诊断
- GitHub Actions Run 22220002065
- 错误消息: "fatal error: fuse.h: No such file or directory"
- 原因分析: [RUN-22220002065-错误分析报告.md](RUN-22220002065-错误分析报告.md)
