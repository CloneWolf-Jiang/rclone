# GitHub Actions 构建失败修复指南
## "sudo: apt-get: 找不到命令" 问题分析与解决方案

**日期:** 2026-02-20  
**问题 ID:** logs_57995866230  
**系统:** Rocky Linux 9.7 Self-hosted Runner

---

## 📋 问题诊断

### 错误信息
```
2026-02-20T07:54:01.2233744Z sudo: apt-get：找不到命令
2026-02-20T07:54:01.2256031Z ##[error]Process completed with exit code 1.
```

### 失败步骤
- **任务:** `Install Libraries on Linux`
- **时间:** 构建执行之初 (Git checkout 之后)
- **命令:** `sudo apt-get update && sudo apt-get install -y fuse3 libfuse-dev ...`

### 根本原因分析
v3.0脚本有以下问题的组合：

#### ❌ 问题 1: apt-get包装器位置不可靠
```bash
# v3.0 脚本
cat > /usr/local/bin/apt-get << 'EOF'
...
EOF

# GitHub Actions 运行环境中的PATH
# 可能是: /opt/actions-runner:/opt/actions-runner/bin:/usr/bin:/usr/sbin:...
# /usr/local/bin **不保证** 包含在PATH中
```

#### ❌ 问题 2: 验证方式不完整
```bash
# v3.0 脚本的验证
export PATH=/usr/local/bin:$PATH  # ← 只在脚本执行时生效
if /usr/local/bin/apt-get --version &>/dev/null 2>&1; then
    print_success "apt-get wrapper 可用"  # ← 验证通过
fi
```
**问题:** 脚本执行时验证通过，但当GitHub Actions启动新的shell时，$PATH会被重置！

#### ❌ 问题 3: 没有系统级别的PATH永久配置
v3.0脚本只是临时设置了环境变量，没有在系统配置中持久化PATH设置。

---

## 📊 问题时序图

```
时间点 1: 用户运行 v3.0 脚本
  ↓
  script设置: export PATH=/usr/local/bin:$PATH
  ↓
  脚本验证: apt-get --version ✅ (成功)
  ↓
时间点 2: GitHub Actions runner启动
  ↓
  PATH被重置为系统默认: /usr/bin:/sbin:... (不包含/usr/local/bin)
  ↓
时间点 3: 工作流程执行 "Install Libraries on Linux"
  ↓
  执行: sudo apt-get update
  ↓
  系统查找 apt-get: 搜索PATH中的所有目录
  ↓
  结果: ❌ 找不到 (/usr/local/bin不在PATH中)
  ↓
  错误: sudo: apt-get: 找不到命令
```

---

## ✅ 解决方案对比

### 方案 A: 快速热修复 (立即可用)
**文件:** `quick-fix-apt-get.sh`

```bash
sudo bash quick-fix-apt-get.sh
```

**原理:**
- 将apt-get包装器从 `/usr/local/bin` 移到 `/usr/bin`
- `/usr/bin` 通常 **始终** 在系统PATH中
- GitHub Actions能够找到该命令

**优势:**
- ✅ 快速 (仅修改apt-get位置)
- ✅ 立即生效
- ✅ 无需完整重新配置

**步骤:**
```bash
# 在Rocky runner上执行
sudo bash quick-fix-apt-get.sh

# 输出应为:
# ✅ apt-get 包装器已创建在 /usr/bin
# ✅ apt-get 命令可用
# ✅ apt-get 路径: /usr/bin/apt-get
```

### 方案 B: 完整重新配置 (推荐长期使用)
**文件:** `setup-rocky-9.4-ci-env-v3.1.sh`

```bash
sudo bash setup-rocky-9.4-ci-env-v3.1.sh
```

**改进点:**
- ✅ apt-get直接创建在 `/usr/bin` (而非 `/usr/local/bin`)
- ✅ 保留所有v3.0的功能 (CRB + EPEL仓库配置)
- ✅ 改进的验证逻辑
- ✅ 备份符号链接

**优势:**
- ✅ 一劳永逸
- ✅ 包含最新的所有修复
- ✅ 更完善的系统配置

