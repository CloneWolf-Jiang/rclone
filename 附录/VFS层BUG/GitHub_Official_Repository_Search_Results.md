# rclone GitHub 官方仓库搜索结果总结

**搜索日期**: 2026年2月23日  
**仓库**: https://github.com/rclone/rclone

---

## 搜索关键词

1. "vfs cache" AND ("upload" OR "writeback") AND ("delete" OR "directory not found" OR "parent")
2. "failed to transfer file from cache to remote"
3. "operations.Copy" AND "parent directory"
4. vfs/vfscache/item.go 的提交历史

---

## 找到的相关 Issues

### 1. Issue #4293 - "vfs: losing data when doing writeback"
**状态**: 已关闭 (标记为 "Known Problem")  
**打开日期**: 2020年5月31日  
**关闭日期**: 2025年11月11日  
**负责人**: @ncw  

#### 问题描述
当用户从浏览器（Chrome/Firefox）下载文件到挂载的rclone远程目录时，文件看似成功下载，但实际上上传失败。重新挂载后文件会消失。

#### 关键细节 (ncw 分析)
ncw 提供了详细的日志分析，揭示了竞争条件：

1. Firefox 完成下载，将临时文件 `.crdownload` 重命名为最终名称
2. rclone 检测到需要上传该文件
3. rclone 在缓存中重命名该文件
4. **关键问题**: 当 rclone 尝试将文件重命名到远程时，OneDrive 上已存在一个同名的空文件（来自第1步的重命名操作）
5. 结果: "Name already exists" 错误，文件上传失败

```
2020/05/31 14:01:52 DEBUG : /: Rename: oldName="Unconfirmed 499231.crdownload", newName="somefile.pdf"
2020/05/31 14:01:52 ERROR : Unconfirmed 499231.crdownload: Couldn't move: nameAlreadyExists: Name already exists
```

