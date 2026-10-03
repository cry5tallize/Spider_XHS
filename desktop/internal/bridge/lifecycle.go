package bridge

import (
	"context"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type Lifecycle interface {
	Start(context.Context) error
	Close() error
}

type LifecycleService struct{ runtime Lifecycle }

func NewLifecycleService(runtime Lifecycle) *LifecycleService {
	return &LifecycleService{runtime: runtime}
}

func (s *LifecycleService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	return s.runtime.Start(ctx)
}

func (s *LifecycleService) ServiceShutdown() error { return s.runtime.Close() }
