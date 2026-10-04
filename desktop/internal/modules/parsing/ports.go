package parsing

import (
	"context"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/notes"
)

type Repository interface {
	CreateParseGroup(context.Context, Job, string, string, []Source) error
	FindParseGroupRequest(context.Context, string) (Job, string, error)
	GetParseGroup(context.Context, string) (Job, error)
	ListParseGroups(context.Context) ([]Job, error)
	ClaimParseGroup(context.Context) (Job, error)
	ParseGroupSources(context.Context, string) ([]Source, error)
	SaveParseUser(context.Context, Job, Source, User) error
	SaveParsePage(context.Context, Job, Source, []DiscoveredItem) error
	FinishParseSource(context.Context, Job, Source) error
	PendingParseItems(context.Context, string, int) ([]Item, error)
	ClaimParseItem(context.Context, Job, string) error
	CompleteParseItem(context.Context, Job, Item, notes.Detail, notes.Payload, ItemState, string) error
	SetParseItemOutcome(context.Context, Job, Item, ItemState, string, string, *notes.Failure) error
	FindFreshParseSnapshot(context.Context, Item, int64) (notes.Detail, error)
	FinishParseGroup(context.Context, Job) error
	StopParseGroup(context.Context, string, State, *notes.Failure) error
	ResumeParseGroup(context.Context, string, bool) error
	RecoverParseGroups(context.Context) error
	ListParseItems(context.Context, ItemQuery) (ItemPage, error)
	ParseItemOrigins(context.Context, string) ([]Origin, error)
}
