# Rocky Linux CI 环境 - JSON 配置维护指南（v3.2）

## 整体架构

```
GitHub Actions 工作流 (apt-get install libfuse-dev)
    ↓
/usr/bin/apt-get (软链接)
    ↓
/opt/actions-runner/compat-scripts/apt-get (主脚本)
    ↓
读取 JSON 配置文件 (jq)
    ├─ package-map.json (包名映射表)
    └─ ignore-packages.json (忽略列表)
    ↓
转换包名 (libfuse-dev → fuse3-devel)
    ↓
dnf install fuse3-devel
    ↓
✅ 成功
```

## 配置文件位置

所有配置文件集中存储在：

```bash
/opt/actions-runner/compat-scripts/
├── apt-get                      # apt-get wrapper 脚本 (v3.2)
├── package-map.json             # 包名映射表 (JSON)
└── ignore-packages.json         # 忽略列表 (JSON)
```

## package-map.json 格式说明

### 文件示例

```json
{
  "_version": "3.2",
  "_comment": "Ubuntu → Rocky Linux 包名映射表",
  "_usage": "格式: \"ubuntu包名\": \"rocky包名\" | 可以手动编辑此文件添加新映射",
  "_maintenance": "脚本执行时会智能合并，保留已有配置，只添加新增映射项",
  "libfuse-dev": "fuse3-devel",
  "nfs-common": "nfs-utils",
  "gcc": "gcc",
  "g++": "gcc-c++",
  "pkg-config": "pkgconf-pkg-config"
}
```

### 说明

- **_version**: 配置文件版本，脚本使用此字段判断是否需要合并新增映射
- **以 _ 开头的键**: 元数据和注释（不是映射关系）
- **其他键值对**: 实际的包名映射，`"ubuntu包名": "rocky包名"`

### 添加新映射

如果需要添加新的包名映射，直接编辑此文件：

```json
{
  "libfuse-dev": "fuse3-devel",
  "nfs-common": "nfs-utils",
  "你的包": "rocky对应包",
  "openssh-client": "openssh-clients"
}
```

## ignore-packages.json 格式说明

### 文件示例

```json
{
  "_version": "3.2",
  "_comment": "忽略列表 - Rocky 中不可用或不需要的包",
  "_usage": "在 ignore 数组中添加需要忽略的包名",
  "_maintenance": "这些包在安装时会被跳过，不会被传递给 dnf",
  "ignore": [
    "git-annex",
    "git-annex-remote-rclone"
  ]
}
```

### 说明

- **ignore 数组**: 包含所有需要跳过的包名
- 这些包在遇到时会被完全跳过，不会尝试安装

### 添加新忽略包

```json
{
  "ignore": [
    "git-annex",
    "git-annex-remote-rclone",
    "不支持的包名"
  ]
}
```

## 维护操作

### 1. 验证 JSON 语法

编辑配置文件后，验证 JSON 格式是否正确：

```bash
# 验证映射表
jq . /opt/actions-runner/compat-scripts/package-map.json

# 验证忽略列表
jq . /opt/actions-runner/compat-scripts/ignore-packages.json

# 如果输出格式化的 JSON，说明语法正确
# 如果出错，会显示 "parse error" 信息
```

### 2. 查看当前配置

```bash
# 查看所有映射关系
jq 'to_entries[] | select(.key | startswith("_") | not) | "\(.key) → \(.value)"' \
  /opt/actions-runner/compat-scripts/package-map.json

# 查看所有忽略包
jq '.ignore[]?' /opt/actions-runner/compat-scripts/ignore-packages.json
```

### 3. 查看 apt-get wrapper 加载的配置

```bash
# apt-get wrapper 提供了诊断命令
/opt/actions-runner/compat-scripts/apt-get config-info
```

输出示例：
```
=== APT-GET WRAPPER CONFIG INFO ===
Package Map File: /opt/actions-runner/compat-scripts/package-map.json
Mappings:
  libfuse-dev → fuse3-devel
  nfs-common → nfs-utils
  ...

Ignore List File: /opt/actions-runner/compat-scripts/ignore-packages.json
Ignored Packages:
  git-annex
  git-annex-remote-rclone
```

### 4. 脚本重新运行时的行为

如果脚本被重新执行，配置文件处理方式：

1. **第一次运行**: 创建默认配置文件
2. **再次运行且版本一致**: 保留配置，无需更新
3. **再次运行且版本不同**: 
   - 备份旧文件 → `package-map.json.bak`
   - 智能合并：保留用户添加的映射，添加新的默认映射
   - 新增的 `_comment` 和 `_usage` 等元数据会被更新

