// Package alist 提供与Alist存储系统的接口
//
//nolint:goimports // 包注释格式
package alist

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/rclone/rclone/fs"
	"github.com/rclone/rclone/fs/config"
	"github.com/rclone/rclone/fs/config/configmap"
	"github.com/rclone/rclone/fs/config/configstruct"
	"github.com/rclone/rclone/fs/config/obscure"
	"github.com/rclone/rclone/fs/fserrors"
	"github.com/rclone/rclone/fs/fshttp"
	"github.com/rclone/rclone/fs/hash"
	"github.com/rclone/rclone/lib/dircache"
	"github.com/rclone/rclone/lib/encoder"
	"github.com/rclone/rclone/lib/pacer"
	"github.com/rclone/rclone/lib/rest"
)

const (
	minSleep      = 10 * time.Millisecond // 最小睡眠时间
	maxSleep      = 5 * time.Minute       // 最大睡眠时间
	decayConstant = 1                     // 衰减常数（值越大衰减越慢）
)

func init() {
	fs.Register(&fs.RegInfo{
		Name:        "alist",
		Description: "Alist 聚合存储系统",
		NewFs:       NewFs,
		Options: []fs.Option{{
			Name:     "api_url",
			Help:     "Alist服务器地址（如 http://localhost:5244）",
			Required: true,
		}, {
			Name:       "token",
			Help:       "访问令牌（可选：如果提供token，则无需输入用户名和密码）",
			IsPassword: true,
			Required:   false,
		}, {
			Name:     "username",
			Help:     "用户名（当不使用token时必需）",
			Required: false,
		}, {
			Name:       "password",
			Help:       "密码（当不使用token时必需；留空禁用密码）",
			IsPassword: true,
			Required:   false,
		}, {
			Name:     "root_path",
			Help:     "远程根路径（可选：使用此路径作为工作空间的基础路径）",
			Required: false,
		}, {
			Name:     config.ConfigEncoding,
			Help:     config.ConfigEncodingHelp,
			Advanced: true,
			// 替换的字符列表:
			//   < (小于号)         -> '＜' // 全角小于号
			//   > (大于号)         -> '＞' // 全角大于号
			//   : (冒号)           -> '：' // 全角冒号
			//   " (双引号)         -> '＂' // 全角引号
			//   \ (反斜杠)         -> '＼' // 全角反斜杠
			//   | (竖线)           -> '｜' // 全角竖线
			//   ? (问号)           -> '？' // 全角问号
			//   * (星号)           -> '＊' // 全角星号
			//
			// 另外文件名不能以空白符开头或结尾
			// 替换的字符列表:
			//     (空格)            -> '␠'  // 空格符号
			//     (水平制表符)      -> '␉'  // 水平制表符号
			//     (换行符)          -> '␊'  // 换行符号
			//     (竖制表符)        -> '␋'  // 竖制表符号
			//     (回车符)          -> '␍'  // 回车符号
			//
			// 同时编码无效的UTF-8字节，因为json无法正确处理它们
			//
			Default: (encoder.Base |
				encoder.EncodeWin |
				encoder.EncodeLeftCrLfHtVt |
				encoder.EncodeRightCrLfHtVt |
				encoder.EncodeBackSlash |
				encoder.EncodeLeftSpace |
				encoder.EncodeRightSpace |
				encoder.EncodeInvalidUtf8),
		}},
	})
}

// Options 定义此后端的配置选项
type Options struct {
	APIURL   string               `config:"api_url"`
	UserName string               `config:"username"`
	Password string               `config:"password"`
	Token    string               `config:"token"`
	RootPath string               `config:"root_path"`
	Enc      encoder.MultiEncoder `config:"encoding"`
}

// Fs 表示远程存储
type Fs struct {
	name     string             // 远程名称
	root     string             // 根路径
	opt      Options            // 已解析的配置选项
	features *fs.Features       // 可选功能集合
	srv      *rest.Client       // REST客户端
	pacer    *fs.Pacer          // 用于限速和重试的步调器
	token    string             // 认证令牌
	dirCache *dircache.DirCache // 目录缓存
}

// Object 代表远程存储中的一个对象（文件）
type Object struct {
	fs      *Fs       // 所属的文件系统
	remote  string    // 远程路径
	id      string    // 文件ID
	parent  string    // 父目录ID
	modTime time.Time // 修改时间
	md5     string    // MD5哈希值
	size    int64     // 文件大小（字节）
}

// parseModifiedTime 解析Alist API返回的modified字段（字符串）为Unix时间戳
func parseModifiedTime(modifiedStr string) int64 {
	if modifiedStr == "" {
		return 0
	}

	// 尝试作为Unix时间戳字符串解析
	var timestamp int64
	_, err := fmt.Sscanf(modifiedStr, "%d", &timestamp)
	if err == nil {
		return timestamp
	}

	// 如果是时间戳，直接返回0（失败情况）
	return 0
}

// parsePath 解析传入的路径
// 为 Alist API 保留前导斜杠，即离去末尾斜杠
func parsePath(path string) (root string) {
	// 仅删除末尾斜杠，保留前导斜杠
	// "/" → "/", "/夸克网盘/" → "/夸克网盘", "/foo/bar/" → "/foo/bar"
	root = strings.TrimSuffix(path, "/")
	if root == "" {
		// 空路径或只有 "/" 应该导致 "/"
		root = "/"
	}
	return
}

// ------------------------------------------------------------

// Name 返回远程名称
func (f *Fs) Name() string {
	return f.name
}

// Root 返回了根路径
func (f *Fs) Root() string {
	return f.root
}

// String 将此文件系统转换为字符串
func (f *Fs) String() string {
	return fmt.Sprintf("Alist root '%s'", f.root)
}

// Features 返回警告功能
func (f *Fs) Features() *fs.Features {
	return f.features
}

// Hashes 返回支持的哈希算法
func (f *Fs) Hashes() hash.Set {
	return hash.Set(hash.MD5)
}

// DirCacheFlush 重置目录缓存
func (f *Fs) DirCacheFlush() {
	f.dirCache.ResetRoot()
}

