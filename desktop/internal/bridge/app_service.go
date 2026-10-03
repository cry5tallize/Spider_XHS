package bridge

import (
	"context"
	"github.com/cry5tallize/xhs_spider_desktop/internal/bridge/dto"
)

type BootstrapReader interface {
	Bootstrap(context.Context) (dto.Bootstrap, error)
}

type AppService struct {
	backend       BootstrapReader
	setAppearance func(bool)
}

func NewAppService(backend BootstrapReader, setAppearance func(bool)) *AppService {
	return &AppService{backend: backend, setAppearance: setAppearance}
}

func (s *AppService) GetBootstrap(ctx context.Context) (dto.Bootstrap, error) {
	return s.backend.Bootstrap(ctx)
}

func (s *AppService) SetWindowAppearance(dark bool) {
	if s.setAppearance != nil {
		s.setAppearance(dark)
	}
}
