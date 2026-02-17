package alist

import (
	"fmt"
)

// Error describes an Alist API error response
type Error struct {
	Info struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// Error satisfies the error interface
func (e *Error) Error() string {
	return fmt.Sprintf("%s (Error %d)", e.Info.Message, e.Info.Code)
}

// Alist 原生 API 数据结构

// ListRequest 描述了Alist列表请求
type ListRequest struct {
	Path string `json:"path"` // 要列表的路径
}

// ListResponse 描述了Alist列表响应
type ListResponse struct {
	Code    int    `json:"code"`    // 状态码（200为成功）
	Message string `json:"message"` // 消息
	Data    struct {
		Content []Item `json:"content"` // 目录内容
	} `json:"data"`
}

// GetRequest 描述了 /api/fs/get 的请求体（获取单个文件或目录信息）
type GetRequest struct {
	Path string `json:"path"` // 要查询的完整路径
}

// GetResponse 描述了 /api/fs/get 的响应体
type GetResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    Item   `json:"data"`
}

// Item 描述了Alist中的文件或目录项
type Item struct {
	Name     string `json:"name"`     // 名称
	Size     int64  `json:"size"`     // 大小（字节）
	IsDir    bool   `json:"is_dir"`   // 是否为目录
	Modified string `json:"modified"` // 修改时间戳（字符串或秒数）
	Type     int    `json:"type"`     // 文件类型（数字）
	// 以下字段为可选
	Thumb    string `json:"thumb,omitempty"`     // 缩略图URL
	Provider string `json:"provider,omitempty"`  // 提供者类型
	RawURL   string `json:"raw_url,omitempty"`   // 原始URL
	URL      string `json:"url,omitempty"`       // URL
	Sign     string `json:"sign,omitempty"`      // 签名
	HashInfo string `json:"hash_info,omitempty"` // 哈希信息
	HashType string `json:"hash_type,omitempty"` // 哈希类型
}

// MkdirRequest 描述了Alist创建目录请求
type MkdirRequest struct {
	Path string `json:"path"` // 要创建的目录路径
}

// MkdirResponse 描述了Alist创建目录响应
type MkdirResponse struct {
	Code    int    `json:"code"`    // 状态码（200为成功）
	Message string `json:"message"` // 消息
	Data    Item   `json:"data"`    // 创建的目录信息
}

// OpenDrive 相关数据结构（已弃用，仅保留用于兼容性）

// Account describes an Alist account
type Account struct {
	Username string `json:"username"`
	Password string `json:"passwd"`
	Token    string `json:"token"`
}

// UserSessionInfo 描述了 Alist 的会话信息
type UserSessionInfo struct {
	Username string `json:"username"` // 用户名，用于登录
	Password string `json:"passwd"`   // 密码，用于登录
	Token    string `json:"token"`    // Alist API 返回的认证令牌

	// 以下字段为 OpenDrive 特有，Alist 不需要使用
	// SessionID          string          `json:"SessionID"`          // 会话 ID
	// UserName           string          `json:"UserName"`           // 用户名（全名）
	// UserFirstName      string          `json:"UserFirstName"`      // 用户的名字
	// UserLastName       string          `json:"UserLastName"`       // 用户的姓氏
	// AccType            string          `json:"AccType"`            // 账户类型
	// UserLang           string          `json:"UserLang"`           // 用户语言
	// UserID             string          `json:"UserID"`             // 用户 ID
	// IsAccountUser      json.RawMessage `json:"IsAccountUser"`      // 是否为账户用户（JSON 原始消息）
	// DriveName          string          `json:"DriveName"`          // 驱动器名称
	// UserLevel          string          `json:"UserLevel"`          // 用户级别
	// UserPlan           string          `json:"UserPlan"`           // 用户计划
	// FVersioning        string          `json:"FVersioning"`        // 文件版本控制
	// UserDomain         string          `json:"UserDomain"`         // 用户域名
	// PartnerUsersDomain string          `json:"PartnerUsersDomain"` // 合作用户域名
}

// FolderList 描述了 Alist 的文件夹列表
type FolderList struct {
	Name             string   `json:"Name"`             // 文件夹名称
	ParentFolderID   string   `json:"ParentFolderID"`   // 父文件夹 ID
	DirectFolderLink string   `json:"DirectFolderLink"` // 文件夹的直接链接
	ResponseType     int      `json:"ResponseType"`     // 响应类型
	Folders          []Folder `json:"Folders"`          // 子文件夹列表
	Files            []File   `json:"Files"`            // 文件列表
}

