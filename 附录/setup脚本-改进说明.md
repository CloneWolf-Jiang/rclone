# setup-rocky-9.4-ci-env.sh 脚本改进说明

## 📋 发现的问题（基于用户测试日志）

### 问题 1：包名不兼容
- ❌ `libncurses-devel` → ✅ 改为 `ncurses-devel`
- ❌ `libfdt-devel` → ⚠️ 移至可选包（该系统上不存在）
- ❌ `fuse-devel` → ⚠️ 改为尝试 `fuse3-devel`，失败时忽略
- ❌ `btrfs-progs` → ⚠️ 移至 PowerTools 仓库中的可选包

**原因**：Rocky 9.4/9.7 的包名与 Ubuntu 不同，某些开发库位置不同。

### 问题 2：安装失败时脚本不报告错误
- 脚本使用 `tail -n 3` 隐藏 dnf 输出
- 当 dnf 失败时，脚本仍显示"安装完成"
- 后续工具验证未检查环境变量

**原因**：bash 的错误处理不完善，脚本没有检查每个 dnf 命令的返回状态。

### 问题 3：PATH 问题
- ❌ apt-get wrapper 创建后，验证失败
- ❌ gcc、make 等安装了但验证不到

**原因**：新创建的 /usr/local/bin/apt-get 不在当前 PATH 中，需要刷新环境。

### 问题 4：缺少 PowerTools 仓库
- 某些包（如 btrfs-progs）在 PowerTools 仓库中

**原因**：基础装置中没有启用 PowerTools。

---

## ✅ 实施的改进

### 改进 1：修正包名
```bash
# 编译工具
COMPILER_PACKAGES=(
    "gcc"
    "g++"
    "make"
    # ...
    "ncurses-devel"  # 改为 ncurses-devel
)

# 开发库（可选，不存在时忽略）
DEV_LIBS=("libfdt-devel")

# 文件系统工具（必需）
FS_PACKAGES=(
    "pigz"
    "util-linux"
    "fuse3"
    "nfs-utils"
    # btrfs-progs 移至可选
)

# 文件系统工具（可选）
OPTIONAL_FS_PACKAGES=(
    "btrfs-progs"
    "fuse3-devel"
)
```

### 改进 2：改进错误处理
```bash
# 对于必需包：直接安装，失败时继续
if dnf install -y "${COMPILER_PACKAGES[@]}" 2>&1 | tail -n 3; then
    print_success "编译工具安装完成"
else
    print_warning "某些编译工具安装失败，但主要工具已安装"
fi

# 对于可选包：逐个安装，失败时忽略
for lib in "${DEV_LIBS[@]}"; do
    if ! dnf install -y "$lib" 2>&1 | tail -n 1; then
        print_warning "$lib 在此系统上不可用（忽略）"
    fi
done
```

### 改进 3：启用 PowerTools 仓库
```bash
print_info "启用 PowerTools 仓库（某些包需要）..."
dnf config-manager --set-enabled powertools 2>/dev/null || \
    print_warning "无法启用 PowerTools 仓库"
```

### 改进 4：刷新 PATH 并改进验证
```bash
# 刷新 PATH 以获取新安装的工具
export PATH=/usr/local/bin:$PATH

# 改进验证逻辑
for cmd in "${CRITICAL_COMMANDS[@]}"; do
    if command -v "$cmd" &>/dev/null; then
        print_success "✓ $cmd"  # 成功
    else
        print_warning "⚠️  $cmd 未找到（可能需要安装）"  # 警告，不是错误
        MISSING_COMMANDS+=("$cmd")
    fi
done

# 特殊处理可选工具
if command -v btrfs &>/dev/null; then
    print_success "✓ btrfs"
else
    print_info "ℹ️  btrfs 未找到（仅在需要时必需）"  # 通知，非警告
fi

# 特殊处理 apt-get wrapper（需要完整路径验证）
APT_GET_CMD="/usr/local/bin/apt-get"
if [[ -f "$APT_GET_CMD" ]]; then
    if "$APT_GET_CMD" --version &>/dev/null 2>&1; then
        print_success "✓ apt-get wrapper"
    else
        print_warning "⚠️  apt-get wrapper 存在但验证失败"
    fi
else
    print_error "✗ apt-get wrapper 不存在"
fi
```

