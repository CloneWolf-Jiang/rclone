// Package alist 提供基于 AList 原生 API 的后端实现。
package alist

import (
	"time"

	"github.com/rclone/rclone/fs"
	"github.com/rclone/rclone/lib/rest"
)

// Options 定义后端配置。
type Options struct {
	URL      string `config:"api_url"`
	Token    string `config:"token"`
	Username string `config:"username"`
	Password string `config:"password"`
	RootPath string `config:"root_path"`
}

// Fs 描述一个 AList 远端。
type Fs struct {
	name     string
	root     string
	opt      Options
	features *fs.Features
	srv      *rest.Client
	pacer    *fs.Pacer

	// 自动登录得到的 token 仅保存在内存，48 小时后会自动刷新。
	tokenFromLogin bool
	tokenExpiresAt time.Time
}

// Object 描述 AList 上的文件对象。
type Object struct {
	fs      *Fs
	remote  string
	size    int64
	modTime time.Time
	rawURL  string
}
