# Alist Backend — Changelog

2026-02-17
- 已实现：调整 `Fs.Copy` / `Fs.Move` 错误映射
  - 在后端明确返回不支持的场景（HTTP 400 / 501）时，返回 `fs.ErrorCantCopy` / `fs.ErrorCantMove`，以便 rclone core 回退到客户端实现。
  - 保持 `403` 映射为 `fs.ErrorDirExists`（目标已存在冲突）。
- 已实现：在元数据路径尽量填充 MD5
  - 在 `readMetaData` 中读取 `/api/fs/get` 的返回并填充 `o.md5`（如果 `HashInfo` 存在）。
  - 在 `Object.Update` 的回退分支（`uploadResp.Data == nil`）使用 `/api/fs/get` 获取元数据并填充 `o.md5`（如果可用）。
  - 在 `List` 时把 `item.HashInfo` 复制到 `File.FileHash`，以便 `newObjectWithInfo` 能使用它填充 `o.md5`。

说明：这些修改基于仓库中对 `backend/alist` 现有实现的最小变更原则，目的是让 core 能够更好地区分“后端不支持”和“临时错误”的语义，并尽量在单文件查询路径填充哈希信息以支持 `track-renames` 与完整性检查。
