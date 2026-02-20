# GitHub Actions Workflow 集成指南（v3.2.1）

**适用于**: rclone 项目在 Rocky Linux 9.4+ 自托管运行器上的编译  
**问题背景**: Run 22220002065 中 libfuse-dev 和 nfs-common 安装失败  
**解决方案**: 在 workflow 中添加诊断和验证步骤

---

## 🎯 建议的集成策略

### 1. 最简单方案：添加诊断步骤（推荐用于开发）

在 `.github/workflows/build.yml` 的"Install Libraries on Linux"步骤前添加：

```yaml
- name: Diagnose apt-get wrapper (Rocky Linux)
  if: runner.os == 'Linux' && !contains(matrix.os, 'ubuntu')
  run: |
    if [[ -f /opt/actions-runner/compat-scripts/apt-get ]]; then
      echo "=== apt-get wrapper 诊断 ==="
      /opt/actions-runner/compat-scripts/apt-get config-info
      echo ""
      echo "=== 关键映射验证 ==="
      jq '.["libfuse-dev","nfs-common","pkg-config"]' /opt/actions-runner/compat-scripts/package-map.json
    else
      echo "⚠️ apt-get wrapper 未找到"
    fi
```

**优点**:
- ✅ 快速添加（3-5 行 YAML）
- ✅ 不需要修改现有 workflow 逻辑
- ✅ 便于调试

**缺点**:
- ❌ 仅在失败时提供信息，无法预防

### 2. 安全方案：添加验证和修复步骤（推荐用于生产）

```yaml
- name: Verify and fix Rocky Linux environment
  if: |
    runner.os == 'Linux' &&
    (matrix.job_name == 'linux' || matrix.job_name == 'linux_386' || matrix.job_name == 'other_os' || matrix.job_name == 'go1.24')
  run: |
    echo "=== Verifying Rocky Linux CI environment ==="
    
    # 1. 检查 apt-get wrapper 是否存在并运行
    if [[ ! -x /opt/actions-runner/compat-scripts/apt-get ]]; then
      echo "⚠️ apt-get wrapper 不可用"
      exit 1
    fi
    
    # 2. 验证 jq 和 JSON 配置文件
    if ! command -v jq &>/dev/null; then
      echo "❌ jq 未安装，无法处理映射表"
      exit 1
    fi
    
    # 3. 验证关键映射
    echo ""
    echo "=== 验证关键包映射 ==="
    
    critical_maps=("libfuse-dev" "nfs-common" "pkg-config")
    failed=0
    
    for pkg in "${critical_maps[@]}"; do
      mapped=$(jq -r ".\"$pkg\" // empty" /opt/actions-runner/compat-scripts/package-map.json)
      if [[ -z "$mapped" ]]; then
        echo "❌ 映射缺失: $pkg"
        ((failed++))
      else
        echo "✅ $pkg → $mapped"
      fi
    done
    
    if [[ $failed -gt 0 ]]; then
      echo ""
      echo "🔧 尝试修复..."
      /opt/actions-runner/compat-scripts/fix-env || true
      exit 1
    fi
    
    echo ""
    echo "✅ 环境验证通过"
  shell: bash
```

**优点**:
- ✅ 主动验证，预防失败
- ✅ 包含自动修复尝试
- ✅ 详细的诊断输出

**缺点**:
- ❌ 增加 workflow 开销（~2-3 秒）
- ❌ 需要定期维护

---

## 📋 完整 workflow 片段示例

将此片段插入 `.github/workflows/build.yml`：

### 位置：在"Install Libraries on Linux"步骤之前

```yaml
jobs:
  build:
    # ... 现有配置 ...
    
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        # ... 现有步骤 ...

      - name: Install Go
        uses: actions/setup-go@v6
        # ... 现有步骤 ...

      - name: Set environment variables
        run: |
          # ... 现有代码 ...
      
      # ============= 新增：Rocky Linux 诊断步骤 =============
      - name: Verify Rocky Linux apt-get wrapper
        if: runner.os == 'Linux' && (matrix.job_name == 'linux' || matrix.job_name == 'linux_386' || matrix.job_name == 'other_os' || matrix.job_name == 'go1.24')
        run: |
          echo "=== Rocky Linux 环境验证 ==="
          
          # 检查 apt-get wrapper 和 JSON 映射表
          if [[ -x /opt/actions-runner/compat-scripts/apt-get ]]; then
            echo "✅ apt-get wrapper 可用"
            
            # 检查关键映射
            echo ""
            echo "=== 关键包映射检查 ==="
            for pkg in "libfuse-dev" "nfs-common" "pkg-config"; do
              result=$(jq -r ".\"$pkg\" // \"MISSING\"" /opt/actions-runner/compat-scripts/package-map.json 2>/dev/null || echo "ERROR")
              if [[ "$result" == "MISSING" || "$result" == "ERROR" ]]; then
                echo "❌ $pkg 映射异常"
              else
                echo "✅ $pkg → $result"
              fi
            done
          else
            echo "⚠️ apt-get wrapper 不可用，workflow 可能会失败"
            /opt/actions-runner/compat-scripts/verify-env || true
          fi
        shell: bash
      
      # ============= 原有步骤继续 =============
      - name: Install Libraries on Linux
        run: |
          sudo modprobe fuse
          sudo chmod 666 /dev/fuse
          sudo chown root:$USER /etc/fuse.conf
          sudo apt-get update
          sudo apt-get install -y fuse3 libfuse-dev rpm pkg-config git-annex git-annex-remote-rclone nfs-common
        if: matrix.os == 'ubuntu-latest'
      
      # ... 其他步骤 ...
```

