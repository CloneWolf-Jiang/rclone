#!/bin/bash
# TMDB 电视剧重命名工具 - Linux/Mac 快速启动脚本

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 帮助信息
show_help() {
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  TMDB 电视剧重命名工具 - Web 版本启动脚本                 ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "使用方法:"
    echo "  ./快速启动.sh /path/to/tv/series [port]"
    echo ""
    echo "示例:"
    echo "  ./快速启动.sh ~/TV/Breaking\\ Bad 8000"
    echo "  ./快速启动.sh /media/tv 9000"
    echo ""
    echo "参数说明:"
    echo "  参数1: 电视剧目录路径（必须）"
    echo "  参数2: HTTP服务端口（可选，默认8000）"
    echo ""
}

# 如果没有参数，显示帮助信息
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ 未找到 Python 3${NC}"
    echo ""
    echo "请安装 Python 3:"
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "  macOS: brew install python3"
    echo ""
    exit 1
fi

# 检查 requests
if ! python3 -c "import requests" 2>/dev/null; then
    echo -e "${YELLOW}⏳ 正在安装依赖 requests...${NC}"
    pip3 install requests -q || pip install requests -q
    echo -e "${GREEN}✓ 依赖安装完成${NC}"
    echo ""
fi

# 获取参数
TV_DIR="$1"
PORT="${2:-8000}"

# 验证目录
if [ ! -d "$TV_DIR" ]; then
    echo -e "${RED}✗ 目录不存在: $TV_DIR${NC}"
    exit 1
fi

# 获取绝对路径
TV_DIR="$(cd "$TV_DIR" && pwd)"

# 清屏
clear

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  TMDB 电视剧重命名工具 - Web 版本                          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ 正在启动服务...${NC}"
echo ""
echo -e "📁 处理目录: ${CYAN}$TV_DIR${NC}"
echo -e "🌐 服务端口: ${CYAN}$PORT${NC}"
echo ""
echo -e "🎯 请在浏览器中打开:"
echo -e "   ${CYAN}http://localhost:$PORT${NC}"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

# 切换到脚本目录
cd "$SCRIPT_DIR"

# 启动Python服务
python3 tmdb-renamer.py "$TV_DIR" $PORT
