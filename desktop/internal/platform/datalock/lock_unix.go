//go:build linux || darwin

package datalock

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

type Lock struct{ file *os.File }

func Acquire(directory string) (*Lock, error) {
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(directory, "instance.lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, errors.New("数据目录正在使用")
	}
	return &Lock{f}, nil
}
func (l *Lock) Close() error {
	return errors.Join(syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN), l.file.Close())
}
