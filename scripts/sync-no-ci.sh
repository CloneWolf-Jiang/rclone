echo "Committing: $COMMIT_MSG"
echo "Pushing to remote..."
echo "Done: pushed with message '$COMMIT_MSG'"
#!/usr/bin/env bash
set -e

AMEND=false
if [ "$1" = "--amend" ] || [ "$1" = "-a" ]; then
  AMEND=true
  shift
fi

MSG="$*"
if [ -z "$MSG" ]; then
  read -p "提交信息: " MSG
fi

COMMIT_MSG="$MSG [skip ci]"

echo "正在暂存更改..."
git add -A

if [ "$AMEND" = true ]; then
  echo "使用 --amend 修改上一次提交： $COMMIT_MSG"
  git commit --amend -m "$COMMIT_MSG" || { echo "git commit --amend 失败"; exit 1; }
else
  echo "正在提交： $COMMIT_MSG"
  git commit -m "$COMMIT_MSG" || { echo "没有可提交的更改或提交失败。"; exit 0; }
fi

echo "正在推送到远程..."
git push

echo "完成：已推送，提交信息为 '$COMMIT_MSG'"
