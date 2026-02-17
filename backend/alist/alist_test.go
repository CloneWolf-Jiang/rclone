//nolint:goimports // 包注释格式
// Package alist_test 提供Alist后端的测试
package alist_test

import (
	"testing"

	"github.com/rclone/rclone/backend/alist"
	"github.com/rclone/rclone/fstest/fstests"
)

// TestIntegration 对Alist远程运行集成测试
// 使用标准的rclone文件系统测试框架来验证Alist后端的功能
// 测试项目：
//   - 文件列表操作
//   - 文件上传下载
//   - 目录创建删除
//   - 元数据操作等
func TestIntegration(t *testing.T) {
	// 使用fstests框架运行集成测试
	// RemoteName: 配置文件中的远程名称前缀（需要在rclone配置中定义）
	// NilObject: Alist对象类型，用于测试框架验证
	fstests.Run(t, &fstests.Opt{
		RemoteName: "TestAlist:",
		NilObject:  (*alist.Object)(nil),
	})
}
