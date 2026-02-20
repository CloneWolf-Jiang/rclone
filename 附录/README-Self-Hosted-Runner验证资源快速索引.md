# Self-Hosted Runner 官方验证资源 - 快速索引

**总结**: 本目录包含GitHub官方关于self-hosted runner（特别是docker形式）部署验证的完整资源  
**日期**: 2026年2月20日  
**来源**: GitHub官方文档、actions/runner、actions/runner-container-hooks

---

## 📚 文档导航

### 文档清单

| 文件名 | 说明 | 适用场景 |
|--------|------|---------|
| **GitHub-Actions-Self-Hosted-Runner-验证指南.md** | 完整的官方验证指南和最佳实践 | 全面理解runner部署 |
| **Self-Hosted-Runner-验证脚本和命令参考.md** | 快速命令和可执行的bash脚本 | 快速验证或故障排查 |
| **Self-Hosted-Runner-完整YAML工作流文件.md** | 可复制使用的GitHub Actions工作流 | 自动化监控和验证 |
| **README-快速开始.md** | 本文件，快速导航和使用指南 | 快速查找需要的资源 |

---

## 🚀 快速开始

### 对于新安装的Runner：

1. **第一步：验证基础连接**
   ```bash
   cd ~/actions-runner
   ./config.sh --check --url https://github.com/YOUR-ORG/YOUR-REPO --pat YOUR_PAT_TOKEN
   ```
   📖 详见: [验证指南 → Runner网络连接验证](#)

2. **第二步：运行系统检查脚本**
   ```bash
   # 复制Self-Hosted-Runner-验证脚本和命令参考.md中的脚本2.1
   bash verify-runner.sh
   ```
   📖 详见: [验证脚本 → 第2.1节](#)

3. **第三步：测试第一个工作流**
   ```bash
   # 复制完整YAML工作流文件.md中的Section 1
   cp runner-health-check.yml .github/workflows/
   git push  # 触发工作流运行
   ```
   📖 详见: [YAML工作流 → Section 1](#)

### 对于日常运维：

1. **配置自动监控**
   - 使用 `daily-runner-monitoring.yml` 每日检查
   - 使用 `comprehensive-check.yml` 每周深度检查

2. **故障排查**
   - 运行 `runner-diagnostics.yml` 收集诊断信息
   - 查看 [验证指南 → 故障排查和监控](#) 部分

3. **性能优化**
   - 运行 `docker-runner-verification.yml` 检查Docker性能
   - 参考 [验证脚本 → 性能测试](#)

---

## 🔍 按需快速查找

### 我需要...

#### ✅ 验证Runner是否正常运行
**快速命令**:
```bash
cd ~/actions-runner && ./run.sh --version
docker ps
```
📖 **详细指南**: [验证脚本 → 1.1 官方网络连接检查](Self-Hosted-Runner-验证脚本和命令参考.md#11-官方网络连接检查-最重要)

---

#### ✅ 检查Docker是否正常
**快速命令**:
```bash
docker --version
docker ps
docker run --rm alpine echo "Docker works!"
```
📖 **详细指南**: [验证脚本 → 1.2 Docker快速验证](Self-Hosted-Runner-验证脚本和命令参考.md#12-docker快速验证)

---

#### ✅ 诊断网络连接问题
**快速命令**:
```bash
curl -I https://api.github.com
nslookup github.com
ping -c 1 github.com
```
📖 **详细指南**: [验证脚本 → 5. 常见问题快速诊断](Self-Hosted-Runner-验证脚本和命令参考.md#5-常见问题快速诊断)

---

#### ✅ 设置自动化验证工作流
**推荐工作流**: `runner-health-check.yml`  
📖 **详细指南**: [YAML工作流 → Section 1](Self-Hosted-Runner-完整YAML工作流文件.md#1-基础-runner-连接验证工作流)

---

#### ✅ 测试Docker容器功能
**推荐工作流**: `docker-runner-verification.yml`  
📖 **详细指南**: [YAML工作流 → Section 2](Self-Hosted-Runner-完整YAML工作流文件.md#2-docker-容器完整测试工作流)

---

#### ✅ 获取详细的诊断信息
**推荐工作流**: `runner-diagnostics.yml`  
📖 **详细指南**: [YAML工作流 → Section 4](Self-Hosted-Runner-完整YAML工作流文件.md#4-故障排查和诊断工作流)

---

#### ✅ 解决"Docker权限被拒绝"错误
**解决方案**:
```bash
sudo usermod -aG docker runner-username
# 然后重新登录或使用:
newgrp docker
```
📖 **详细指南**: [验证脚本 → "Permission denied..."](Self-Hosted-Runner-验证脚本和命令参考.md#permission-denied-while-trying-to-connect-to-the-docker-daemon-socket)

---

#### ✅ 检查Runner日志
**快速命令**:
```bash
tail -n 100 ~/actions-runner/_diag/Runner_*.log
# 或实时查看:
sudo journalctl -u actions.runner* -f
```
📖 **详细指南**: [验证脚本 → 1.4 Runner服务状态检查](Self-Hosted-Runner-验证脚本和命令参考.md#14-runner服务状态检查-linux-systemd)

---

## 📊 完整资源索引

### GitHub官方来源

| 资源类型 | URL | 说明 |
|---------|-----|------|
| 主仓库 | https://github.com/actions/runner | Runner应用源码 |
| Docker镜像 | https://github.com/orgs/actions/packages/container/package/actions-runner | 官方Docker镜像 |
| 容器Hooks | https://github.com/actions/runner-container-hooks | Docker容器hooks实现 |
| 官方文档 | https://docs.github.com/en/actions/hosting-your-own-runners | Runner完整文档 |
| 构建工作流 | `.github/workflows/build.yml` in actions/runner | 官方CI/CD工作流 |

### 本文档包含的官方示例

#### 配置文件示例:
- ✅ `prepare-job.json` - Runner容器钩子的prepare job配置
- ✅ `run-container-step.json` - Runner容器钩子的run container step配置
- ✅ `extension.yaml` - Kubernetes runner扩展配置示例

#### 工作流示例:
- ✅ `actions/runner` 中的 `build.yml` - 官方Runner构建工作流
- ✅ `actions/runner-container-hooks` 中的 `build.yaml` - 容器hooks构建工作流

#### 脚本示例:
- ✅ `./config.sh --check` - 官方网络连接检查脚本
- ✅ `./svc.sh install` - 官方服务安装脚本
- ✅ 自定义的验证脚本集合 - 基于官方最佳实践

---

## 📋 验证检查清单

### 部署前检查
- [ ] Docker已安装并运行 (`docker ps`)
- [ ] 可以访问GitHub (`curl -I https://api.github.com`)
- [ ] 有足够的磁盘空间 (`df -h`)
- [ ] 网络配置正确 (`nslookup github.com`)

### 部署后检查
- [ ] Runner服务已启动 (`systemctl status actions.runner*`)
- [ ] Runner可以连接GitHub (`./config.sh --check`)
- [ ] Docker可以执行容器 (`docker run --rm alpine echo test`)
- [ ] 卷挂载工作正常 (参考测试脚本)

### 定期检查 (每周)
- [ ] 检查磁盘空间
- [ ] 查看错误日志
- [ ] 验证网络连接
- [ ] 测试至少一个工作流

---

## 🔧 常见任务快速指南

### 任务: 重启Runner Service
```bash
# Linux
sudo systemctl restart actions.runner.OWNER-REPO.RUNNER_NAME.service

# 或使用svc.sh
cd ~/actions-runner
./svc.sh restart

# 或直接运行
./run.sh
```

---

### 任务: 查看最近的运行日志
```bash
cd ~/actions-runner
tail -n 100 _diag/Runner_*.log | tail -50
```

---

### 任务: 清理旧的工作目录
```bash
cd ~/actions-runner/_work
# 列出目录大小
du -sh */ | sort -rh | head

# 删除特定的旧目录 (谨慎操作!)
rm -rf DIRECTORY_NAME
```

---

### 任务: 更新Runner应用
```bash
# Runner通常自动更新，但可以手动检查
cd ~/actions-runner

# 停止当前运行
./run.sh  # 跑到自然结束，或在另一个终端:

# 在另一个终端
cd ~/actions-runner
./config.sh --url https://github.com/YOUR-ORG/YOUR-REPO --token YOUR_TOKEN --replace
```

---

### 任务: 测试特定的工作流
```bash
# 创建简单的测试工作流
cat > .github/workflows/test.yml << 'EOF'
name: Quick Test
on: [workflow_dispatch]
jobs:
  test:
    runs-on: [self-hosted]
    steps:
      - run: echo "Hello from Runner"
EOF

# 推送并在GitHub UI中手动运行
git add .github/workflows/test.yml
git commit -m "Add test workflow"
git push
```

---

## 📞 获取帮助

### 如果遇到问题

1. **第一步**: 查看相关的故障排查部分
   - [验证指南 → 故障排查](#) 
   - [验证脚本 → 常见问题快速诊断](#)

2. **第二步**: 运行诊断工作流
   ```bash
   # 在GitHub UI中手动运行
   Actions → Runner Diagnostics → Run workflow
   ```

3. **第三步**: 检查日志
   - Runner日志: `~/actions-runner/_diag/Runner_*.log`
   - 系统日志: `sudo journalctl -u actions.runner* -n 100`

4. **第四步**: 参考官方资源
   - GitHub官方文档: https://docs.github.com/en/actions/hosting-your-own-runners
   - GitHub Community Discussions: https://github.com/orgs/community/discussions/categories/actions

---

## 版本信息

- **文档版本**: 2.0
- **最后更新**: 2026年2月20日
- **Runner版本**: v2.331.0 (latest)
- **Container Hooks版本**: v0.8.1
- **基础镜像**: ubuntu:24.04 (noble)

---

## 许可和来源

所有内容基于 GitHub 官方开源项目和文档：
- `actions/runner` - [MIT License](https://github.com/actions/runner/blob/main/LICENSE)
- `actions/runner-container-hooks` - [MIT License](https://github.com/actions/runner-container-hooks/blob/main/LICENSE.md)
- GitHub Actions 官方文档 - 根据 GitHub Terms of Service

---

## 下一步建议

1. ✅ **首先阅读**: 选择适合你的场景，读对应的部分
2. ✅ **然后执行**: 运行相应的检查命令或脚本
3. ✅ **最后部署**: 配置自动化工作流进行持续监控
4. ✅ **定期维护**: 按照检查清单定期验证

---

**有问题？** 查看上方的"按需快速查找"部分，或参考原始GitHub官方资源。

**有改进建议？** 本文档将不定期更新以跟上GitHub官方的最新变化。
