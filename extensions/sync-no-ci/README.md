# Sync (no CI) VS Code 扩展（本地）

用途：在 Source Control 面板标题栏添加一个按钮 "Sync (no CI)"，点击会在集成终端运行仓库内的 `scripts/sync-no-ci.ps1`（Windows）或 `scripts/sync-no-ci.sh`（Linux/macOS），提交信息会自动附加 `[skip ci]`，从而避免触发 GitHub Actions。
# Sync (no CI) VS Code 扩展（本地）

用途：在 Source Control 面板标题栏添加一个按钮 "Sync (no CI)"，点击会在集成终端运行仓库内的 `scripts/sync-no-ci.ps1`（Windows）或 `scripts/sync-no-ci.sh`（Linux/macOS），提交信息会自动附加 `[skip ci]`，从而避免触发 GitHub Actions。

使用说明：

1. 在 VS Code 中打开本仓库根目录。
2. 在左侧活动栏选择 “运行与调试 (Run and Debug)” 并选择 “启动扩展开发主机 (Launch Extension)”，或直接按 `F5` 启动扩展开发主机。
3. 在新打开的扩展开发窗口中打开 Source Control 面板，你会在标题栏看到 `Sync (no CI)` 按钮（如果当前仓库使用 Git）。
4. 点击按钮会弹出集成终端并运行对应脚本；脚本会提示输入提交信息。

打包与安装：

- 若要把扩展打包并安装到常规 VS Code：需要使用 `vsce` 打包为 `.vsix`，然后通过 `Extensions: Install from VSIX...` 安装。

注意事项：
- 该扩展在本地开发模式下即可使用（更安全、无需发布）。
- 脚本路径假定为仓库根的 `scripts/` 目录，若你修改位置请相应更新 `extension.js`。

用途：在 Source Control 面板标题栏添加一个按钮 "仅同步(不构建)"，点击会在集成终端运行仓库内的 `scripts/sync-no-ci.ps1`（Windows）或 `scripts/sync-no-ci.sh`（Linux/macOS），提交信息会自动附加 `[skip ci]`，从而避免触发 GitHub Actions。
3. 在新打开的扩展主机窗口中打开 Source Control，你会在标题栏看到 `仅同步(不构建)` 按钮（如果当前仓库使用 Git）。
4. 点击按钮会弹出集成终端并运行对应脚本；脚本会提示输入提交信息。