// Folder describes an Alist folder
type Folder struct {
	FolderID      string `json:"FolderID"`      // 文件夹 ID
	Name          string `json:"Name"`          // 文件夹名称
	DateCreated   int    `json:"DateCreated"`   // 创建日期
	DirUpdateTime int    `json:"DirUpdateTime"` // 目录更新时间
	Access        int    `json:"Access"`        // 访问权限
	DateModified  int64  `json:"DateModified"`  // 修改日期
	Shared        string `json:"Shared"`        // 共享状态
	// ChildFolders  int    `json:"ChildFolders"` // 子文件夹数量（Alist 不需要使用）
	Link      string `json:"Link"`      // 文件夹链接
	Encrypted string `json:"Encrypted"` // 加密状态
}

//nolint:unused // 保留给未来的文件夹操作
type createFolder struct {
	SessionID       string `json:"session_id"`        // 会话 ID
	FolderName      string `json:"folder_name"`       // 文件夹名称
	FolderSubParent string `json:"folder_sub_parent"` // 父文件夹 ID
	// FolderIsPublic      int64  `json:"folder_is_public"`      // (0 = 私有, 1 = 公开, 2 = 隐藏) - Alist 不需要使用
	// FolderPublicUpl     int64  `json:"folder_public_upl"`     // (0 = 禁用, 1 = 启用) - Alist 不需要使用
	// FolderPublicDisplay int64  `json:"folder_public_display"` // (0 = 禁用, 1 = 启用) - Alist 不需要使用
	// FolderPublicDnl     int64  `json:"folder_public_dnl"`     // (0 = 禁用, 1 = 启用) - Alist 不需要使用
}

//nolint:unused // 保留给未来的文件夹操作
type createFolderResponse struct {
	FolderID      string `json:"FolderID"`      // 文件夹 ID
	Name          string `json:"Name"`          // 文件夹名称
	DateCreated   int    `json:"DateCreated"`   // 创建日期
	DirUpdateTime int    `json:"DirUpdateTime"` // 目录更新时间
	Access        int    `json:"Access"`        // 访问权限
	DateModified  int    `json:"DateModified"`  // 修改日期
	Shared        string `json:"Shared"`        // 共享状态
	// Description   string `json:"Description"` // 描述（Alist 不需要使用）
	Link string `json:"Link"` // 文件夹链接
}

// moveCopyFolder 描述了移动或复制文件夹的请求
//
//nolint:unused // 保留给未来的文件夹操作
type moveCopyFolder struct {
	SessionID     string `json:"session_id"`      // 会话 ID
	FolderID      string `json:"folder_id"`       // 文件夹 ID
	DstFolderID   string `json:"dst_folder_id"`   // 目标文件夹 ID
	Move          string `json:"move"`            // 是否移动（0 = 复制, 1 = 移动）
	NewFolderName string `json:"new_folder_name"` // 新的文件夹名称
}

// renameFolder 描述了重命名文件夹的请求
//
//nolint:unused // 保留给未来的文件夹操作
type renameFolder struct {
	SessionID  string `json:"session_id"`  // 会话 ID
	FolderID   string `json:"folder_id"`   // 文件夹 ID
	FolderName string `json:"folder_name"` // 新的文件夹名称（最大 255 个字符）
	// SharingID  string `json:"sharing_id"` // 共享 ID - Alist 不需要使用
}

// moveCopyFolderResponse 描述了移动或复制文件夹的响应
//
//nolint:unused // 保留给未来的文件夹操作
type moveCopyFolderResponse struct {
	FolderID string `json:"FolderID"` // 文件夹 ID
	// Name          string `json:"Name"`           // 文件夹名称（OpenDrive 特有，Alist 不需要使用）
	// DateCreated   int    `json:"DateCreated"`    // 创建日期（OpenDrive 特有，Alist 不需要使用）
	// DirUpdateTime int    `json:"DirUpdateTime"`  // 目录更新时间（OpenDrive 特有，Alist 不需要使用）
	// Access        int    `json:"Access"`         // 访问权限（OpenDrive 特有，Alist 不需要使用）
	// DateModified  int    `json:"DateModified"`   // 修改日期（OpenDrive 特有，Alist 不需要使用）
	// Link          string `json:"Link"`           // 文件夹链接（OpenDrive 特有，Alist 不需要使用）
}

