// Package alist 提供基于 AList 原生 API 的后端实现。
package alist

import (
	"context"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
	"time"

	"github.com/rclone/rclone/fs"
	"github.com/rclone/rclone/fs/config/configmap"
	"github.com/rclone/rclone/fs/config/configstruct"
	"github.com/rclone/rclone/fs/config/obscure"
	"github.com/rclone/rclone/fs/fshttp"
	"github.com/rclone/rclone/fs/hash"
	"github.com/rclone/rclone/lib/pacer"
	"github.com/rclone/rclone/lib/rest"
)

const (
	minSleep      = 10 * time.Millisecond
	maxSleep      = 2 * time.Second
	decayConstant = 2
)

func init() {
	fs.Register(&fs.RegInfo{
		Name:        "alist",
		Description: "AList",
		NewFs:       NewFs,
		Options: []fs.Option{{
			Name:     "api_url",
			Help:     "Alist服务器地址（如 http://localhost:5244）",
			Required: true,
		}, {
			Name:      "token",
			Help:      "AList API Token。若已填写则忽略用户名和密码。",
			Sensitive: true,
		}, {
			Name: "username",
			Help: "当未配置 token 时使用该用户名自动登录。",
		}, {
			Name:       "password",
			Help:       "当未配置 token 时使用该密码自动登录。",
			Sensitive:  true,
			IsPassword: true,
		}, {
			Name:     "root_path",
			Help:     "远端的起始路径，默认为根路径 \"/\"。命令行中指定的路径将以此路径为基础拼接。",
			Default:  "/",
			Advanced: true,
		}},
	})
}

// NewFs 根据 name 与 root 创建后端实例。
func NewFs(ctx context.Context, name, root string, m configmap.Mapper) (fs.Fs, error) {
	opt := new(Options)
	err := configstruct.Set(m, opt)
	if err != nil {
		return nil, err
	}
	if opt.Password != "" {
		opt.Password, err = obscure.Reveal(opt.Password)
		if err != nil {
			return nil, fmt.Errorf("解密密码失败：%w", err)
		}
	}

	root = strings.Trim(path.Join(opt.RootPath, root), "/")
	baseURL := strings.TrimRight(opt.URL, "/")
	baseURL = strings.TrimSuffix(baseURL, "/api")
	baseURL += "/api"

	f := &Fs{
		name: name,
		root: root,
		opt:  *opt,
		srv:  rest.NewClient(fshttp.NewClient(ctx)).SetRoot(baseURL),
		pacer: fs.NewPacer(ctx,
			pacer.NewDefault(
				pacer.MinSleep(minSleep),
				pacer.MaxSleep(maxSleep),
				pacer.DecayConstant(decayConstant),
			),
		),
	}

	f.initFeatures(ctx)

	if err := f.login(ctx); err != nil {
		return nil, err
	}

	if root != "" {
		e, err := f.apiGet(ctx, f.absPath(""))
		if err == nil && !e.IsDir {
			f.root = path.Dir(root)
			if f.root == "." {
				f.root = ""
			}
			return f, fs.ErrorIsFile
		}
	}

	return f, nil
}

// Name 返回远端名称。
func (f *Fs) Name() string { return f.name }

// Root 返回远端根路径。
func (f *Fs) Root() string { return f.root }

// String 返回后端描述。
func (f *Fs) String() string { return fmt.Sprintf("AList root '%s'", f.root) }

// Precision 返回远端时间精度。
func (f *Fs) Precision() time.Duration { return time.Second }

// Hashes 返回支持的哈希类型。
func (f *Fs) Hashes() hash.Set { return hash.Set(hash.None) }

// initFeatures 初始化后端能力集合，启用原子上传（PartialUploads）使上传中断后不留下残缺文件。
func (f *Fs) initFeatures(ctx context.Context) {
	f.features = (&fs.Features{
		CanHaveEmptyDirectories: true,
		PartialUploads:          true,
	}).Fill(ctx, f)
}

// Features 返回可选能力集合。
func (f *Fs) Features() *fs.Features { return f.features }

func (f *Fs) absPath(remote string) string {
	p := path.Join("/", f.root, remote)
	if p == "" {
		return "/"
	}
	return p
}

