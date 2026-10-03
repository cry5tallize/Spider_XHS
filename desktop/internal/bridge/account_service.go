package bridge

import (
	"context"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/accounts"
)

type AccountBackend interface {
	WithAccounts(context.Context, func(context.Context, *accounts.Service) error) error
}
type AccountService struct{ backend AccountBackend }

func NewAccountService(backend AccountBackend) *AccountService { return &AccountService{backend} }

func (s *AccountService) List(ctx context.Context) (result []accounts.Account, err error) {
	err = s.backend.WithAccounts(ctx, func(ctx context.Context, service *accounts.Service) error {
		var e error
		result, e = service.List(ctx)
		return e
	})
	return
}
func (s *AccountService) Create(ctx context.Context, input accounts.Create) (result accounts.Account, err error) {
	err = s.backend.WithAccounts(ctx, func(ctx context.Context, service *accounts.Service) error {
		var e error
		result, e = service.Create(ctx, input)
		return e
	})
	return
}
func (s *AccountService) Update(ctx context.Context, input accounts.Update) (result accounts.Account, err error) {
	err = s.backend.WithAccounts(ctx, func(ctx context.Context, service *accounts.Service) error {
		var e error
		result, e = service.Update(ctx, input)
		return e
	})
	return
}
func (s *AccountService) ReplaceCookie(ctx context.Context, input accounts.ReplaceCookie) (result accounts.Account, err error) {
	err = s.backend.WithAccounts(ctx, func(ctx context.Context, service *accounts.Service) error {
		var e error
		result, e = service.ReplaceCookie(ctx, input)
		return e
	})
	return
}
func (s *AccountService) SetDefault(ctx context.Context, id string) (result accounts.Account, err error) {
	err = s.backend.WithAccounts(ctx, func(ctx context.Context, service *accounts.Service) error {
		var e error
		result, e = service.SetDefault(ctx, id)
		return e
	})
	return
}
func (s *AccountService) Validate(ctx context.Context, id string) (result accounts.Account, err error) {
	err = s.backend.WithAccounts(ctx, func(ctx context.Context, service *accounts.Service) error {
		var e error
		result, e = service.Validate(ctx, id)
		return e
	})
	return
}
func (s *AccountService) Delete(ctx context.Context, id string) error {
	return s.backend.WithAccounts(ctx, func(ctx context.Context, service *accounts.Service) error { return service.Delete(ctx, id) })
}
