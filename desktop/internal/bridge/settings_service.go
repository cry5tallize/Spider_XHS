package bridge

import (
	"context"
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/settings"
)

type SettingsProvider interface {
	GetGeneral(context.Context) (settings.General, error)
	UpdateGeneral(context.Context, settings.UpdateGeneral) (settings.General, error)
}

type SettingsService struct{ backend SettingsProvider }

func NewSettingsService(backend SettingsProvider) *SettingsService {
	return &SettingsService{backend: backend}
}

func (s *SettingsService) GetGeneral(ctx context.Context) (settings.General, error) {
	return s.backend.GetGeneral(ctx)
}

func (s *SettingsService) UpdateGeneral(ctx context.Context, input settings.UpdateGeneral) (settings.General, error) {
	return s.backend.UpdateGeneral(ctx, input)
}