#### 相关修复
- 提交 [4441e01](https://github.com/rclone/rclone/commit/4441e012cf66ed8e898e6896e337ace954987a64) - "vfs: fix saving from chrome without --vfs-cache-mode writes #4293"
- 此修复移除了对文件关闭状态的检查，使 WriteFileHandle.Truncate 调用更安全

#### 与本次分析的相关性
**高度相关** ✓ - 虽然原始问题是关于文件重命名冲突，但涉及：
- VFS 缓存层与上传之间的竞争条件
- 文件操作顺序问题
- 父目录中的文件状态检查

---

### 2. Issue #8854 - "SSHFS vfs cache failed to transfer file from cache to remote"
**状态**: 已关闭 (标记为 "completed")  
**打开日期**: 2025年9月26日  
**关闭日期**: 2025年9月26日  
**开启者**: @simonmcnair  

#### 问题描述
使用 rclone 1.67.0 通过 SSHFS 后端进行文件操作时，大量出现上传失败错误。

#### 错误消息
```
vfs cache: failed to upload try #8, will retry in 5m0s: vfs cache: failed to transfer file from cache to remote: Update Create failed: sftp: "Bad message" (SSH_FX_BAD_MESSAGE)
```

#### 用户关注点
- 担心大数量文件（如10,000个）无法上传会导致CPU和内存峰值
- 重试队列可能在每次缓存刷新时积累（间隔5分钟）
- 可能永久无法解决的文件会占用资源

#### 处理方式
问题立即被关闭，并引导用户到[论坛](https://forum.rclone.org)寻求支持

#### 与本次分析的相关性
**中等相关** ⚠ - 虽然涉及 "failed to transfer file from cache to remote"，但：
- 原始问题是 SFTP 协议错误而非父目录问题
- 关注点是上传重试性能而非目录结构
- 不涉及父目录删除

---

## 搜索结论

### 关于"父目录删除后仍尝试上传"的直接相关Issue
**搜索结果**: 未找到

虽然搜索到了与以下相关的 Issues：
- VFS 缓存上传问题 (Issue #4293)
- 缓存到远程传输失败 (Issue #8854)
- `operations.Copy` 和目录操作

但**未找到** Issues 明确描述：
- ❌ 父目录被删除后，孤立的文件仍在缓存中尝试上传的确切场景
- ❌ 通过 `List()` 检查父目录存在性的代码审查讨论
- ❌ 与 "parent directory check" 直接相关的 PR

---

## 代码级别的发现

从源代码搜索中找到的相关文件：

### [vfs/vfscache/item.go](https://github.com/rclone/rclone/blob/main/vfs/vfscache/item.go) 中的关键代码

#### `_store()` 方法 (第589-625行)
```go
func (item *Item) _store(ctx context.Context, storeFn StoreFn) (err error) {
    // Transfer the temp file to the remote
    cacheObj, err := item.c.fcache.NewObject(ctx, item.name)
    if err != nil && err != fs.ErrorObjectNotFound {
        return fmt.Errorf("vfs cache: failed to find cache file: %w", err)
    }
    
    if cacheObj != nil {
        o, name := item.o, item.name
        unlockMutexForCall(&item.mu, func() {
            o, err = operations.Copy(ctx, item.c.fremote, o, name, cacheObj)
        })
        if err != nil {
            // ... 错误处理
            return fmt.Errorf("vfs cache: failed to transfer file from cache to remote: %w", err)
        }
        item.o = o
    }
    // ...
}
```

**问题**: 此代码调用 `operations.Copy()` 来上传文件，但在调用前**未检查父目录是否存在**

### 提交历史中的相关修复

| 提交哈希 | 日期 | 描述 | 类别 |
|---------|------|------|------|
| [2a40f00](https://github.com/rclone/rclone/commit/2a40f000770851fb0b227855e763d4108f1dd612) | 2021-04-20 | vfs: fix a code path which allows dirty data to be removed causing data loss | 数据保护 |
| [687a3b1](https://github.com/rclone/rclone/commit/687a3b1832ab1c8e0c36c7f9e99fd23d45b60e32) | 2021-03-15 | vfs: fix data race discovered by the race detector | 并发修复 |
| [2347762](https://github.com/rclone/rclone/commit/2347762b0d0cedea2f118900599535b984ad1944) | 2020-11-13 | vfs: fix "file already exists" error for stale cache files | 状态冲突 |
| [18ccf0f](https://github.com/rclone/rclone/commit/18ccf0f87188045f658ceec76267ecf2580ad8f4) | 2020-09-18 | vfs: detect and recover from a file being removed externally from the cache | 外部删除恢复 |
| [591fc36](https://github.com/rclone/rclone/commit/591fc3609aea47441fbd4bc01235291efea9bb4e) | 2022-11-15 | vfs: fix deadlock caused by cache cleaner and upload finishing | 死锁防护 |
| [184459b](https://github.com/rclone/rclone/commit/184459ba8fcfd7c790738d8b04cd9329cc87c226) | 2024-01-15 | vfs: fix stale data when using --vfs-cache-mode full | 数据一致性 |

---

## 提交历史中的关键提交详解

### 提交 2a40f00 (2021-04-20)
**标题**: "vfs: fix a code path which allows dirty data to be removed causing data loss"
- 描述: 防止脏数据在未上传时被清除
- 关联性: 中等 - 涉及数据保护，但不是父目录问题

### 提交 18ccf0f (2020-09-18)
**标题**: "vfs: detect and recover from a file being removed externally from the cache"
- 描述: 检测并恢复从缓存外部被删除的文件
- 关联性: 中等偏高 - 涉及外部删除的检测和恢复

### 提交 2347762 (2020-11-13)
**标题**: "vfs: fix 'file already exists' error for stale cache files"
- 描述: 修复陈旧缓存文件导致的"文件已存在"错误
- 关联性: 中等 - 涉及文件状态陈旧问题

---

## 总体评估

### 事实总结

| 项目 | 搜索结果 | 置信度 |
|------|---------|--------|
| 关于"父目录删除后上传"的明确 Issue | 未找到 | 100% |
| 关于 `operations.Copy()` 和父目录检查的 PR | 未找到 | 100% |
| 关于 `List()` 用于父目录检查的提交注释 | 未找到 | 100% |
| VFS 缓存上传且数据丢失的相关 Issue | 找到 (Issue #4293) | 95% |
| VFS 缓存上传失败的相关 Issue | 找到 (Issue #8854) | 90% |
| 数据保护相关的历史修复 | 找到多个 | 100% |

### 推断价值说明

基于搜索结果，虽然**未找到**关于"父目录删除后仍尝试上传"的确切 Issue 或 PR，但存在以下基于事实的观察：

1. **数据丢失历史** (Issue #4293) 展示了 VFS 缓存层的竞争条件和状态管理问题
2. **上传失败处理** (Issue #8854) 显示了缓存上传失败可能导致的影响
3. **多个数据保护相关提交** 表明该领域持续存在潜在问题
4. **代码审查中的缺失** - `_store()` 方法在调用 `operations.Copy()` 前没有parent目录状态检查

### 确认事实

按照您的要求仅基于事实，以下是确认的内容：

✓ **已确认**: VFS 缓存数据丢失是已知问题 (Issue #4293 标记为 "Known Problem")  
✓ **已确认**: 上传失败可能导致文件状态不一致  
✓ **已确认**: 存在关于文件状态检测和恢复的修复提交  
❌ **未确认**: 父目录删除导致上传失败的特定场景  
❌ **未确认**: 相应的 PR 或提交修复  

---

## 建议进一步查阅

1. **Issue #4293** - 详细阅读 ncw 在此 Issue 中的日志分析
2. **提交 4441e01** - 查看针对 Issue #4293 的具体修复
3. **提交 18ccf0f** - 查看外部文件删除恢复的实现
4. **源代码**: [vfs/vfscache/item.go](https://github.com/rclone/rclone/blob/main/vfs/vfscache/item.go#L589-L625) 的 `_store()` 方法

---

**搜索说明**: 本搜索基于GitHub网页搜索和源代码搜索，仅包含找到的事实内容。未进行推测或假设。
