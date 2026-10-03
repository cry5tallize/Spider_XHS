package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"sort"
	"strings"
	"time"

	"github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi"
	"github.com/joho/godotenv"
)

type testApp struct {
	client                           *xhsapi.Client
	notes                            []string
	userURL, query, category, cursor string
	limit, pages                     int
	imageURL                         string
}

var errSkipped = errors.New("skipped")

func (a *testApp) noteCases(ctx context.Context, action func(xhsapi.NoteRef, string) error) error {
	if len(a.notes) == 0 {
		return fmt.Errorf("%w: fill noteURL1/noteURL2 in cmd/xhsapitest/cases.go", errSkipped)
	}
	var errs []error
	for i, input := range a.notes {
		ref, e := xhsapi.ParseNoteURL(input)
		if e == nil {
			e = action(ref, input)
		}
		if e != nil {
			errs = append(errs, fmt.Errorf("note[%d]: %w", i, e))
			fmt.Printf("  note[%d]: %v\n", i, e)
		} else {
			fmt.Printf("  note[%d]: OK\n", i)
		}
	}
	return errors.Join(errs...)
}
func (a *testApp) userRef() (xhsapi.UserRef, error) {
	if a.userURL != "" {
		return xhsapi.ParseUserURL(a.userURL)
	}
	id := a.client.UserID()
	if id == "" {
		return xhsapi.UserRef{}, fmt.Errorf("run me first or supply -user")
	}
	return xhsapi.UserRef{ID: id, Source: "pc_search"}, nil
}
func (a *testApp) registry() map[string]func(context.Context) error {
	one := func(call func(context.Context) (*xhsapi.Response, error)) func(context.Context) error {
		return func(ctx context.Context) error { _, e := call(ctx); return e }
	}
	userNotes := func(kind string) func(context.Context) error {
		return func(ctx context.Context) error {
			ref, e := a.userRef()
			if e != nil {
				return e
			}
			o := xhsapi.UserNotesOptions{Cursor: a.cursor, Token: ref.Token, Source: ref.Source}
			var err error
			switch kind {
			case "posted":
				_, err = a.client.GetUserNotes(ctx, ref.ID, o)
			case "liked":
				_, err = a.client.GetUserLikedNotes(ctx, ref.ID, o)
			case "collected":
				_, err = a.client.GetUserCollectedNotes(ctx, ref.ID, o)
			}
			return err
		}
	}
	registry := map[string]func(context.Context) error{
		"me": one(a.client.GetMe), "channels": one(a.client.GetHomefeedChannels), "unread": one(a.client.GetUnread), "web-config": one(a.client.GetWebConfig), "system-config": one(a.client.GetSystemConfig), "global-config": one(a.client.GetGlobalConfig), "display-period": one(a.client.GetWorldcupDisplayPeriod),
		"homefeed": func(ctx context.Context) error {
			_, e := a.client.GetHomefeed(ctx, xhsapi.RecommendOptions{Category: a.category})
			return e
		},
		"trending": func(ctx context.Context) error {
			_, e := a.client.GetTrendingQueries(ctx, xhsapi.TrendingOptions{})
			return e
		},
		"dqa": func(ctx context.Context) error { _, e := a.client.GetDQARecommend(ctx, ""); return e },
		"user": func(ctx context.Context) error {
			ref, e := a.userRef()
			if e != nil {
				return e
			}
			_, e = a.client.GetUserInfo(ctx, ref.ID)
			return e
		},
		"posted": userNotes("posted"), "liked": userNotes("liked"), "collected": userNotes("collected"),
		"boards": func(ctx context.Context) error {
			ref, e := a.userRef()
			if e != nil {
				return e
			}
			_, e = a.client.GetUserBoards(ctx, ref.ID, 15, 1)
			return e
		},
		"mentions":            func(ctx context.Context) error { _, e := a.client.GetMentions(ctx, a.cursor); return e },
		"notifications-likes": func(ctx context.Context) error { _, e := a.client.GetLikesAndCollections(ctx, a.cursor); return e },
		"connections":         func(ctx context.Context) error { _, e := a.client.GetNewConnections(ctx, a.cursor); return e },
		"search": func(ctx context.Context) error {
			if a.query == "" {
				return fmt.Errorf("%w: supply -query or testSearchKeyword", errSkipped)
			}
			_, e := a.client.SearchNotes(ctx, a.query, xhsapi.SearchNotesOptions{})
			return e
		},
		"search-users": func(ctx context.Context) error {
			if a.query == "" {
				return fmt.Errorf("%w: supply -query or testSearchKeyword", errSkipped)
			}
			_, e := a.client.SearchUsers(ctx, a.query, xhsapi.SearchUsersOptions{})
			return e
		},
		"search-pages": func(ctx context.Context) error {
			if a.query == "" {
				return fmt.Errorf("%w: supply -query", errSkipped)
			}
			result, e := a.client.CollectSearchNotes(ctx, a.query, xhsapi.SearchNotesOptions{}, xhsapi.CollectOptions{Limit: a.limit, MaxPages: a.pages})
			fmt.Printf("  items: %d\n", len(result.Items))
			return e
		},
		"onebox": func(ctx context.Context) error {
			if a.query == "" {
				return fmt.Errorf("%w: supply -query", errSkipped)
			}
			_, e := a.client.SearchOnebox(ctx, a.query, xhsapi.OneboxOptions{})
			return e
		},
		"keywords": func(ctx context.Context) error {
			if a.query == "" {
				return fmt.Errorf("%w: supply -query", errSkipped)
			}
			_, e := a.client.GetSearchKeywords(ctx, a.query)
			return e
		},
		"filters": func(ctx context.Context) error {
			if a.query == "" {
				return fmt.Errorf("%w: supply -query", errSkipped)
			}
			id, e := a.client.NewSearchID()
			if e != nil {
				return e
			}
			if _, e = a.client.SearchNotes(ctx, a.query, xhsapi.SearchNotesOptions{SearchID: id}); e != nil {
				return e
			}
			_, e = a.client.GetSearchFilters(ctx, a.query, id)
			return e
		},
		"image": func(context.Context) error {
			if a.imageURL == "" {
				return fmt.Errorf("%w: supply -image-url", errSkipped)
			}
			address, e := xhsapi.ImageURL(a.imageURL)
			if e == nil {
				fmt.Println(" ", address)
			}
			return e
		},
	}
	for _, name := range []string{"note", "comments", "all-comments", "widgets", "share-code", "seo", "video"} {
		kind := name
		registry[kind] = func(ctx context.Context) error {
			return a.noteCases(ctx, func(ref xhsapi.NoteRef, input string) error {
				var e error
				switch kind {
				case "note":
					_, e = a.client.GetNote(ctx, input)
				case "comments":
					_, e = a.client.GetComments(ctx, ref, a.cursor)
				case "all-comments":
					result, err := a.client.GetAllComments(ctx, input, xhsapi.CollectOptions{Limit: a.limit, MaxPages: a.pages})
					fmt.Printf("  root comments: %d\n", len(result.Comments))
					e = err
				case "widgets":
					_, e = a.client.GetWidgets(ctx, ref.ID, xhsapi.WidgetsOptions{})
				case "share-code":
					_, e = a.client.ShareCode(ctx, ref.ID)
				case "seo":
					_, e = a.client.WorldcupNoteSEO(ctx, []string{ref.ID})
				case "video":
					address, _, err := a.client.GetVideoURL(ctx, input)
					if err == nil {
						fmt.Println(" ", address)
					}
					e = err
				}
				return e
			})
		}
	}
	return registry
}
func run() error {
	apis := flag.String("apis", "me,note", "comma-separated read-only test names, or all")
	env := flag.String("env", ".env", "godotenv input file")
	output := flag.String("out", "test-output", "response output directory")
	query := flag.String("query", testSearchKeyword, "search keyword")
	user := flag.String("user", testUserURL, "user URL or ID")
	category := flag.String("category", testHomefeedCategory, "homefeed channel")
	cursor := flag.String("cursor", "", "single-page cursor")
	limit := flag.Int("limit", 20, "maximum collected items")
	pages := flag.Int("pages", 3, "maximum collected pages")
	timeout := flag.Duration("timeout", 45*time.Second, "timeout per selected test")
	image := flag.String("image-url", "", "image URL to normalize")
	noteFile := flag.String("note-file", "", "parse a local note item array or feed response without Cookie or requests")
	list := flag.Bool("list", false, "list test names without loading Cookie")
	flag.Parse()
	if *noteFile != "" {
		return runOfflineNotes(*noteFile, *output)
	}
	app := &testApp{userURL: *user, query: *query, category: *category, cursor: *cursor, limit: *limit, pages: *pages, imageURL: *image}
	registry := app.registry()
	names := []string{}
	for name := range registry {
		names = append(names, name)
	}
	sort.Strings(names)
	if *list {
		fmt.Println(strings.Join(names, ", "))
		return nil
	}
	selected := strings.Split(*apis, ",")
	if *apis == "all" {
		selected = append([]string{"me"}, names...)
	}
	seen := map[string]bool{}
	tests := []string{}
	for _, name := range selected {
		name = strings.TrimSpace(name)
		if _, ok := registry[name]; !ok {
			return fmt.Errorf("unknown test %q; use -list", name)
		}
		if !seen[name] {
			seen[name] = true
			tests = append(tests, name)
		}
	}
	if *timeout <= 0 || *limit < 0 || *pages < 1 {
		return fmt.Errorf("invalid timeout/limit/pages")
	}
	if e := godotenv.Load(*env); e != nil && !os.IsNotExist(e) {
		return fmt.Errorf("load env: %w", e)
	}
	cookie := os.Getenv("COOKIE")
	if cookie == "" {
		cookie = os.Getenv("XHS_COOKIE")
	}
	if cookie == "" {
		return fmt.Errorf("set COOKIE in %s (XHS_COOKIE also accepted)", *env)
	}
	proxy := os.Getenv("PROXY")
	if proxy == "" {
		proxy = os.Getenv("XHS_PROXY")
	}
	recorder, e := newRecorder(*output)
	if e != nil {
		return e
	}
	client, e := xhsapi.NewClient(cookie, xhsapi.Options{ProxyURL: proxy, OnResponse: recorder.capture})
	if e != nil {
		return e
	}
	defer client.Close()
	app.client = client
	registry = app.registry()
	for _, input := range testNoteURLs {
		if strings.TrimSpace(input) != "" {
			app.notes = append(app.notes, input)
		}
	}
	root, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	fmt.Println("responses:", recorder.directory)
	failed, skipped := 0, 0
	for _, name := range tests {
		if e := root.Err(); e != nil {
			return e
		}
		recorder.setCase(name)
		ctx, cancel := context.WithTimeout(root, *timeout)
		e := registry[name](ctx)
		cancel()
		if errors.Is(e, errSkipped) {
			skipped++
			fmt.Printf("%s: SKIPPED: %v\n", name, e)
		} else if e != nil {
			failed++
			fmt.Printf("%s: FAILED: %v\n", name, e)
		} else {
			fmt.Printf("%s: OK\n", name)
		}
	}
	fmt.Printf("saved %d raw responses; failed tests: %d; skipped: %d\n", recorder.sequence, failed, skipped)
	if failed > 0 {
		return fmt.Errorf("%d selected tests failed; inspect saved responses", failed)
	}
	return nil
}
func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