// List 列出指定目录下的文件和目录。
func (f *Fs) List(ctx context.Context, dir string) (entries fs.DirEntries, err error) {
	items, err := f.apiList(ctx, f.absPath(dir))
	if err == errNotFound {
		return nil, fs.ErrorDirNotFound
	}
	if err != nil {
		return nil, err
	}

	entries = make(fs.DirEntries, 0, len(items))
	for i := range items {
		item := items[i]
		remote := path.Join(dir, item.Name)
		if item.IsDir {
			d := fs.NewDir(remote, parseModTime(item.Modified))
			entries = append(entries, d)
			continue
		}
		entries = append(entries, &Object{
			fs:      f,
			remote:  remote,
			size:    item.Size,
			modTime: parseModTime(item.Modified),
			rawURL:  item.RawURL,
		})
	}

	return entries, nil
}

// NewObject 获取指定路径的对象。
func (f *Fs) NewObject(ctx context.Context, remote string) (fs.Object, error) {
	item, err := f.apiGet(ctx, f.absPath(remote))
	if err == errNotFound {
		return nil, fs.ErrorObjectNotFound
	}
	if err != nil {
		return nil, err
	}
	if item.IsDir {
		return nil, fs.ErrorIsDir
	}

	return &Object{
		fs:      f,
		remote:  remote,
		size:    item.Size,
		modTime: parseModTime(item.Modified),
		rawURL:  item.RawURL,
	}, nil
}

// Put 上传新对象。
func (f *Fs) Put(ctx context.Context, in io.Reader, src fs.ObjectInfo, options ...fs.OpenOption) (fs.Object, error) {
	o := &Object{fs: f, remote: src.Remote()}
	if err := o.Update(ctx, in, src, options...); err != nil {
		return nil, err
	}
	return o, nil
}

// Mkdir 创建目录（若不存在）。
func (f *Fs) Mkdir(ctx context.Context, dir string) error {
	return f.apiMkdir(ctx, f.absPath(dir))
}

// Rmdir 删除空目录。
func (f *Fs) Rmdir(ctx context.Context, dir string) error {
	if dir == "" {
		return fs.ErrorDirectoryNotEmpty
	}
	if err := f.apiRemoveByPath(ctx, f.absPath(dir)); err != nil {
		if err == errNotFound {
			return fs.ErrorDirNotFound
		}
		return err
	}
	return nil
}

// Copy 使用服务端能力复制对象。
func (f *Fs) Copy(ctx context.Context, src fs.Object, remote string) (fs.Object, error) {
	srcObj, ok := src.(*Object)
	if !ok {
		return nil, fs.ErrorCantCopy
	}
	if srcObj.fs.Name() != f.Name() {
		return nil, fs.ErrorCantCopy
	}

	// AList 的 /fs/copy 不支持“同目录改名复制”这一语义，
	// 遇到该场景交给 rclone 自动回退到常规复制流程。
	srcFull := srcObj.fs.absPath(srcObj.remote)
	dstFull := f.absPath(remote)
	if path.Dir(srcFull) == path.Dir(dstFull) && path.Base(srcFull) != path.Base(dstFull) {
		return nil, fs.ErrorCantCopy
	}

	if err := f.apiCopy(ctx, srcFull, dstFull); err != nil {
		return nil, err
	}
	return f.NewObject(ctx, remote)
}

// Move 使用服务端能力移动对象。
func (f *Fs) Move(ctx context.Context, src fs.Object, remote string) (fs.Object, error) {
	srcObj, ok := src.(*Object)
	if !ok {
		return nil, fs.ErrorCantMove
	}
	if srcObj.fs.Name() != f.Name() {
		return nil, fs.ErrorCantMove
	}

	srcFull := srcObj.fs.absPath(srcObj.remote)
	dstFull := f.absPath(remote)
	if path.Dir(srcFull) == path.Dir(dstFull) && path.Base(srcFull) != path.Base(dstFull) {
		err := f.apiRename(ctx, srcFull, path.Base(dstFull))
		if errors.Is(err, errFileExists) {
			// AList /fs/rename 不支持覆盖同名文件；先删除目标，再重命名。
			// 这与 rclone 的覆盖写语义一致（partial → final）。
			if delErr := f.apiRemoveByPath(ctx, dstFull); delErr != nil {
				return nil, fmt.Errorf("删除已有目标文件失败：%w", delErr)
			}
			err = f.apiRename(ctx, srcFull, path.Base(dstFull))
		}
		if err != nil {
			return nil, err
		}
		return f.NewObject(ctx, remote)
	}

	if err := f.apiMove(ctx, srcFull, dstFull); err != nil {
		return nil, err
	}
	return f.NewObject(ctx, remote)
}