// NewFs 从给定路径构建并初始化一个文件系统实例Fs
// 参数说明：
//
//	ctx: 上下文，用于取消和超时控制
//	name: 远程名称（如"myremote"）
//	root: 相对路径参数（来自URL path部分）
//	m: 配置映射，包含api_url、username、password、root_path等配置参数
//
// 返回值：
//
//	fs.Fs: 初始化完成的文件系统实例
//	error: 初始化过程中的任何错误
//
// 根路径处理说明：
// - root_path配置：作为工作空间的基础路径（全局限制）
// - URL中的root参数：相对于root_path配置的相对路径
// - 最终路径：join(root_path配置, URL的path参数)
//
// 示例：
// - 如果root_path配置为"/A/A"，URL为"alistA:D"，最终访问路径为"/A/A/D"
// - 如果root_path配置为"/A/B"，URL为"alistB:subfolder/D"，最终访问路径为"/A/B/subfolder/D"
// - 如果不设置root_path配置，则使用URL中的path参数或默认为"/"
//
// 主要功能流程：
//  1. 解析和验证配置参数（api_url等）
//  2. 根据root_path配置和URL中的path参数确定最终的根路径
//  3. 验证认证配置有效（token 或 用户名+密码 二选一）
//  4. 解密密码字段（仅当不使用token时）
//  5. 准备认证信息供后续步骤使用
//  6. 初始化REST客户端和速率限制器
//  7. 执行登录认证（使用token或用户名密码）
//  8. 初始化目录缓存
//  9. 验证根路径是目录还是文件
func NewFs(ctx context.Context, name, root string, m configmap.Mapper) (fs.Fs, error) {
	// 步骤1：将配置映射解析到Options结构体中
	opt := new(Options)
	err := configstruct.Set(m, opt)
	if err != nil {
		return nil, err
	}

	// 步骤1.5：验证并规范化API URL
	// 规则：
	// 1. API URL 不能为空
	// 2. 只支持 http 和 https 两种协议
	// 3. 验证主机名不为空（支持 hostname:port 格式）
	// 4. 规范化 URL：去掉末尾的 "/"
	if opt.APIURL == "" {
		return nil, errors.New("API URL 不能为空")
	}

	// 验证URL格式
	userURL, err := url.Parse(opt.APIURL)
	if err != nil {
		return nil, fmt.Errorf("API URL 格式无效: %w", err)
	}

	// 验证URL协议
	if userURL.Scheme != "http" && userURL.Scheme != "https" {
		return nil, fmt.Errorf("API URL 协议不支持: %s（仅支持 http 和 https）", userURL.Scheme)
	}

	// 验证URL主机部分（不能为空）
	if userURL.Host == "" {
		return nil, errors.New("API URL 缺少有效的主机地址")
	}

	// 进一步验证主机名部分（userURL.Host 可能为 "host:port" 格式，需要检查主机名部分不为空）
	hostname := userURL.Hostname()
	if hostname == "" {
		return nil, fmt.Errorf("API URL 主机名无效: %q", userURL.Host)
	}

	// 规范化 URL：去掉末尾的 "/" 以避免双斜杠
	opt.APIURL = strings.TrimSuffix(opt.APIURL, "/")

	// 步骤2：处理根路径
	// 规则：
	// 1. 如果配置了root_path，作为基础路径
	// 2. 如果URL中有path参数，追加到root_path之后
	// 3. 如果都没有，使用默认的"/"（空字符串表示根目录）
	var rootPath string
	if opt.RootPath != "" {
		// 配置中有root_path，作为基础路径
		rootPath = parsePath(opt.RootPath)
		// 如果URL中还有路径，追加其后
		if root != "" {
			urlPath := parsePath(root)
			if urlPath != "" && urlPath != "/" {
				// 移除urlPath的前导斜杠，避免双斜杠
				urlPath = strings.TrimPrefix(urlPath, "/")
				rootPath = rootPath + urlPath
			}
		}
	} else {
		// 没有配置root_path，使用URL中的路径或默认为""
		if root != "" {
			rootPath = parsePath(root)
		} else {
			rootPath = ""
		}
	}
	root = rootPath

	// 步骤3：验证认证配置有效（token 或 用户名+密码 二选一）
	if opt.Token == "" {
		// 没有提供token，则需要用户名和密码
		if opt.UserName == "" {
			return nil, errors.New("不提供token时，用户名不能为空")
		}

		// 步骤4：解密密码字段（使用rclone的obscure包）
		opt.Password, err = obscure.Reveal(opt.Password)
		if err != nil {
			return nil, errors.New("密码解密失败")
		}
		if opt.Password == "" {
			return nil, errors.New("不提供token时，密码不能为空")
		}
	} else {
		// 有token，需要解密
		opt.Token, err = obscure.Reveal(opt.Token)
		if err != nil {
			return nil, errors.New("token解密失败")
		}
		if opt.Token == "" {
			return nil, errors.New("token不能为空")
		}
	}

	// 步骤5：初始化Fs结构体
	// 创建REST客户端用于与OpenDrive API通信
	// 配置errorHandler处理非2xx HTTP响应
	// 创建pacer进行API调用限流和重试策略
	f := &Fs{
		name:  name,      // 远程名称
		root:  root,      // 确定后的根路径
		opt:   *opt,      // 解析后的配置选项
		token: opt.Token, // ← 需要添加这行
		srv:   rest.NewClient(fshttp.NewClient(ctx)).SetErrorHandler(errorHandler),
		pacer: fs.NewPacer(ctx, pacer.NewDefault(pacer.MinSleep(minSleep), pacer.MaxSleep(maxSleep), pacer.DecayConstant(decayConstant))),
	}

	// 步骤6：初始化目录缓存（trueRootID变量在alist api中暂时可有可无）
	f.dirCache = dircache.New("", root, f)

	// 步骤7：设置REST客户端的基础URL
	// 注意：opt.APIURL 已在步骤1.5中验证过，只支持 http/https 协议，且格式有效
	f.srv.SetRoot(opt.APIURL)

	// 步骤8：检测服务器连通性（ping）
	err = f.pacer.Call(func() (bool, error) {
		opts := rest.Opts{
			Method: "GET",
			Path:   "/ping",
		}
		resp, err := f.srv.Call(ctx, &opts)
		if err != nil {
			return f.shouldRetry(ctx, resp, err)
		}

		if resp.StatusCode != http.StatusOK {
			return false, fmt.Errorf("连接Alist服务器失败，服务器状态码: %d", resp.StatusCode)
		}

		// 关闭响应体，防止连接泄漏
		_ = resp.Body.Close()

		fs.Debugf(nil, "成功连接到Alist服务器：%s", opt.APIURL)
		return false, nil // 成功，不需要重试
	})
	if err != nil {
		return nil, fmt.Errorf("连接Alist服务器失败: %w", err)
	}

	// 步骤9：获取认证令牌（如果没有预先提供token）
	// 如果提供了token，跳过登录
	// 如果没有token，通过用户名密码进行登录以获取token
	if opt.Token == "" {
		// 没有token，使用用户名和密码进行登录
		var resp *http.Response
		var loginResp struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
			Data    struct {
				Token string `json:"token"`
			} `json:"data"`
		}

		err = f.pacer.Call(func() (bool, error) {
			// 构造登录请求
			loginReq := struct {
				Username string `json:"username"`
				Password string `json:"password"`
			}{
				Username: opt.UserName,
				Password: opt.Password,
			}

			// 调用Alist login端点
			opts := rest.Opts{
				Method: "POST",
				Path:   "/api/auth/login",
			}
			resp, err = f.srv.CallJSON(ctx, &opts, &loginReq, &loginResp)
			return f.shouldRetry(ctx, resp, err)
		})
		if err != nil {
			return nil, fmt.Errorf("alist登录失败: %w", err)
		}

		// 检查登录响应
		if loginResp.Code != http.StatusOK {
			return nil, fmt.Errorf("alist登录失败: %s (代码:%d)", loginResp.Message, loginResp.Code)
		}

		if loginResp.Data.Token == "" {
			return nil, errors.New("Alist登录成功但未返回token")
		}

		// 更新token为登录返回的值
		f.token = loginResp.Data.Token
		fs.Debugf(nil, "成功通过用户名密码获取Alist认证令牌")
	} else {
		// 已有token（来自配置），需要验证token有效性
		// 注意：f.token 已在步骤5初始化时设置为 opt.Token
		var userInfo struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
			Data    struct {
				ID       int    `json:"id"`
				Username string `json:"username"`
			} `json:"data"`
		}

		err = f.pacer.Call(func() (bool, error) {
			opts := rest.Opts{
				Method: "GET",
				Path:   "/api/me",
				ExtraHeaders: map[string]string{
					"Authorization": f.token,
				},
			}
			resp, err := f.srv.CallJSON(ctx, &opts, nil, &userInfo)
			defer func() {
				if resp != nil && resp.Body != nil {
					_ = resp.Body.Close()
				}
			}()
			if err != nil {
				return f.shouldRetry(ctx, resp, err)
			}

			// 检查token验证响应
			if userInfo.Code != http.StatusOK {
				return false, fmt.Errorf("token验证失败: %s (代码:%d), 可能是token无效或过期", userInfo.Message, userInfo.Code)
			}

			if userInfo.Data.Username == "" {
				return false, errors.New("Token验证成功但未返回用户信息")
			}

			return false, nil
		})
		if err != nil {
			return nil, fmt.Errorf("预配置的Token验证失败: %w", err)
		}
		fs.Debugf(nil, "使用预配置的认证令牌，验证成功")
	}

	// 步骤10：初始化文件系统特性
	// 根据Alist API文档和实现情况配置文件系统特性
	// 注意：Alist是聚合存储系统，支持多种后端（本地、OneDrive、S3等）
	// 这里使用通用配置以兼容所有后端
	f.features = (&fs.Features{
		// CaseInsensitive: Alist后端多样化，包括case-sensitive和case-insensitive的存储
		// 为了兼容性，默认设为false（更为保险的选择）
		// 如果需要针对特定Alist实例，可通过/api/settings接口动态查询
		CaseInsensitive: false,

		// CanHaveEmptyDirectories: Alist支持创建空目录
		CanHaveEmptyDirectories: true,

		// DuplicateFiles: Alist不允许创建重名的文件和目录
		// 同一目录中的文件名必须唯一
		DuplicateFiles: false,

		// ReadMimeType: Alist API返回文件的MIME类型信息
		// 列表接口返回type字段，可用于识别文件类型
		ReadMimeType: true,

		// PartialUploads: Alist支持流式/分块上传文件
		// 表示上传中的文件可能不完整地显示在文件系统中（符合Alist行为）
		PartialUploads: true,

		// SlowHash: Alist需要单独调用接口获取MD5哈希，不是列表时的属性
		// 因此获取哈希值为慢操作
		SlowHash: true,
	}).Fill(ctx, f)

	// 步骤11：查找并验证根路径
	// 检查根路径是否作为目录存在
	err = f.dirCache.FindRoot(ctx, false)
	if err != nil {
		// 如果作为目录不存在，假设它是一个文件对象
		// 分割路径获得文件名和父目录路径
		newRoot, remote := dircache.SplitPath(root)
		tempF := *f
		// 注意：现在使用路径作为目录标识符（不是OpenDrive的"0"）
		tempF.dirCache = dircache.New(newRoot, newRoot, &tempF)
		tempF.root = newRoot

		// 尝试查找父目录
		err = tempF.dirCache.FindRoot(ctx, false)
		if err != nil {
			// 父目录也不存在，返回原始的Fs实例（使用设置的根路径）
			return f, nil
		}

		// 尝试作为文件获取对象信息
		_, err := tempF.newObjectWithInfo(ctx, remote, nil, "")
		if err != nil {
			if err == fs.ErrorObjectNotFound {
				// 文件不存在，返回原始的Fs实例（使用设置的根路径）
				return f, nil
			}
			return nil, err
		}

		// 更新f以使用父目录作为根
		// 注意：这里更新f而不是返回tempF，因为features字段
		// 已经使用*f作为方法接收器进行初始化
		// 参考：https://github.com/rclone/rclone/issues/2182
		f.dirCache = tempF.dirCache
		f.root = tempF.root

		// 返回一个特殊错误，表示指定的路径是文件而非目录
		return f, fs.ErrorIsFile
	}

	// 成功初始化并返回Fs实例
	return f, nil
}