**步骤:**
```bash
# 在Rocky runner上执行
sudo bash setup-rocky-9.4-ci-env-v3.1.sh

# 脚本会:
# 1. 检查系统 (Rocky 9.7)
# 2. 配置CRB仓库
# 3. 安装EPEL
# 4. 安装所有必需包
# 5. 创建apt-get包装器在 /usr/bin
# 6. 验证所有工具
```

### 方案 C: 最小化修复 (仅修复apt-get)
如果已经成功运行过v3.0，可以仅执行这一行命令：

```bash
# 创建 /usr/bin/apt-get (覆盖v3.0版本)
sudo cp /usr/local/bin/apt-get /usr/bin/apt-get || {
    # 如果/usr/local/bin/apt-get不存在，则创建新的
    sudo bash -c 'cat > /usr/bin/apt-get << "EOF"
#!/bin/bash
COMMAND="$1"
shift
case "$COMMAND" in
    update) dnf clean all -y && dnf makecache -y ;;
    install) dnf install -y "$@" ;;
    remove|purge) dnf remove -y "$@" ;;
    autoremove) dnf autoremove -y "$@" ;;
    clean) dnf clean all -y ;;
    --version) echo "apt-get wrapper v3.1"; dnf --version ;;
    *) dnf "$COMMAND" "$@" ;;
esac
EOF'
}
sudo chmod +x /usr/bin/apt-get

# 验证
which apt-get
apt-get --version
```

---

## 🔧 详细修复步骤

### 步骤 1: 登录Rocky Runner
```bash
# 连接到你的Rocky 9.7 runner服务器
ssh user@rocky-runner-ip

# 或者，如果是本地，直接打开终端
```

### 步骤 2: 选择修复方案

#### 🟢 推荐: 完整修复 (v3.1脚本)
```bash
# 下载或准备v3.1脚本
cd /path/to/rclone/附录

# 执行脚本
sudo bash setup-rocky-9.4-ci-env-v3.1.sh

# 输出应包含:
# ✅ CRB 仓库已启用
# ✅ EPEL 仓库已安装
# ✅ apt-get 包装器已创建在 /usr/bin
# ✅ apt-get wrapper 可用
```

#### 🟡 快速修复 (快速热修复脚本)
```bash
sudo bash quick-fix-apt-get.sh

# 输出应为:
# ✅ apt-get 包装器已创建在 /usr/bin
# ✅ apt-get 命令可用
# ✅ apt-get 路径: /usr/bin/apt-get
```

### 步骤 3: 验证修复
```bash
# 测试 apt-get 可用性
which apt-get
# 输出: /usr/bin/apt-get

# 测试 apt-get 功能
apt-get --version
# 输出: apt-get wrapper v3.1 for Rocky Linux
#       dnf version X.X.X

# 测试能否在sudo下执行
sudo apt-get --version
# 应该成功测试系统PATH中是否包含 /usr/bin
echo $PATH | grep -q "/usr/bin" && echo "✅ /usr/bin在PATH中" || echo "❌ /usr/bin不在PATH中"
```

### 步骤 4: 验证GitHub Actions
```bash
# 1. 提交修改 (如果修改了脚本)
git add 附录/setup-rocky-9.4-ci-env-v3.1.sh 附录/quick-fix-apt-get.sh
git commit -m "fix: 修复apt-get包装器位置问题 (v3.1)"

# 2. 推送到远程
git push origin main

# 3. 手动触发GitHub Actions
# 在GitHub界面: Actions → 选择工作流 → Run workflow

# 4. 监控构建日志
# 关注: "Install Libraries on Linux" 步骤
# 应该看到:
# sudo modprobe fuse         ✅
# sudo chmod 666 /dev/fuse   ✅
# sudo apt-get update        ✅ (现在应该可用)
# sudo apt-get install ...   ✅
```

---

## 📋 预期结果

修复后，GitHub Actions日志应该显示：

### ✅ 修复前 (v3.0)
```
2026-02-20T07:54:01.0852818Z [36;1msudo apt-get update[0m
2026-02-20T07:54:01.2233744Z sudo: apt-get：找不到命令      ❌ 错误
2026-02-20T07:54:01.2256031Z ##[error]Process completed with exit code 1.
```

