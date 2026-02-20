# Rocky Linux 9.4/9.7 CI/CD 环境配置 - v3.2 完整指南

> **版本**: v3.2 (JSON + jq 改进版)  
> **发布日期**: 2026-02-20  
> **用途**: 为 GitHub Actions 在 Rocky Linux 上提供完整的 CI/CD 环境支持

## 📌 快速开始

### 安装

```bash
# 下载脚本并以 root 权限运行
sudo bash setup-rocky-9.4-ci-env-v3.2.sh
```

### 验证安装

```bash
# 检查 apt-get wrapper 是否工作
apt-get --version

# 查看当前配置
apt-get config-info

# 测试包转换
apt-get install libfuse-dev
```

## 🎯 核心功能

这个脚本为 Rocky Linux 系统提供三个关键功能：

### 1. 完整的编译环境

- GCC / G++ / Make
- Python 3 开发库
- OpenSSL / zlib / ncurses
- FUSE 文件系统支持
- 仓库配置 (CRB + EPEL)

### 2. apt-get 命令兼容层

将 Ubuntu 的 `apt-get` 命令自动转换为 Rocky 的 `dnf` 命令：

```bash
apt-get install libfuse-dev  # Ubuntu 语法
    ↓
apt-get wrapper 拦截
    ↓
转换为: dnf install fuse3-devel  # Rocky 语法
```

### 3. 智能包名转换

用 JSON 配置文件存储包名映射，支持：

- Ubuntu 包 → Rocky 包的自动转换
- 不支持的包的自动忽略
- 用户可维护的配置

## 📁 文件结构

```
附录/
├── setup-rocky-9.4-ci-env-v3.2.sh      # 主安装脚本
├── 
├── 快速参考-JSON配置.md                   # 快速查询
├── JSON配置维护指南-v3.2.md              # 详细指南
├── v3.2变更日志.md                      # 版本说明
├── README-v3.2.md                      # 本文件
│
├── 示例-package-map.json                # 映射表示例
└── 示例-ignore-packages.json            # 忽略列表示例

运行后生成:
/opt/actions-runner/compat-scripts/
├── apt-get                             # wrapper 脚本
├── package-map.json                    # 实际映射表
└── ignore-packages.json                # 实际忽略列表
```

## 🚀 安装流程

```
1. 权限检查 (sudo)
   │
2. 系统检查 (Rocky 版本)
   │
3. 仓库配置 (CRB + EPEL)
   │
4. 工具链安装 (gcc, make, git 等)
   │
5. 开发库安装 (python-devel, zlib-devel 等)
   │
6. 可选库安装 (fuse, btrfs 等)
   │
7. Runner 权限配置 (sudo 无密码)
   │
8. JSON 配置文件生成
   │
9. apt-get wrapper 创建 + 软链接
   │
10. 验证和汇总信息
```

## 📊 关键改进 - v3.2 vs v3.1

| 方面 | v3.1 | v3.2 |
|------|------|------|
| **配置格式** | Bash 脚本 | JSON 文件 |
| **易读性** | ⭐⭐ | ⭐⭐⭐ |
| **编辑难度** | 需懂 Bash | 任何编辑器 |
| **验证工具** | bash -n | jq validate |
| **版本管理** | 字符串匹配 | JSON 版本字段 |

## 💻 使用示例

### 场景 1: GitHub Actions 工作流运行 apt-get 命令

```yaml
# .github/workflows/build.yml
jobs:
  build:
    runs-on: [self-hosted, linux, rocky]
    steps:
      - name: Install dependencies
        run: |
          apt-get update
          apt-get install -y libfuse-dev nfs-common pkg-config
```

**幕后发生**:
```
apt-get update
  → wrapper 拦截
  → dnf clean all && dnf makecache
  → ✅ 成功

apt-get install -y libfuse-dev nfs-common pkg-config
  → wrapper 拦截并转换包名
  → libfuse-dev → fuse3-devel
  → nfs-common → nfs-utils
  → pkg-config → pkgconf-pkg-config
  → dnf install -y fuse3-devel nfs-utils pkgconf-pkg-config
  → ✅ 成功
```