// DirMove 使用服务端能力移动目录。
func (f *Fs) DirMove(ctx context.Context, src fs.Fs, srcRemote, dstRemote string) error {
	srcFs, ok := src.(*Fs)
	if !ok {
		return fs.ErrorCantDirMove
	}
	if srcFs.Name() != f.Name() {
		return fs.ErrorCantDirMove
	}

	// 目标目录已存在则返回标准错误。
	_, err := f.apiGet(ctx, f.absPath(dstRemote))
	if err == nil {
		return fs.ErrorDirExists
	}
	if !errors.Is(err, errNotFound) {
		return err
	}

	return f.apiMove(ctx, srcFs.absPath(srcRemote), f.absPath(dstRemote))
}

// Purge 批量删除目录下的所有条目（不删除目录本身）。
func (f *Fs) Purge(ctx context.Context, dir string) error {
	entries, err := f.apiList(ctx, f.absPath(dir))
	if err == errNotFound {
		return fs.ErrorDirNotFound
	}
	if err != nil {
		return err
	}

	if len(entries) == 0 {
		return nil
	}
	names := make([]string, 0, len(entries))
	for i := range entries {
		names = append(names, entries[i].Name)
	}

	return f.apiRemoveByNames(ctx, f.absPath(dir), names)
}

// Fs 返回对象所属的后端。
func (o *Object) Fs() fs.Info { return o.fs }

// String 返回对象字符串表示。
func (o *Object) String() string {
	if o == nil {
		return "<nil>"
	}
	return o.remote
}

// Remote 返回对象远端路径。
func (o *Object) Remote() string { return o.remote }

// ModTime 返回对象修改时间。
func (o *Object) ModTime(context.Context) time.Time { return o.modTime }

// Size 返回对象大小。
func (o *Object) Size() int64 { return o.size }

// Hash 暂不支持，返回未实现。
func (o *Object) Hash(context.Context, hash.Type) (string, error) { return "", hash.ErrUnsupported }

// Storable 表示对象可存储。
func (o *Object) Storable() bool { return true }

// SetModTime 暂不支持设置修改时间。
func (o *Object) SetModTime(context.Context, time.Time) error { return fs.ErrorCantSetModTime }

// Open 打开对象进行读取。
func (o *Object) Open(ctx context.Context, options ...fs.OpenOption) (io.ReadCloser, error) {
	item, err := o.fs.apiGet(ctx, o.fs.absPath(o.remote))
	if err != nil {
		if err == errNotFound {
			return nil, fs.ErrorObjectNotFound
		}
		return nil, err
	}
	if item.RawURL == "" {
		return nil, fmt.Errorf("alist 未返回对象 %q 的 raw_url", o.remote)
	}

	opts := rest.Opts{
		Method:  "GET",
		RootURL: item.RawURL,
		Options: options,
	}
	resp, err := o.fs.srv.Call(ctx, &opts)
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}

// Update 更新对象内容。
func (o *Object) Update(ctx context.Context, in io.Reader, src fs.ObjectInfo, options ...fs.OpenOption) error {
	size := src.Size()
	if size < 0 {
		return fmt.Errorf("暂不支持未知大小的上传")
	}
	if err := o.fs.apiPut(ctx, o.fs.absPath(o.remote), in, size); err != nil {
		return err
	}

	item, err := o.fs.apiGet(ctx, o.fs.absPath(o.remote))
	if err != nil {
		return err
	}
	o.size = item.Size
	o.modTime = parseModTime(item.Modified)
	o.rawURL = item.RawURL

	return nil
}

// Remove 删除对象。
func (o *Object) Remove(ctx context.Context) error {
	err := o.fs.apiRemoveByPath(ctx, o.fs.absPath(o.remote))
	if err == errNotFound {
		return fs.ErrorObjectNotFound
	}
	return err
}

// 接口实现检查。
var (
	_ fs.Fs       = (*Fs)(nil)
	_ fs.Copier   = (*Fs)(nil)
	_ fs.Mover    = (*Fs)(nil)
	_ fs.DirMover = (*Fs)(nil)
	_ fs.Purger   = (*Fs)(nil)
	_ fs.Object   = (*Object)(nil)
)
