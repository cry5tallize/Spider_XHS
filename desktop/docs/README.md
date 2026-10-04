# Desktop 开发计划

计划基线：2026-10-03。2026-10-05 更新：P3a 批量/用户解析、P3b 全部/自定义候选与批量下载已实现；剩余高级配置和可靠性按台账推进。构建运行方法见 [desktop README](../README.md)，阶段证据见 [进度台账](07-roadmap-and-progress.md)。下方基础盘点是制定计划时的快照。

目标是在现有 Go 模块 `github.com/cry5tallize/xhs_spider_desktop` 上实现 Wails 3 桌面应用，完成「配置账号 → 解析笔记/用户 → 选择媒体 → 创建下载任务 → 查看进度与历史」闭环。本文档是后续实现和验收依据；代码未完成的能力不能在进度中标记为完成。

## 阅读顺序

| 文档 | 负责内容 |
| --- | --- |
| [01-architecture.md](01-architecture.md) | 后端/前端目录、依赖方向、工程约定 |
| [02-persistence.md](02-persistence.md) | modernc SQLite、数据关系、迁移、集中 SQL、索引 |
| [03-accounts-and-parsing.md](03-accounts-and-parsing.md) | 多账号 Cookie、单条/批量/用户笔记解析 |
| [04-download-system.md](04-download-system.md) | 媒体选择、完整配置、并发、重试、覆盖、历史去重 |
| [05-contracts-and-lifecycle.md](05-contracts-and-lifecycle.md) | Wails 服务、DTO、事件、启动关闭、资源所有权 |
| [06-frontend-and-ux.md](06-frontend-and-ux.md) | React Router 懒加载、Ant Design、页面、主题、性能 |
| [07-roadmap-and-progress.md](07-roadmap-and-progress.md) | 分阶段任务、依赖、状态、变更记录 |
| [08-validation.md](08-validation.md) | 自动验证、故障模拟、性能与人工验收 |

既有算法与接口记录继续保留：[MIGRATION.md](../MIGRATION.md)、[XHSAPI_PLAN.md](../XHSAPI_PLAN.md)、[NOTE_RESPONSE_PLAN.md](../NOTE_RESPONSE_PLAN.md)、[PROGRESS.md](../PROGRESS.md)。新的应用开发进度集中更新到本文档组，不另建重复台账。

## 已核对的工程基础

| 项目 | 当前事实 | 本计划处理 |
| --- | --- | --- |
| Wails | `go.mod` 已使用 `v3.0.0-beta.27`；根目录是演示入口和 GreetService | 沿用 Wails 3，替换演示代码，校验版本兼容后锁定工具链 |
| 前端 | React 18、TypeScript、Vite 8、pnpm；尚无 Ant Design/路由/业务页面 | 建立 React Router 与 Ant Design 工程；实施时核对最新稳定版本及 peer dependencies |
| 核心 | `internal/xhs` 已实现算法、Cookie/session、Chrome_152_PSK 传输 | 保留现有核心；本计划不改 TLS profile |
| API | `internal/xhsapi` 有账号、用户分页、feed 详情、媒体整理等 | 通过适配层复用，不将数据库/下载/UI 放入 xhsapi |
| 笔记 | 动态视频流、图片候选、备用 URL、LivePhoto、未知字段已支持 | 全部候选向业务开放，选择策略放在下载模块 |
| 用户列表 | `GetUserNotes` 单页和 `CollectUserNotes` 累积收集已存在 | 用户批量任务使用单页接口逐页持久化，不无限累积全部响应 |
| 下载 | 当前传输会将响应读入内存，默认限制 32 MiB | 新建流式媒体下载器，禁止直接用现有 API transport 下载大文件 |
| 存储 | 尚未引入 modernc SQLite | 新增集中存储层和版本化迁移 |
| 构建 | `desktop/build/` 本地存在，但被根 `.gitignore` 的 `build/` 忽略 | 工程阶段修正跟踪范围，确保干净检出可运行；不忽略应提交的构建配置 |

