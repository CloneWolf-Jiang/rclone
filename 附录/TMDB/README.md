# 🎬 TMDB 电视剧重命名工具 - Web 版本

**现代化的图形界面电视剧文件管理工具，完全替代命令行版本**

![Status](https://img.shields.io/badge/Status-Ready-green?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.6+-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## 📦 项目结构

```
附录/TMDB/
├── tmdb-renamer.py                # ⭐ 主程序（Web服务器）
├── static/
│   ├── index.html                 # HTML前端页面
│   ├── css/
│   │   └── style.css              # 样式表
│   └── js/
│       └── app.js                 # 前端交互脚本
├── config/
│   └── config.conf                # 配置文件（自动生成）
├── tmdb_config.json               # API配置示例
├── requirements-tmdb.txt          # Python依赖
├── 快速启动.bat                    # Windows启动脚本
├── 快速启动.sh                     # Linux/Mac启动脚本
├── Web版使用说明.md               # 详细使用文档
└── README.md                      # 本文件
```

---

## ✨ 核心特性

| 功能 | 说明 |
|------|------|
| 🎨 **Web界面** | 美观现代化的HTML5界面，无需命令行 |
| 🌐 **TMDB集成** | 直接连接TMDB API获取正确的剧集信息 |
| 📁 **目录树** | 实时展示原文件和修改预览 |
| 🔍 **格式识别** | 智能识别多种季集格式，支持自定义正则 |
| 🛡️ **安全预览** | 修改前完整预览，零风险 |
| 🔐 **加密存储** | API密钥加密保存在本地 |
| ⚡ **快速启动** | 双击脚本即可启动（Windows/Linux/Mac） |
| 📊 **批量操作** | 一次处理多个文件 |
| 📝 **详细日志** | 完整的操作记录 |

---

## 🚀 3步快速开始

### 1️⃣ 获取 API 密钥（免费）

https://www.themoviedb.org/settings/api

### 2️⃣ 选择启动脚本

**Windows:**
```
双击 快速启动.bat，选择电视剧文件夹
```

**Linux/Mac:**
```bash
chmod +x 快速启动.sh
./快速启动.sh ~/TV/Breaking\ Bad 8000
```

**或使用Python直接启动：**
```bash
python tmdb-renamer.py "D:\TV\Breaking Bad" 8000
```

### 3️⃣ 打开浏览器

```
http://localhost:8000
```

---

## 📖 使用流程

```
1. 设置API密钥 → 左上角输入并保存
                ↓
2. 搜索电视剧 → 输入名称并选择
                ↓
3. 分析文件格式 → 自动识别或自定义正则
                ↓
4. 选择文件 → 从目录树选择需要重命名的文件
                ↓
5. 预览操作 → 查看原文件名和新文件名对应关系
                ↓
6. 执行重命名 → 点击确认并完成操作
```

---

## 🎯 核心功能详解

### 1. API密钥配置

```
左侧面板 → API密钥配置
├─ 输入TMDB API密钥
├─ 点击"保存API密钥"
└─ 密钥自动加密存储到 ./config/config.conf
```

**密钥加密方式：** XOR + Base64（本地加密，服务仅在localhost运行）

### 2. 电视剧搜索

```
左侧面板 → 搜索电视剧
├─ 输入电视剧名称
├─ 点击搜索获取TMDB结果
└─ 选择正确的电视剧（显示上映年份）
```

### 3. 文件名格式识别

```
左侧面板 → 文件名格式识别
├─ 输入示例文件名：Breaking Bad S01E01.mkv
├─ 自动识别格式：
│  ├─ S##E## 标准格式（优先级1）
│  ├─ ##x## X格式（优先级2）
│  └─ ##.## 点号格式（优先级3）
└─ 支持手动输入正则表达式
```

### 4. 目录树浏览

```
中间面板
├─ 左侧：原始文件树（点击选择）
├─ 右侧：修改预览（自动更新）
└─ 支持"显示所有文件"切换
```

### 5. 预览与执行

```
下方面板
├─ 文件列表（显示原名→新名）
├─ 全选/取消选择
└─ 点击"开始重命名"→确认→执行
```

---

## 🔧 API接口列表

| 端点 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 主页面 |
| `/api/directory-tree` | GET | 获取目录树 |
| `/api/search-series` | GET | 搜索电视剧 |
| `/api/get-episodes` | GET | 获取剧集列表 |
| `/api/preview-rename` | GET | 预览重命名结果 |
| `/api/extract-format` | POST | 分析文件名格式 |
| `/api/save-api-key` | POST | 保存API密钥 |
| `/api/get-api-key` | GET | 获取密钥状态 |
| `/api/rename-files` | POST | 执行重命名 |

---

## 📋 支持的文件格式

### 视频格式

- `.mkv` (Matroska)
- `.mp4` (MPEG-4)
- `.avi` (Audio Video Interleave)
- `.mov` (QuickTime)
- `.flv` (Flash Video)
- `.wmv` (Windows Media Video)
- `.webm` (WebM)
- `.m4v` (MPEG-4 Voice Notes)

### 识别的季集格式

| 格式 | 示例 | 识别为 |
|------|------|--------|
| 标准 | `S01E01` | S01E01 |
| 小写 | `s01e01` | S01E01 |
| X格式 | `1x01` | S01E01 |
| 点号 | `1.01` | S01E01 |
| 连字符 | `1-01` | S01E01 |
| 自定义 | 任何正则 | 自定义 |

---

## 📝 输出命名规范

遵循TMDB标准格式：

```
SeriesName S{Season:02d}E{Episode:02d} - Episode Name.ext
```

**示例：**

```
Breaking Bad S01E01 - Pilot.mkv
Breaking Bad S05E16 - Felina.mkv
The Office S09E23 - Finale.mp4
Better Call Saul S06E13 - Saul Gone.mkv
```

---

## 🔐 安全特性

- ✅ API密钥加密存储在本地 `./config/config.conf`
- ✅ 服务仅绑定到 `localhost`（本地访问）
- ✅ 修改前完整预览（零风险）
- ✅ 完整的操作日志记录
- ✅ 文件冲突检测（防止覆盖）
- ✅ 原始文件扩展名保留

---

## 📊 系统要求

| 要求 | 说明 |
|------|------|
| Python | 3.6 或更高版本 |
| 依赖 | requests |
| 内存 | 最低 512MB |
| 网络 | 需访问 api.themoviedb.org |
| 浏览器 | 现代浏览器（Chrome、Firefox、Edge等） |
| 操作系统 | Windows、Linux、macOS |

---

## 📥 安装步骤

### 前置要求

```bash
# 1. 检查Python版本
python --version    # Windows / macOS
python3 --version   # Linux

# 2. 如果没有Python，访问：
# https://www.python.org/downloads/
```

### 安装依赖

```bash
# 方式1：使用requirements文件
pip install -r requirements-tmdb.txt

# 方式2：直接安装
pip install requests
```

### 启动服务

```bash
# Windows - 双击快速启动.bat 或命令行:
python tmdb-renamer.py "D:\TV\Breaking Bad" 8000

# Linux/Mac - 终端运行:
python3 tmdb-renamer.py ~/TV/Breaking\ Bad 8000
```

然后打开浏览器访问：`http://localhost:8000`

---

## 📂 配置文件

### 位置
```
./config/config.conf
```

### 自动生成
第一次运行时自动创建，无需手动配置。

### 内容
```json
{
  "api_key": "加密的TMDB API密钥"
}
```

---

## 🐛 常见问题解决

### ❓ "未找到 Python"

**解决：**
```bash
# Windows
python --version

# Linux/Mac
python3 --version

# 未找到时：访问 https://www.python.org/downloads/
```

### ❓ "ImportError: No module named 'requests'"

**解决：**
```bash
pip install requests
# 或
pip install -r requirements-tmdb.txt
```

### ❓ "找不到电视剧"

**解决步骤：**
1. 在 https://www.themoviedb.org 搜索验证名称
2. 尝试英文名称
3. 尝试原始名称（如日文名）
4. 检查API密钥是否有效

### ❓ "无法重命名文件"

**解决步骤：**
1. 检查文件是否被占用（关闭视频播放器）
2. 检查目录权限（需要写权限）
3. 检查是否有同名文件
4. 查看日志文件 `tmdb_renamer.log`

### ❓ "预览不显示"

**解决步骤：**
1. 确保已选择电视剧
2. 检查文件名是否含季集编号
3. 尝试手动输入正则表达式
4. 检查示例文件名格式

---

## 📝 日志查看

### 日志位置
```
./tmdb_renamer.log
```

### 查看方式

**Windows PowerShell：**
```powershell
Get-Content tmdb_renamer.log -Tail 50
Get-Content tmdb_renamer.log -Wait  # 实时
```

**Linux/Mac 终端：**
```bash
tail -50 tmdb_renamer.log
tail -f tmdb_renamer.log  # 实时
```

### 日志内容
- 服务启动/停止
- API请求
- 文件操作
- 错误信息

---

## ⚠️ 注意事项

1. **备份重要文件** - 重命名前建议备份
2. **检查预览** - 执行前仔细检查预览结果
3. **网络连接** - 需要互联网访问TMDB
4. **权限检查** - 确保有目录写权限
5. **特殊字符** - 某些特殊命名可能无法自动识别

---

## 🆚 与命令行版本的对比

| 特性 | 命令行版 | Web版 |
|------|--------|------|
| 界面类型 | 终端命令 | 图形化Web |
| 易用度 | 中 | 高 |
| 功能完整性 | 完整 | 完整+ |
| 预览效果 | 文本 | 可视 |
| 文件管理 | 列表 | 目录树 |
| 使用学习 | 需要 | 直观 |

---

## 🎓 技术栈

### 后端
- **框架：** Python 3.6+ + `http.server`
- **API客户端：** requests
- **加密：** XOR + Base64
- **特点：** 无外部依赖，内置HTTP服务

### 前端
- **标记：** HTML5
- **样式：** 现代CSS3（响应式）
- **交互：** 原生JavaScript（无框架）
- **特点：** 轻量级，快速响应

---

## 📚 更多资源

| 资源 | 链接 |
|------|------|
| 详细使用说明 | [Web版使用说明.md](Web版使用说明.md) |
| TMDB官网 | https://www.themoviedb.org/ |
| TMDB API | https://www.themoviedb.org/settings/api |
| Python文档 | https://docs.python.org/3/ |

---

## 🔄 更新日志

### v1.0 (2026-02-28)
- 🎉 首个Web版本发布
- ✨ 完整的图形化界面
- 🌐 TMDB API集成
- 📱 响应式设计
- 🔐 加密配置存储
- ⚡ 快速启动脚本
- 🎨 现代化UI

---

## 📞 获取帮助

1. **查看本文档** - 大多数问题都有说明
2. **阅读使用说明** - [Web版使用说明.md](Web版使用说明.md)
3. **检查日志** - `tmdb_renamer.log` 包含详细信息
4. **TMDB支持** - https://www.themoviedb.org/

---

## 📄 许可证

MIT License - 自由使用、修改、分发

---

## 🙏 致谢

- TMDB API - The Movie Database
- Python 社区
- 所有使用者的反馈

---

**版本：** 1.0  
**发布日期：** 2026年2月28日  
**最后更新：** 2026年2月28日

---

### 快速开始命令

```bash
# Windows
快速启动.bat

# Linux/Mac
./快速启动.sh ~/TV/Breaking\ Bad 8000

# 通用
python tmdb-renamer.py /path/to/tv 8000
```

然后访问：`http://localhost:8000`

🎬 **现在就开始组织你的电视剧库吧！**
