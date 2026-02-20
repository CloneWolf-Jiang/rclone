# GitHub Actions Workflow 修改指南

> **针对**: rclone 项目的 `.github/workflows/build.yml`  
> **目的**: 使 workflow 能正确处理 self-hosted Rocky Linux runner 的库依赖  
> **版本**: v3.2+ 兼容性适配

## 🔍 问题诊断

### 当前 build.yml 的问题

在 build.yml 中，有一个库安装步骤：

```yaml
- name: Install Libraries on Linux
  run: |
    sudo apt-get update
    sudo apt-get install -y fuse3 libfuse-dev rpm pkg-config git-annex git-annex-remote-rclone nfs-common
  if: matrix.os == 'ubuntu-latest'
```

**问题**：
- 条件 `if: matrix.os == 'ubuntu-latest'` 检查的是矩阵定义中的 OS 值
- 但实际的 runner 类型不由 `matrix.os` 决定，而由 `runs-on` 决定
- self-hosted runner 上的任务（linux, linux_386, other_os, go1.24）虽然定义了 `matrix.os: ubuntu-latest`，但实际运行在 Rocky Linux 上
- 导致库安装步骤被跳过

### 新的环境验证机制

v3.2+ 脚本提供了两个命令：

```bash
verify-rocky-ci-env    # 检查环境完整性
fix-rocky-ci-env       # 修复缺失的库
```

这些命令可以在 workflow 中使用，以确保环境始终准备完毕。

## ✅ 建议的修改方案

### 方案 1：使用环境验证（推荐）

在 build job 中添加一个新步骤，在任何依赖库的操作之前进行验证：

#### 修改 1.1：在 Setup Go 之后添加验证步骤

```yaml
      - name: Install Go
        uses: actions/setup-go@v6
        with:
          go-version: ${{ matrix.go }}
          check-latest: true

      # 🆕 新增：验证环境
      - name: Verify Rocky Linux CI environment
        run: |
          if [[ -f /etc/os-release ]]; then
            . /etc/os-release
            if [[ "$ID" == "rocky" ]]; then
              echo "::notice::Rocky Linux detected - verifying environment..."
              if command -v verify-rocky-ci-env &>/dev/null; then
                verify-rocky-ci-env || {
                  echo "::warning::Missing dependencies detected - attempting to fix..."
                  fix-rocky-ci-env
                }
              else
                echo "::warning::verify-rocky-ci-env not found, environment may be incomplete"
              fi
            fi
          fi
        continue-on-error: true
        if: runner.os == 'Linux'

      - name: Set environment variables
        run: |
          echo 'GOTAGS=${{ matrix.gotags }}' >> $GITHUB_ENV
          ...
```

### 方案 2：改进库安装步骤的条件（终极方案）

完全替换现有的 "Install Libraries on Linux" 步骤：

```yaml
      - name: Install Libraries on Linux
        run: |
          # 检查系统类型
          if [[ -f /etc/os-release ]]; then
            . /etc/os-release
            if [[ "$ID" == "rocky" ]]; then
              echo "::notice::Rocky Linux detected - using v3.2+ setup"
              
              # 验证环境完整性
              if command -v verify-rocky-ci-env &>/dev/null; then
                echo "Verifying environment..."
                if ! verify-rocky-ci-env; then
                  echo "::warning::Environment verification failed - attempting to fix..."
                  fix-rocky-ci-env || exit 1
                fi
              else
                echo "::warning::verify-rocky-ci-env command not found"
              fi
              exit 0
            fi
          fi
          
          # Ubuntu 环境执行标准安装
          echo "::notice::Ubuntu detected - installing packages..."
          sudo modprobe fuse
          sudo chmod 666 /dev/fuse
          sudo chown root:$USER /etc/fuse.conf
          sudo apt-get update
          sudo apt-get install -y fuse3 libfuse-dev rpm pkg-config git-annex git-annex-remote-rclone nfs-common
        if: matrix.os == 'ubuntu-latest'
```

### 方案 3：使用 runner 检测（最简洁）

```yaml
      - name: Install Libraries on Linux
        run: |
          if [[ "${{ runner.name }}" == "self-hosted" || "${{ runner.name }}" == *"rocky"* ]]; then
            echo "::notice::Self-hosted runner detected - verifying environment..."
            verify-rocky-ci-env || fix-rocky-ci-env
          else
            # Ubuntu 标准安装
            sudo modprobe fuse
            sudo chmod 666 /dev/fuse
            sudo chown root:$USER /etc/fuse.conf
            sudo apt-get update
            sudo apt-get install -y fuse3 libfuse-dev rpm pkg-config git-annex git-annex-remote-rclone nfs-common
          fi
        if: matrix.os == 'ubuntu-latest'
```

## 🔧 逐步实施指南

### 步骤 1：备份 build.yml