### 场景 2: 添加新的包名映射

```bash
# 1. 编辑映射表
nano /opt/actions-runner/compat-scripts/package-map.json

# 2. 添加新映射
{
  ...
  "openssh-client": "openssh-clients"
}

# 3. 验证 JSON 格式
jq . /opt/actions-runner/compat-scripts/package-map.json

# 4. 立即生效（无需重启）
apt-get install openssh-client
  → 自动使用新映射
```

### 场景 3: 添加忽略包

```bash
# 1. 编辑忽略列表
nano /opt/actions-runner/compat-scripts/ignore-packages.json

# 2. 添加新包
{
  "ignore": [
    "git-annex",
    "git-annex-remote-rclone",
    "新的不支持包"
  ]
}

# 3. 验证
jq . /opt/actions-runner/compat-scripts/ignore-packages.json

# 4. 测试
apt-get install 新的不支持包
  → wrapper 检查
  → 包在忽略列表中
  → 跳过安装
```

## ⚙️ 配置文件详解

### package-map.json (包名映射表)

```json
{
  "_version": "3.2",
  "_comment": "说明",
  "_usage": "使用方法",
  "ubuntu包名": "rocky包名"
}
```

**关键点**:
- `_开头的字段`: 元数据（被 wrapper 忽略）
- 其他字段: 实际映射关系
- 版本字段用于升级时的智能合并

### ignore-packages.json (忽略列表)

```json
{
  "_version": "3.2",
  "ignore": ["包1", "包2"]
}
```

**关键点**:
- `ignore` 数组包含所有要跳过的包
- wrapper 遇到这些包会完全忽略它们

## 🔍 诊断命令

```bash
# 查看 wrapper 当前配置
apt-get config-info

# 查看所有映射
jq 'to_entries[] | select(.key | startswith("_") | not)' \
  /opt/actions-runner/compat-scripts/package-map.json

# 查看所有忽略包
jq '.ignore[]' /opt/actions-runner/compat-scripts/ignore-packages.json

# 测试单个包的映射
jq '.libfuse-dev' /opt/actions-runner/compat-scripts/package-map.json

# 查看脚本版本
apt-get --version
```

## 🔄 升级路径

### 从 v3.1 升级到 v3.2

```bash
# 1. 备份旧配置（可选）
cp -r /opt/actions-runner/compat-scripts /tmp/compat-scripts.backup.v3.1

# 2. 运行新脚本
sudo bash setup-rocky-9.4-ci-env-v3.2.sh

# 3. 脚本会自动：
#    - 检测版本升级
#    - 备份旧 JSON 文件 (*.bak)
#    - 创建新 JSON 文件
#    - 智能合并用户配置

# 4. 验证升级
apt-get config-info

# 5. 删除旧的 .sh 文件（可选）
rm /opt/actions-runner/compat-scripts/*.sh
```

## 📝 常见任务

### 添加新的包名映射

```bash
# 方法 1: 直接编辑
nano /opt/actions-runner/compat-scripts/package-map.json
# 添加: "新包": "映射到的包"

# 方法 2: 使用 jq 追加
jq '.新包 = "映射到的包"' \
  /opt/actions-runner/compat-scripts/package-map.json > /tmp/new.json && \
  mv /tmp/new.json /opt/actions-runner/compat-scripts/package-map.json
```

### 验证配置文件

```bash
# 验证 JSON 格式
jq . /opt/actions-runner/compat-scripts/package-map.json
jq . /opt/actions-runner/compat-scripts/ignore-packages.json

# 如果有错误，jq 会显示 parse error
```

### 查看脚本日志

