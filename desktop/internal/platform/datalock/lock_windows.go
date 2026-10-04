//go:build windows

package datalock

import (
	"errors"
	"golang.org/x/sys/windows"
	"os"
	"path/filepath"
)

type Lock struct {
	file       *os.File
	overlapped windows.Overlapped
}

func Acquire(directory string) (*Lock, error) {
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(directory, "instance.lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	l := &Lock{file: file}
	if err = windows.LockFileEx(windows.Handle(file.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &l.overlapped); err != nil {
		file.Close()
		return nil, errors.New("数据目录正在被另一实例或 CLI 使用")
	}
	return l, nil
}
func (l *Lock) Close() error {
	err := windows.UnlockFileEx(windows.Handle(l.file.Fd()), 0, 1, 0, &l.overlapped)
	return errors.Join(err, l.file.Close())
}
