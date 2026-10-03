package main

import (
	"embed"
	"log/slog"
	"os"

	"github.com/cry5tallize/xhs_spider_desktop/internal/app"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	if err := app.Run(assets); err != nil {
		// Run has completed resource cleanup before an error reaches this point.
		slog.Error("application stopped", "error", err)
		os.Exit(1)
	}
}