// removeFolder 描述了删除文件夹的请求
//
//nolint:unused // 保留给未来的文件夹操作
type removeFolder struct {
	SessionID string `json:"session_id"` // 会话 ID
	FolderID  string `json:"folder_id"`  // 文件夹 ID
}

// File 描述了 Alist 文件
type File struct {
	FileID            string `json:"FileId"`              // 文件 ID
	FileHash          string `json:"FileHash"`            // 文件哈希值
	Name              string `json:"Name"`                // 文件名称
	GroupID           int    `json:"GroupID"`             // 组 ID
	Extension         string `json:"Extension"`           // 文件扩展名
	Size              int64  `json:"Size,string"`         // 文件大小
	Views             string `json:"Views"`               // 浏览次数
	Version           string `json:"Version"`             // 版本
	Downloads         string `json:"Downloads"`           // 下载次数
	DateModified      int64  `json:"DateModified,string"` // 修改日期
	Access            string `json:"Access"`              // 访问权限
	Link              string `json:"Link"`                // 文件链接
	DownloadLink      string `json:"DownloadLink"`        // 下载链接
	StreamingLink     string `json:"StreamingLink"`       // 流媒体链接
	TempStreamingLink string `json:"TempStreamingLink"`   // 临时流媒体链接
	// EditLink          string `json:"EditLink"`        // 编辑链接（Alist 不需要使用）
	// ThumbLink         string `json:"ThumbLink"`       // 缩略图链接（Alist 不需要使用）
	// Password          string `json:"Password"`        // 密码（Alist 不需要使用）
	// EditOnline        int    `json:"EditOnline"`      // 在线编辑（Alist 不需要使用）
}

// moveCopyFile 描述了移动或复制文件的请求
//
//nolint:unused // 保留给未来的文件操作
type moveCopyFile struct {
	SessionID         string `json:"session_id"`          // 会话 ID
	SrcFileID         string `json:"src_file_id"`         // 源文件 ID
	DstFolderID       string `json:"dst_folder_id"`       // 目标文件夹 ID
	Move              string `json:"move"`                // 是否移动（0 = 复制, 1 = 移动）
	OverwriteIfExists string `json:"overwrite_if_exists"` // 是否覆盖已存在的文件（OpenDrive 特有，Alist 不需要使用）
	NewFileName       string `json:"new_file_name"`       // 新的文件名称
}

// moveCopyFileResponse 描述了移动或复制文件的响应
//
//nolint:unused // 保留给未来的文件操作
type moveCopyFileResponse struct {
	FileID string `json:"FileID"` // 文件 ID
	Size   string `json:"Size"`   // 文件大小（OpenDrive 特有，Alist 不需要使用）
}

// renameFile 描述了重命名文件的请求
//
//nolint:unused // 保留给未来的文件操作
type renameFile struct {
	SessionID      string `json:"session_id"`       // 会话 ID
	NewFileName    string `json:"new_file_name"`    // 新的文件名称
	FileID         string `json:"file_id"`          // 文件 ID
	AccessFolderID string `json:"access_folder_id"` // 访问文件夹 ID（OpenDrive 特有，Alist 不需要使用）
	// SharingID      string `json:"sharing_id"`      // 共享 ID（OpenDrive 特有，Alist 不需要使用）
}

// createFile 描述了创建文件的请求
//
//nolint:unused // 保留给未来的文件操作
type createFile struct {
	SessionID string `json:"session_id"` // 会话 ID
	FolderID  string `json:"folder_id"`  // 文件夹 ID
	Name      string `json:"file_name"`  // 文件名称
}

