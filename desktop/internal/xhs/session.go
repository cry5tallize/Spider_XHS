package xhs

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"strconv"
	"strings"
	"sync"
	"time"
)

const APIOrigin = "https://edith.xiaohongshu.com"
const SearchOrigin = "https://so.xiaohongshu.com"
const DSURL = "https://as.xiaohongshu.com/api/sec/v1/ds?appId=xhs-pc-web"

type MNSStage struct {
	Constant uint32
	Tail     []byte
}
type SessionOptions struct {
	Clock                                     func() time.Time
	Random                                    io.Reader
	SourceURL, WebBuild, FixedB1, DSL, UserID string
	LocalStorage                              Object
	B1Overrides                               Object
	Stages                                    map[string]MNSStage
}
type SessionState struct {
	LoadTimestampMS, DSLLT, ETS, LastTigaUpdateMS int64
	Sequence, SignCount, ProfileCount             uint32
	FingerprintReady                              bool
	UserID, WebBuild                              string
}
type Session struct {
	mu           sync.Mutex
	gate         chan struct{}
	cookies      *CookieStore
	state        SessionState
	clock        func() time.Time
	random       io.Reader
	release      Object
	stages       map[string]MNSStage
	storage      Object
	b1Overrides  Object
	b1Started    int64
	fixedB1, dsl string
	xraySeq      uint32
}

