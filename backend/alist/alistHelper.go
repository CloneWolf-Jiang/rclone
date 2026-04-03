package alist

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/rclone/rclone/fs"
	"github.com/rclone/rclone/fs/fserrors"
	"github.com/rclone/rclone/lib/rest"
)

var (
	errNotFound = errors.New("未找到")
)

const autoLoginTokenTTL = 48 * time.Hour

const alistStaticHashSalt = "https://github.com/alist-org/alist"

type loginAPIError struct {
	apiPath string
	code    int
	message string
}

func (e *loginAPIError) Error() string {
	return fmt.Sprintf("登录接口 %s 返回错误：code=%d，message=%q", e.apiPath, e.code, e.message)
}

var retryErrorCodes = []int{
	408,
	409,
	423,
	429,
	500,
	502,
	503,
	504,
}

func shouldRetry(ctx context.Context, resp *http.Response, err error) (bool, error) {
	if fserrors.ContextError(ctx, &err) {
		return false, err
	}
	return fserrors.ShouldRetry(err) || fserrors.ShouldRetryHTTP(resp, retryErrorCodes), err
}

func isAPINotFound(code int, message string) bool {
	if code == 404 {
		return true
	}
	msg := strings.ToLower(strings.TrimSpace(message))
	return code == 500 && (msg == "object not found" || strings.Contains(msg, "object not found"))
}

func (f *Fs) ensureAuth(ctx context.Context) error {
	// 用户显式配置 token 时，直接使用，不做自动续期。
	if f.opt.Token != "" && !f.tokenFromLogin {
		f.srv.SetHeader("Authorization", f.opt.Token)
		return nil
	}

	// 自动登录获取的 token 在有效期内可复用。
	if f.tokenFromLogin && f.opt.Token != "" && time.Now().Before(f.tokenExpiresAt) {
		f.srv.SetHeader("Authorization", f.opt.Token)
		return nil
	}

	if f.opt.Username == "" || f.opt.Password == "" {
		return errors.New("未配置 token，且缺少用户名或密码")
	}

	return f.login(ctx)
}

