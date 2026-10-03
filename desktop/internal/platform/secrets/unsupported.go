//go:build !windows

package secrets

import (
	"errors"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
)

type Protector struct{}

func New() *Protector                                { return &Protector{} }
func (*Protector) Provider() accounts.SecretProvider { return accounts.SecretUnknown }
func (*Protector) Protect([]byte, string) ([]byte, error) {
	return nil, errors.New("credential protection is not available on this platform")
}
func (*Protector) Unprotect([]byte, string) ([]byte, error) {
	return nil, errors.New("credential protection is not available on this platform")
}
