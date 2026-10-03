package app

import (
	"context"
	"errors"
	"github.com/cry5tallize/xhs_spider_desktop/internal/bridge"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
	"github.com/wailsapp/wails/v3/pkg/application"
	"io/fs"
	"os"
	"sync/atomic"
)

// Construction is side-effect-free until Wails selects the single instance.
func Run(assets fs.FS) (err error) {
	runtime, err := NewRuntime(buildProfile, os.Getenv("XHS_DESKTOP_DATA_DIR"))
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, runtime.Close()) }()
	var mainWindow atomic.Pointer[application.WebviewWindow]
	var wails *application.App
	appearance := func(dark bool) {
		window := mainWindow.Load()
		if window == nil {
			return
		}
		colour := application.NewRGB(246, 247, 251)
		if dark {
			colour = application.NewRGB(16, 18, 22)
		}
		window.SetBackgroundColour(colour)
	}
	instanceID := Identifier
	if buildProfile == paths.Development {
		instanceID += ".development"
	}
	chooseDirectory := func(ctx context.Context) (string, error) {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		return wails.Dialog.OpenFile().SetTitle("选择默认下载目录").CanChooseFiles(false).CanChooseDirectories(true).PromptForSingleSelection()
	}
	wails = application.New(application.Options{
		Name: Name, Description: "小红书笔记解析与下载管理",
		Services: []application.Service{
			application.NewService(bridge.NewLifecycleService(runtime)),
			application.NewService(bridge.NewAppService(runtime, appearance)),
			application.NewService(bridge.NewSettingsService(runtime)),
			application.NewService(bridge.NewFileService(chooseDirectory)),
		},
		Assets: application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: instanceID,
			OnSecondInstanceLaunch: func(_ application.SecondInstanceData) {
				window := mainWindow.Load()
				if window != nil {
					window.Show()
					window.Focus()
				}
			},
		},
		Mac: application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
	})
	mainWindow.Store(wails.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "main", Title: Name, Width: 1200, Height: 800, MinWidth: 960, MinHeight: 640,
		Frameless: true, URL: "/", BackgroundColour: application.NewRGB(246, 247, 251),
	}))
	return wails.Run()
}