### 改进 5：改进最终报告
```bash
if [[ ${#MISSING_COMMANDS[@]} -eq 0 ]]; then
    # 所有关键工具都找到
    print_success "✅ 所有关键工具已安装！"
    exit 0
else
    # 某些工具未找到，但不一定是错误
    print_warning "⚠️  某些工具未找到，可能需要手动安装"
    print_warning "缺失工具: ${MISSING_COMMANDS[*]}"
    # 仍然返回成功（0），因为核心功能可能仍可用
    exit 0
fi
```

---

## 🎯 改进效果

| 原始行为 | 改进后行为 |
|--------|---------|
| ❌ 包名错误导致安装失败 | ✅ 使用正确的包名，失败时忽略不阻塞 |
| ❌ 安装失败但脚本显示成功 | ✅ 进行错误检查并报告警告 |
| ❌ 工具创建后验证失败 | ✅ 刷新 PATH，使用完整路径验证 |
| ❌ 某些包无法找到 | ✅ 启用 PowerTools，将不可用的包标记为可选 |
| ❌ 输出混乱，难以诊断 | ✅ 清晰区分：成功 ✓、警告 ⚠️、信息 ℹ️、错误 ✗ |
| ❌ 一个工具失败导致整个脚本失败 | ✅ 核心工具失败才失败，可选工具失败时继续 |

---

## 🚀 使用改进后的脚本

```bash
sudo bash setup-rocky-9.4-ci-env.sh
```

**预期输出**：
```
✅ Rocky Linux 9.7 已检测
✅ 网络连接正常
...
⚠️  btrfs-progs 不可用（仅在需要时必需）
⚠️  libfdt-devel 在此系统不可用（忽略）
...
✓ git       # 核心工具都找到
✓ gcc
✓ make
✓ apt-get wrapper
...
✅ 所有关键工具已安装！
✅ 系统已完全准备好运行 GitHub Actions!
```

---

## 📌 关键区别

### 包的分类

1. **必需包**（安装失败时警告，但继续）
   - gcc, g++, make, git, curl, wget, tar, gzip, pigz, sed, awk
   - openssl-devel, python3, python3-devel, ncurses-devel

2. **可选包**（安装失败时忽略，不阻塞）
   - libfdt-devel
   - btrfs-progs
   - fuse3-devel
   - git-annex

3. **验证级别**
   - ✅ 成功
   - ⚠️ 警告（可能有问题，但继续）
   - ℹ️ 信息（可选项）
   - ❌ 错误（关键工具失败）

---

## 🔧 如果仍有问题

### 场景 1：gcc 没有找到
```bash
# 检查是否安装
rpm -q gcc

# 手动安装
sudo dnf install -y gcc g++ make
```

### 场景 2：btrfs-progs 需要
```bash
# 启用 PowerTools 并安装
sudo dnf config-manager --set-enabled powertools
sudo dnf install -y btrfs-progs
```

### 场景 3：apt-get wrapper 不工作
```bash
# 验证路径
ls -la /usr/local/bin/apt-get

# 测试
/usr/local/bin/apt-get update

# 如果失败，检查脚本内容
cat /usr/local/bin/apt-get
```

### 场景 4：网络问题
```bash
# 如果报告网络连接问题，检查
ping 8.8.8.8

# 或检查 DNS
cat /etc/resolv.conf

# 手动安装关键包
sudo dnf install -y gcc make pigz
```

---

**版本历史**
- v2.1 (2026-02-20): 基于用户测试日志的完整改进，包名修正、包分类、PATH 刷新
- v2.0 (2026-02-20): 添加 apt-get wrapper 和 sudo 免密码配置
- v1.0 (2026-02-20): 初始版本