// createFileResponse 描述了创建文件的响应
//
//nolint:unused // 保留给未来的文件操作
type createFileResponse struct {
	FileID            string `json:"FileId"`            // 文件 ID
	Name              string `json:"Name"`              // 文件名称
	GroupID           int    `json:"GroupID"`           // 组 ID
	Extension         string `json:"Extension"`         // 文件扩展名
	Size              string `json:"Size"`              // 文件大小
	Views             string `json:"Views"`             // 浏览次数
	Downloads         string `json:"Downloads"`         // 下载次数
	DateModified      string `json:"DateModified"`      // 修改日期
	Access            string `json:"Access"`            // 访问权限
	Link              string `json:"Link"`              // 文件链接
	DownloadLink      string `json:"DownloadLink"`      // 下载链接
	StreamingLink     string `json:"StreamingLink"`     // 流媒体链接
	TempStreamingLink string `json:"TempStreamingLink"` // 临时流媒体链接
	// DirUpdateTime      int    `json:"DirUpdateTime"`      // 目录更新时间（OpenDrive 特有，Alist 不需要使用）
	// TempLocation       string `json:"TempLocation"`       // 临时位置（OpenDrive 特有，Alist 不需要使用）
	// SpeedLimit         int    `json:"SpeedLimit"`         // 速度限制（OpenDrive 特有，Alist 不需要使用）
	// RequireCompression int    `json:"RequireCompression"` // 是否需要压缩（OpenDrive 特有，Alist 不需要使用）
	// RequireHash        int    `json:"RequireHash"`        // 是否需要哈希（OpenDrive 特有，Alist 不需要使用）
	// RequireHashOnly    int    `json:"RequireHashOnly"`    // 仅需要哈希（OpenDrive 特有，Alist 不需要使用）
}

// modTimeFile 描述了修改文件修改时间的请求
//
//nolint:unused // 保留给未来的文件操作
type modTimeFile struct {
	SessionID            string `json:"session_id"`             // 会话 ID
	FileID               string `json:"file_id"`                // 文件 ID
	FileModificationTime string `json:"file_modification_time"` // 文件修改时间
}

// 以下类型已弃用，保留以备未来使用
// openUpload 描述了打开上传的请求（未使用，为避免粘贴错误而注释）
// closeUpload 描述了关闭上传的请求（未使用）
// closeUploadResponse 描述了关闭上传的响应（未使用）
// permissions 描述了设置文件权限的请求（未使用）
// uploadFileChunkReply 描述了上传文件块的响应（未使用）
// usersInfoResponse 描述了 Alist users/info.json 的响应（未使用）

/*
// openUpload 描述了打开上传的请求
type openUpload struct {
	SessionID string `json:"session_id"` // 会话 ID
	FileID    string `json:"file_id"`    // 文件 ID
	Size      int64  `json:"file_size"`  // 文件大小
	// PartitionCount int    `json:"partition_count"` // 分区数量（OpenDrive 特有，Alist 不需要使用）
	// PartitionSize  int64  `json:"partition_size"`  // 分区大小（OpenDrive 特有，Alist 不需要使用）
}

// openUploadResponse 描述了打开上传的响应
type openUploadResponse struct {
	TempLocation string `json:"TempLocation"` // 临时位置
	// RequireCompression bool   `json:"RequireCompression"` // 是否需要压缩（OpenDrive 特有，Alist 不需要使用）
	// RequireHash        bool   `json:"RequireHash"`        // 是否需要哈希（OpenDrive 特有，Alist 不需要使用）
	// RequireHashOnly    bool   `json:"RequireHashOnly"`    // 仅需要哈希（OpenDrive 特有，Alist 不需要使用）
	// SpeedLimit         int    `json:"SpeedLimit"`         // 速度限制（OpenDrive 特有，Alist 不需要使用）
}

// closeUpload 描述了关闭上传的请求
type closeUpload struct {
	SessionID    string `json:"session_id"`    // 会话 ID
	FileID       string `json:"file_id"`       // 文件 ID
	Size         int64  `json:"file_size"`     // 文件大小
	TempLocation string `json:"temp_location"` // 临时位置
	// PartitionSha1 string `json:"partition_sha1"` // 分区 SHA1（OpenDrive 特有，Alist 不需要使用）
	// PartitionIdx  int    `json:"partition_idx"`  // 分区索引（OpenDrive 特有，Alist 不需要使用）
}

// closeUploadResponse 描述了关闭上传的响应
type closeUploadResponse struct {
	FileID   string `json:"FileID"`   // 文件 ID
	FileHash string `json:"FileHash"` // 文件哈希值
	Size     int64  `json:"Size"`     // 文件大小
	// ThumbLink string `json:"ThumbLink"`   // 缩略图链接（OpenDrive 特有，Alist 不需要使用）
	// Version   string `json:"Version"`     // 版本（OpenDrive 特有，Alist 不需要使用）
}

// permissions 描述了设置文件权限的请求
type permissions struct {
	SessionID    string `json:"session_id"`    // 会话 ID
	FileID       string `json:"file_id"`       // 文件 ID
	FileIsPublic int64  `json:"file_ispublic"` // 文件是否公开（0 = 私有, 1 = 公开）
}

// uploadFileChunkReply 描述了上传文件块的响应
type uploadFileChunkReply struct {
	TotalWritten int64 `json:"TotalWritten"` // 总写入字节数
}

// usersInfoResponse 描述了 Alist users/info.json 的响应
type usersInfoResponse struct {
	// StorageUsed 已用存储空间（OpenDrive 特有，Alist 不需要使用）
	StorageUsed int64 `json:"StorageUsed,string"`
	// MaxStorage 最大存储空间（OpenDrive 特有，Alist 不需要使用）
	MaxStorage int64 `json:"MaxStorage,string"`
}

*/

