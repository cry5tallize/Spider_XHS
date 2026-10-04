# XHS Desktop

模块：`github.com/cry5tallize/xhs_spider_desktop`。Wails 3 + React + Ant Design，SQLite 使用 modernc pure Go driver。

P1 工程基础、P2a 多账号 Cookie、P2b 单笔记解析与笔记库已实现。支持后台解析/取消、全部视频/图片/LivePhoto 候选、不可变快照切换、按需读取原始响应。Cookie 使用 Windows DPAPI；校验和解析共享版本化会话，替换/禁用/删除取消旧请求。下一阶段 P2c 实现笔记下载任务、实时进度与历史。

## 运行

从 desktop 目录执行，使用 Go 1.26.8、Node 22.14 或兼容版本、pnpm 10 和 Wails CLI beta.27。

```powershell
wails3 dev
wails3 build
.\bin\xhs-desktop.exe
```

生产版数据：`%APPDATA%\XHSSpiderDesktop\production`；开发版：`%APPDATA%\XHSSpiderDesktop\development`。`XHS_DESKTOP_DATA_DIR` 可指定隔离数据目录。下载目录是独立设置，默认不创建下载任务。

下载并发设置指同时执行的笔记数；同一笔记的下载项始终串行。SQLite/DTO 时间戳为毫秒，应用枚举为 Go int8，前端直接使用生成枚举。SQL 全部在 `internal/storage/sql`。

## 本地检查

```powershell
go run ./cmd/desktopcheck db
go run ./cmd/desktopcheck parse -note-file ./internal/xhsapi/testdata/note_response.json -data-dir ./.task/local-check -out ./.task/notes-pretty.json
go run ./cmd/desktopcheck inspect -data-dir ./.task/local-check
go test ./...
go vet ./...
```

frontend 中使用 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。详细计划与状态：[docs/README.md](docs/README.md)、[阶段台账](docs/07-roadmap-and-progress.md)。

离线导入/查看使用真实 SQLite，不使用 Cookie 或网络；详情见 [desktopcheck](cmd/desktopcheck/README.md)。UI 在“解析笔记”填写完整链接或笔记 ID、选择账号后才执行真实 API 请求。当前不支持短链接、分享文本、批量或用户主页解析；这些在 P3 实现。

原生自动化工具本次不可用，原生视觉和窗口交互留待手工复验；已完成 Windows 构建/启动、组件回归和真实 Wails 服务持久化验证。常规开发完成必要检查后即提交，额外全量复验在 QA 阶段进行。
