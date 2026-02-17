const vscode = require('vscode');
const path = require('path');

function activate(context) {
  let disposable = vscode.commands.registerCommand('sync-no-ci.sync', async function () {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage('未打开工作区，无法运行 Sync (no CI)');
      return;
    }
    const root = folders[0].uri.fsPath;
    const isWin = process.platform === 'win32';

    let scriptPath;
    if (isWin) {
      // use PowerShell script
      scriptPath = path.join(root, 'scripts', 'sync-no-ci.ps1');
      // ensure backslashes for powershell
      scriptPath = scriptPath.replace(/\\/g, '\\');
    } else {
      scriptPath = path.join(root, 'scripts', 'sync-no-ci.sh');
    }

    const terminal = vscode.window.createTerminal({ name: '仅同步(不构建)' });
    terminal.show();

    const cmd = isWin
      ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`
      : `bash "${scriptPath}"`;

    terminal.sendText(cmd, true);
  });

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