Ant Design MCP 本次返回的最新 changelog 条目为 **6.6.4（2026-09-14）**，并核对了 ConfigProvider 和 Table 的 API。实施时再查询 npm `latest`，选择当时最新稳定版并提交 lockfile；MCP 数据版本不能代替安装时的 registry 核对。Wails CLI、Go SDK、JS runtime、bindings 必须成套验证，不能各自使用漂移的 `latest`。

## 固定约束

1. `modernc.org/sqlite` + `database/sql`；SQL 统一存放在 `internal/storage/sql`，业务、桥接、页面不写 SQL。
2. 应用定义的状态、策略、模式使用具名 Go `int8` 枚举，常量显式编号；SQLite 使用 INTEGER + CHECK，前端使用生成的数字契约。
3. 所有应用时间字段为 UTC Unix 毫秒 `int64`，数据库字段及 DTO 使用 `_at_ms`/`AtMS`。超时、退避、媒体时长是持续时间，也明确使用 `*MS`，与时间戳区分。
4. 外部开放值，如 `EF7`、未知 codec、`image_scene` 和原始笔记类型，保留字符串；它们不是应用的封闭枚举。适配时将已知类型映射为 `int8`，未知原值同时保留。既有 API 参数枚举不兼容改写。
5. Cookie 由用户手动填写，支持多账号；不引入浏览器自动登录。账号登录态与笔记作者是不同实体。
6. 视频、图片、LivePhoto 候选数量不设固定 schema 上限。WebDft 优先，所有不同候选和备用 URL 保留；默认选择首个最佳候选，也允许全部或自定义选择。
7. 一个下载任务对应一条笔记，一个历史单位也对应一次笔记任务；笔记下的图片、视频、LivePhoto 和辅助输出按确定顺序逐项串行执行。下载并发控制同时执行的笔记数，默认 4；批量提交只作分组，不将多个笔记合成一个执行任务。
8. 默认覆盖已存在的目标文件；历史按笔记管理，但智能去重核对其下载项的实际覆盖与有效文件。强制重下绕过历史过滤，仍默认覆盖。
9. 下载执行、分页解析、持久化、失败恢复由后端负责；前端关闭页面不取消任务。暂停/取消必须由显式命令控制，默认作用于一条笔记。
10. React Router 管理页面，业务路由动态加载；明/暗/跟随系统三种主题，默认跟随系统。
11. 不实现 Live、IM、RWP；不重新引入自动 GetVideoURL 补全链路。先保存服务端提供的原始媒体，不将转码、Apple LivePhoto 合成作为基础下载前提。

## 范围与需求追踪

| 需求 | 详细设计 | 实现任务 |
| --- | --- | --- |
| 工程结构、可扩展、模块职责 | 01 | ENG-01～03 |
| SQLite、int8、毫秒、集中 SQL | 02 | DB-01～03 |
| 多账号 Cookie | 03 | ACC-01～03 |
| 单条/批量笔记、用户批量解析 | 03 | PAR-01～04 |
| 全媒体与丰富下载配置 | 04 | DL-01、DL-04 |
| 笔记并发、笔记内串行、实时进度、恢复、覆盖 | 04、05 | DL-02～05、LIFE-01、EVT-01 |
| 按笔记管理历史、下载项结果、智能补缺过滤 | 02、04 | HIS-01～02 |
| 现代简约界面、懒加载、主题 | 06 | FE-01～05 |
| 无资源泄露、可追溯验收 | 05、07、08 | LIFE-01、QA-01～02 |

## 首个可运行交付

优先打通一个真实闭环：保存/验证一个 Cookie，解析一条笔记，在界面查看所有媒体候选，按默认配置下载一份选定媒体，实时展示进度，重启后查到任务和历史。随后沿同一架构加入批量、用户分页、完整配置和多账号调度；不先做一堆互不相连的页面。

计划中的默认值是首版可实施基线，可在配置页修改。若实现时遇到真实响应或框架约束，应记录原因、改动文档与验收项，不能静默缩小支持范围。
