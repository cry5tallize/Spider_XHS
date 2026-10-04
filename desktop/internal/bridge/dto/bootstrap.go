package dto

import (
	"github.com/cry5tallize/xhs_spider_desktop/internal/modules/settings"
	"github.com/cry5tallize/xhs_spider_desktop/internal/platform/paths"
)

type RuntimeState int8

const (
	StateUnknown  RuntimeState = 0
	StateStarting RuntimeState = 1
	StateReady    RuntimeState = 2
	StateClosing  RuntimeState = 3
	StateClosed   RuntimeState = 4
	StateFailed   RuntimeState = 5
)

type Bootstrap struct {
	Name                     string           `json:"name"`
	Version                  string           `json:"version"`
	Profile                  paths.Profile    `json:"profile"`
	State                    RuntimeState     `json:"state"`
	DataDirectory            string           `json:"data_directory"`
	DefaultDownloadDirectory string           `json:"default_download_directory"`
	SchemaVersion            int              `json:"schema_version"`
	Settings                 settings.General `json:"settings"`
}
