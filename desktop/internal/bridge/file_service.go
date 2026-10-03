package bridge

import "context"

type FileService struct {
	choose func(context.Context) (string, error)
}

func NewFileService(choose func(context.Context) (string, error)) *FileService {
	return &FileService{choose: choose}
}

func (s *FileService) ChooseOutputDirectory(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return s.choose(ctx)
}
