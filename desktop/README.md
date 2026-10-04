# XHS Desktop

模块：`github.com/cry5tallize/xhs_spider_desktop`。Wails 3 + React + Ant Design，SQLite 使用 modernc pure Go driver。

P2 单笔记闭环已实现：多账号 Cookie → 解析/笔记库 → 下载配置与计划预览 → 笔记并发、笔记内串行 → 实时进度 → 笔记历史与文件明细。支持暂停/恢复/取消、失败项重试、同目录历史过滤、默认安全覆盖。Cookie 使用 Windows DPAPI；下载 CDN 不携带账号 Cookie。下一阶段 P3 补批量/用户解析、全部/自定义媒体配置。

## 运行

从 desktop 目录执行，使用 Go 1.26.8、Node 22.14 或兼容版本、pnpm 10 和 Wails CLI beta.27。

```powershell
wails3 dev
wails3 build
.\bin\xhs-desktop.exe
```

开发版与正式版统一使用可执行文件旁的 `data` 目录，与启动工作目录无关。例如 `bin\xhs-desktop.exe` 对应 `bin\data\desktop.sqlite`、`bin\data\webview`。未设置下载位置时使用 `bin\data\downloads`；设置页可另选目录，也可点击“恢复默认”并保存。

应用不读取 `XHS_DESKTOP_DATA_DIR`，不再使用 AppData/不同构建配置的独立目录。已有 AppData 数据不会自动搬迁或删除；需要保留时，关闭应用后将原数据目录内容搬到可执行文件旁的 data，再启动应用。

下载并发设置指同时执行的笔记数；同一笔记的下载项始终串行。SQLite/DTO 时间戳为毫秒，应用枚举为 Go int8，前端直接使用生成枚举。SQL 全部在 `internal/storage/sql`。

首次使用：添加账号 → 解析笔记 → 笔记详情点击“下载笔记” → 选择目录/内容 → 预览 → 创建任务。在任务页暂停、恢复、取消；历史页查看每条笔记的文件结果、重试未完成项或创建新的重下任务。

当前媒体选择为 Best，LivePhoto 导出静态图+原始动态视频+配对清单；全部编码/图片 Scene、自定义选择、模板、Range、限速与 URL 刷新在 P3/P4。暂停会清理当前未完成文件，恢复从该项重新开始；已成功项保留。退出后未完成任务标为“已中断”，需手动恢复。

## 本地检查

```powershell
go run ./cmd/desktopcheck db
go run ./cmd/desktopcheck parse -note-file ./internal/xhsapi/testdata/note_response.json -data-dir ./.task/local-check -out ./.task/notes-pretty.json
go run ./cmd/desktopcheck inspect -data-dir ./.task/local-check

# 仅用本机媒体服务器完成视频/LivePhoto/图文三类下载
go run ./cmd/desktopcheck download -fixture-server -data-dir ./.task/download-check
go run ./cmd/desktopcheck inspect -history -data-dir ./.task/download-check
go test ./...
go vet ./...
```

frontend 中使用 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。详细计划与状态：[docs/README.md](docs/README.md)、[阶段台账](docs/07-roadmap-and-progress.md)。

离线导入/查看使用真实 SQLite，不使用 Cookie；download fixture 模式仅访问本机临时服务器。详情见 [desktopcheck](cmd/desktopcheck/README.md)。UI 在“解析笔记”填写完整链接或笔记 ID、选择账号后才执行真实 API 请求。当前不支持短链接、分享文本、批量或用户主页解析；这些在 P3 实现。

原生自动化工具本次不可用，原生视觉和窗口交互留待手工复验；已完成 Windows 构建/启动、组件回归和真实 Wails 服务持久化验证。常规开发完成必要检查后即提交，额外全量复验在 QA 阶段进行。
