package accounts

import "errors"

type Status int8

const (
	Unknown    Status = 0
	Unchecked  Status = 1
	Valid      Status = 2
	Expired    Status = 3
	Restricted Status = 4
	Disabled   Status = 5
	Error      Status = 6
)

type SecretProvider int8

const (
	SecretUnknown SecretProvider = 0
	SecretDPAPI   SecretProvider = 1
)

var (
	ErrNotFound = errors.New("账号不存在或已删除")
	ErrChanged  = errors.New("账号配置已变更，请刷新后重试")
	ErrDisabled = errors.New("账号已禁用")
)

// Account is safe to send to the UI; it never contains a Cookie or ciphertext.
type Account struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	UserID            string `json:"user_id"`
	Nickname          string `json:"nickname"`
	AvatarURL         string `json:"avatar_url"`
	Status            Status `json:"status"`
	Enabled           bool   `json:"enabled"`
	IsDefault         bool   `json:"is_default"`
	HasCookie         bool   `json:"has_cookie"`
	CredentialVersion int64  `json:"credential_version"`
	ValidatedAtMS     *int64 `json:"validated_at_ms"`
	LastError         string `json:"last_error"`
	CreatedAtMS       int64  `json:"created_at_ms"`
	UpdatedAtMS       int64  `json:"updated_at_ms"`
}

type Credential struct {
	Account    Account
	Provider   SecretProvider
	Ciphertext []byte
}

type Create struct {
	Name   string `json:"name"`
	Cookie string `json:"cookie"`
}
type Update struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}
type ReplaceCookie struct {
	ID              string `json:"id"`
	Cookie          string `json:"cookie"`
	ExpectedVersion int64  `json:"expected_version"`
}
type Identity struct{ UserID, Nickname, AvatarURL string }
type Validation struct {
	Status      Status
	Identity    Identity
	Error       string
	CheckedAtMS int64
}
