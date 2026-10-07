package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
)

func TestAccountDefaultCookieVersionAndPrivacy(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UnixMilli()
	for _, id := range []string{"first", "second"} {
		a := accounts.Account{ID: id, Name: id, CreatedAtMS: now, UpdatedAtMS: now}
		if err := s.CreateAccount(ctx, accounts.Credential{Account: a, Provider: accounts.SecretDPAPI, Ciphertext: []byte("protected-secret")}); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.SetDefaultAccount(ctx, "second", now); err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateAccount(ctx, accounts.Update{ID: "first", Name: "first", Enabled: false}, now); err != nil {
		t.Fatal(err)
	}
	if err := s.SetDefaultAccount(ctx, "first", now); !errors.Is(err, accounts.ErrDisabled) {
		t.Fatalf("disabled default: %v", err)
	}
	second, err := s.GetAccount(ctx, "second")
	if err != nil || !second.IsDefault {
		t.Fatal("failed default change did not roll back")
	}
	if err = s.ReplaceAccountCookie(ctx, "second", []byte("new-protected-secret"), accounts.SecretDPAPI, 1, now); err != nil {
		t.Fatal(err)
	}
	validation := accounts.Validation{Status: accounts.Valid, Identity: accounts.Identity{UserID: "user-id"}, CheckedAtMS: now}
	if err = s.SaveAccountValidation(ctx, "second", 1, validation); !errors.Is(err, accounts.ErrChanged) {
		t.Fatalf("stale validation: %v", err)
	}
	if err = s.SaveAccountValidation(ctx, "second", 2, validation); err != nil {
		t.Fatal(err)
	}
	credential, err := s.GetCredential(ctx, "second")
	if err != nil || string(credential.Ciphertext) != "new-protected-secret" {
		t.Fatalf("credential snapshot: %v", err)
	}
	items, err := s.ListAccounts(ctx)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(items)
	if strings.Contains(string(encoded), "protected-secret") || strings.Contains(string(encoded), "ciphertext") {
		t.Fatal("account DTO leaked credential")
	}
	if err = s.DeleteAccount(ctx, "second", now); err != nil {
		t.Fatal(err)
	}
	if _, err = s.GetCredential(ctx, "second"); !errors.Is(err, accounts.ErrNotFound) {
		t.Fatal("deleted credential still available")
	}
	var cleared bool
	if err = s.writer.QueryRowContext(ctx, "SELECT secret_blob IS NULL FROM accounts WHERE id='second'").Scan(&cleared); err != nil || !cleared {
		t.Fatal("soft delete did not clear the credential")
	}
}

func TestAccountProfilePersistsAndSurvivesFailedValidation(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UnixMilli()
	if err := s.CreateAccount(ctx, accounts.Credential{Account: accounts.Account{ID: "profile", Name: "备注", CreatedAtMS: now, UpdatedAtMS: now}, Provider: accounts.SecretDPAPI, Ciphertext: []byte("protected")}); err != nil {
		t.Fatal(err)
	}
	identity := accounts.Identity{UserID: "user-id", Nickname: "昵称", AvatarURL: "https://cdn.example.test/avatar.png"}
	if err := s.SaveAccountValidation(ctx, "profile", 1, accounts.Validation{Status: accounts.Valid, Identity: identity, CheckedAtMS: now}); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, s.path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	items, err := reopened.ListAccounts(ctx)
	if err != nil || len(items) != 1 || items[0].AvatarURL != identity.AvatarURL || items[0].Nickname != identity.Nickname {
		t.Fatalf("persisted profile: %+v, %v", items, err)
	}
	if err := reopened.SaveAccountValidation(ctx, "profile", 1, accounts.Validation{Status: accounts.Error, Error: "network unavailable", CheckedAtMS: now + 1}); err != nil {
		t.Fatal(err)
	}
	loaded, err := reopened.GetAccount(ctx, "profile")
	if err != nil || loaded.UserID != identity.UserID || loaded.Nickname != identity.Nickname || loaded.AvatarURL != identity.AvatarURL || loaded.Status != accounts.Error || loaded.LastError != "network unavailable" {
		t.Fatalf("failed validation erased profile: %+v, %v", loaded, err)
	}
	if err := reopened.ReplaceAccountCookie(ctx, "profile", []byte("replacement"), accounts.SecretDPAPI, 1, now+2); err != nil {
		t.Fatal(err)
	}
	loaded, err = reopened.GetAccount(ctx, "profile")
	if err != nil || loaded.UserID != "" || loaded.Nickname != "" || loaded.AvatarURL != "" {
		t.Fatalf("old identity after cookie replacement: %+v, %v", loaded, err)
	}
	if err := reopened.SaveAccountValidation(ctx, "profile", 1, accounts.Validation{Status: accounts.Valid, Identity: identity, CheckedAtMS: now + 3}); !errors.Is(err, accounts.ErrChanged) {
		t.Fatalf("stale profile accepted: %v", err)
	}
}

func TestAccountAvatarMigrationPreservesExistingProfile(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "legacy.sqlite")
	available, err := embeddedMigrations()
	if err != nil {
		t.Fatal(err)
	}
	legacy, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { legacy.Close() })
	if _, err := migrate(ctx, legacy, path, available[:6]); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UnixMilli()
	if _, err := legacy.ExecContext(ctx, query("accounts/create"), "legacy", "备注", []byte("protected"), accounts.SecretDPAPI, now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.ExecContext(ctx, "UPDATE accounts SET xhs_user_id=?, nickname=? WHERE id=?", "user-id", "旧昵称", "legacy"); err != nil {
		t.Fatal(err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}
	upgraded, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer upgraded.Close()
	loaded, err := upgraded.GetAccount(ctx, "legacy")
	if err != nil || loaded.Name != "备注" || loaded.Nickname != "旧昵称" || loaded.UserID != "user-id" || loaded.AvatarURL != "" || !loaded.HasCookie {
		t.Fatalf("legacy profile after migration: %+v, %v", loaded, err)
	}
}
