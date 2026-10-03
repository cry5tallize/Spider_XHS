package storage

import (
	"context"
	"encoding/json"
	"errors"
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
