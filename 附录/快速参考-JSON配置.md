# 快速参考 - JSON 配置操作

## 📍 配置文件位置

```bash
/opt/actions-runner/compat-scripts/package-map.json      # 包名映射表
/opt/actions-runner/compat-scripts/ignore-packages.json  # 忽略列表
```

## 🔍 常用命令

### 查看配置

```bash
# 查看 apt-get wrapper 当前加载的配置
apt-get config-info

# 查看映射表
jq . /opt/actions-runner/compat-scripts/package-map.json

# 查看忽略列表
jq . /opt/actions-runner/compat-scripts/ignore-packages.json

# 只看映射关系（不含元数据）
jq 'to_entries[] | select(.key | startswith("_") | not) | "\(.key) → \(.value)"' \
  /opt/actions-runner/compat-scripts/package-map.json

# 只看忽略的包
jq '.ignore[]' /opt/actions-runner/compat-scripts/ignore-packages.json
```

### 验证配置

```bash
# 检查 JSON 语法是否正确
jq . /opt/actions-runner/compat-scripts/package-map.json
jq . /opt/actions-runner/compat-scripts/ignore-packages.json

# 如果输出美化的 JSON，说明正确；否则显示 "parse error"
```

### 编辑配置

```bash
# 使用你喜欢的编辑器编辑（nano/vi/vim/sed 等）
nano /opt/actions-runner/compat-scripts/package-map.json
nano /opt/actions-runner/compat-scripts/ignore-packages.json

# 编辑后验证 JSON 格式
jq . /opt/actions-runner/compat-scripts/package-map.json
```

## 📋 JSON 格式示例

### package-map.json

```json
{
  "_version": "3.2",
  "_comment": "Ubuntu → Rocky Linux 包名映射表",
  "libfuse-dev": "fuse3-devel",
  "nfs-common": "nfs-utils",
  "pkg-config": "pkgconf-pkg-config",
  "你的包": "对应的rocky包"
}
```

### ignore-packages.json

```json
{
  "_version": "3.2",
  "_comment": "忽略列表 - Rocky 中不可用的包",
  "ignore": [
    "git-annex",
    "git-annex-remote-rclone",
    "其他不支持的包"
  ]
}
```

## ⚙️ jq 查询速查表

```bash
# 查询特定包的映射
jq '.libfuse-dev' /opt/actions-runner/compat-scripts/package-map.json

# 检查某包是否在忽略列表中
jq '.ignore | index("git-annex")' /opt/actions-runner/compat-scripts/ignore-packages.json

# 获取所有键（包括元数据）
jq 'keys' /opt/actions-runner/compat-scripts/package-map.json

# 获取所有值
jq '.[] | select(type == "string")' /opt/actions-runner/compat-scripts/package-map.json

# 添加新映射（通过 jq 修改）
jq '.openssh_client = "openssh-clients"' /opt/actions-runner/compat-scripts/package-map.json

# 从元数据中排除显示（只看实际映射）
jq 'to_entries[] | select(.key | startswith("_") | not)' /opt/actions-runner/compat-scripts/package-map.json
```

## 🔄 脚本重新运行时的行为

| 情况 | 行为 | 结果 |
|------|------|------|
| 首次运行 | 创建默认配置文件 | 生成 package-map.json 和 ignore-packages.json |
| 重新运行，版本一致 | 保留现有文件 | 配置文件不变 |
| 重新运行，版本不同 | 智能合并 | `*.bak` 备份 + 合并新增项 |

## 🆘 故障排除

### JSON 解析失败

**问题**: 编辑后 `jq` 命令报错 `parse error`

**原因**: JSON 格式不正确（缺少逗号、引号不匹配等）

**解决**:
```bash
# 查找错误行
jq . /opt/actions-runner/compat-scripts/package-map.json 2>&1

# 使用编辑器修复，确保：
# 1. 所有字符串用双引号 ""
# 2. 属性间用逗号分隔
# 3. 最后一个属性后面没有逗号
# 4. 大括号 {} 和中括号 [] 匹配
```

### 包没有被转换

**问题**: `apt-get install libfuse-dev` 但仍然安装失败

**排查**:
```bash
# 检查映射是否存在
jq '.libfuse-dev' /opt/actions-runner/compat-scripts/package-map.json

# 如果返回 null，需要添加映射
```

### 包应该跳过但没跳过

**问题**: `apt-get install git-annex` 还是尝试安装

**排查**:
```bash
# 检查是否在忽略列表
jq '.ignore[] | select(. == "git-annex")' /opt/actions-runner/compat-scripts/ignore-packages.json

# 如果没有输出，需要添加到忽略列表
```

## 💡 实用技巧

### 批量添加映射（使用 jq）

```bash
# 添加多个新映射
jq '. + {
  "openssh-client": "openssh-clients",
  "build-essential": "gcc",
  "curl": "curl"
}' /opt/actions-runner/compat-scripts/package-map.json > /tmp/new_map.json && \
mv /tmp/new_map.json /opt/actions-runner/compat-scripts/package-map.json
```

### 导出为用户易读的格式

```bash
# 以表格形式显示所有映射
echo "Ubuntu Package | Rocky Package"
echo "---|---"
jq -r 'to_entries[] | select(.key | startswith("_") | not) | "\(.key) | \(.value)"' \
  /opt/actions-runner/compat-scripts/package-map.json
```

### 定期备份配置

```bash
# 备份到日期标记的文件
cp /opt/actions-runner/compat-scripts/package-map.json \
   /opt/actions-runner/compat-scripts/package-map.json.backup.$(date +%Y%m%d_%H%M%S)
```

---

💡 **提示**: 所有 jq 命令都可以在配置文件直接修改后执行  
🔗 **更多帮助**: 查看 `JSON配置维护指南-v3.2.md`