func (f *Fs) callAPI(ctx context.Context, method, apiPath string, request any, response any) error {
	if err := f.ensureAuth(ctx); err != nil {
		return err
	}

	opts := rest.Opts{
		Method: method,
		Path:   apiPath,
	}

	var result apiResponse
	err := f.pacer.Call(func() (bool, error) {
		resp, err := f.srv.CallJSON(ctx, &opts, request, &result)
		return shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return err
	}

	if isAPINotFound(result.Code, result.Message) {
		return errNotFound
	}
	if result.Code >= 400 {
		return fmt.Errorf("alist API 错误：code=%d，message=%q", result.Code, result.Message)
	}
	if response != nil && len(result.Data) > 0 && string(result.Data) != "null" {
		if err := json.Unmarshal(result.Data, response); err != nil {
			return fmt.Errorf("解析 alist 响应失败：%w", err)
		}
	}

	return nil
}

func (f *Fs) login(ctx context.Context) error {
	if f.opt.Token != "" && !f.tokenFromLogin {
		f.srv.SetHeader("Authorization", f.opt.Token)
		f.tokenFromLogin = false
		return nil
	}
	if f.opt.Username == "" || f.opt.Password == "" {
		return errors.New("请配置 token，或同时配置用户名与密码")
	}

	// 先尝试明文登录，失败后按条件回退到 hash 登录（兼容新旧版本和前端口令处理方式）。
	data, err := f.loginWithRequest(ctx, "/auth/login", f.opt.Password)
	if err != nil {
		// 触发限流时立即返回，避免继续重试导致锁定时间延长。
		var apiErr *loginAPIError
		if errors.As(err, &apiErr) && apiErr.code == 429 {
			return fmt.Errorf("alist 登录受限：%w", err)
		}

		if isSHA256Hex(f.opt.Password) {
			data, err = f.loginWithRequest(ctx, "/auth/login/hash", f.opt.Password)
			if err != nil {
				return fmt.Errorf("alist 登录失败（已尝试明文与预哈希密码）：%w", err)
			}
		} else {
			hashPwd := alistStaticHash(f.opt.Password)
			data, err = f.loginWithRequest(ctx, "/auth/login/hash", hashPwd)
			if err != nil {
				return fmt.Errorf("alist 登录失败（明文与 hash 均失败）：%w", err)
			}
		}
	}

	// 自动获取的 token 仅保存在进程内存中，不写回配置文件。
	f.opt.Token = data.Token
	f.tokenFromLogin = true
	f.tokenExpiresAt = time.Now().Add(autoLoginTokenTTL)
	f.srv.SetHeader("Authorization", data.Token)
	fs.Debugf(f, "已通过用户名密码自动获取 token（有效期 48 小时）")
	return nil
}

func (f *Fs) loginWithRequest(ctx context.Context, apiPath, password string) (loginData, error) {
	opts := rest.Opts{Method: "POST", Path: apiPath}
	var data loginData
	var result apiResponse

	err := f.pacer.Call(func() (bool, error) {
		resp, err := f.srv.CallJSON(ctx, &opts, &loginRequest{
			Username: f.opt.Username,
			Password: password,
		}, &result)
		return shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return loginData{}, err
	}
	if result.Code >= 400 {
		return loginData{}, &loginAPIError{apiPath: apiPath, code: result.Code, message: result.Message}
	}
	if len(result.Data) > 0 && string(result.Data) != "null" {
		if err := json.Unmarshal(result.Data, &data); err != nil {
			return loginData{}, fmt.Errorf("解析登录响应失败：%w", err)
		}
	}
	if data.Token == "" {
		return loginData{}, fmt.Errorf("登录接口 %s 成功但 token 为空", apiPath)
	}

	return data, nil
}

func alistStaticHash(password string) string {
	s := password + "-" + alistStaticHashSalt
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func isSHA256Hex(s string) bool {
	if len(s) != 64 {
		return false
	}
	_, err := hex.DecodeString(s)
	return err == nil
}

func (f *Fs) apiList(ctx context.Context, fullPath string) ([]entry, error) {
	var data listData
	err := f.callAPI(ctx, "POST", "/fs/list", &listRequest{
		Path:    fullPath,
		Page:    1,
		PerPage: 0,
		Refresh: false,
	}, &data)
	if err != nil {
		return nil, err
	}
	return data.Content, nil
}

func (f *Fs) apiGet(ctx context.Context, fullPath string) (*entry, error) {
	var data entry
	err := f.callAPI(ctx, "POST", "/fs/get", &getRequest{Path: fullPath}, &data)
	if err != nil {
		return nil, err
	}
	return &data, nil
}

func (f *Fs) apiMkdir(ctx context.Context, fullPath string) error {
	return f.callAPI(ctx, "POST", "/fs/mkdir", &mkdirRequest{Path: fullPath}, nil)
}

func (f *Fs) apiRemoveByPath(ctx context.Context, fullPath string) error {
	clean := path.Clean(fullPath)
	if clean == "/" {
		return errors.New("拒绝删除根目录")
	}
	parent := path.Dir(clean)
	name := path.Base(clean)

	return f.apiRemoveByNames(ctx, parent, []string{name})
}

func (f *Fs) apiRemoveByNames(ctx context.Context, dir string, names []string) error {
	if len(names) == 0 {
		return nil
	}
	return f.callAPI(ctx, "POST", "/fs/remove", &removeRequest{
		Dir:   dir,
		Names: names,
	}, nil)
}

func (f *Fs) apiPut(ctx context.Context, fullPath string, in io.Reader, size int64) error {
	if err := f.ensureAuth(ctx); err != nil {
		return err
	}

	opts := rest.Opts{
		Method:        "PUT",
		Path:          "/fs/put",
		Body:          in,
		ContentType:   "application/octet-stream",
		ContentLength: &size,
		ExtraHeaders: map[string]string{
			"File-Path": url.PathEscape(fullPath),
		},
	}

	var result apiResponse
	err := f.pacer.Call(func() (bool, error) {
		resp, err := f.srv.CallJSON(ctx, &opts, nil, &result)
		return shouldRetry(ctx, resp, err)
	})
	if err != nil {
		return err
	}
	if isAPINotFound(result.Code, result.Message) {
		return errNotFound
	}
	if result.Code >= 400 {
		return fmt.Errorf("alist API 错误：code=%d，message=%q", result.Code, result.Message)
	}
	return nil
}

func cleanNonRootPath(fullPath string) (string, error) {
	clean := path.Clean(fullPath)
	if clean == "/" {
		return "", errors.New("拒绝对根目录执行该操作")
	}
	return clean, nil
}

func splitParentBase(fullPath string) (parent string, base string) {
	return path.Dir(fullPath), path.Base(fullPath)
}

func (f *Fs) apiRename(ctx context.Context, fullPath, newName string) error {
	clean, err := cleanNonRootPath(fullPath)
	if err != nil {
		return err
	}
	if strings.TrimSpace(newName) == "" {
		return errors.New("新名称不能为空")
	}

	return f.callAPI(ctx, "POST", "/fs/rename", &renameRequest{
		Path: clean,
		Name: newName,
	}, nil)
}

func (f *Fs) apiMove(ctx context.Context, srcFullPath, dstFullPath string) error {
	srcClean, err := cleanNonRootPath(srcFullPath)
	if err != nil {
		return err
	}
	dstClean, err := cleanNonRootPath(dstFullPath)
	if err != nil {
		return err
	}

	srcDir, srcName := splitParentBase(srcClean)
	dstDir, dstName := splitParentBase(dstClean)

	if err := f.callAPI(ctx, "POST", "/fs/move", &moveRequest{
		SrcDir: srcDir,
		DstDir: dstDir,
		Names:  []string{srcName},
	}, nil); err != nil {
		return err
	}

	if srcName != dstName {
		return f.apiRename(ctx, path.Join(dstDir, srcName), dstName)
	}

	return nil
}

func (f *Fs) apiCopy(ctx context.Context, srcFullPath, dstFullPath string) error {
	srcClean, err := cleanNonRootPath(srcFullPath)
	if err != nil {
		return err
	}
	dstClean, err := cleanNonRootPath(dstFullPath)
	if err != nil {
		return err
	}

	srcDir, srcName := splitParentBase(srcClean)
	dstDir, dstName := splitParentBase(dstClean)

	if err := f.callAPI(ctx, "POST", "/fs/copy", &copyRequest{
		SrcDir: srcDir,
		DstDir: dstDir,
		Names:  []string{srcName},
	}, nil); err != nil {
		return err
	}

	if srcName != dstName {
		return f.apiRename(ctx, path.Join(dstDir, srcName), dstName)
	}

	return nil
}

func parseModTime(s string) time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}
	}

	if ts, err := strconv.ParseInt(s, 10, 64); err == nil {
		if len(s) > 10 {
			return time.UnixMilli(ts)
		}
		return time.Unix(ts, 0)
	}

	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}

	return time.Time{}
}
