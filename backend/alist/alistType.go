package alist

import "encoding/json"

// apiResponse 对应 AList 通用响应结构。
type apiResponse struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// loginRequest 对应 /api/auth/login 与 /api/auth/login/hash。
type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	OTPCode  string `json:"otp_code,omitempty"`
}

type loginData struct {
	Token string `json:"token"`
}

// listRequest 对应 /api/fs/list。
type listRequest struct {
	Path     string `json:"path"`
	Password string `json:"password,omitempty"`
	Page     int    `json:"page,omitempty"`
	PerPage  int    `json:"per_page,omitempty"`
	Refresh  bool   `json:"refresh,omitempty"`
}

type listData struct {
	Content  []entry `json:"content"`
	Total    int64   `json:"total"`
	Readme   string  `json:"readme"`
	Header   string  `json:"header"`
	Write    bool    `json:"write"`
	Provider string  `json:"provider"`
}

// getRequest 对应 /api/fs/get。
type getRequest struct {
	Path     string `json:"path"`
	Password string `json:"password,omitempty"`
	Page     int    `json:"page,omitempty"`
	PerPage  int    `json:"per_page,omitempty"`
	Refresh  bool   `json:"refresh,omitempty"`
}

// mkdirRequest 对应 /api/fs/mkdir。
type mkdirRequest struct {
	Path string `json:"path"`
}

// removeRequest 对应 /api/fs/remove。
type removeRequest struct {
	Names []string `json:"names"`
	Dir   string   `json:"dir"`
}

// moveRequest 对应 /api/fs/move。
type moveRequest struct {
	SrcDir string   `json:"src_dir"`
	DstDir string   `json:"dst_dir"`
	Names  []string `json:"names"`
}

// copyRequest 对应 /api/fs/copy。
type copyRequest struct {
	SrcDir string   `json:"src_dir"`
	DstDir string   `json:"dst_dir"`
	Names  []string `json:"names"`
}

// renameRequest 对应 /api/fs/rename。
type renameRequest struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// putData 对应 /api/fs/put 返回中的 data.task。
type putData struct {
	Task *taskInfo `json:"task,omitempty"`
}

type taskInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	State    int    `json:"state"`
	Status   string `json:"status"`
	Progress int    `json:"progress"`
	Error    string `json:"error"`
}

// entry 对应 /api/fs/list 与 /api/fs/get 的文件/目录信息。
type entry struct {
	Name           string          `json:"name"`
	Size           int64           `json:"size"`
	IsDir          bool            `json:"is_dir"`
	Modified       string          `json:"modified"`
	Created        string          `json:"created,omitempty"`
	Sign           string          `json:"sign,omitempty"`
	Thumb          string          `json:"thumb,omitempty"`
	Type           int             `json:"type,omitempty"`
	HashInfo       json.RawMessage `json:"hash_info,omitempty"`
	HashInfoLegacy string          `json:"hashinfo,omitempty"`
	RawURL         string          `json:"raw_url,omitempty"`
	Readme         string          `json:"readme,omitempty"`
	Header         string          `json:"header,omitempty"`
	Provider       string          `json:"provider,omitempty"`
	Related        json.RawMessage `json:"related,omitempty"`
}
