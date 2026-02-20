# Rocky Linux 9.4 与仓库 CI/CD 兼容性适配方案

**创建日期**: 2026-02-20  
**针对系统**: Rocky Linux 9.4  
**涉及仓库**: CloneWolf-Jiang/rclone、CloneWolf-Jiang/amlogic-s9xxx-openwrt

---

## 📊 兼容性分析总结

两个仓库中的 CI/CD 命令与 Rocky 9.4 的兼容性情况如下：

### ✅ 完全兼容的命令
- Git、tar、gzip、curl、wget 等基础工具
- sed、awk、grep、cut 等文本处理工具
- bash 脚本语言
- systemd / systemctl 服务管理
- dnf / yum 包管理系统

### ⚠️ 条件兼容的命令

#### 1. **btrfs 文件系统功能**
- **使用场景**: `amlogic-s9xxx-openwrt` 的 `remake` 脚本
- **代码位置**: `remake` 第 1119 行
  ```bash
  btrfs subvolume snapshot -r etc .snapshots/etc-000
  ```
- **问题**: Rocky 9.4 默认不安装 btrfs-progs
- **解决方案**:
  ```bash
  sudo dnf install -y btrfs-progs
  ```

#### 2. **pigz (并行gzip压缩)**
- **使用场景**: `amlogic-s9xxx-openwrt` 的 `remake` 脚本
- **代码位置**: `remake` 第 1145 行
  ```bash
  pigz -qf ${openwrt_filename} || gzip -qf ${openwrt_filename}
  ```
- **问题**: Rocky 9.4 默认不安装 pigz
- **解决方案**:
  ```bash
  sudo dnf install -y pigz
  ```

#### 3. **sed 的 `-i` 选项行为差异**
- **问题**: Rocky 上的 sed 需要备份文件扩展名为字符串，不能为空
- **当前代码**:
  ```bash
  sed -i 's/pattern/replace/g' file
  ```
- **Rocky 9.4 兼容方案**:
  ```bash
  sed -i.bak 's/pattern/replace/g' file && rm file.bak
  # 或者使用 in-place 不带扩展名
  sed -i '' 's/pattern/replace/g' file  # macOS 风格
  # 推荐使用以下通用方案
  sed -i.tmp 's/pattern/replace/g' file && rm -f file.tmp
  ```

---

## 🛠️ Rocky 9.4 部署前置环境配置

### 第 1 步：安装必要的依赖包

这是对现有部署流程的补充。在运行 CI/CD 脚本之前，执行以下命令：

```bash
#!/bin/bash
# Rocky 9.4 CI/CD 环境初始化脚本

echo "=========================================="
echo "Rocky 9.4 CI/CD 环境初始化"
echo "=========================================="

# 基础工具
sudo dnf install -y \
    bash \
    git \
    curl \
    wget \
    tar \
    gzip \
    sed \
    awk \
    grep \
    bc \
    jq \
    dialog

# OpenWrt 编译依赖（针对 amlogic-s9xxx-openwrt）
sudo dnf install -y \
    gcc \
    g++ \
    make \
    binutils \
    bison \
    flex \
    libfdt-devel \
    libncurses-devel \
    openssl-devel \
    python3 \
    python3-devel \
    perl \
    zlib-devel \
    glib2-devel

# 文件系统工具
sudo dnf install -y \
    btrfs-progs \
    pigz \
    util-linux \
    lvm2 \
    dosfstools \
    parted

# runner 用户 sudoer 权限（rclone 部署时需要）
sudo usermod -aG wheel runner

echo "=========================================="
echo "✅ 依赖环装完毕"
echo "=========================================="
```

**保存位置**: `附录/setup-rocky-9.4-ci-env.sh`

### 第 2 步：修复脚本兼容性问题

#### 对于 `remake` 脚本（amlogic-s9xxx-openwrt）

需要修改以下行来确保 Rocky 9.4 兼容：

**位置 1**: `remake` 第 1145 行 - 处理 sed -i 和压缩

```bash
# ❌ 原始代码
pigz -qf ${openwrt_filename} || gzip -qf ${openwrt_filename}

# ✅ Rocky 9.4 兼容代码
if command -v pigz &>/dev/null; then
    pigz -qf "${openwrt_filename}"
else
    gzip -qf "${openwrt_filename}"
fi
```

**位置 2**: 所有 `sed -i` 调用（多处）

```bash
# ❌ 原始代码（在不同脚本中多次出现）
sed -i 's/DISTRIB_REVISION.*/DISTRIB_REVISION=.../g' file

# ✅ Rocky 9.4 兼容代码
sed -i.bak 's/DISTRIB_REVISION.*/DISTRIB_REVISION=..../g' file && rm -f file.bak

# 或者使用 GNU sed 的通用方式（需要在脚本开头检查）
if [[ $(sed --version 2>&1 | grep -c GNU) -gt 0 ]]; then
    sed -i 's/.../g' file
else
    sed -i '' 's/.../g' file
fi
```

**位置 3**: `config/lede-master/diy-part2.sh` 等脚本中的 sed 调用

```bash
# 在文件开头添加 sed 兼容性检查
if [[ $(sed --version 2>&1 | grep -c GNU) -eq 0 ]]; then
    # BSD/macOS sed（Rocky 上 GNU sed 应该总是可用的）
    SED_INPLACE_FLAG=''
else
    # GNU sed（Rocky Linux 默认使用）
    SED_INPLACE_FLAG='.bak'
fi

# 然后在所有 sed -i 调用中使用
sed -i${SED_INPLACE_FLAG} 's/pattern/replace/g' file
```

