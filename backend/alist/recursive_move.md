# Alist `/api/fs/recursive_move`（聚合移动）知识记录

目的：记录 Alist 提供的聚合目录移动接口的用法、历史问题与对 rclone 后端实现的建议。

概览
- 路径：`POST /api/fs/recursive_move`
- 主要用途：在服务端将一个目录（及其子内容）整体移动到目标目录（server-side 递归移动），避免客户端逐文件复制+删除以提高性能与保持原子性（视后端实现而定）。
- 认证：需要 `Authorization` 头（Alist token）。

请求示例

JSON Body:

```json
{
  "src_dir": "/path/to/source",
  "dst_dir": "/path/to/dest"
}
```

响应
- 成功：HTTP 200，返回 {"code":200,"message":"success","data":null}
- 失败：可能返回 4xx/5xx，历史上已报告过 500 错误（如 storage not found / dst dir not found），以及在较早实现中移动会覆盖目标已有文件的行为。

重要历史与实现细节
- Apifox 文档（公开 API 文档）列出了该接口及其基本参数（`src_dir` / `dst_dir`）。参见：https://alist-public.apifox.cn/327955423e0
- 早期版本问题：社区 issue 报告 `recursive_move` 在某些驱动/配置会返回 500（参见 issue #6891），以及默认会覆盖目标已有文件（issue #7382）。
- 覆盖行为修正：已通过 PR #7868（merged 2025-01-27）新增 `overwrite` 选项以防止非预期覆盖（参见 PR https://github.com/AlistGo/alist/pull/7868 和合并提交 258b8f5）。因此在较新版本中可以传入或使用 `overwrite` 控制覆盖语义（需要确认具体请求字段名与 Apifox 文档的最新版本）。

常见错误与语义
- 500 错误：通常是运行时或配置问题（storage 未找到、目标目录不存在等），并非接口语义本身；在实现调用前应确保 storage/driver/路径在后端可访问。
- 覆盖冲突：在没有 `overwrite` 控制的实现里，移动会覆盖目标已有文件；在支持 `overwrite` 的版本应明确传参或检查返回错误以决定是否回退或报错。

对 rclone `backend/alist` 的建议
1. 能力探测：在决定使用 `/api/fs/recursive_move` 前，检测后端版本或首次调用时探测行为（比如在安全测试目录上调用并检查结果），或读取 API 文档（若可用）以查看是否支持 `overwrite`。
2. 请求构造：调用时提供 `Authorization` 头；当存在覆盖风险时，在支持的后端上使用 `overwrite=false`（或等价字段）以避免意外数据丢失，或在用户明确允许覆盖时设置为 `true`。
3. 错误映射：
   - 如果请求被后端明确拒绝或返回“不支持此操作”的语义，应返回 `fs.ErrorCantDirMove`，让 rclone 回退为逐文件复制+删除。
   - 如果返回冲突（例如 403 或明确提示目标已存在），返回 `fs.ErrorDirExists` 以让 core 执行上层冲突策略。
   - 如果返回 5xx 或临时网络错误，采用重试策略（已由 pacer/shouldRetry 处理），但对持续错误记录详细日志并回退到客户端策略。
4. 安全措施：对生产目录移动操作尽量在可控范围内先做小规模验证；在调用前确保目标父目录存在（或创建），并在需要时使用 `overwrite` 控制或提前备份。

参考
- Alist 公共 API（Apifox）：https://alist-public.apifox.cn/327955423e0
- Issue: `mkdir and recursive_move API always return 500 error` (#6891) https://github.com/AlistGo/alist/issues/6891
- Issue: `recursive_move 会覆盖已经存在的文件` (#7382) https://github.com/AlistGo/alist/issues/7382
- PR: feat(recursive-move): add `overwrite` option (#7868) https://github.com/AlistGo/alist/pull/7868
- Commit: 258b8f520f467b7f7be7cc18d70f1e86de95f182 (merge of #7868)

记录人：自动化采集（由 rclone 后端审查时请人工复核 API 字段细节与版本兼容性）。