```bash
cp .github/workflows/build.yml .github/workflows/build.yml.bak
```

### 步骤 2：选择修改方案

根据你的需求选择上面的某个方案：
- **最佳选择**: 方案 2（最完善，区分 Rocky 和 Ubuntu）
- **快速选择**: 方案 3（最简洁，依赖 runner 名称）
- **保险选择**: 方案 1（非入侵性，仅添加验证）

### 步骤 3：编辑 build.yml

在 IDE 或编辑器中打开 `.github/workflows/build.yml`，找到：

```yaml
      - name: Install Libraries on Linux
        run: |
          sudo modprobe fuse
          ...
```

替换为选定方案中的内容。

### 步骤 4：测试修改

1. **提交变更**
   ```bash
   git add .github/workflows/build.yml
   git commit -m "chore: improve rocky linux build.yml compatibility (v3.2+)"
   git push
   ```

2. **触发 workflow**
   - 推送代码到 GitHub
   - 或在 Actions 标签中手动触发
   - 监控运行日志

3. **验证结果**
   - 检查 linux/linux_386/other_os/go1.24 job 是否成功
   - 查看是否有库缺失的错误
   - 确认 apt-get 命令能正常转换包名

### 步骤 5：监控和优化

如果遇到问题：

```bash
# 在 self-hosted runner 上手动验证
verify-rocky-ci-env

# 如有缺失，修复环境
fix-rocky-ci-env

# 查看 apt-get wrapper 配置
apt-get config-info
```

## 添加的 GitHub Actions 输出

修改后，workflow 日志会显示：

```
::notice::Rocky Linux detected - using v3.2+ setup
Verifying environment...
✅ VERIFICATION PASSED - Environment is complete
```

或者如果需要修复：

```
::warning::Environment verification failed - attempting to fix...
Installing missing packages...
⚠️  Will install: nfs-utils
Running: sudo dnf install -y nfs-utils
...
✅ Installation complete
```

## Lint 和 Android Job 考虑

### Lint Job 补充（可选）

Lint job 也在 self-hosted 运行，建议添加环节验证：

```yaml
  lint:
    ...
    steps:
      - name: Verify Rocky Linux CI environment
        run: |
          if command -v verify-rocky-ci-env &>/dev/null; then
            verify-rocky-ci-env || true
          fi
        continue-on-error: true
        if: runner.os == 'Linux'

      - name: Checkout
        uses: actions/checkout@v6
        ...
```

### Android Job 补充（可选）

Android job 需要额外的工具（NDK），建议：

```yaml
  android:
    ...
    steps:
      - name: Verify Rocky Linux CI environment
        run: |
          echo "Checking Android build dependencies..."
          # 验证基础环境
          verify-rocky-ci-env || true
          
          # 检查 NDK
          if [[ -z "$ANDROID_NDK" ]]; then
            echo "::warning::ANDROID_NDK not set"
          else
            echo "ANDROID_NDK=$ANDROID_NDK"
          fi
        continue-on-error: true
        if: runner.os == 'Linux'

      - name: Checkout
        uses: actions/checkout@v6
        ...
```

## 常见问题排查

### Q: 为什么验证步骤 continue-on-error 设置为 true？

A: 若环境验证失败不应该中断整个 workflow。通过 `continue-on-error: true`，可以：
- 显示警告但继续执行
- 如果后续步骤需要缺失的库会自然失败，错误信息会很清楚
- 避免因验证工具问题导致 workflow 中断

### Q: 如果验证失败该怎么办？

A: 在 self-hosted runner 上手动运行：

```bash
sudo fix-rocky-ci-env
```

或完整过程：

```bash
# 1. 检查环境
verify-rocky-ci-env

# 2. 如果有缺失，修复
sudo dnf install -y <missing_package>

# 3. 重新验证
verify-rocky-ci-env
```

### Q: 如何禁用验证步骤？

A: 在 `.github/workflows/build.yml` 中找到验证步骤，添加 `if: false`：

```yaml
      - name: Verify Rocky Linux CI environment
        if: false  # 禁用此步骤
        run: |
          ...
```

## 总结

通过以上修改：

✅ Rocky Linux runner 的库依赖会被正确处理  
✅ Ubuntu 的标准流程保持不变  
✅ 环境问题会显示清晰的警告  
✅ 维护人员可快速排查问题  

**推荐实施时间表**:
1. 立即：备份 build.yml 并应用方案 2
2. 24 小时：监控 workflow 运行结果
3. 如有问题：通过 `fix-rocky-ci-env` 修复
4. 验证成功后：可考虑应用到 lint 和 android job

---

**相关文档**:
- [补充兼容性分析报告.md](补充兼容性分析报告.md)
- [README-v3.2.md](README-v3.2.md)
- [快速参考-JSON配置.md](快速参考-JSON配置.md)
