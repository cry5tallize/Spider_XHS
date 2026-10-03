# XHS Desktop

模块：`github.com/cry5tallize/xhs_spider_desktop`。Wails 3 + React + Ant Design，SQLite 使用 modernc pure Go driver。

P1 已实现工作空间、设置持久化、目录选择、笔记并发偏好、三种主题和统一生命周期。P2a 已实现多账号 Cookie：添加、改名、更新、设默认、禁用、删除、手动校验；Windows DPAPI 加密保存，普通查询不返回原文。笔记解析、下载与历史接下来按独立子阶段实现并提交。

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
go test ./...
go vet ./...
```

frontend 中使用 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。详细计划与状态：[docs/README.md](docs/README.md)、[阶段台账](docs/07-roadmap-and-progress.md)。

原生自动化工具本次不可用，原生视觉和窗口交互留待手工复验；已完成 Windows 构建/启动、组件回归和真实 Wails 服务持久化验证。常规开发完成必要检查后即提交，额外全量复验在 QA 阶段进行。
