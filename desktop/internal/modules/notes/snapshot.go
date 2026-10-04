package notes

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"time"
)

func NewSnapshot(p Payload) Detail {
	warnings := p.Warnings
	if warnings == nil {
		warnings = []string{}
	}
	d := Detail{Note: p.Note, Snapshot: Snapshot{ID: rand.Text(), NoteID: p.Note.ID, AccountID: p.AccountID, CredentialVersion: p.CredentialVersion, ParserVersion: 1, Warnings: warnings, FetchedAtMS: time.Now().UnixMilli(), RawAvailable: len(p.Raw) > 0}}
	if len(p.Raw) > 0 {
		sum := sha256.Sum256(p.Raw)
		d.Snapshot.RawSHA256 = hex.EncodeToString(sum[:])
	}
	return d
}