---

## 📝 改写部署流程 - 新增章节

### 建议在部署文档中添加以下部分：

#### **第 0 阶段：系统兼容性检查和环境初始化**（新增）

```markdown
# 第 0 阶段：Rocky Linux 9.4 CI/CD 环境准备

在开始后续部署步骤之前，必须确保系统满足以下要求：

## 检查清单

□ 确认 Rocky Linux 版本 >= 9.4
  bash
  cat /etc/os-release | grep VERSION
  
□ 检查必要命令可用性
  bash
  command -v git curl wget tar sed awk
  
□ 确认 SELinux 已禁用（见第 3 阶段）
  bash
  getenforce  # 应显示 Disabled

## 执行环境初始化

如果是全新的 Rocky 9.4 系统，或之前未用于 OpenWrt/rclone 编译，请运行：

bash
sudo bash setup-rocky-9.4-ci-env.sh


此脚本会自动安装所有必要的依赖包，包括：
- 基础编译工具（gcc, make, binutils 等）
- 文件系统工具（btrfs-progs, pigz, util-linux 等）
- OpenWrt 编译依赖

**预计耗时**: 5-10 分钟
**磁盘空间**: ~800MB
```

---

## 🔧 脚本兼容性修复清单

| 文件 | 行号 | 问题命令 | 修复方案 | 优先级 |
|------|------|--------|--------|-------|
| remake | 1145 | pigz 检查 | 添加 command -v 检查 | 🔴 高 |
| remake | 1119 | btrfs subvolume | 添加存在性检查 | 🔴 高 |
| config/lede-master/diy-part2.sh | 多处 | sed -i | 使用 .bak 中间文件 | 🟡 中 |
| config/immortalwrt-master/diy-part2.sh | 多处 | sed -i | 使用 .bak 中间文件 | 🟡 中 |
| config/docker/make_docker_image.sh | 多处 | sed -i | 使用 .bak 中间文件 | 🟡 中 |
| bin/installdependencies.sh | TBD | 包管理器 | 检查是否包含 Linux 版本检测 | 🟢 低 |

---

## 🚀 实施路线图

### Phase 1: 部署（用户当前阶段）
1. ✅ 完成原有的 7 阶段 Runner 部署
2. ✅ 添加**第 0 阶段**（系统准备）到部署流程文档
3. ✅ 创建 `setup-rocky-9.4-ci-env.sh` 脚本

### Phase 2: 脚本兼容性修复（可选）
4. 提交 PR 到 `amlogic-s9xxx-openwrt` 仓库
5. 修复 `remake` 脚本中的 sed -i 和 btrfs 检查
6. 为各 diy-part*.sh 添加兼容性检查

### Phase 3: 验证（测试）
7. 在 Rocky 9.4 Runner 上运行 rclone 构建
8. 在 Rocky 9.4 Runner 上运行 OpenWrt 编译
9. 监控和调整

---

## ⚠️ 已知限制和注意事项

### 1. **LVM/btrfs 快照**
- `remake` 脚本中的 `btrfs subvolume snapshot` 命令会创建文件系统快照
- 这要求文件系统必须是 btrfs（当前系统可能是 ext4）
- **处理方式**: 脚本已有备选方案（包含 `||` 操作符），如果 btrfs 不可用会跳过

### 2. **losetup 和 mount 权限**
- `remake` 中使用 losetup 创建虚拟磁盘和 mount 挂载
- 需要 root 或 sudo 权限
- **处理方式**: 确保 runner 用户在 wheel 组中（见第 4 阶段）

### 3. **性能差异**
- pigz 比 gzip 更快，但不是必需的
- 如果 pigz 不可用，脚本会自动降级到 gzip
- **预期影响**: 压缩时间可能增加 2-3 倍（通常几分钟）

---

## 📞 故障排除

### 问题 1: `btrfs: command not found`

**症状**: amlogic 编译失败，提示 btrfs 命令不存在

**解决方案**:
```bash
sudo dnf install -y btrfs-progs
```

### 问题 2: `sed: can't read /tmp/xyz: No such file or directory (with -i flag)`

**症状**: sed -i 执行失败

**解决方案**: 
某些脚本中 sed -i 的语法不兼容 GNU sed。编辑脚本文件，将：
```bash
sed -i 's/.../g' file
```
改为：
```bash
sed -i.bak 's/.../g' file && rm -f file.bak
```

### 问题 3: 编译时提示缺少特定 Python 包或开发库

**症状**: OpenWrt 编译失败，缺少开发文件

**解决方案**:
运行 `setup-rocky-9.4-ci-env.sh` 应该已安装大部分依赖，如仍缺少，可逐个安装：
```bash
sudo dnf install -y python3-devel libfdt-devel libncurses-devel openssl-devel
```

---

## 📚 相关文档链接

- **原部署流程**: [GitHub Self-hosted Runner 完整部署流程.html](./GitHub%20Self-hosted%20Runner%20%E5%AE%8C%E6%95%B4%E9%83%A8%E7%BD%B2%E6%B5%81%E7%A8%8B.html)
- **环境初始化脚本**: [setup-rocky-9.4-ci-env.sh](./setup-rocky-9.4-ci-env.sh)
- **rclone 仓库**: https://github.com/CloneWolf-Jiang/rclone
- **OpenWrt 仓库**: https://github.com/CloneWolf-Jiang/amlogic-s9xxx-openwrt
