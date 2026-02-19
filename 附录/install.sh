#!/bin/bash
# ==============================
# 完全无人值守部署 GitHub Self-hosted Runner
# Rocky Linux 9 / 裸机
# ==============================

# ------------------------------
# ⚠️ 前提条件 1：GitHub Personal Access Token (PAT)
# ------------------------------
# 1. 登录你的 GitHub 账户
# 2. 打开仓库页面 → Settings → Developer settings → Personal access tokens → Tokens (classic)
# 3. 点击 "Generate new token" → "Generate new token (classic)"
# 4. 选择有效期（例如 30 天）
# 5. 勾选权限：
#      - repo (Full control of private repositories)
#      - admin:repo_hook (管理仓库 webhook)
# 6. 生成 token 并复制到下面的 GITHUB_PAT 变量
# ⚠️ 注意：这个 token 会被脚本用于自动注册 Runner，请妥善保管
GITHUB_PAT="YOUR_PERSONAL_ACCESS_TOKEN"

# ------------------------------
# 配置参数
# ------------------------------
GITHUB_REPO="CloneWolf-Jiang/rclone"       # 仓库完整名 user/repo
RUNNER_NAME="Rocky-KVM"                     # Runner 名称
RUNNER_LABELS="self-hosted,Linux,X64,label-1"
WORK_DIR="_work"
RUNNER_PATH="/opt/actions-runner"
RUNNER_VERSION="2.331.0"
RUNNER_USER="runner"

# ------------------------------
# 安装依赖
# ------------------------------
sudo dnf install -y tar gzip curl git wget lttng-ust libicu zlib openssl krb5-libs bash-completion jq

# ------------------------------
# 创建用户和目录
# ------------------------------
sudo useradd -m -s /bin/bash $RUNNER_USER 2>/dev/null || echo "$RUNNER_USER 用户已存在"
sudo mkdir -p $RUNNER_PATH
sudo chown $RUNNER_USER:$RUNNER_USER $RUNNER_PATH

# ------------------------------
# 下载 Runner
# ------------------------------
cd $RUNNER_PATH
sudo -u $RUNNER_USER wget -q https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz
sudo -u $RUNNER_USER tar xzf actions-runner-linux-x64-$RUNNER_VERSION.tar.gz

# ------------------------------
# 获取 GitHub 注册 token
# ------------------------------
REG_TOKEN=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$GITHUB_REPO/actions/runners/registration-token \
  | jq -r .token)

if [ -z "$REG_TOKEN" ] || [ "$REG_TOKEN" == "null" ]; then
  echo "❌ 获取 Runner 注册 token 失败，请检查 GITHUB_PAT 和网络"
  exit 1
fi

echo "✅ 获取 Runner 注册 token 成功"

# ------------------------------
# 配置 Runner
# ------------------------------
sudo -u $RUNNER_USER bash -c "
cd $RUNNER_PATH
./config.sh --url https://github.com/$GITHUB_REPO \
            --token $REG_TOKEN \
            --name $RUNNER_NAME \
            --labels $RUNNER_LABELS \
            --work $WORK_DIR \
            --unattended \
            --replace
"

# ------------------------------
# 安装 systemd 服务并启动
# ------------------------------
sudo -u $RUNNER_USER bash -c "
cd $RUNNER_PATH
./svc.sh install
./svc.sh start
"

# ------------------------------
# 完成
# ------------------------------
echo "==============================================="
echo "✅ Self-hosted Runner 部署完成"
echo "查看状态： sudo systemctl status actions.runner.$RUNNER_NAME.service"
echo "在 GitHub 仓库 Actions 页确认 Runner Online"
echo "==============================================="