```bash
# 安装时的详细日志
bash -x setup-rocky-9.4-ci-env-v3.2.sh 2>&1 | tee install.log

# wrapper 执行时的日志（调试）
bash -x /opt/actions-runner/compat-scripts/apt-get install libfuse-dev
```

## 🆘 故障排除

### 问题 1: apt-get: command not found

**原因**: PATH 不包含 apt-get 位置  
**解决**:
```bash
# 检查软链接
ls -la /usr/bin/apt-get
ls -la /usr/local/bin/apt-get

# 检查 PATH
echo $PATH

# 验证文件权限
file /opt/actions-runner/compat-scripts/apt-get
```

### 问题 2: JSON parse error

**原因**: 编辑配置文件时引入了 JSON 语法错误  
**解决**:
```bash
# 查看错误信息
jq . /opt/actions-runner/compat-scripts/package-map.json

# 检查常见问题
# 1. 字符串必须用双引号 ""
# 2. 属性间用逗号分隔
# 3. 最后一个属性后没有逗号

# 恢复备份
cp /opt/actions-runner/compat-scripts/package-map.json.bak \
   /opt/actions-runner/compat-scripts/package-map.json
```

### 问题 3: 包没有被正确转换

**原因**: 映射表中不存在该包的映射  
**解决**:
```bash
# 1. 检查是否有映射
jq '.libfuse-dev' /opt/actions-runner/compat-scripts/package-map.json

# 2. 如果返回 null，需要添加映射

# 3. 检查是否拼写错误
jq 'keys' /opt/actions-runner/compat-scripts/package-map.json
```

### 问题 4: dnf 命令找不到

**原因**: Rocky Linux 版本太旧或 dnf 没有安装  
**解决**:
```bash
# 检查 Rocky 版本
cat /etc/os-release

# 安装 dnf
yum install -y dnf

# 验证 dnf
dnf --version
```

## 📚 相关文档

- [快速参考-JSON配置.md](快速参考-JSON配置.md) - jq 命令速查表
- [JSON配置维护指南-v3.2.md](JSON配置维护指南-v3.2.md) - 详细维护指南
- [v3.2变更日志.md](v3.2变更日志.md) - 版本对比和升级说明
- [示例-package-map.json](示例-package-map.json) - 映射表示例
- [示例-ignore-packages.json](示例-ignore-packages.json) - 忽略列表示例

## 🎓 学习资源

### jq 教程

JSON 处理工具 jq 的基础用法：

```bash
# 安装 jq
dnf install -y jq

# 查看 jq 帮助
jq --help
man jq

# 官方教程
https://stedolan.github.io/jq/tutorial/
```

### Bash 脚本参考

```bash
# 脚本调试模式
bash -x script.sh

# 检查脚本语法
bash -n script.sh

# 追踪执行
bash -v script.sh
```

## 📞 问题反馈

如遇到问题，请提供：

1. Rocky Linux 版本 (cat /etc/os-release)
2. 脚本执行日志 (bash -x setup-rocky-9.4-ci-env-v3.2.sh 2>&1 | head -100)
3. 当前配置状态 (apt-get config-info)
4. 错误信息 (完整的错误输出)

## 📜 许可证和署名

此脚本基于 Rocky Linux 官方文档和社区最佳实践编写。

## 版本历史

| 版本 | 日期 | 主要改进 |
|------|------|---------|
| v1.0 | - | 初始版本 (PowerTools 配置错误) |
| v2.1 | - | 修复包名 (libncurses-devel) |
| v2.2 | - | 改进错误处理 |
| v3.0 | - | 使用 CRB + EPEL (真实仓库配置) |
| v3.1 | - | 中心存储 + 软链接 + Bash 配置 |
| **v3.2** | 2026-02-20 | **JSON + jq 配置系统** |

---

**最后更新**: 2026-02-20  
**当前版本**: v3.2  
**维护人**: CI/CD 配置团队

祝安装顺利！🎉
