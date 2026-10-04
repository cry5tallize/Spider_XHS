package parsing

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
)

func (s *Service) sourceInput(source Source) (SourceInput, error) {
	var input SourceInput
	if source.Provider != s.secrets.Provider() {
		return input, errors.New("凭据保护方式不支持")
	}
	plain, err := s.secrets.Unprotect(source.InputBlob, "parse-source/"+source.ID)
	if err != nil {
		return input, &notes.Failure{Kind: notes.ErrorAccount, Message: "解析输入无法解密"}
	}
	defer clear(plain)
	err = json.Unmarshal(plain, &input)
	return input, err
}
func refScope(job, note, account string, version int64) string {
	return "parse-ref/" + job + "/" + note + "/" + account + "/" + jsonNumber(version)
}
func jsonNumber(v int64) string { body, _ := json.Marshal(v); return string(body) }
func (s *Service) discover(j Job, source Source, n UserNote) (DiscoveredItem, error) {
	n.Ref.ID = strings.ToLower(n.Ref.ID)
	if !objectID.MatchString(n.Ref.ID) {
		return DiscoveredItem{}, &notes.Failure{Kind: notes.ErrorResponse, Message: "列表笔记 ID 无效"}
	}
	if n.Ref.Source == "" {
		n.Ref.Source = "pc_user"
	}
	body, _ := json.Marshal(n.Ref)
	blob, err := s.secrets.Protect(body, refScope(j.ID, n.Ref.ID, source.AccountID, source.CredentialVersion))
	if err != nil {
		return DiscoveredItem{}, &notes.Failure{Kind: notes.ErrorStorage, Message: "无法保护笔记访问参数"}
	}
	i := Item{ID: rand.Text(), JobID: j.ID, NoteID: n.Ref.ID, Title: n.Title, RawKind: n.RawKind, PublishedAtMS: n.PublishedAtMS, AccountID: source.AccountID, CredentialVersion: source.CredentialVersion, RefBlob: blob, Provider: s.secrets.Provider()}
	priority := 0
	if n.Ref.Token != "" {
		priority = 1
	}
	return DiscoveredItem{Item: i, SourceID: source.ID, RefBlob: blob, Priority: priority}, nil
}
func (s *Service) run(ctx context.Context, j Job) error {
	sources, err := s.repository.ParseGroupSources(ctx, j.ID)
	if err != nil {
		return err
	}
	// Direct inputs are resolved before details so duplicate URLs can contribute
	// a stronger token and every origin is retained without another API request.
	if j.Mode == ModeNotes {
		for _, source := range sources {
			if source.State == SourceComplete || source.State == SourceFailed || source.State == SourceLimited {
				continue
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			err = s.noteSource(ctx, j, source)
			if err != nil {
				if ctx.Err() != nil || fatal(err) {
					return err
				}
				source.State = SourceFailed
				source.Failure = asFailure(err)
				if err = s.failSource(ctx, j, source, err); err != nil {
					return err
				}
			}
		}
		if err = s.details(ctx, j); err != nil {
			return err
		}
	} else {
		// Drain any page already committed before pause/termination first.
		if err = s.details(ctx, j); err != nil {
			return err
		}
		for _, source := range sources {
			if source.State == SourceComplete || source.State == SourceFailed || source.State == SourceLimited {
				continue
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			err = s.userSource(ctx, j, source)
			if err != nil {
				if ctx.Err() != nil || fatal(err) {
					return err
				}
				source.State = SourceFailed
				source.Failure = asFailure(err)
				if err = s.failSource(ctx, j, source, err); err != nil {
					return err
				}
			}
		}
	}
	return s.repository.FinishParseGroup(ctx, j)
}

func (s *Service) failSource(ctx context.Context, j Job, source Source, cause error) error {
	// Preserve the last committed page checkpoint when a later page fails.
	sources, err := s.repository.ParseGroupSources(ctx, j.ID)
	if err != nil {
		return err
	}
	for _, current := range sources {
		if current.ID == source.ID {
			source = current
			break
		}
	}
	source.State = SourceFailed
	source.Failure = asFailure(cause)
	return s.repository.FinishParseSource(ctx, j, source)
}
func (s *Service) noteSource(ctx context.Context, j Job, source Source) error {
	if err := s.checkAccount(ctx, source.AccountID, source.CredentialVersion); err != nil {
		return err
	}
	input, err := s.sourceInput(source)
	if err != nil {
		return err
	}
	request, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	expanded, err := s.fetcher.ExpandURL(request, input.URL)
	if err != nil {
		return err
	}
	ref, err := xhsapi.ParseNoteURL(expanded)
	if err != nil {
		return &notes.Failure{Kind: notes.ErrorResponse, Message: "笔记链接中没有有效笔记 ID"}
	}
	ref.ID = strings.ToLower(ref.ID)
	source.TargetID = ref.ID
	source.State = SourceComplete
	source.HasMore = false
	i, err := s.discover(j, source, UserNote{Ref: ref})
	if err != nil {
		return err
	}
	return s.repository.SaveParsePage(ctx, j, source, []DiscoveredItem{i})
}
func (s *Service) userSource(ctx context.Context, j Job, source Source) error {
	if err := s.checkAccount(ctx, source.AccountID, source.CredentialVersion); err != nil {
		return err
	}
	input, err := s.sourceInput(source)
	if err != nil {
		return err
	}
	request, cancel := context.WithTimeout(ctx, 20*time.Second)
	expanded, err := s.fetcher.ExpandURL(request, input.URL)
	cancel()
	if err != nil {
		return err
	}
	ref, err := xhsapi.ParseUserURL(expanded)
	if err != nil {
		return &notes.Failure{Kind: notes.ErrorResponse, Message: "用户链接中没有有效用户 ID"}
	}
	ref.ID = strings.ToLower(ref.ID)
	source.TargetID = ref.ID
	if source.UserName == "" {
		request, cancel = context.WithTimeout(ctx, 30*time.Second)
		u, e := s.fetcher.FetchUser(request, source.AccountID, ref.ID)
		cancel()
		if e != nil {
			return e
		}
		if u.CredentialVersion != source.CredentialVersion {
			return &notes.Failure{Kind: notes.ErrorAccount, Message: "用户列表账号凭据已变化"}
		}
		source.UserName = u.Nickname
		if err = s.repository.SaveParseUser(ctx, j, source, u); err != nil {
			return err
		}
	}
	for source.HasMore {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err = s.checkAccount(ctx, source.AccountID, source.CredentialVersion); err != nil {
			return err
		}
		current, e := s.repository.GetParseGroup(ctx, j.ID)
		if e != nil {
			return e
		}
		if source.Pages >= j.Config.MaxPages || (j.Config.MaxNotes > 0 && current.Discovered >= j.Config.MaxNotes) {
			source.State = SourceLimited
			source.LimitReason = "达到配置页数或笔记数量上限"
			return s.repository.FinishParseSource(ctx, j, source)
		}
		request, cancel = context.WithTimeout(ctx, 45*time.Second)
		page, e := s.fetcher.FetchUserPage(request, source.AccountID, ref, source.Cursor)
		cancel()
		if e != nil {
			return e
		}
		if page.CredentialVersion != source.CredentialVersion {
			return &notes.Failure{Kind: notes.ErrorAccount, Message: "用户列表账号凭据已变化"}
		}
		if page.HasMore && (page.Cursor == "" || page.Cursor == source.Cursor || len(page.Notes) == 0) {
			return &notes.Failure{Kind: notes.ErrorResponse, Message: "分页游标缺失、重复或空页仍标有下一页"}
		}
		items := make([]DiscoveredItem, 0, len(page.Notes))
		for _, n := range page.Notes {
			i, e := s.discover(j, source, n)
			if e != nil {
				return e
			}
			items = append(items, i)
		}
		source.Pages++
		source.Cursor = page.Cursor
		source.HasMore = page.HasMore
		source.State = SourceRunning
		if !source.HasMore {
			source.State = SourceComplete
		}
		if err = s.repository.SaveParsePage(ctx, j, source, items); err != nil {
			return err
		}
		if err = s.details(ctx, j); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) details(ctx context.Context, j Job) error {
	for {
		items, err := s.repository.PendingParseItems(ctx, j.ID, j.Config.Concurrency)
		if err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		step, cancel := context.WithCancel(ctx)
		var wg sync.WaitGroup
		var mu sync.Mutex
		var first error
		for _, item := range items {
			wg.Add(1)
			go func(i Item) {
				defer wg.Done()
				if err := s.detail(step, j, i); err != nil {
					mu.Lock()
					if first == nil {
						first = err
					}
					mu.Unlock()
					cancel()
				}
			}(item)
		}
		wg.Wait()
		cancel()
		if first != nil {
			return first
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}
func (s *Service) detail(ctx context.Context, j Job, i Item) error {
	if err := s.checkAccount(ctx, i.AccountID, i.CredentialVersion); err != nil {
		return err
	}
	if err := s.repository.ClaimParseItem(ctx, j, i.ID); err != nil {
		return err
	}
	finish := func(d notes.Detail, reason string) error {
		state := Complete
		if len(d.Snapshot.Warnings) > 0 {
			state = Incomplete
		}
		if !j.Config.Matches(d) {
			state = Skipped
			reason = "不符合笔记筛选条件"
		}
		i.Title, i.RawKind, i.PublishedAtMS = d.Note.Title, d.Note.Type, d.Note.CreatedAtMS
		return s.repository.SetParseItemOutcome(ctx, j, i, state, d.Snapshot.ID, reason, nil)
	}
	if j.Config.CacheMode != ForceRefresh {
		since := time.Now().UnixMilli() - j.Config.CacheTTLMS
		if j.Config.CacheMode == CacheOnly {
			since = 0
		}
		d, err := s.repository.FindFreshParseSnapshot(ctx, i, since)
		if err == nil && (j.Config.CacheMode == CacheOnly || !j.Config.SaveRaw || d.Snapshot.RawAvailable) {
			return finish(d, "使用同账号版本的已有快照")
		}
		if err != nil && !errors.Is(err, notes.ErrNotFound) {
			return err
		}
		if j.Config.CacheMode == CacheOnly {
			return s.repository.SetParseItemOutcome(ctx, j, i, Skipped, "", "没有可用缓存", nil)
		}
	}
	plain, err := s.secrets.Unprotect(i.RefBlob, refScope(j.ID, i.NoteID, i.AccountID, i.CredentialVersion))
	if err != nil {
		return &notes.Failure{Kind: notes.ErrorAccount, Message: "笔记访问参数无法解密"}
	}
	var ref xhsapi.NoteRef
	err = json.Unmarshal(plain, &ref)
	clear(plain)
	if err != nil {
		return err
	}
	request, cancel := context.WithTimeout(ctx, 45*time.Second)
	p, err := s.fetcher.FetchNote(request, i.AccountID, ref)
	cancel()
	if err != nil {
		if ctx.Err() != nil || fatal(err) {
			return err
		}
		return s.repository.SetParseItemOutcome(ctx, j, i, ItemFailed, "", "", asFailure(err))
	}
	if p.Note.ID != i.NoteID || p.AccountID != i.AccountID || p.CredentialVersion != i.CredentialVersion {
		return &notes.Failure{Kind: notes.ErrorAccount, Message: "笔记或账号版本与作业上下文不一致"}
	}
	if !j.Config.SaveRaw {
		p.Raw = nil
	}
	d := notes.NewSnapshot(p)
	state := Complete
	reason := ""
	if len(d.Snapshot.Warnings) > 0 {
		state = Incomplete
	}
	if !j.Config.Matches(d) {
		state = Skipped
		reason = "不符合笔记筛选条件"
	}
	return s.repository.CompleteParseItem(ctx, j, i, d, p, state, reason)
}
