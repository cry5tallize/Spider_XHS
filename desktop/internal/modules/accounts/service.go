package accounts

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

type Repository interface {
	ListAccounts(context.Context) ([]Account, error)
	GetAccount(context.Context, string) (Account, error)
	GetCredential(context.Context, string) (Credential, error)
	CreateAccount(context.Context, Credential) error
	UpdateAccount(context.Context, Update, int64) error
	ReplaceAccountCookie(context.Context, string, []byte, SecretProvider, int64, int64) error
	SetDefaultAccount(context.Context, string, int64) error
	DeleteAccount(context.Context, string, int64) error
	SaveAccountValidation(context.Context, string, int64, Validation) error
}

type Secrets interface {
	Provider() SecretProvider
	Protect([]byte, string) ([]byte, error)
	Unprotect([]byte, string) ([]byte, error)
}

type Probe interface {
	CheckCookie(string) error
	CheckAccount(context.Context, string) (Identity, Status, error)
}

type Service struct {
	repository Repository
	secrets    Secrets
	probe      Probe
	clock      func() time.Time
}

func NewService(repository Repository, secrets Secrets, probe Probe) *Service {
	return &Service{repository, secrets, probe, time.Now}
}

func normalizeName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 128 {
		return "", errors.New("账号名称需为 1～128 个字符")
	}
	return name, nil
}

func (s *Service) normalizeCookie(cookie string) (string, error) {
	cookie = strings.TrimSpace(cookie)
	if len(cookie) >= 7 && strings.EqualFold(cookie[:7], "cookie:") {
		cookie = strings.TrimSpace(cookie[7:])
	}
	if cookie == "" || len(cookie) > 64*1024 {
		return "", errors.New("请填写有效的 Cookie")
	}
	if err := s.probe.CheckCookie(cookie); err != nil {
		return "", err
	}
	return cookie, nil
}

func (s *Service) List(ctx context.Context) ([]Account, error) { return s.repository.ListAccounts(ctx) }

func (s *Service) Create(ctx context.Context, input Create) (Account, error) {
	name, err := normalizeName(input.Name)
	if err != nil {
		return Account{}, err
	}
	cookie, err := s.normalizeCookie(input.Cookie)
	if err != nil {
		return Account{}, err
	}
	id := rand.Text()
	ciphertext, err := s.secrets.Protect([]byte(cookie), id)
	if err != nil {
		return Account{}, errors.New("无法加密 Cookie，本次未保存")
	}
	now := s.clock().UnixMilli()
	account := Account{ID: id, Name: name, Status: Unchecked, Enabled: true, HasCookie: true, CredentialVersion: 1, CreatedAtMS: now, UpdatedAtMS: now}
	if err = s.repository.CreateAccount(ctx, Credential{account, s.secrets.Provider(), ciphertext}); err != nil {
		return Account{}, err
	}
	return s.repository.GetAccount(ctx, id)
}

func (s *Service) Update(ctx context.Context, input Update) (Account, error) {
	name, err := normalizeName(input.Name)
	if err != nil {
		return Account{}, err
	}
	input.Name = name
	if err = s.repository.UpdateAccount(ctx, input, s.clock().UnixMilli()); err != nil {
		return Account{}, err
	}
	return s.repository.GetAccount(ctx, input.ID)
}

func (s *Service) ReplaceCookie(ctx context.Context, input ReplaceCookie) (Account, error) {
	cookie, err := s.normalizeCookie(input.Cookie)
	if err != nil {
		return Account{}, err
	}
	ciphertext, err := s.secrets.Protect([]byte(cookie), input.ID)
	if err != nil {
		return Account{}, errors.New("无法加密 Cookie，本次未保存")
	}
	if err = s.repository.ReplaceAccountCookie(ctx, input.ID, ciphertext, s.secrets.Provider(), input.ExpectedVersion, s.clock().UnixMilli()); err != nil {
		return Account{}, err
	}
	return s.repository.GetAccount(ctx, input.ID)
}

func (s *Service) SetDefault(ctx context.Context, id string) (Account, error) {
	if err := s.repository.SetDefaultAccount(ctx, id, s.clock().UnixMilli()); err != nil {
		return Account{}, err
	}
	return s.repository.GetAccount(ctx, id)
}

func (s *Service) Delete(ctx context.Context, id string) error {
	return s.repository.DeleteAccount(ctx, id, s.clock().UnixMilli())
}

// Validate is an explicit user command. Creating/listing an account never sends a request.
func (s *Service) Validate(ctx context.Context, id string) (Account, error) {
	credential, err := s.repository.GetCredential(ctx, id)
	if err != nil {
		return Account{}, err
	}
	if !credential.Account.Enabled {
		return Account{}, ErrDisabled
	}
	if credential.Provider != s.secrets.Provider() {
		return Account{}, errors.New("不支持此账号的凭据保护方式")
	}
	plain, err := s.secrets.Unprotect(credential.Ciphertext, id)
	if err != nil {
		return Account{}, errors.New("无法解密 Cookie，请在当前系统账号下重新填写")
	}
	defer clear(plain)
	probeCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	identity, status, probeErr := s.probe.CheckAccount(probeCtx, string(plain))
	if ctx.Err() != nil {
		return Account{}, ctx.Err()
	}
	validation := Validation{Status: status, Identity: identity, CheckedAtMS: s.clock().UnixMilli()}
	if probeErr != nil {
		validation.Error = probeErr.Error()
	}
	if err = s.repository.SaveAccountValidation(ctx, id, credential.Account.CredentialVersion, validation); err != nil {
		return Account{}, err
	}
	return s.repository.GetAccount(ctx, id)
}