---

## 🔄 选项 1 vs 选项 2 对比

| 方面 | 诊断步骤 | 验证和修复 |
|-----|--------|----------|
| **设置难度** | ⭐ 简单 | ⭐⭐⭐ 中等 |
| **执行时间** | < 1 秒 | 2-3 秒 |
| **预防能力** | ✅ 可调试 | ✅✅ 更好 |
| **修复能力** | ❌ 无 | ⚠️ 部分 |
| **维护成本** | ✅ 低 | ⚠️ 中等 |
| **推荐场景** | 开发/测试 | 生产运行 |

---

## 🚀 实施步骤

### 第 1 步：更新脚本

1. 用前面提供的 JSON 配置更新 `setup-rocky-9.4-ci-env-v3.1.sh`
2. 在 Rocky 运行器上重新运行：
   ```bash
   sudo bash setup-rocky-9.4-ci-env-v3.1.sh
   ```
3. 验证配置文件已创建：
   ```bash
   cat /opt/actions-runner/compat-scripts/package-map.json | jq ._version
   # 应输出: "3.2.1"
   ```

### 第 2 步：更新 workflow

编辑 `.github/workflows/build.yml`，在"Install Libraries on Linux"步骤前添加诊断步骤。

### 第 3 步：测试

运行工作流（可以通过 `workflow_dispatch` 手动触发），检查：
- ✅ 诊断步骤输出包含映射信息
- ✅ "Install Libraries on Linux"步骤不再显示"未找到匹配的参数"错误
- ✅ 后续的"Build rclone"步骤能找到 fuse.h

### 第 4 步：监视

- 前 5-10 次运行中密切关注日志
- 如果仍有问题，检查诊断输出
- 参考 [RUN-22220002065-错误分析报告.md](RUN-22220002065-错误分析报告.md) 进行调试

---

## 📊 预期改进

### Run 22220002065 之前（失败）

```
linux job:
  - "未找到匹配的参数: libfuse-dev"
  - "未找到匹配的参数: nfs-common"
  - ❌ Build step: "fatal error: fuse.h: No such file or directory"
  - ❌ FAILED in 2m49s
```

### 更新后（预期成功）

```
linux job:
  - ✅ Verify Rocky Linux apt-get wrapper: PASS
    - libfuse-dev → fuse3-devel ✅
    - nfs-common → nfs-utils ✅
    - pkg-config → pkgconf-pkg-config ✅
  - ✅ Install Libraries on Linux: All packages installed
  - ✅ Build rclone: SUCCESS
  - ✅ PASSED
```

---

## 🔧 故障排查

### 问题 1: 诊断步骤输出"apt-get wrapper 不可用"

**解决方案**:
```bash
# SSH 到运行器，检查
ls -la /opt/actions-runner/compat-scripts/apt-get

# 如果不存在，重新运行 setup 脚本
sudo bash setup-rocky-9.4-ci-env-v3.1.sh

# 如果权限问题，修复
sudo chmod +x /opt/actions-runner/compat-scripts/apt-get
```

### 问题 2: 诊断步骤输出"映射缺失"

**解决方案**:
```bash
# 检查 JSON 文件
cat /opt/actions-runner/compat-scripts/package-map.json | jq .

# 检查特定映射
jq '.["libfuse-dev"]' /opt/actions-runner/compat-scripts/package-map.json

# 如果缺失，手动添加
jq '.["libfuse-dev"] = "fuse3-devel"' \
  /opt/actions-runner/compat-scripts/package-map.json \
  > /tmp/map.json && \
  sudo mv /tmp/map.json \
  /opt/actions-runner/compat-scripts/package-map.json
```

### 问题 3: 诊断步骤通过，但仍然安装失败

**可能原因**:
1. apt-get wrapper 在 workflow 中的 PATH 位置不对
2. workflow 使用了不同的 shell 或环境
3. apt-get wrapper 脚本本身有 bug

**调试步骤**:
```bash
# 在诊断步骤中添加
which apt-get
apt-get --version
apt-get config-info

# 测试 wrapper
apt-get install --simulate fuse3 libfuse-dev 2>&1 | head -20
```

---

## 📝 临时禁用 apt-get wrapper 的方法

如果 wrapper 导致问题，可以临时绕过它（用于排查原始问题）：

```bash
# 在 workflow 中
- name: Test with native apt-get
  if: matrix.job_name == 'linux'
  run: |
    # 临时禁用 wrapper
    sudo rm -f /usr/bin/apt-get /usr/local/bin/apt-get
    
    # 安装库（使用系统 apt-get）
    sudo apt-get update
    sudo apt-get install -y fuse3-devel rpm pkgconf-pkg-config nfs-utils
```

**注意**: 这仅用于调试，生产环境中应该保持 wrapper 启用。

---

## 📚 相关文档

- [setup-rocky-9.4-ci-env-v3.1.sh](setup-rocky-9.4-ci-env-v3.1.sh) - 设置脚本
- [JSON映射表-v3.2.1-更新说明.md](JSON映射表-v3.2.1-更新说明.md) - 映射表详解
- [快速参考-映射表维护指南.md](快速参考-映射表维护指南.md) - 快速参考
- [RUN-22220002065-错误分析报告.md](RUN-22220002065-错误分析报告.md) - 原始错误分析
