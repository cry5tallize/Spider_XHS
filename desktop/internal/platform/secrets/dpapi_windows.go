//go:build windows

package secrets

import (
	"errors"
	"runtime"
	"unsafe"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
	"golang.org/x/sys/windows"
)

type Protector struct{}

func New() *Protector                                { return &Protector{} }
func (*Protector) Provider() accounts.SecretProvider { return accounts.SecretDPAPI }

func blob(value []byte) windows.DataBlob {
	return windows.DataBlob{Size: uint32(len(value)), Data: &value[0]}
}

func (*Protector) Protect(value []byte, scope string) ([]byte, error) {
	return transform(value, scope, false)
}
func (*Protector) Unprotect(value []byte, scope string) ([]byte, error) {
	return transform(value, scope, true)
}

func transform(value []byte, scope string, decrypt bool) ([]byte, error) {
	if len(value) == 0 || len(value) > 1<<20 || scope == "" {
		return nil, errors.New("invalid secret input")
	}
	entropy := []byte("xhs-desktop/account-cookie/v1/" + scope)
	input, extra := blob(value), blob(entropy)
	var output windows.DataBlob
	var err error
	if decrypt {
		err = windows.CryptUnprotectData(&input, nil, &extra, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output)
	} else {
		err = windows.CryptProtectData(&input, nil, &extra, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &output)
	}
	runtime.KeepAlive(value)
	runtime.KeepAlive(entropy)
	if err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(output.Data)))
	return append([]byte(nil), unsafe.Slice(output.Data, int(output.Size))...), nil
}