// rootSlash 如果根路径不为空，返回带有斜杠的根路径；否则返回空字符串
//
//nolint:unused // 保留给未来使用
func (f *Fs) rootSlash() string {
	if f.root == "" {
		return f.root
	}
	return f.root + "/"
}

// errorHandler 解析非 2xx 错误响应为错误
func errorHandler(resp *http.Response) error {
	errResponse := new(Error)
	err := rest.DecodeJSON(resp, &errResponse)
	if err != nil {
		fs.Debugf(nil, "无法解码错误响应: %v", err)
	}
	if errResponse.Info.Code == 0 {
		errResponse.Info.Code = resp.StatusCode
	}
	if errResponse.Info.Message == "" {
		errResponse.Info.Message = "未知错误 " + resp.Status
	}
	return errResponse
}

// Mkdir 创建文件夹（如果不存在）
func (f *Fs) Mkdir(ctx context.Context, dir string) error {
	//fs.Debugf(nil, "Mkdir(\"%s\") 开始执行", dir)

	var fullPath string
	if f.root == "" || f.root == "/" {
		fullPath = "/" + dir
	} else {
		fullPath = f.root + "/" + dir
	}

	fs.Debugf(nil, "Mkdir: 计算的完整路径 fullPath=%q (dir=%q, f.root=%q)", fullPath, dir, f.root)

	// 调用 Alist API 创建目录
	var mkdirResp MkdirResponse
	err := f.pacer.Call(func() (bool, error) {
		mkdirReq := MkdirRequest{
			Path: fullPath,
		}
		opts := rest.Opts{
			Method: "POST",
			Path:   "/api/fs/mkdir",
			ExtraHeaders: map[string]string{
				"Authorization": f.token,
			},
		}
		fs.Debugf(nil, "Mkdir: 发送 API 请求 - 路径=%q", fullPath)
		resp, err := f.srv.CallJSON(ctx, &opts, &mkdirReq, &mkdirResp)
		defer func() {
			if resp != nil && resp.Body != nil {
				_ = resp.Body.Close()
			}
		}()
		return f.shouldRetry(ctx, resp, err)
	})

	if err != nil {
		fs.Debugf(nil, "Mkdir: 网络/系统错误 err=%v (fullPath=%q)", err, fullPath)
		return fmt.Errorf("创建目录失败 %q: %w", fullPath, err)
	}

	// 检查API响应状态
	if mkdirResp.Code != 200 {
		// 判断是否为"目录已存在"错误，通常是 409 Conflict 或消息包含 "already"
		if mkdirResp.Code == 409 || strings.Contains(strings.ToLower(mkdirResp.Message), "already") {
			fs.Debugf(nil, "Mkdir: 目录已存在，返回成功 (fullPath=%q, Code=%d, Message=%q)", fullPath, mkdirResp.Code, mkdirResp.Message)
			return nil // 幂等性：目录已存在当作成功
		}
		fs.Debugf(nil, "Mkdir: 创建失败，Code=%d, Message=%q (fullPath=%q)", mkdirResp.Code, mkdirResp.Message, fullPath)
		return fmt.Errorf("创建目录失败 %q: %s (代码:%d)", fullPath, mkdirResp.Message, mkdirResp.Code)
	}

	fs.Debugf(nil, "Mkdir: 成功创建目录 (fullPath=%q, 响应Code=%d)", fullPath, mkdirResp.Code)

	return nil
}

// deleteObject 通过路径删除对象（文件或目录）
func (f *Fs) deleteObject(ctx context.Context, id string) error {
	return f.pacer.Call(func() (bool, error) {
		// id 是一个路径字符串，需要分解为目录和名称
		dir := path.Dir(id)
		if dir == "." {
			dir = "/"
		}
		name := path.Base(id)

		deleteReq := DeleteRequest{
			Dir:   dir,
			Names: []string{name},
		}

		var deleteResp DeleteResponse
		opts := rest.Opts{
			Method:       "POST",
			Path:         "/api/fs/remove",
			ExtraHeaders: map[string]string{"Authorization": f.token},
		}
		resp, err := f.srv.CallJSON(ctx, &opts, &deleteReq, &deleteResp)
		if err != nil {
			return f.shouldRetry(ctx, resp, err)
		}

		// 检查删除是否成功
		if deleteResp.Code != 200 {
			return false, fmt.Errorf("删除失败: 代码=%d, 消息=%s", deleteResp.Code, deleteResp.Message)
		}

		return f.shouldRetry(ctx, resp, nil)
	})
}

// purgeCheck 删除根目录，如果 check 设置为 true，则
// 如果它有任何内容，拒绝这样做
func (f *Fs) purgeCheck(ctx context.Context, dir string, check bool) error {
	root := path.Join(f.root, dir)
	if root == "" {
		return errors.New("无法清除根目录")
	}
	dc := f.dirCache
	rootID, err := dc.FindDir(ctx, dir, false)
	if err != nil {
		return err
	}
	item, err := f.readMetaDataForFolderID(ctx, rootID)
	if err != nil {
		return err
	}
	if check && len(item.Files) != 0 {
		return errors.New("文件夹不为空")
	}
	err = f.deleteObject(ctx, rootID)
	if err != nil {
		return err
	}
	f.dirCache.FlushDir(dir)
	return nil
}

// Rmdir 删除根文件夹
//
// 如果文件夹不为空，则返回错误
func (f *Fs) Rmdir(ctx context.Context, dir string) error {
	// fs.Debugf(nil, "Rmdir(\"%s\")", path.Join(f.root, dir))
	return f.purgeCheck(ctx, dir, true)
}

// Precision 返回远程的精度
func (f *Fs) Precision() time.Duration {
	return time.Second
}

// Copy 使用 Alist 服务器端复制操作将源文件复制到指定的远程路径
//
// 参数说明：
//   - ctx: 上下文，用于取消和超时控制
//   - src: 源文件对象
//   - remote: 目标相对路径（相对于此文件系统的根目录）
//
// 返回值：
//   - 目标文件对象（如果复制成功）
//   - 错误信息（如果操作失败）
//
// 注意：
//   - 仅当源和目标文件系统相同时才会调用此方法
//   - 如果 Alist 不支持或操作失败，返回 fs.ErrorCantCopy 让 rclone 回退到下载-上传方案
func (f *Fs) Copy(ctx context.Context, src fs.Object, remote string) (fs.Object, error) {
	// 确保源对象来自同一个 Alist 文件系统
	srcObj, ok := src.(*Object)
	if !ok {
		// 源对象不是 Alist 对象，无法进行服务器端复制
		fs.Debugf(nil, "Copy: 源对象不是 Alist 对象，无法进行服务器端复制")
		return nil, fs.ErrorCantCopy
	}

	// 获取源文件的完整路径（优先使用对象 parent，若缺失则通过 dirCache 查找）
	srcDir, srcName, err := f.dirPathLeaf(ctx, srcObj.remote, srcObj.parent)
	if err != nil {
		fs.Debugf(nil, "Copy: 无法解析源路径: %v", err)
		return nil, err
	}
	var srcPath string
	if srcDir == "" || srcDir == "/" {
		srcPath = "/" + srcName
	} else {
		srcPath = srcDir + "/" + srcName
	}

	// 获取目标文件的目录路径和文件名
	dstLeaf, dstDirPath, err := f.dirCache.FindPath(ctx, remote, true)
	if err != nil {
		fs.Debugf(nil, "Copy: 获取目标目录路径失败: %v", err)
		return nil, err
	}

	// 确保目标目录存在（如果不存在则创建）
	if dstDirPath == "" {
		dstDirPath = f.root
	}

	// 构建目标文件的完整路径
	var dstPath string
	if dstDirPath == "" || dstDirPath == "/" {
		dstPath = "/" + dstLeaf
	} else {
		dstPath = dstDirPath + "/" + dstLeaf
	}

	fs.Debugf(nil, "Copy: 准备复制源文件\n  源路径: %q\n  目标路径: %q", srcPath, dstPath)

	// 目标文件处理按后端/上层策略执行（不在此处预先备份）

	// 调用 Alist 复制 API
	var copyResp CopyResponse
	err = f.pacer.Call(func() (bool, error) {
		// 提取源目录/文件名 与 目标目录
		srcDirForReq := path.Dir(srcPath)
		if srcDirForReq == "." {
			srcDirForReq = "/"
		}
		srcName := path.Base(srcPath)

		dstDir := path.Dir(dstPath)
		if dstDir == "." {
			dstDir = "/"
		}

		copyReq := CopyRequest{
			SrcDir: srcDirForReq,
			DstDir: dstDir,
			Names:  []string{srcName},
		}

		opts := rest.Opts{
			Method: "POST",
			Path:   "/api/fs/copy",
			ExtraHeaders: map[string]string{
				"Authorization": f.token,
			},
		}

		fs.Debugf(nil, "Copy: 发送复制请求\n  源目录: %q\n  目标目录: %q\n  源文件名: %q", srcDir, dstDir, srcName)

		resp, err := f.srv.CallJSON(ctx, &opts, &copyReq, &copyResp)
		defer func() {
			if resp != nil && resp.Body != nil {
				_ = resp.Body.Close()
			}
		}()
		return f.shouldRetry(ctx, resp, err)
	})

	if err != nil {
		fs.Debugf(nil, "Copy: 网络/系统错误 err=%v (src=%q, dst=%q)", err, srcPath, dstPath)
		return nil, fmt.Errorf("复制文件失败: %w", err)
	}

	// 检查 API 响应状态
	if copyResp.Code != 200 {
		fs.Debugf(nil, "Copy: API 错误 Code=%d, Message=%q (src=%q, dst=%q)", copyResp.Code, copyResp.Message, srcPath, dstPath)
		if copyResp.Code == 403 {
			return nil, fs.ErrorDirExists
		}
		// 400/501 等表示后端不支持该操作，告知 core 回退到客户端实现
		if copyResp.Code == 400 || copyResp.Code == 501 {
			return nil, fs.ErrorCantCopy
		}
		return nil, fmt.Errorf("复制文件失败: %s (代码:%d)", copyResp.Message, copyResp.Code)
	}

	fs.Debugf(nil, "Copy: 复制成功 (src=%q, dst=%q)", srcPath, dstPath)

	// 读取目标文件的元数据
	dstObj, err := f.NewObject(ctx, remote)
	if err != nil {
		fs.Debugf(nil, "Copy: 读取目标文件元数据失败: %v (remote=%q)", err, remote)
		return nil, err
	}

	return dstObj, nil
}

