# XHS Desktop

模块：`github.com/cry5tallize/xhs_spider_desktop`。Wails 3 + React + Ant Design，SQLite 使用 modernc pure Go driver。

P3 主要业务已实现：批量/用户逐页解析、全部视频流/图片变体、自定义候选、LivePhoto 配对、规格筛选、命名模板、下载预设与批量创建笔记任务。支持分享文本/短链/UTF-8、固定/按来源分配账号、筛选/缓存/raw、暂停恢复/失败项重试；下载保持笔记并发、笔记内串行及实时进度/历史。

## 运行

从 desktop 目录执行，使用 Go 1.26.8、Node 22.14 或兼容版本、pnpm 10 和 Wails CLI beta.27。

```powershell
wails3 dev
wails3 build
.\bin\xhs-desktop.exe
```

开发版与正式版统一使用可执行文件旁的 `data` 目录，与启动工作目录无关。例如 `bin\xhs-desktop.exe` 对应 `bin\data\desktop.sqlite`、`bin\data\webview`。未设置下载位置时使用 `bin\data\downloads`；设置页可另选目录，也可点击“恢复默认”并保存。

应用不读取 `XHS_DESKTOP_DATA_DIR`，不使用 AppData/不同构建配置的独立目录，不包含数据搬迁逻辑。

下载并发设置指同时执行的笔记数；同一笔记的下载项始终串行。SQLite/DTO 时间戳为毫秒，应用枚举为 Go int8，前端直接使用生成枚举。SQL 全部在 `internal/storage/sql`。

首次使用：添加账号 → 解析笔记 → 笔记详情点击“下载笔记” → 选择目录/内容 → 预览 → 创建任务。在任务页暂停、恢复、取消；历史页查看每条笔记的文件结果、重试未完成项或创建新的重下任务。

默认媒体选择为 Best；可改为每编码最佳、全部或自选流，图片支持全部变体/Scene/自选。LivePhoto 可选静态/动态/两者，清单记录配对。笔记库和解析结果勾选后可以批量预览/创建（一笔记一任务）。保存预设可复用规格筛选和命名模板。Range、限速、URL 刷新及跨快照强身份过滤在 P4。暂停清理当前未完成文件，恢复从该项重新开始；已成功项保留。退出后未完成任务标“已中断”，需手动恢复。

## 本地检查

```powershell
go run ./cmd/desktopcheck db
go run ./cmd/desktopcheck parse -note-file ./internal/xhsapi/testdata/note_response.json -data-dir ./.task/local-check -out ./.task/notes-pretty.json
go run ./cmd/desktopcheck inspect -data-dir ./.task/local-check

# 仅用本机媒体服务器完成视频/LivePhoto/图文三类下载
go run ./cmd/desktopcheck download -fixture-server -data-dir ./.task/download-check
go run ./cmd/desktopcheck inspect -history -data-dir ./.task/download-check
go run ./cmd/desktopcheck collect -fixture -mode users -data-dir ./.task/parse-check -out ./.task/users.json
go run ./cmd/desktopcheck download -fixture-server -all -data-dir ./.task/all-media-check
go test ./...
go vet ./...
```

frontend 中使用 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。详细计划与状态：[docs/README.md](docs/README.md)、[阶段台账](docs/07-roadmap-and-progress.md)。

离线 import/collect 使用真实 SQLite 与本地样本；collect 创建明确标注的合成账号，无真实 Cookie 或请求。download fixture 模式仅访问本机临时服务器。详情见 [desktopcheck](cmd/desktopcheck/README.md)。UI 由用户明确开始解析后才执行真实 API 请求。用户模式抓取发布笔记，达到限额显示“仍可能有更多”；更新 Cookie 后需新建解析作业，旧作业不会自动换用凭据。

原生自动化工具本次不可用，原生视觉和窗口交互留待手工复验；已完成 Windows 构建/启动、组件回归和真实 Wails 服务持久化验证。常规开发完成必要检查后即提交，额外全量复验在 QA 阶段进行。
