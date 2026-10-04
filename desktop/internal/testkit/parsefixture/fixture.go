// Package parsefixture supplies offline batch/user discovery and note details.
package parsefixture

import (
	"context"
	"encoding/json"
	"errors"
	"sync"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/parsing"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

const UserID = "bbbbbbbbbbbbbbbbbbbbbbbb"

type Fixture struct {
	Payloads       []notes.Payload
	mu             sync.Mutex
	Calls          map[string]int
	FailOnce       string
	PageTwoStarted chan struct{}
	PageTwoRelease chan struct{}
	pageOnce       sync.Once
}

func New(payloads []notes.Payload) *Fixture {
	return &Fixture{Payloads: payloads, Calls: map[string]int{}}
}
func (f *Fixture) ExpandURL(ctx context.Context, input string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return input, nil
}
func (f *Fixture) FetchUser(ctx context.Context, account, id string) (parsing.User, error) {
	if err := ctx.Err(); err != nil {
		return parsing.User{}, err
	}
	return parsing.User{ID: id, Nickname: "本地用户", Raw: []byte(`{"nickname":"offline"}`), CredentialVersion: 1}, nil
}
func (f *Fixture) FetchUserPage(ctx context.Context, account string, ref xhsapi.UserRef, cursor string) (parsing.UserPage, error) {
	if err := ctx.Err(); err != nil {
		return parsing.UserPage{}, err
	}
	if cursor == "page-2" && f.PageTwoStarted != nil {
		f.pageOnce.Do(func() { close(f.PageTwoStarted) })
		select {
		case <-ctx.Done():
			return parsing.UserPage{}, ctx.Err()
		case <-f.PageTwoRelease:
		}
	}
	page := parsing.UserPage{Notes: []parsing.UserNote{}, CredentialVersion: 1}
	indices := []int{0, 1}
	if cursor == "" {
		page.Cursor = "page-2"
		page.HasMore = true
	} else if cursor == "page-2" {
		indices = []int{0, 2}
	} else {
		return page, errors.New("unexpected fixture cursor")
	}
	for _, index := range indices {
		n := f.Payloads[index].Note
		page.Notes = append(page.Notes, parsing.UserNote{Ref: xhsapi.NoteRef{ID: n.ID, Token: "note-only-" + n.ID, Source: "pc_user"}, Title: n.Title, RawKind: n.Type, PublishedAtMS: n.CreatedAtMS})
	}
	return page, nil
}
func (f *Fixture) FetchNote(ctx context.Context, account string, ref xhsapi.NoteRef) (notes.Payload, error) {
	if err := ctx.Err(); err != nil {
		return notes.Payload{}, err
	}
	if ref.Token == "user-only-token" {
		return notes.Payload{}, errors.New("user token forwarded to note request")
	}
	f.mu.Lock()
	f.Calls[ref.ID]++
	fail := f.FailOnce == ref.ID && f.Calls[ref.ID] == 1
	f.mu.Unlock()
	if fail {
		return notes.Payload{}, &notes.Failure{Kind: notes.ErrorNetwork, Message: "本地模拟首次失败", Retryable: true}
	}
	for _, p := range f.Payloads {
		if p.Note.ID == ref.ID {
			body, _ := json.Marshal(p.Note)
			var copyNote xhsapi.Note
			_ = json.Unmarshal(body, &copyNote)
			p.Note = copyNote
			p.AccountID = account
			p.CredentialVersion = 1
			return p, nil
		}
	}
	return notes.Payload{}, errors.New("unknown fixture note")
}
func (f *Fixture) Count(id string) int { f.mu.Lock(); defer f.mu.Unlock(); return f.Calls[id] }