func NewSession(cookie string, options SessionOptions) (*Session, error) {
	source := options.SourceURL
	if source == "" {
		source = APIOrigin
	}
	store, e := NewCookieStore(cookie, source)
	if e != nil {
		return nil, e
	}
	if store.shared.Get("a1") == nil || jsText(store.shared.Get("a1")) == "" {
		return nil, fmt.Errorf("Cookie must contain a1")
	}
	if store.shared.Get("web_session") == nil || jsText(store.shared.Get("web_session")) == "" {
		return nil, fmt.Errorf("Cookie must contain web_session")
	}
	clock := options.Clock
	if clock == nil {
		clock = time.Now
	}
	r := options.Random
	if r == nil {
		r = rand.Reader
	}
	now := clock().UnixMilli()
	load, e := cookieInt(store.shared, "loadts", now)
	if e != nil {
		return nil, e
	}
	etsDefault := load
	if etsDefault%10 == 1 {
		etsDefault++
	}
	ets, e := cookieInt(store.shared, "ets", etsDefault)
	if e != nil {
		return nil, e
	}
	ref := resourceObject("reference_profile.json")
	release := cloneObject(object(ref.Get("release")))
	build := options.WebBuild
	if build == "" {
		if value := store.shared.Get("webBuild"); value != nil {
			build = jsText(value)
		}
	}
	if build == "" {
		build = jsText(release.Get("webBuild"))
	}
	s := &Session{gate: make(chan struct{}, 1), cookies: store, clock: clock, random: r, release: release, stages: map[string]MNSStage{}, storage: cloneObject(options.LocalStorage), b1Overrides: cloneObject(options.B1Overrides), b1Started: load, fixedB1: options.FixedB1, dsl: options.DSL}
	s.state = SessionState{LoadTimestampMS: load, DSLLT: load, ETS: ets, FingerprintReady: store.shared.Get("gid") != nil && jsText(store.shared.Get("gid")) != "", UserID: options.UserID, WebBuild: build}
	if value := s.storage.Get("dsllt"); value != nil {
		s.state.DSLLT = int64(number(value))
	}
	s.state.SignCount = uint32(number(s.storage.Get("sc")))
	s.state.ProfileCount = uint32(number(s.storage.Get("p1")))
	s.state.LastTigaUpdateMS = int64(number(s.storage.Get("last_tiga_update_time")))
	if before, after, ok := strings.Cut(s.dsl, ";"); ok {
		v, e := strconv.ParseInt(before, 10, 64)
		if e != nil || after == "" {
			return nil, fmt.Errorf("invalid DSL pair")
		}
		s.state.DSLLT = v
		s.dsl = after
	}
	for _, f := range object(ref.Get("mnsStages")) {
		o := object(f.Value)
		tail, e := hex.DecodeString(jsText(o.Get("envFpTailHex")))
		if e != nil || len(tail) != 14 {
			return nil, fmt.Errorf("invalid bundled MNS stage")
		}
		s.stages[jsText(o.Get("tier"))] = MNSStage{uint32(number(o.Get("envConst"))), tail}
	}
	for tier, value := range options.Stages {
		if tier != "0101" && tier != "0201" && tier != "0301" {
			return nil, fmt.Errorf("invalid MNS tier override")
		}
		if len(value.Tail) != 14 {
			return nil, fmt.Errorf("MNS tail override must be 14 bytes")
		}
		s.stages[tier] = MNSStage{value.Constant, append([]byte{}, value.Tail...)}
	}
	s.applyReleaseLocked()
	s.xraySeq, e = randomUint32(r)
	if e != nil {
		return nil, fmt.Errorf("session entropy: %w", e)
	}
	s.xraySeq &= 0x7fffff
	return s, nil
}
func cookieInt(o Object, key string, def int64) (int64, error) {
	value := o.Get(key)
	if value == nil || jsText(value) == "" {
		return def, nil
	}
	n, e := strconv.ParseInt(jsText(value), 10, 64)
	if e != nil {
		return 0, fmt.Errorf("invalid Cookie field %s", key)
	}
	return n, nil
}
func (s *Session) applyReleaseLocked() {
	if s.state.WebBuild == "6.32.2" {
		s.release.Set("signVersion", "4.3.7")
		s.release.Set("userAgent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36")
		s.release.Set("secChUa", `"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"`)
	} else {
		s.release = cloneObject(object(resourceObject("reference_profile.json").Get("release")))
	}
}
func (s *Session) Snapshot() SessionState { s.mu.Lock(); defer s.mu.Unlock(); return s.state }
func (s *Session) CookieForURL(value string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cookies, e := s.cookies.ForURL(value)
	if e != nil {
		return "", e
	}
	return CookieHeader(cookies), nil
}
func (s *Session) SetUserID(value string) { s.mu.Lock(); defer s.mu.Unlock(); s.state.UserID = value }
func (s *Session) ResolveTier(api, tier string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.resolveTierLocked(api, tier)
}
func (s *Session) resolveTierLocked(api, tier string) (string, error) {
	if tier != "" {
		if _, ok := s.stages[tier]; !ok {
			return "", fmt.Errorf("unsupported mns tier %q", tier)
		}
		return tier, nil
	}
	if s.state.FingerprintReady {
		return "0301", nil
	}
	if strings.Contains(api, "/api/sec/v1/") || strings.Contains(api, "/api/redcaptcha/") || strings.Contains(api, "sem_sdk") {
		return "0201", nil
	}
	return "0101", nil
}
func (s *Session) NextContext(api, tier string, version *uint32) (MNSInput, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.nextContextLocked(api, tier, version, s.clock().UnixMilli())
}
func (s *Session) nextContextLocked(api, tier string, version *uint32, now int64) (MNSInput, string, error) {
	tier, e := s.resolveTierLocked(api, tier)
	if e != nil {
		return MNSInput{}, "", e
	}
	v := uint32(0)
	if version != nil {
		v = *version
	} else {
		v, e = randomUint32(s.random)
		if e != nil {
			return MNSInput{}, "", e
		}
	}
	s.state.Sequence++
	stage := s.stages[tier]
	return MNSInput{API: api, A1: jsText(s.cookies.shared.Get("a1")), TimestampMS: now, LoadTimestampMS: s.state.LoadTimestampMS, Version: v, Sequence: s.state.Sequence, EnvironmentConstant: stage.Constant, EnvironmentTail: append([]byte{}, stage.Tail...), AppID: jsText(s.release.Get("appId")), DeviceTag: "a3"}, tier, nil
}
func (s *Session) CurrentB1(now int64) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b1Locked(now)
}
func (s *Session) b1Locked(now int64) (string, error) {
	if s.fixedB1 != "" {
		return s.fixedB1, nil
	}
	ref := object(resourceObject("reference_profile.json").Get("b1Reference"))
	overrides := cloneObject(object(ref.Get("overrides")))
	for _, key := range []string{"x37", "x38", "x82"} {
		if ref.Has(key) {
			overrides.Set(key, ref.Get(key))
		}
	}
	overrides.Set("x36", jsText(ref.Get("frameCount")))
	overrides = merge(overrides, s.b1Overrides)
	origin := float64(s.b1Started) + number(ref.Get("timeOriginOffsetMs"))
	if template := ref.Get("telemetryTemplate"); template != nil {
		overrides.Set("x84", strings.ReplaceAll(jsText(template), "__TIME_ORIGIN__", jsNumber(origin)))
	}
	options := Object{{"now", now}, {"x39", ref.Get("x39")}, {"x50", ref.Get("x50")}, {"secCanvas", ref.Get("secCanvas")}, {"windowKeys", ref.Get("selectedGlobalNames")}, {"telemetry", Object{{"profile", ref.Get("telemetryProfile")}, {"timeOrigin", origin}, {"mouse", ref.Get("mouse")}, {"keyboard", ref.Get("keyboard")}, {"page", ref.Get("page")}, {"state", ref.Get("state")}, {"features", ref.Get("features")}}}, {"overrides", overrides}}
	out, e := GenerateB1(options)
	return out.B1, e
}
func (s *Session) MergeCookies(sourceURL string, updates []CookieUpdate) error {
	host, e := cookieHost(sourceURL)
	if e != nil {
		return e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	// Validate numeric updates before mutating the session.
	for _, u := range updates {
		if !u.Delete && (u.Name == "loadts" || u.Name == "ets") && u.Value != "" {
			if _, e := strconv.ParseInt(u.Value, 10, 64); e != nil {
				return fmt.Errorf("invalid Cookie field %s", u.Name)
			}
		}
	}
	old := s.cookies.shared.Get("websectiga")
	s.cookies.update(host, updates)
	for _, u := range updates {
		if u.Delete {
			continue
		}
		switch u.Name {
		case "webBuild":
			if u.Value != "" {
				s.state.WebBuild = u.Value
				s.applyReleaseLocked()
			}
		case "loadts":
			if u.Value != "" {
				s.state.LoadTimestampMS, _ = strconv.ParseInt(u.Value, 10, 64)
			}
		case "ets":
			if u.Value != "" {
				s.state.ETS, _ = strconv.ParseInt(u.Value, 10, 64)
			}
		case "gid":
			if u.Value != "" {
				s.state.FingerprintReady = true
			}
		case "websectiga":
			if u.Value != "" && old != u.Value {
				s.state.LastTigaUpdateMS = s.clock().UnixMilli()
			}
		}
	}
	return nil
}
func (s *Session) StorageSnapshot() Object {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := cloneObject(s.storage)
	out.Set("dsllt", strconv.FormatInt(s.state.DSLLT, 10))
	out.Set("sc", strconv.FormatUint(uint64(s.state.SignCount), 10))
	out.Set("p1", strconv.FormatUint(uint64(s.state.ProfileCount), 10))
	out.Set("last_tiga_update_time", strconv.FormatInt(s.state.LastTigaUpdateMS, 10))
	return out
}