### ✅ 修复后 (v3.1 或 快速修复)
```
2026-02-20T07:54:01.0852818Z [36;1msudo apt-get update[0m
2026-02-20T07:54:01.1234567Z Reading package lists... Done    ✅ 成功
2026-02-20T07:54:01.5678901Z Processing triggers...           ✅ 成功
2026-02-20T07:54:01.9012345Z [36;1msudo apt-get install -y fuse3 libfuse-dev...[0m
2026-02-20T07:54:02.2345678Z Setting up fuse3...              ✅ 成功
```

---

## 🚨 故障排除

### 问题: 执行脚本后仍然显示 "apt-get: 找不到命令"

**可能原因 1: PATH在GitHub Actions环境中被重置**
```bash
# 检查runner的shell PATH
sudo -u runner bash -c 'echo $PATH'
# 应该包含 /usr/bin

# 如果不包含，可以在GitHub Actions工作流中添加:
- name: Set PATH for apt-get
  run: |
    echo "PATH=/usr/bin:$PATH" >> $GITHUB_ENV
```

**可能原因 2: apt-get包装器权限不正确**
```bash
# 检查权限
ls -la /usr/bin/apt-get
# 应该显示: -rwxr-xr-x (755)

# 修复权限
sudo chmod 755 /usr/bin/apt-get
```

**可能原因 3: apt-get包装器内容损坏**
```bash
# 检查内容
cat /usr/bin/apt-get | head -20
# 应该显示 bash 脚本头

# 重新创建
sudo bash quick-fix-apt-get.sh
```

### 问题: 脚本执行成功但其他依赖包安装失败

**可能原因: 仓库配置不完整**
```bash
# 检查已启用的仓库
sudo dnf repolist enabled | grep -E "crb|epel"

# 如果缺少:
sudo dnf config-manager --set-enabled crb -y
sudo dnf install -y epel-release
sudo dnf makecache -y
```

---

## 📚 相关文件清单

| 文件 | 用途 | 建议 |
|------|------|------|
| `setup-rocky-9.4-ci-env-v3.0.sh` | 原始脚本 (有apt-get路径问题) | 已过时，不推荐 |
| `setup-rocky-9.4-ci-env-v3.1.sh` | 改进脚本 (apt-get改到/usr/bin) | ✅ 推荐 |
| `quick-fix-apt-get.sh` | 快速热修复脚本 | ✅ 立即修复 |
| `Rocky9.7-真实仓库解决方案.md` | 仓库配置文档 | 参考 |
| `setup脚本v3.0-重大改进说明.md` | v3.0改进说明 | 已过时 |

---

## 🎯 推荐行动清单

- [ ] 1. 在Rocky runner上执行修复脚本:
  - 选项 A (推荐): `sudo bash setup-rocky-9.4-ci-env-v3.1.sh`
  - 选项 B (快速): `sudo bash quick-fix-apt-get.sh`

- [ ] 2. 验证修复:
  ```bash
  which apt-get  # 应显示 /usr/bin/apt-get
  apt-get --version  # 应成功
  ```

- [ ] 3. 重新运行 GitHub Actions:
  - 在GitHub界面触发 Re-run
  - 监控 "Install Libraries on Linux" 步骤
  - 验证包安装成功

- [ ] 4. 验证构建成功:
  - 检查 "Build rclone" 步骤
  - 验证 "Run tests" 步骤完成
  - 确认二进制文件生成

- [ ] 5. 文档更新:
  - [ ] 将v3.1脚本加入部署文档
  - [ ] 标记v3.0为已过时
  - [ ] 添加快速修复说明到README

---

## 📞 技术支持

如有任何非标的问题，请检查:
1. Rocky 系统版本 (应为 9.4 或更高)
2. DNF 仓库配置 (CRB + EPEL)
3. 网络连接 (包下载可用性)
4. 权限配置 (runner用户sudoers)
5. GitHub Actions runner 状态 (服务运行中)

---

**文档版本:** v1.0  
**最后更新:** 2026-02-20  
**状态:** 待验证