## 常见任务

### 添加 Ubuntu 包与 Rocky 包的映射

1. 编辑 `/opt/actions-runner/compat-scripts/package-map.json`
2. 在主体部分（非 `_` 开头的部分）添加新行
3. 验证 JSON 格式

```bash
# 例子：添加 openssh-client → openssh-clients 映射
# 编辑前：
{
  "libfuse-dev": "fuse3-devel",
  "nfs-common": "nfs-utils"
}

# 编辑后：
{
  "libfuse-dev": "fuse3-devel",
  "nfs-common": "nfs-utils",
  "openssh-client": "openssh-clients"
}

# 验证
jq . /opt/actions-runner/compat-scripts/package-map.json
```

### 添加需要忽略的包

1. 编辑 `/opt/actions-runner/compat-scripts/ignore-packages.json`
2. 在 `ignore` 数组中添加包名

```bash
# 编辑前：
{
  "ignore": [
    "git-annex"
  ]
}

# 编辑后：
{
  "ignore": [
    "git-annex",
    "新的不支持包"
  ]
}

# 验证
jq . /opt/actions-runner/compat-scripts/ignore-packages.json
```

### 查看哪个包被映射了

```bash
# 查询特定包的映射
jq '.libfuse-dev' /opt/actions-runner/compat-scripts/package-map.json
# 输出: "fuse3-devel"

# 查询是否被忽略
jq '.ignore | index("git-annex") != null' /opt/actions-runner/compat-scripts/ignore-packages.json
# 输出: true (被忽略) 或 null (未被忽略)
```

## apt-get wrapper 的工作流程

```bash
# GitHub Actions 执行：
apt-get install -y libfuse-dev nfs-common openssh-client git-annex

# wrapper 处理流程：
1. 检查 git-annex → 在忽略列表中 → 跳过
2. 检查 libfuse-dev → 映射到 fuse3-devel
3. 检查 nfs-common → 映射到 nfs-utils
4. 检查 openssh-client → 未在映射表中 → 直接通过 openssh-client

# 最终执行：
dnf install -y fuse3-devel nfs-utils openssh-client
```

## 故障排除

### 问题 1: JSON 格式错误

**症状**: `apt-get install xxx` 执行时失败

**排查**:
```bash
# 检查 JSON 语法
jq . /opt/actions-runner/compat-scripts/package-map.json
# 如果有 "parse error"，说明 JSON 格式不对

# 用编辑器修复（确保逗号和引号正确）
```

### 问题 2: 包没有被正确转换

**症状**: 运行 `apt-get install libfuse-dev`，但仍然找不到包

**排查**:
```bash
# 查看当前映射
jq '.libfuse-dev' /opt/actions-runner/compat-scripts/package-map.json

# 如果返回 null，说明映射不存在，需要添加
```

### 问题 3: 包应该被忽略但没有被忽略

**症状**: `apt-get install git-annex` 尝试安装失败

**排查**:
```bash
# 检查忽略列表
jq '.ignore[]?' /opt/actions-runner/compat-scripts/ignore-packages.json

# 如果没有看到 git-annex，添加它
```

## v3.2 vs v3.1 的改进

| 方面 | v3.1 | v3.2 |
|------|------|------|
| 配置格式 | Bash 脚本 (declare -A) | JSON |
| 配置易读性 | 一般 | ⭐⭐⭐ 优秀 |
| 编辑工具 | 需要懂 Bash | 任何文本编辑器 |
| 变量处理 | 使用 Bash 数组 | 使用 jq 查询 |
| 版本管理 | 简单的字符串匹配 | JSON _version 字段 |
| 智能合并 | 简单判断 | 完整的 jq 合并逻辑 |
| 易于集成 | 受限 | 标准 JSON，易集成 |

## 关键要点

✅ **做**：
- 直接编辑 JSON 配置文件添加映射
- 使用 `jq` 验证 JSON 语法  
- 使用 `apt-get config-info` 查看当前配置
- 重新运行脚本已将配置文件保留

❌ **不要**：
- 将 `_version` 字段改错（这会导致不必要的合并）
- 删除所有 `_metadata` 字段（虽然不会出错，但失去文档）
- 手动编辑脚本本身的 jq 部分（直接编辑配置文件即可）

---

更新时间: 2026-02-20  
版本: v3.2 (JSON + jq)