// DeleteRequest 用于 Alist /api/fs/remove 删除请求
type DeleteRequest struct {
	Dir   string   `json:"dir"`   // 文件所在目录路径
	Names []string `json:"names"` // 要删除的文件或目录名称数组
}

// DeleteResponse 用于 Alist /api/fs/rm 删除响应
type DeleteResponse struct {
	Code    int    `json:"code"`    // 响应代码
	Message string `json:"message"` // 响应消息
	Data    any    `json:"data"`    // 响应数据
}

// UploadResponse 用于 Alist /api/fs/put 上传响应
type UploadResponse struct {
	Code    int    `json:"code"`    // 响应代码（200 表示成功）
	Message string `json:"message"` // 响应消息
	Data    *struct {
		Task struct {
			ID       string `json:"id"`       // 任务唯一标识
			Name     string `json:"name"`     // 任务描述（文件名和目标路径）
			State    int    `json:"state"`    // 任务状态代码（0=进行中、1=已完成、2=已失败等）
			Status   string `json:"status"`   // 任务状态文本（uploading/completed/failed）
			Progress int    `json:"progress"` // 上传进度百分比（0-100）
			Error    string `json:"error"`    // 错误信息（成功时为空）
		} `json:"task"` // 上传任务信息
	} `json:"data"` // 响应数据
}

// CopyRequest 用于 Alist /api/fs/copy 复制请求
type CopyRequest struct {
	SrcDir string   `json:"src_dir"` // 源文件所在目录路径
	DstDir string   `json:"dst_dir"` // 目标目录路径
	Names  []string `json:"names"`   // 要复制的文件或目录名称数组
}

// CopyResponse 用于 Alist /api/fs/copy 复制响应
type CopyResponse struct {
	Code    int    `json:"code"`    // 响应代码
	Message string `json:"message"` // 响应消息
	Data    any    `json:"data"`    // 响应数据
}

// RenameRequest 用于 Alist /api/fs/rename 重命名请求
// 字段已根据 Alist 官方 API 校验
type RenameRequest struct {
	Path string `json:"path"` // 原始完整路径（例如 /a/b.txt）
	Name string `json:"name"` // 新文件名（不含路径，例如 c.txt）
}

// RenameResponse 用于 Alist /api/fs/rename 响应
type RenameResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// MoveRequest 用于 Alist /api/fs/move 移动请求
// TODO: 请根据 Alist 文档/源码校对字段名与含义
type MoveRequest struct {
	SrcDir string   `json:"src_dir"` // 源目录
	DstDir string   `json:"dst_dir"` // 目标目录
	Names  []string `json:"names"`   // 源文件名数组
}

// MoveResponse 用于 Alist /api/fs/move 响应
type MoveResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// RecursiveMoveRequest 用于 Alist /api/fs/recursive_move 聚合移动请求
type RecursiveMoveRequest struct {
	SrcDir    string `json:"src_dir"`
	DstDir    string `json:"dst_dir"`
	Overwrite bool   `json:"overwrite,omitempty"`
}

// RecursiveMoveResponse 用于 Alist /api/fs/recursive_move 响应
type RecursiveMoveResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}
