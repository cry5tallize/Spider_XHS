//go:build windows

package secrets

import (
	"bytes"
	"testing"
)

func TestDPAPIRoundTripAndAccountScope(t *testing.T) {
	protector := New()
	plain := []byte("a1=local-test; web_session=placeholder")
	protected, err := protector.Protect(plain, "account-1")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(plain, protected) {
		t.Fatal("plaintext persisted")
	}
	restored, err := protector.Unprotect(protected, "account-1")
	if err != nil || !bytes.Equal(plain, restored) {
		t.Fatalf("decrypt: %v", err)
	}
	if _, err = protector.Unprotect(protected, "account-2"); err == nil {
		t.Fatal("wrong account scope decrypted the secret")
	}
}