// About 获取配额信息
func (f *Fs) About(ctx context.Context) (usage *fs.Usage, err error) {
	// Alist 不提供标准的配额/存储使用 API 端点
	// 返回 nil 表示该功能不可用
	return nil, nil
}

// 备份功能已移除：不在后端预先执行覆盖前备份逻辑

// Move 用服务器端移动操作将 src 移动到此远程位置。
//
// 存储为给定的远程路径。
//
// 返回目标对象和可能的错误。
//
// 仅当 src.Fs().Name() == f.Name() 时才调用
//
// 如果不可能则返回 fs.ErrorCantMove
func (f *Fs) Move(ctx context.Context, src fs.Object, remote string) (fs.Object, error) {
	srcObj, ok := src.(*Object)
	if !ok {
		fs.Debugf(nil, "Move: 源对象不是 Alist 对象，无法服务器端移动")
		return nil, fs.ErrorCantMove
	}

	// 源完整路径（优先使用对象 parent，若缺失则通过 dirCache 查找）
	srcDir, srcName, err := f.dirPathLeaf(ctx, srcObj.remote, srcObj.parent)
	if err != nil {
		fs.Debugf(nil, "Move: 无法解析源路径: %v", err)
		return nil, err
	}
	var srcPath string
	if srcDir == "" || srcDir == "/" {
		srcPath = "/" + srcName
	} else {
		srcPath = srcDir + "/" + srcName
	}

	// 目标完整路径
	dstLeaf, dstDirPath, err := f.dirCache.FindPath(ctx, remote, true)
	if err != nil {
		fs.Debugf(nil, "Move: 获取目标目录路径失败: %v", err)
		return nil, err
	}
	if dstDirPath == "" {
		dstDirPath = f.root
	}

	var dstPath string
	if dstDirPath == "" || dstDirPath == "/" {
		dstPath = "/" + dstLeaf
	} else {
		dstPath = dstDirPath + "/" + dstLeaf
	}

	fs.Debugf(nil, "Move: 源路径=%q 目标路径=%q", srcPath, dstPath)

	// 目标文件处理按后端/上层策略执行（不在此处预先备份）

	// 计算目录/文件名
	srcDirForReq := path.Dir(srcPath)
	if srcDirForReq == "." {
		srcDirForReq = "/"
	}
	srcName = path.Base(srcPath)

	dstDir := path.Dir(dstPath)
	if dstDir == "." {
		dstDir = "/"
	}
	dstName := path.Base(dstPath)

	// 1) 如果“路径一致（同目录）”，调用 /api/fs/rename
	if srcDir == dstDir {
		// 若文件名也一致，直接返回
		if srcName == dstName {
			fs.Debugf(nil, "Move: 源路径与目标路径完全一致，跳过")
			return f.NewObject(ctx, remote)
		}

		var renameResp RenameResponse
		err = f.pacer.Call(func() (bool, error) {
			req := RenameRequest{
				Path: srcPath,
				Name: dstName,
			}
			opts := rest.Opts{
				Method: "POST",
				Path:   "/api/fs/rename",
				ExtraHeaders: map[string]string{
					"Authorization": f.token,
				},
			}
			resp, err := f.srv.CallJSON(ctx, &opts, &req, &renameResp)
			defer func() {
				if resp != nil && resp.Body != nil {
					_ = resp.Body.Close()
				}
			}()
			return f.shouldRetry(ctx, resp, err)
		})
		if err != nil {
			return nil, fmt.Errorf("重命名失败: %w", err)
		}
		if renameResp.Code != 200 {
			if renameResp.Code == 403 {
				return nil, fs.ErrorDirExists
			}
			return nil, fmt.Errorf("重命名失败: %s (代码:%d)", renameResp.Message, renameResp.Code)
		}

		// 刷新目录缓存
		f.dirCache.FlushDir(srcDir)

		return f.NewObject(ctx, remote)
	}

	// 2) 路径不一致，调用 /api/fs/move
	var moveResp MoveResponse
	err = f.pacer.Call(func() (bool, error) {
		req := MoveRequest{
			SrcDir: srcDir,
			DstDir: dstDir,
			Names:  []string{srcName},
		}
		opts := rest.Opts{
			Method: "POST",
			Path:   "/api/fs/move",
			ExtraHeaders: map[string]string{
				"Authorization": f.token,
			},
		}
		resp, err := f.srv.CallJSON(ctx, &opts, &req, &moveResp)
		defer func() {
			if resp != nil && resp.Body != nil {
				_ = resp.Body.Close()
			}
		}()
		return f.shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return nil, fmt.Errorf("移动失败: %w", err)
	}
	if moveResp.Code != 200 {
		if moveResp.Code == 403 {
			return nil, fs.ErrorDirExists
		}
		if moveResp.Code == 400 || moveResp.Code == 501 {
			return nil, fs.ErrorCantMove
		}
		return nil, fmt.Errorf("移动失败: %s (代码:%d)", moveResp.Message, moveResp.Code)
	}

	// 刷新目录缓存，若为相同目录仅刷新一次以避免重复操作
	if srcDir == dstDir {
		f.dirCache.FlushDir(srcDir)
	} else {
		f.dirCache.FlushDir(srcDir)
		f.dirCache.FlushDir(dstDir)
	}

	return f.NewObject(ctx, remote)
}

// DirMove 在服务器端将整个目录从 srcRemote 移动到 dstRemote。
//
// 作用与语义（对 rclone core 的影响）：
//   - DirMove 代表一个后端提供的“原子”目录级移动能力。当实现返回 nil 时，
//     rclone core 认为服务器端已完成整个目录的迁移，无需逐文件复制+删除。
//   - 如果后端不能或不安全地提供该语义，DirMove 必须返回 fs.ErrorCantDirMove，
//     触发 rclone core 的回退逻辑（客户端逐文件复制+删除）。
//   - 当目标已存在且后端以明确冲突响应拒绝时，应返回 fs.ErrorDirExists，
//     以便 core 执行上层冲突处理策略。
//
// 本实现说明：
//   - 优先尝试调用 Alist 的聚合移动接口 `/api/fs/recursive_move`（若可用），
//     并使用保守的覆盖策略（尝试传入 `overwrite=false`，以避免意外覆盖）。
//   - 若 `/api/fs/recursive_move` 明确不可用或返回不支持语义，本方法将继续
//     使用更局部的 API（如 `/api/fs/rename` 或 `/api/fs/move`）处理可行的同目录
//     或同名移动场景；若这些操作也不适用，则返回 fs.ErrorCantDirMove。
func (f *Fs) DirMove(ctx context.Context, src fs.Fs, srcRemote, dstRemote string) (err error) {
	// 尝试使用 Alist 的 /api/fs/move 或 /api/fs/rename 实现目录移动。
	// 注意：Alist 的 move 端点在不同实现中可能不支持跨目录改名。

	// 仅在源也是 Alist 后端时尝试服务器端移动
	srcFs, ok := src.(*Fs)
	if !ok {
		fs.Debugf(nil, "DirMove: 源不是 Alist 后端，放弃服务器端目录移动")
		return fs.ErrorCantDirMove
	}

	// 简单安全检查：要求源和目标指向同一 Alist 实例（通过 api_url 比较）
	if srcFs.opt.APIURL != f.opt.APIURL {
		fs.Debugf(nil, "DirMove: 源和目标 API URL 不同，无法服务器端移动 (%q != %q)", srcFs.opt.APIURL, f.opt.APIURL)
		return fs.ErrorCantDirMove
	}

	// 解析源目录的父目录与叶名
	srcLeaf, srcDirPath, err := srcFs.dirCache.FindPath(ctx, srcRemote, false)
	if err != nil {
		return fmt.Errorf("DirMove: 无法定位源目录 %q: %w", srcRemote, err)
	}

	// 解析目标目录的父目录与叶名（尝试创建目标父目录）
	dstLeaf, dstDirPath, err := f.dirCache.FindPath(ctx, dstRemote, true)
	if err != nil {
		return fmt.Errorf("DirMove: 无法定位目标目录 %q: %w", dstRemote, err)
	}

	// 先尝试使用 Alist 提供的聚合移动接口（`/api/fs/recursive_move`），
	// 以便在服务端递归移动整个目录树（更高效且接近原子性）。
	// 构造源/目标完整路径（Alist 使用路径字符串，如 "/" 或 "/foo/bar"）
	var srcFullPath string
	if srcDirPath == "" || srcDirPath == "/" {
		srcFullPath = "/" + srcLeaf
	} else {
		srcFullPath = srcDirPath + "/" + srcLeaf
	}

	var dstFullPath string
	if dstDirPath == "" || dstDirPath == "/" {
		dstFullPath = "/" + dstLeaf
	} else {
		dstFullPath = dstDirPath + "/" + dstLeaf
	}

	// 组装请求体，保守地使用 overwrite=false（若后端支持该字段）
	recursiveReq := RecursiveMoveRequest{
		SrcDir:    srcFullPath,
		DstDir:    dstFullPath,
		Overwrite: false,
	}
	var recursiveResp RecursiveMoveResponse
	err = f.pacer.Call(func() (bool, error) {
		opts := rest.Opts{
			Method: "POST",
			Path:   "/api/fs/recursive_move",
			ExtraHeaders: map[string]string{
				"Authorization": f.token,
			},
		}
		resp, err := f.srv.CallJSON(ctx, &opts, &recursiveReq, &recursiveResp)
		defer func() {
			if resp != nil && resp.Body != nil {
				_ = resp.Body.Close()
			}
		}()
		return f.shouldRetry(ctx, resp, err)
	})
	if err == nil {
		if recursiveResp.Code == 200 {
			// 成功：刷新目录缓存并返回
			f.dirCache.FlushDir(srcDirPath)
			f.dirCache.FlushDir(dstDirPath)
			return nil
		}
		if recursiveResp.Code == 403 {
			return fs.ErrorDirExists
		}
		// 如果后端明确返回不支持或错误（例如 400/501），记录并继续回退到后续逻辑
		if recursiveResp.Code == 400 || recursiveResp.Code == 501 {
			fs.Debugf(nil, "DirMove: 聚合移动不被支持或请求参数不被接受, code=%d message=%q", recursiveResp.Code, recursiveResp.Message)
			// 继续尝试更局部的 rename/move
		} else {
			// 其他错误视为操作失败，返回具体错误
			return fmt.Errorf("DirMove: 聚合移动失败: %s (代码:%d)", recursiveResp.Message, recursiveResp.Code)
		}
	} else {
		// 网络/重试类错误：记录并继续回退到后续逻辑以便可能的局部移动
		fs.Debugf(nil, "DirMove: 调用聚合移动时遇到网络/系统错误: %v", err)
	}

	// 如果聚合移动未成功或不适用，则继续下面的局部移动逻辑

	// 如果父目录相同，可尝试重命名（/api/fs/rename）
	if srcDirPath == dstDirPath {
		if srcLeaf == dstLeaf {
			// 相同路径与名字：不需要移动
			fs.Debugf(nil, "DirMove: 源与目标完全一致，跳过")
			return nil
		}

		var renameResp RenameResponse
		err = f.pacer.Call(func() (bool, error) {
			req := RenameRequest{
				Path: path.Join(srcDirPath, srcLeaf),
				Name: dstLeaf,
			}
			opts := rest.Opts{
				Method: "POST",
				Path:   "/api/fs/rename",
				ExtraHeaders: map[string]string{
					"Authorization": f.token,
				},
			}
			resp, err := f.srv.CallJSON(ctx, &opts, &req, &renameResp)
			defer func() {
				if resp != nil && resp.Body != nil {
					_ = resp.Body.Close()
				}
			}()
			return f.shouldRetry(ctx, resp, err)
		})
		if err != nil {
			return fmt.Errorf("DirMove: 重命名失败: %w", err)
		}
		if renameResp.Code != 200 {
			if renameResp.Code == 403 {
				return fs.ErrorDirExists
			}
			return fmt.Errorf("DirMove: 重命名失败: %s (代码:%d)", renameResp.Message, renameResp.Code)
		}

		f.dirCache.FlushDir(srcDirPath)
		return nil
	}

	// 父目录不同：如果叶名一致，可尝试调用 /api/fs/move
	if srcLeaf != dstLeaf {
		// 许多 Alist 实现不支持跨目录并改名的原子操作
		fs.Debugf(nil, "DirMove: 跨目录并改名不被支持，放弃服务器端移动 (srcLeaf=%q dstLeaf=%q)", srcLeaf, dstLeaf)
		return fs.ErrorCantDirMove
	}

	var moveResp MoveResponse
	err = f.pacer.Call(func() (bool, error) {
		req := MoveRequest{
			SrcDir: srcDirPath,
			DstDir: dstDirPath,
			Names:  []string{srcLeaf},
		}
		opts := rest.Opts{
			Method: "POST",
			Path:   "/api/fs/move",
			ExtraHeaders: map[string]string{
				"Authorization": f.token,
			},
		}
		resp, err := f.srv.CallJSON(ctx, &opts, &req, &moveResp)
		defer func() {
			if resp != nil && resp.Body != nil {
				_ = resp.Body.Close()
			}
		}()
		return f.shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return fmt.Errorf("DirMove: 移动失败: %w", err)
	}
	if moveResp.Code != 200 {
		if moveResp.Code == 403 {
			return fs.ErrorDirExists
		}
		// 如果后端明确不支持此操作，返回 ErrorCantDirMove 让 rclone 回退
		if moveResp.Code == 400 || moveResp.Code == 501 {
			fs.Debugf(nil, "DirMove: 后端不支持目录移动, code=%d message=%q", moveResp.Code, moveResp.Message)
			return fs.ErrorCantDirMove
		}
		return fmt.Errorf("DirMove: 移动失败: %s (代码:%d)", moveResp.Message, moveResp.Code)
	}

	// 刷新源与目标目录缓存
	f.dirCache.FlushDir(srcDirPath)
	f.dirCache.FlushDir(dstDirPath)

	return nil
}

// Purge 删除目录中的所有文件
//
// 可选接口：仅当你有方法
// 比对列表结果逐个运行 Remove() 更快删除所有文件时才实现此接口
func (f *Fs) Purge(ctx context.Context, dir string) error {
	return f.purgeCheck(ctx, dir, false)
}

// 从路径返回一个对象
//
// 如果找不到则返回错误 fs.ErrorObjectNotFound
func (f *Fs) newObjectWithInfo(ctx context.Context, remote string, file *File, parent string) (fs.Object, error) {
	// fs.Debugf(nil, "newObjectWithInfo(%s, %v)", remote, file)

	var o *Object
	if nil != file {
		o = &Object{
			fs:      f,
			remote:  remote,
			id:      file.FileID,
			parent:  parent,
			modTime: time.Unix(file.DateModified, 0),
			size:    file.Size,
			md5:     file.FileHash,
		}
	} else {
		o = &Object{
			fs:     f,
			remote: remote,
		}

		err := o.readMetaData(ctx)
		if err != nil {
			return nil, err
		}
	}
	return o, nil
}

// NewObject 查找远程位置的对象。如果找不到
// 它返回错误 fs.ErrorObjectNotFound。
func (f *Fs) NewObject(ctx context.Context, remote string) (fs.Object, error) {
	// fs.Debugf(nil, "NewObject(\"%s\")", remote)
	return f.newObjectWithInfo(ctx, remote, nil, "")
}

// 从传入的参数创建一个半成品对象，该对象
// 必须调用 setMetaData 来完成初始化
//
// 返回对象、叶节点、目录ID 和错误。
//
// 用于创建新对象
func (f *Fs) createObject(ctx context.Context, remote string, modTime time.Time, size int64) (o *Object, leaf string, directoryID string, err error) {
	// 如果对象的目录不存在，则创建该目录
	leaf, directoryID, err = f.dirCache.FindPath(ctx, remote, true)
	if err != nil {
		return nil, leaf, directoryID, err
	}
	// fs.Debugf(nil, "\n...leaf %#v\n...id %#v", leaf, directoryID)
	// 正在构建的临时对象
	// 注意: 记录父目录 (directoryID) 到对象的 parent 字段，
	// 以便后续的 Move/Copy 操作能正确构造源完整路径，
	// 避免在上传 partial 后 parent 为空导致的路径丢失问题。
	o = &Object{
		fs:     f,
		remote: remote,
		parent: directoryID,
	}
	return o, f.opt.Enc.FromStandardName(leaf), directoryID, nil
}

// dirPathLeaf 返回给定 remote 的目录路径和叶名。
// 优先使用传入的 parent；如果 parent 为空则使用 dirCache 查找。
func (f *Fs) dirPathLeaf(ctx context.Context, remote, parent string) (dirPath string, leaf string, err error) {
	if parent != "" {
		return parent, remote, nil
	}
	leaf, dirPath, err = f.dirCache.FindPath(ctx, remote, false)
	if err != nil {
		return "", "", err
	}
	return dirPath, leaf, nil
}

// readMetaDataForFolderID 使用 Alist API 从路径读取元数据
func (f *Fs) readMetaDataForFolderID(ctx context.Context, id string) (info *FolderList, err error) {
	// id 现在是一个路径字符串（例如 "/" 或 "/folder1"）
	var listResp ListResponse
	var resp *http.Response

	listReq := ListRequest{
		Path: id,
	}

	opts := rest.Opts{
		Method:       "POST",
		Path:         "/api/fs/list",
		ExtraHeaders: map[string]string{"Authorization": f.token},
	}

	err = f.pacer.Call(func() (bool, error) {
		resp, err = f.srv.CallJSON(ctx, &opts, &listReq, &listResp)
		return f.shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return nil, err
	}

	if listResp.Code != 200 {
		return nil, fmt.Errorf("获取文件夹列表失败: 代码=%d, 消息=%s", listResp.Code, listResp.Message)
	}

	// 将 ListResponse 转换为 FolderList 格式
	info = &FolderList{
		Name: id,
	}

	// 从 Content 中提取文件和文件夹
	for _, item := range listResp.Data.Content {
		if item.IsDir {
			// 这是一个文件夹
			folder := Folder{
				Name:     item.Name,
				FolderID: item.Name, // 对于 Alist，使用名称作为标识符
			}
			info.Folders = append(info.Folders, folder)
		} else {
			// 这是一个文件
			file := File{
				Name: item.Name,
				Size: item.Size,
			}
			info.Files = append(info.Files, file)
		}
	}

	return info, nil
}

// ListDir 列出指定目录中的所有子目录（必须由dircache调用）
// 这个方法用于dircache内部的目录缓存操作
func (f *Fs) ListDir(ctx context.Context, dirID string) (entries fs.DirEntries, err error) {
	// dirID 是目录的标识符（在Alist中就是路径字符串）
	var listResp ListResponse
	var resp *http.Response

	listReq := ListRequest{
		Path: dirID,
	}

	opts := rest.Opts{
		Method:       "POST",
		Path:         "/api/fs/list",
		ExtraHeaders: map[string]string{"Authorization": f.token},
	}

	err = f.pacer.Call(func() (bool, error) {
		resp, err = f.srv.CallJSON(ctx, &opts, &listReq, &listResp)
		return f.shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return nil, fmt.Errorf("列表目录失败: %w", err)
	}

	if listResp.Code != 200 {
		if listResp.Code == 404 {
			return fs.DirEntries{}, nil
		}
		return nil, fmt.Errorf("列表目录失败: 代码=%d, 消息=%s", listResp.Code, listResp.Message)
	}

	// 只返回子目录，不返回文件（这是dircache.ListDir的约定）
	for _, item := range listResp.Data.Content {
		if item.IsDir {
			itemName := f.opt.Enc.ToStandardName(item.Name)
			// 构造子目录的路径
			subDirPath := dirID
			if subDirPath == "" || subDirPath == "/" {
				subDirPath = "/" + item.Name
			} else {
				subDirPath = subDirPath + "/" + item.Name
			}
			// 创建目录条目
			d := fs.NewDir(itemName, time.Unix(parseModifiedTime(item.Modified), 0)).SetID(subDirPath)
			entries = append(entries, d)
		}
	}

	return entries, nil
}

// Put 将对象放入桶中
//
// 将读取器复制到返回的新对象中。
//
// 如果返回错误，新对象可能已被创建
func (f *Fs) Put(ctx context.Context, in io.Reader, src fs.ObjectInfo, options ...fs.OpenOption) (fs.Object, error) {
	remote := src.Remote()
	size := src.Size()
	modTime := src.ModTime(ctx)

	// fs.Debugf(nil, "Put(%s)", remote)

	o, _, _, err := f.createObject(ctx, remote, modTime, size)
	if err != nil {
		return nil, err
	}

	// 通过 Update 方法处理实际上传
	err = o.Update(ctx, in, src, options...)
	if err != nil {
		return nil, err
	}

	// 上传成功，直接返回对象
	// rclone 框架会自动处理 .partial 文件的重命名和刷新
	return o, nil
}

// retryErrorCodes 是一个错误代码数组，遇到这些代码时会进行重试
var retryErrorCodes = []int{
	401, // 未授权（在"令牌已过期"中见过）
	408, // 请求超时
	423, // 锁定 - 有时在文件夹上出现
	429, // 超过速率限制
	500, // 偶尔出现 500 内部服务器错误
	502, // 网关错误（在大型列表时出现）
	503, // 服务不可用
	504, // 网关超时
}

// shouldRetry 返回一个布尔值，表示该响应和错误
// 是否应该重试。为方便起见，它返回该错误
func (f *Fs) shouldRetry(ctx context.Context, resp *http.Response, err error) (bool, error) {
	if fserrors.ContextError(ctx, &err) {
		return false, err
	}
	return fserrors.ShouldRetry(err) || fserrors.ShouldRetryHTTP(resp, retryErrorCodes), err
}

// getAccessLevel 是一个帮助函数，用于确定访问级别整数
//
//nolint:unused // 保留给未来使用
func getAccessLevel(access string) int64 {
	var accessLevel int64
	switch access {
	case "private":
		accessLevel = 0
	case "public":
		accessLevel = 1
	case "hidden":
		accessLevel = 2
	default:
		accessLevel = 0
		fs.Errorf(nil, "Invalid access: %s, defaulting to private", access)
	}
	return accessLevel
}

// DirCacher methods

// CreateDir makes a directory with pathID as parent and name leaf
// 注意：在Alist中，pathID实际上是一个路径字符串（作为父目录标识符）
func (f *Fs) CreateDir(ctx context.Context, pathID, leaf string) (newID string, err error) {
	// fs.Debugf(f, "CreateDir(pathID=%q, leaf=%q)\n", pathID, leaf)

	// 构造新目录的完整路径
	leaf = f.opt.Enc.FromStandardName(leaf)
	var newPath string
	if pathID == "" {
		// 在dircache根目录下创建（对应于f.root位置）
		// 使用f.root而不是"/"，以正确支持root_path配置
		if f.root == "" || f.root == "/" {
			newPath = "/" + leaf
		} else {
			newPath = f.root + "/" + leaf
		}
	} else {
		// 在子目录下创建
		newPath = pathID + "/" + leaf
	}

	// 调用Alist创建目录API
	var mkdirResp MkdirResponse
	err = f.pacer.Call(func() (bool, error) {
		mkdirReq := MkdirRequest{
			Path: newPath,
		}
		opts := rest.Opts{
			Method: "POST",
			Path:   "/api/fs/mkdir",
			ExtraHeaders: map[string]string{
				"Authorization": f.token,
			},
		}
		resp, err := f.srv.CallJSON(ctx, &opts, &mkdirReq, &mkdirResp)
		defer func() {
			if resp != nil && resp.Body != nil {
				_ = resp.Body.Close()
			}
		}()
		return f.shouldRetry(ctx, resp, err)
	})

	if err != nil {
		return "", fmt.Errorf("创建目录失败 %q: %w", newPath, err)
	}

	// 检查API响应状态
	if mkdirResp.Code != 200 {
		return "", fmt.Errorf("创建目录失败 %q: %s", newPath, mkdirResp.Message)
	}

	// 返回新目录的路径作为newID
	return newPath, nil
}

// FindLeaf 在具有 ID pathID 的文件夹中查找名称为 leaf 的目录
// 注意：在Alist中，pathID 是 Alist API 能直接使用的完整路径（例如 "/" 或 "/夸克网盘" 或 "/夸克网盘/a"）
func (f *Fs) FindLeaf(ctx context.Context, pathID, leaf string) (pathIDOut string, found bool, err error) {
	fs.Debugf(nil, "FindLeaf(pathID=%q, leaf=%q) 开始查询", pathID, leaf)

	// 根目录特殊处理
	if pathID == "" && leaf == "" {
		// 这是根目录
		fs.Debugf(nil, "FindLeaf: 找到根目录")
		return "", true, nil
	}

	// pathID 是 Alist API 路径，可以直接使用
	// 如果 pathID 是空，表示dircache的根目录，对应于f.root位置
	var apiPath string
	if pathID == "" {
		// 在dircache根处，对应f.root位置
		if f.root == "" || f.root == "/" {
			apiPath = "/"
		} else {
			apiPath = f.root
		}
	} else {
		apiPath = pathID
	}

	fs.Debugf(nil, "FindLeaf: 开始列表查询 %q 以查找 leaf=%q", apiPath, leaf)

	// 调用Alist列表API获取目录内容
	var listResp ListResponse
	err = f.pacer.Call(func() (bool, error) {
		listReq := ListRequest{
			Path: apiPath,
		}
		opts := rest.Opts{
			Method: "POST",
			Path:   "/api/fs/list",
			ExtraHeaders: map[string]string{
				"Authorization": f.token,
			},
		}
		resp, err := f.srv.CallJSON(ctx, &opts, &listReq, &listResp)
		defer func() {
			if resp != nil && resp.Body != nil {
				_ = resp.Body.Close()
			}
		}()
		return f.shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return "", false, fmt.Errorf("列表目录失败 %q: %w", apiPath, err)
	}

	// 检查API响应状态
	if listResp.Code != 200 {
		fs.Debugf(nil, "FindLeaf: API 错误 %q: 代码=%d, 消息=%s", apiPath, listResp.Code, listResp.Message)
		return "", false, fmt.Errorf("列表目录失败 %q: %s", apiPath, listResp.Message)
	}

	// 在返回的内容中查找匹配的项（区分大小写或不区分取决于特性设置）
	leaf = f.opt.Enc.FromStandardName(leaf)
	for _, item := range listResp.Data.Content {
		// 比较文件名（考虑编码处理）
		itemName := f.opt.Enc.FromStandardName(item.Name)
		if itemName == leaf && item.IsDir {
			// 找到了目录，返回新的路径作为pathID（API 路径格式）
			if apiPath == "/" {
				// 从根目录开始
				pathIDOut = "/" + item.Name
			} else {
				// 从子目录开始
				pathIDOut = apiPath + "/" + item.Name
			}
			fs.Debugf(nil, "FindLeaf: 找到目录 %q, 返回 pathID=%q", item.Name, pathIDOut)
			return pathIDOut, true, nil
		}
	}

	// 未找到
	fs.Debugf(nil, "FindLeaf: 在 %q 中未找到 %q", apiPath, leaf)
	return "", false, nil
}

// List 将 dir 中的对象和目录列到 entries 中。
// 条目可以以任何顺序返回，但应该是完整目录。
//
// dir 应该是 "" 以列出根目录，不应该有
// 尾部斜杠。
//
// 如果找不到目录，应该返回 ErrDirNotFound。
func (f *Fs) List(ctx context.Context, dir string) (entries fs.DirEntries, err error) {
	// fs.Debugf(nil, "List(%v)", dir)
	directoryPath, err := f.dirCache.FindDir(ctx, dir, false)
	if err != nil {
		return nil, err
	}

	// directoryPath 现在是一个路径字符串（例如 "/" 或 "/folder1"）
	var listResp ListResponse
	var resp *http.Response

	listReq := ListRequest{
		Path: directoryPath,
	}

	opts := rest.Opts{
		Method:       "POST",
		Path:         "/api/fs/list",
		ExtraHeaders: map[string]string{"Authorization": f.token},
	}

	err = f.pacer.Call(func() (bool, error) {
		resp, err = f.srv.CallJSON(ctx, &opts, &listReq, &listResp)
		return f.shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return nil, fmt.Errorf("获取文件夹列表失败: %w", err)
	}

	if listResp.Code != 200 {
		if listResp.Code == 404 {
			return fs.DirEntries{}, nil
		}
		return nil, fmt.Errorf("列表目录失败: 代码=%d, 消息=%s", listResp.Code, listResp.Message)
	}

	// 处理从 Alist 返回的项
	for _, item := range listResp.Data.Content {
		itemName := f.opt.Enc.ToStandardName(item.Name)

		if item.IsDir {
			// 这是一个目录
			remote := path.Join(dir, itemName)
			// 为此子目录构造路径
			subDirPath := directoryPath
			if subDirPath == "" {
				subDirPath = "/" + item.Name
			} else if subDirPath == "/" {
				subDirPath = "/" + item.Name
			} else {
				subDirPath = subDirPath + "/" + item.Name
			}
			// 缓存目录路径以供后续查找使用
			f.dirCache.Put(remote, subDirPath)
			d := fs.NewDir(remote, time.Unix(parseModifiedTime(item.Modified), 0)).SetID(subDirPath)
			d.SetParentID(directoryPath)
			entries = append(entries, d)
		} else {
			// 这是一个文件
			remote := path.Join(dir, itemName)
			file := &File{
				FileID:       item.Name, // 对于 Alist，使用名称作为文件标识符
				Name:         item.Name,
				Size:         item.Size,
				DateModified: parseModifiedTime(item.Modified),
				FileHash:     item.HashInfo,
			}
			o, err := f.newObjectWithInfo(ctx, remote, file, directoryPath)
			if err != nil {
				return nil, err
			}
			entries = append(entries, o)
		}
	}

	return entries, nil
}

// ------------------------------------------------------------

// Fs 返回父文件系统
func (o *Object) Fs() fs.Info {
	return o.fs
}

// Return 字符串版本
func (o *Object) String() string {
	if o == nil {
		return "<nil>"
	}
	return o.remote
}

// Remote 返回远程路径
func (o *Object) Remote() string {
	return o.remote
}

// Hash 返回对象的 Md5 值，为小写十六进制字符串
func (o *Object) Hash(ctx context.Context, t hash.Type) (string, error) {
	if t != hash.MD5 {
		return "", hash.ErrUnsupported
	}
	return o.md5, nil
}

// Size 返回对象的字节大小
func (o *Object) Size() int64 {
	return o.size // 对象可能处于待定状态
}

// ModTime 返回对象的修改时间
//
// 它尝试读取对象的 mtime，如果不存在则使用
// HTTP 标头中返回的 LastModified 时间
func (o *Object) ModTime(ctx context.Context) time.Time {
	return o.modTime
}

// SetModTime 设置本地文件系统对象的修改时间
func (o *Object) SetModTime(ctx context.Context, modTime time.Time) error {
	// Alist 不支持修改文件修改时间
	// 在不实际修改任何内容的情况下返回成功
	o.modTime = modTime
	return nil
}

// Open 打开对象以进行读取
func (o *Object) Open(ctx context.Context, options ...fs.OpenOption) (in io.ReadCloser, err error) {
	// fs.Debugf(nil, "Open(\"%v\")", o.remote)
	fs.FixRangeOption(options, o.size)

	// 对于 Alist，需要先获取文件的 raw_url，然后下载
	// 构造完整的绝对路径，优先使用 parent 字段，若缺失则通过 dirCache 查找
	dirPath, leaf, err := o.fs.dirPathLeaf(ctx, o.remote, o.parent)
	if err != nil {
		return nil, fmt.Errorf("无法解析对象路径: %w", err)
	}
	var fullPath string
	if dirPath == "" || dirPath == "/" {
		fullPath = "/" + leaf
	} else {
		fullPath = dirPath + "/" + leaf
	}

	// 第一步：调用 /api/fs/get 获取文件信息（包括 raw_url）
	type getResp struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			RawURL string `json:"raw_url"`
		} `json:"data"`
	}

	var getResponse getResp
	getReq := struct {
		Path string `json:"path"`
	}{Path: fullPath}

	err = o.fs.pacer.Call(func() (bool, error) {
		opts := rest.Opts{
			Method: "POST",
			Path:   "/api/fs/get",
			ExtraHeaders: map[string]string{
				"Authorization": o.fs.token,
			},
		}
		resp, err := o.fs.srv.CallJSON(ctx, &opts, &getReq, &getResponse)
		defer func() {
			if resp != nil && resp.Body != nil {
				_ = resp.Body.Close()
			}
		}()
		if err != nil {
			return o.fs.shouldRetry(ctx, resp, err)
		}

		if getResponse.Code != 200 {
			return false, fmt.Errorf("获取文件下载链接失败: %s (代码:%d)", getResponse.Message, getResponse.Code)
		}

		return false, nil
	})

	if err != nil {
		return nil, err
	}

	if getResponse.Data.RawURL == "" {
		return nil, fmt.Errorf("无法获取文件下载链接: raw_url 为空")
	}

	// 第二步：通过 raw_url 下载文件
	var resp *http.Response
	err = o.fs.pacer.Call(func() (bool, error) {
		opts := rest.Opts{
			Method:  "GET",
			Path:    getResponse.Data.RawURL,
			Options: options,
		}
		resp, err = o.fs.srv.Call(ctx, &opts)
		return o.fs.shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return nil, fmt.Errorf("打开文件失败: %w", err)
	}

	return resp.Body, nil
}

// Remove 删除一个对象
func (o *Object) Remove(ctx context.Context) error {
	// fs.Debugf(nil, "Remove(\"%s\")", o.remote)
	// 使用 Alist /api/fs/remove API 删除文件
	// 获取父目录和文件名分别传递（优先使用 parent，若缺失则通过 dirCache 查找）
	dirPath, leaf, err := o.fs.dirPathLeaf(ctx, o.remote, o.parent)
	if err != nil {
		return fmt.Errorf("删除对象时无法解析路径: %w", err)
	}
	deleteDir := dirPath
	if deleteDir == "" {
		deleteDir = "/"
	}
	deleteName := leaf

	deleteReq := DeleteRequest{
		Dir:   deleteDir,
		Names: []string{deleteName},
	}

	var deleteResp DeleteResponse

	return o.fs.pacer.Call(func() (bool, error) {
		opts := rest.Opts{
			Method:       "POST",
			Path:         "/api/fs/remove",
			ExtraHeaders: map[string]string{"Authorization": o.fs.token},
		}
		resp, err := o.fs.srv.CallJSON(ctx, &opts, &deleteReq, &deleteResp)
		if err != nil {
			return o.fs.shouldRetry(ctx, resp, err)
		}

		// 检查删除是否成功
		if deleteResp.Code != 200 {
			return false, fmt.Errorf("删除失败: 代码=%d, 消息=%s", deleteResp.Code, deleteResp.Message)
		}

		return o.fs.shouldRetry(ctx, resp, nil)
	})
}

// Storable 返回一个布尔值，表示此对象是否可存储
func (o *Object) Storable() bool {
	return true
}

// Update 使用 io.Reader 的内容更新对象（上传文件）
//
// 参数说明：
//   - ctx: 上下文，用于取消和超时控制
//   - in: 输入文件数据流
//   - src: 源文件对象信息（包含修改时间、大小等）
//   - options: 打开选项（如范围、头部等）
//
// 返回值：
//   - 错误信息（如果操作失败）
func (o *Object) Update(ctx context.Context, in io.Reader, src fs.ObjectInfo, options ...fs.OpenOption) error {
	// 获取文件的完整路径
	leaf, directoryPath, err := o.fs.dirCache.FindPath(ctx, o.remote, false)
	if err != nil && err != fs.ErrorDirNotFound {
		return fmt.Errorf("查询路径失败: %w", err)
	}

	// 构造完整的绝对路径
	fullPath := directoryPath
	if directoryPath != "/" {
		fullPath = directoryPath + "/" + leaf
	} else {
		fullPath = "/" + leaf
	}

	fs.Debugf(o, "Update: 上传文件 %q 大小=%d 字节", fullPath, src.Size())

	// 读取全部内容以便设置 Content-Length 并支持重试
	fileData, err := io.ReadAll(in)
	if err != nil {
		return fmt.Errorf("读取文件内容失败: %w", err)
	}

	contentLength := int64(len(fileData))
	bodyReader := bytes.NewReader(fileData)

	err = o.fs.pacer.Call(func() (bool, error) {
		// 重置 Body Reader 位置以支持重试
		if _, err := bodyReader.Seek(0, io.SeekStart); err != nil {
			return false, fmt.Errorf("重置 Body 位置失败: %w", err)
		}

		// 构造请求
		opts := rest.Opts{
			Method:        "PUT",
			Path:          "/api/fs/put",
			Body:          bodyReader,
			ContentType:   "application/octet-stream",
			ContentLength: &contentLength,
			ExtraHeaders: map[string]string{
				"Authorization": o.fs.token,
				"File-Path":     url.QueryEscape(fullPath),
				"As-Task":       "false",
			},
		}

		resp, err := o.fs.srv.Call(ctx, &opts)
		if err != nil {
			return o.fs.shouldRetry(ctx, resp, err)
		}

		// 读取并关闭响应体
		respBody, _ := io.ReadAll(resp.Body)
		fs.CheckClose(resp.Body, &err)

		// 成功上传（2xx）
		if resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices {
			// 解析上传响应（可能为 data == null）
			var uploadResp UploadResponse
			_ = json.Unmarshal(respBody, &uploadResp)

			// 若响应中未提供大小信息，则调用 /api/fs/get 获取单个文件信息（更精确且开销更小）
			o.size = contentLength // 先做保底赋值
			if uploadResp.Data == nil {
				var getResp GetResponse
				getReq := GetRequest{Path: fullPath}
				getOpts := rest.Opts{
					Method:       "POST",
					Path:         "/api/fs/get",
					ExtraHeaders: map[string]string{"Authorization": o.fs.token},
				}
				var gresp *http.Response
				if err := o.fs.pacer.Call(func() (bool, error) {
					gresp, err = o.fs.srv.CallJSON(ctx, &getOpts, &getReq, &getResp)
					if err != nil {
						return o.fs.shouldRetry(ctx, gresp, err)
					}
					return false, nil
				}); err == nil && getResp.Code == 200 {
					o.size = getResp.Data.Size
					o.modTime = time.Unix(parseModifiedTime(getResp.Data.Modified), 0)
					// 尽量填充哈希信息（如果 API 返回）
					if getResp.Data.HashInfo != "" {
						o.md5 = getResp.Data.HashInfo
					}
				} else {
					fs.Debugf(o, "Update: 无法通过 /api/fs/get 获取上传后的文件大小: %v", err)
				}
			}

			// 尽可能设置修改时间
			if mt := src.ModTime(ctx); !mt.IsZero() {
				o.modTime = mt
			}

			fs.Debugf(o, "Update: 上传成功 %q 大小=%d", fullPath, o.size)
			return false, nil
		}

		// 非 2xx 响应作为错误处理
		var errMsg string
		var errResp struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(respBody, &errResp); err == nil && errResp.Message != "" {
			errMsg = errResp.Message
		} else if len(respBody) > 0 {
			errMsg = string(respBody)
		} else {
			errMsg = resp.Status
		}

		return o.fs.shouldRetry(ctx, resp, fmt.Errorf("上传文件失败: %s (状态码:%d)", errMsg, resp.StatusCode))
	})

	return err
}

func (o *Object) readMetaData(ctx context.Context) (err error) {
	leaf, directoryPath, err := o.fs.dirCache.FindPath(ctx, o.remote, false)
	if err != nil {
		if err == fs.ErrorDirNotFound {
			return fs.ErrorObjectNotFound
		}
		return err
	}

	// 构造完整路径并使用 /api/fs/get 获取单个文件信息（更高效且语义明确）
	var fullPath string
	if directoryPath == "/" {
		fullPath = "/" + leaf
	} else {
		fullPath = directoryPath + "/" + leaf
	}

	var getResp GetResponse
	getReq := GetRequest{Path: fullPath}

	opts := rest.Opts{
		Method:       "POST",
		Path:         "/api/fs/get",
		ExtraHeaders: map[string]string{"Authorization": o.fs.token},
	}
	var resp *http.Response
	err = o.fs.pacer.Call(func() (bool, error) {
		resp, err = o.fs.srv.CallJSON(ctx, &opts, &getReq, &getResp)
		return o.fs.shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return fmt.Errorf("获取文件信息失败: %w", err)
	}
	if getResp.Code != 200 {
		return fs.ErrorObjectNotFound
	}

	// 填充对象元数据
	o.id = getResp.Data.Name
	o.modTime = time.Unix(parseModifiedTime(getResp.Data.Modified), 0)
	o.size = getResp.Data.Size
	// 尽量填充哈希信息（如有返回）
	if getResp.Data.HashInfo != "" {
		o.md5 = getResp.Data.HashInfo
	}
	o.parent = directoryPath
	return nil
}

// ID 返回对象的 ID（如已知），否则返回 ""
func (o *Object) ID() string {
	return o.id
}

// ParentID 返回对象的父目录 ID（如已知），否则返回 ""
func (o *Object) ParentID() string {
	return o.parent
}

// 检查接口实现是否满足
var (
	_ fs.Fs              = (*Fs)(nil)
	_ fs.Purger          = (*Fs)(nil)
	_ fs.Copier          = (*Fs)(nil)
	_ fs.Mover           = (*Fs)(nil)
	_ fs.DirMover        = (*Fs)(nil)
	_ fs.DirCacheFlusher = (*Fs)(nil)
	_ fs.Abouter         = (*Fs)(nil)
	_ dircache.DirCacher = (*Fs)(nil)
	_ fs.Object          = (*Object)(nil)
	_ fs.IDer            = (*Object)(nil)
	_ fs.ParentIDer      = (*Object)(nil)
)
