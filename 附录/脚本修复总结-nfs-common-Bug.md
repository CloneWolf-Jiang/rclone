# 脚本 Bug 修复总结 - 2026-02-20

**文件**: setup-rocky-9.4-ci-env-v3.1.sh  
**修复范围**: 脚本初始化部分（直接 dnf 调用）  
**修复内容**: 包名错误（1 处）  
**更新版本**: v3.2.1  

---

## 🔧 修复项目清单

### Item 1: 可选库安装部分的 nfs-common 包名错误

**位置**: 第 194-201 行的 OPTIONAL_PACKAGES 数组  
**问题**: Ubuntu 包名 `nfs-common` 出现在 Rocky 系统的直接 dnf 调用中  
**修复**: 改为 Rocky 正确的包名 `nfs-utils`

```bash
# ❌ 修复前
"nfs-common:NFS client support"

# ✅ 修复后
"nfs-utils:NFS client support"
```

**原因**: 该代码段直接调用 `dnf install`，不经过 apt-get wrapper，所以必须使用 Rocky 的正确包名。

---

## 📊 脚本架构中的两层包管理

理解这个修复需要明白脚本中的两个不同的包管理层：

### 第 1 层: 脚本初始化（直接 dnf）
```bash
[setup-rocky-9.4-ci-env-v3.1.sh]
    ↓
[直接 dnf install nfs-utils]  ← 必须使用 Rocky 包名
    ↓
[系统包安装]
```

**特点**:
- ✅ 在脚本运行时执行
- ✅ 在 Rocky 本地系统上执行
- ❌ JSON 映射表对其无效
- ✅ 必须使用 Rocky 正确包名

**影响的代码**:
- ESSENTIAL_PACKAGES（第 147 行）- 由于 dnf 有内置别名机制，大多数包名可工作
- REQUIRED_LIBS（第 167 行）- 都是 Rocky 正确包名
- OPTIONAL_PACKAGES（第 194 行）- **这里有 nfs-common 的 Bug**
- verify-env 脚本（第 723 行）- 都是 Rocky 正确包名
- fix-env 脚本（第 866 行）- 都是 Rocky 正确包名

### 第 2 层: GitHub Actions Workflow（apt-get wrapper）
```bash
[.github/workflows/build.yml]
    ↓
apt-get install libfuse-dev nfs-common ...
    ↓
[apt-get wrapper 拦截]
    ↓
[JSON 映射表查询]
    libfuse-dev → fuse3-devel
    nfs-common → nfs-utils
    ↓
[dnf install fuse3-devel nfs-utils ...]
    ↓
[Rocky 系统包安装]
```

**特点**:
- ✅ 在 GitHub Actions 工作流运行时执行
- ✅ 使用 Ubuntu 包名（由 workflow 指定）
- ✅ JSON 映射表在这里发挥作用
- ✅ 支持 Ubuntu 语法，自动转换为 Rocky 包名

**影响的代码**:
- GitHub Actions workflow 中的 "Install Libraries on Linux" 步骤

---

## ✅ 修复前后对比

### 修复前的问题

运行脚本时的日志：
```
=== 安装可选库和工具 ===

⚠️  libfdt-devel (libfdt development files) 已安装
✅ fuse3-devel (FUSE 3 development files) 已安装
✅ btrfs-progs (btrfs filesystem tools) 已安装
✅ rpm (RPM package manager) 已安装
⚠️  nfs-common (NFS client support) 安装失败（可选）
   ^ 这个报错是因为 Rocky 中没有 nfs-common 包
```

### 修复后的预期结果

运行脚本时的日志：
```
=== 安装可选库和工具 ===

✅ libfdt-devel (libfdt development files) 已安装
✅ fuse3-devel (FUSE 3 development files) 已安装
✅ btrfs-progs (btrfs filesystem tools) 已安装
✅ rpm (RPM package manager) 已安装
✅ nfs-utils (NFS client support) 已安装
   ^ 修复后正确安装
```

---

## 🎯 为什么修复这个 Bug？

### 三个理由

1. **脚本一致性**
   - 其他部分（verify-env、fix-env）都使用 Rocky 正确包名
   - OPTIONAL_PACKAGES 应该保持一致
   - 避免混淆维护人员

2. **功能完整性**
   - NFS 工具在实际工作流中需要用到
   - 修复前无法正确安装，可能导致后续问题
   - 修复后环境更完整

3. **故障预防**
   - GitHub Actions 工作流中使用 nfs-common
   - apt-get wrapper 会将其转换为 nfs-utils
   - 但本地测试或其他场景可能需要直接使用 nfs-utils
   - 确保本地环境与生产环境一致

---

## 🔄 修复对不同场景的影响

### 场景 1: 直接在 Rocky 运行器上运行 setup 脚本

```
前: ⚠️  nfs-common 安装失败，NFS 工具未安装
后: ✅ nfs-utils 安装成功，NFS 工具可用
```

### 场景 2: GitHub Actions 工作流

```
工作流代码: sudo apt-get install nfs-common
   ↓
apt-get wrapper: 查询映射表 → nfs-common → nfs-utils
   ↓
dnf install nfs-utils  ✅ 成功（setup 脚本已确保安装）
```

### 场景 3: verify-env 验证

```
修复前: 
  ❌ nfs-utils: MISSING
  (因为 setup 脚本中用的是 nfs-common，其实际无法安装)

修复后:
  ✅ nfs-utils: Installed
  (setup 脚本现在正确安装了 nfs-utils)
```

---

## 📋 修复检查清单

运行修复后的脚本，应该看到：

- [ ] setup 脚本成功运行完毕
- [ ] 可选库部分不再显示 nfs-common 安装失败警告
- [ ] NFS 工具已安装: `rpm -q nfs-utils` 返回包版本号
- [ ] JSON 映射表已创建: `cat /opt/actions-runner/compat-scripts/package-map.json | jq ._version`
- [ ] 映射表包含 nfs-common 映射: `jq '.["nfs-common"]' /opt/actions-runner/compat-scripts/package-map.json` 返回 "nfs-utils"

---

## 🚀 实施建议

1. **立即应用**: 将修复后的脚本重新部署到 Rocky 运行器
2. **验证**: 运行一次 setup 脚本，确认日志输出符合预期
3. **测试**: 运行 GitHub Actions 工作流，确认库安装步骤无警告
4. **文档**: 将此修复记录添加到版本历史

---

## 📚 关联文档

| 文档 | 内容 |
|-----|------|
| [setup-rocky-9.4-ci-env-v3.1.sh](setup-rocky-9.4-ci-env-v3.1.sh) | 已修复的脚本 |
| [Bug修复说明-nfs-common-to-nfs-utils.md](Bug修复说明-nfs-common-to-nfs-utils.md) | 详细的 Bug 分析 |
| [JSON映射表-v3.2.1-更新说明.md](JSON映射表-v3.2.1-更新说明.md) | JSON 配置更新 |
| [RUN-22220002065-错误分析报告.md](RUN-22220002065-错误分析报告.md) | 原始错误背景 |
| [升级总结-v3.2-to-v3.2.1.md](升级总结-v3.2-to-v3.2.1.md) | 版本升级信息 |

