# 实施路线与进度台账

更新时间：2026-10-04。当前阶段：P1、P2a 已提交，P2b 单笔记后台解析、笔记库、全媒体详情及快照已实现；下一阶段 P2c 下载与历史。P2 按这些可独立交付的子阶段命名提交。原生视觉交互与干净检出复验留在 QA-02，不重复扩展当前阶段测试。

## 进度维护规则

状态使用 `TODO / DOING / VERIFY / DONE / BLOCKED / DEFERRED`。同一项只在实现、测试及验收证据齐全后标 DONE；有代码但未验收是 VERIFY。

每次开发只选可完成的连续闭环；开始填写任务状态/负责人，结束填写变更文件、验证命令/结果、commit 或未提交说明、限制。commit 未创建前不得编造 hash。需求变化在下方日志记录，并同步相关设计，不改已完成任务的历史编号。

用户要求每个阶段完成并验收后立即做命名 Git 提交，再进入下一阶段，不能等整个应用完成后一起提交。使用清楚的 Conventional Commit 标题，例如 P0 `docs(desktop): plan note-based download tasks and history`、P1 `feat(desktop): establish application foundation`；提交只包含本阶段授权改动，保留用户独立修改。

任务表是唯一应用进度入口。重大选型追加简短 `decisions/*.md`；错误/障碍注明可复现条件、下一步，不留只有「待优化」的条目。

## 阶段交付

| 阶段 | 目标 | 可运行交付与出口 |
| --- | --- | --- |
| P0 | 调研与计划 | 当前 docs 全部建立，基线、边界、验收和追踪明确 |
| P1 | 工程与生命周期基础 | 当前环境 Windows 构建、SQLite 迁移/设置、主题/懒加载 shell、启动失败/命令取消/资源关闭验证通过；干净检出与原生交互在 QA-02 复验 |
| P2 | 单条端到端闭环 | UI 保存/验证 Cookie → 详情候选 → 默认计划 → 单连接下载 → 实时进度 → 历史 → 重启查询 |
| P3 | 批量与完整媒体配置 | 多账号调度、用户逐页解析、失败重试；全部/自定义视频图片、LivePhoto 配对、模板与完整配置 |
| P4 | 下载可靠性与智能历史 | 有界笔记并发/笔记内串行、公平/限速、Range/分段、备用/刷新、笔记暂停恢复、默认安全覆盖、按项补缺和故障恢复 |
| P5 | 体验与发布验收 | 明暗/系统全覆盖、性能/泄露验证、Windows 包和干净检出复验、使用说明 |

P2 可以交付早期可测试版本，但仍需明确其只覆盖默认媒体与基础队列。完整需求达到 P5 才完成。可靠性不是全部等到 P4：P2 已要求取消、清理和安全写文件，P4 增强故障恢复与高级调度。

## 任务清单

| ID | 阶段 | 内容与明确验收 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| PLAN-01 | P0 | 核对代码、建立 docs、链接/需求覆盖/状态一致性检查 | — | DONE |
| ENG-01 | P1 | app/bridge/modules 基础；删除演示循环/Greet；现有 xhs CLI 保持可用 | PLAN-01 | DONE |
| ENG-02 | P1 | 修正 build 配置忽略、应用元信息与构建任务；Windows 构建通过，干净检出在 QA-02 复验 | ENG-01 | DONE |
| ENG-03 | P1 | 核对并锁定 Wails/runtime/最新 AntD/Router/React 依赖；统一 pnpm/TS 脚本和生成契约 | ENG-01 | DONE |
| DB-01 | P1 | modernc writer/reader、PRAGMA、迁移/checksum/备份；从空库与失败迁移可恢复 | ENG-01 | DONE |
| DB-02 | P2→P3 | 账号、作者/笔记/不可变快照/单笔记解析作业已落地；下载与批量模型待对应阶段；typed repository/集中 SQL | DB-01 | DOING |
| DB-03 | P4 | cursor/组合过滤/索引实测、短事务并发、清理与备份恢复；无全表 UI 扫描 | DB-02、HIS-02 | TODO |
| LIFE-01 | P1→P4 | P1 Start/Close、单实例、失败回滚、根取消联动/命令等待已实现；后续加入 lease/worker/恢复 | ENG-01、DB-01 | DOING |
| FE-01 | P1 | 工程化目录、createHashRouter route.lazy、providers/shell/错误边界；产物确实拆页 | ENG-03 | DONE |
| FE-02 | P1→P5 | P1 Ant tokens、三主题、首帧镜像/监听清理通过；业务页面/原生视觉在后续复验 | FE-01 | DOING |
| ACC-01 | P2a | 账号 CRUD/默认/启用；Windows DPAPI；普通 DTO 无 Cookie；软删除清凭据 | DB-02、LIFE-01 | DONE |
| ACC-02 | P2a→P2b | 手动 GetMe 与解析共享 client/lease；按账号/凭据版本复用，轮换/禁用/删除取消、引用归零关闭；拒绝过时响应 | ACC-01 | DONE |
| ACC-03 | P3 | 固定/来源分配/受控轮询、账号冷却、禁用取消；每次切换可追踪 | ACC-02 | TODO |
| PAR-01 | P2b | 详情适配、全部候选/Partial warnings、单条 StartParse/GetParseJob/CancelParse、笔记/快照/原文查询，重启保留结果 | ACC-02、DB-02 | DONE |
| PAR-02 | P3 | 文本输入提取/短链展开/批量幂等/有界队列/部分失败/失败重试 | PAR-01 | TODO |
| PAR-03 | P3 | 用户轻量列表适配、逐页事务/游标恢复/背压、单独 note token 补详情、多用户 | PAR-02 | TODO |
| PAR-04 | P3 | 类型/日期/范围/cache/raw 配置与警告；达到上限不会伪报全量 | PAR-03 | TODO |
| DL-01 | P2→P3 | 纯 Planner/candidate 身份/config Validate；先默认 Best，再全部/自定义/LivePhoto/模板预览 | PAR-01 | TODO |
| DL-02 | P2 | 流式单连接 executor/临时文件/校验/默认安全覆盖/成功入库；大文件不整体载入内存 | DL-01、DB-02 | TODO |
| DL-03 | P2→P4 | 单笔记 task/有序 item 状态机、有界笔记 pool、每笔记同时一项、暂停/取消；再加公平配额/热更新/限速/当前项退避后继续 | DL-02、LIFE-01 | TODO |
| EVT-01 | P2→P4 | 类型化批量事件、唯一监听/清理、revision、snapshot 同步、ring 溢出恢复 | DL-03、FE-01 | TODO |
| HIS-01 | P2 | 一笔记任务一历史、项结果明细、作者/账号关联、失败重试沿用原记录；笔记分页/目录定位、重启可读 | DL-02 | TODO |
| FE-03 | P2 | 账号、单笔记解析、笔记库/全部候选/快照已接真实绑定；下载任务与历史在 P2c 接入 | PAR-01、DL-03、EVT-01、HIS-01 | DOING |
| DL-04 | P3 | 完整配置矩阵逐项实现，全部编码/scene/流、LivePhoto/metadata/raw 输出，presets 版本化 | DL-01、PAR-04 | TODO |
| DL-05 | P4 | 备用/预算/Retry-After/URL 刷新、Range/分段、finalize journal/异常重启恢复 | DL-03、DL-04 | TODO |
| HIS-02 | P4 | 笔记级历史/逐项覆盖验证、strong/weak 身份、SameOutput/AnyValidCopy、补缺/强制重下、note/asset claim 防竞态 | HIS-01、DL-04、DL-05 | TODO |
| FE-04 | P3→P4 | 批量/用户、多账号、全部配置、候选详情、历史过滤和失败恢复界面 | FE-03、ACC-03、PAR-04、DL-04、HIS-02 | TODO |
| QA-01 | P4 | 笔记并发上限/笔记内串行/历史单位与补缺，存储/故障注入/断点/覆盖/取消回归及资源循环测试 | DB-03、DL-05、HIS-02、EVT-01 | TODO |
| FE-05 | P5 | 大列表虚拟化/懒加载包检查/体验/键盘/主题/长时间任务性能；页面切换无重复事件 | FE-02、FE-04、QA-01 | TODO |
| QA-02 | P5 | Windows build/package/安装目录数据权限/干净检出/升级/退出复验、使用文档与版本说明 | ENG-02、FE-05、QA-01 | TODO |

跨阶段任务不一次标 DONE。每项证据明确列子范围，例如 DL-03 的基础 pool/取消通过后仍 DOING，直到公平/限速/退避测试也通过。

依赖表中的跨阶段任务以当前闭环需要的子范围通过验收为就绪条件。例如 P2 的 ACC-01 需要 DB-02 的账户表/查询，P2 的 DL-02 需要 DL-01 的默认 Best 规划器；不要求等 P3 所有配置完成后才做 P2。每次证据记录注明依赖子范围，避免用一个大任务状态隐藏实际就绪程度。

## 第一批实现顺序

1. ENG-01：把 Wails 演示整理为薄入口，建立 runtime 与桥接目录；不先铺六个空业务页面。
2. ENG-02/03 + FE-01/02 基础：提交可复现构建配置，锁定最新稳定组件/路由，建立懒加载 shell 与主题。
3. DB-01 + LIFE-01 基础：先验证迁移与生命周期，再扩展账户/笔记/下载闭环所需 DB-02 子集。
4. ACC-01/02 + PAR-01：账号验证和单条笔记完整解析；沿用现有 fixture 和 CLI 校验。
5. DL-01/02/03 基础 + EVT-01 + HIS-01：单笔记内下载项串行闭环、笔记并发、汇总实时进度、一笔记一历史。
6. FE-03 验收 P2；提供可运行 desktopcheck CLI，使 UI 之外也能测试，之后依表推进批量/高级能力。

desktopcheck 计划提供独立子命令：`db`（临时库/迁移）、`parse -note-file`（离线 fixture）、`download -fixture-server`（本地模拟下载）、`inspect -task`（状态/manifest）。真实 Cookie 请求仅由用户显式运行指定子命令，并保存受控原始响应；自动测试不访问小红书。不替代既有 xhsapitest。

## 验收证据记录模板

每次实施追加一条，不建立散乱的个人进度文件：

```text
日期：YYYY-MM-DD
任务：ID / 子范围
状态：DOING → VERIFY → DONE（或仍 DOING）
变更：关键文件/接口/迁移编号
验证：命令、场景、通过/失败、结果文件位置
提交：commit hash / 未提交
限制：已知问题与尚未实现的子项
下一步：下一个任务 ID
```

## 当前记录

| 日期 | 任务 | 事实与证据 | 提交 |
| --- | --- | --- | --- |
| 2026-10-03 | PLAN-01 | 核对 Wails beta.27 模板、xhsapi 详情/分页/媒体类型、API 内存式传输；查询 Ant Design MCP changelog/ConfigProvider/Table；建立本文档组和需求/阶段映射。相对链接、UTF-8 与代码块成对检查通过；仅新增 docs，无依赖安装、业务代码变更或 XHS 网络请求 | 纳入本次 P0 计划提交 |
| 2026-10-03 | PLAN-01 修订 | 用户明确下载任务与历史按单笔记管理、笔记内多个项串行、并发为同时执行的笔记数。同步架构、schema、接口、UI、调度/恢复与验收；P0 计划阶段提交标题：`docs(desktop): plan note-based download tasks and history` | 本次计划阶段提交，hash 在后续记录引用 |
| 2026-10-04 | P1 / ENG-01～03、DB-01、FE-01，LIFE-01/FE-02 基础 | 薄 Wails 入口、统一 Runtime、SQLite 单写/读池、集中 SQL/迁移/备份/设置 CAS、系统/明暗主题、懒加载工作空间/设置、原生目录选择及 desktopcheck。`go test ./...`、`go vet ./...`、前端 6 测试/typecheck/lint/build、`wails3 build` 均通过；真实 npm runtime 通过本地 Wails 服务读到重启前设置并正常 Quit。100 次 Runtime 关闭、取消联动与失败回滚已覆盖。原生工具连接及浏览器环境不可用，未验证原生视觉/窗口交互；不将其标为通过。未请求小红书 | P1 命名提交：`feat(desktop): establish application foundation` |
| 2026-10-04 | P1 提交 | 工程基础已独立提交，工作区清理；不修改现有 xhs/xhsapi 算法与 CLI 常量 | `42c73d7` |
| 2026-10-04 | P2a / ACC-01、ACC-02 校验子范围 | 迁移 0002/accounts 集中查询；Windows DPAPI + 每账号 entropy；添加/改名/换 Cookie/默认/禁用/软删除清凭据；手动 GetMe（20s context/现有15s传输）、版本守卫拒绝旧响应、普通 DTO 无原文；账号懒加载页面接实际绑定。存储/DPAPI/Runtime/CLI 相关测试及前端 typecheck/lint/build 通过，无真实 XHS 请求。会话复用及账号级取消尚未完成，ACC-02 保持 DOING | P2a 命名提交：`feat(desktop): manage encrypted account cookies` |
| 2026-10-04 | P2a 提交 | 多账号 Cookie 配置已独立提交 | `eaf12cc` |
| 2026-10-04 | P2b / PAR-01、ACC-02；DB-02/FE-03 子范围，负责人 Codex | 迁移 0003：作者/笔记投影、不可变全媒体快照、解析作业；集中 notes/parsing SQL，完成/取消事务守卫及账号版本守卫；root 持有 2 个解析 worker + 32 个等待槽，45s 作业超时，重启/退出标 Interrupted。版本化 lease 共用 GetMe/详情，旧请求取消并等最后引用释放后关闭，缓存命中不重复解密。前端懒加载解析/笔记库/详情，视频动态流/图片全部 Scene/LivePhoto 表、快照切换、按需原文。CLI parse/inspect 离线入库与重启查询。6 项新增离线检查及前端 lint/typecheck/生产构建、Windows `wails3 build` 通过；样本全部媒体/原文/警告保留，取消后迟到提交回滚。无真实 XHS 请求。下载、批量/用户解析、访问参数加密持久化和事件汇聚尚未实现 | P2b 命名提交：`feat(desktop): persist parsed notes and media snapshots` |

## 设计变更日志

| 日期 | 决定 | 影响 |
| --- | --- | --- |
| 2026-10-03 | 应用 enum int8、时间戳毫秒、开放上游值保留字符串 | schema/DTO/适配一致；不破坏未知 codec/scene 与既有签名参数 |
| 2026-10-03 | SQL 与迁移集中 storage/sql，模块通过 typed ports 访问 | 业务/bridge/worker 不散布 SQL；方便审查与查询性能验证 |
| 2026-10-03 | 下载独立 streaming 适配；默认安全覆盖；逐资产历史过滤 | 大文件有界内存、保留旧文件、不同规格/LivePhoto 部分结果可补缺 |
| 2026-10-03 | root 持有任务，页面路由懒加载、唯一事件订阅 | 页面切换不取消后台任务、不增监听；重启/重载可同步状态 |
| 2026-10-03 | 用户修正：一笔记一下载任务/历史，笔记并发、下载项串行 | 移除 TaskNote 中间层与文件并发配置；batch 仅分组，历史增加项明细，补缺仍核对逐资产有效文件；每阶段验收后立即命名提交 |
| 2026-10-04 | P1 版本锁定与验证边界 | AntD 6.6.5、React 19.3.0、Router 8.4.0、SQLite 1.60.1；npm runtime 只发布到 beta.26，与 SDK/CLI beta.27 的生成类型及服务调用验证通过。共享 UI chunk 约 520 kB minified，首屏合计约 288 kB gzip；保留构建提示，后续性能阶段处理。不反复尝试不可用的 UI 工具，完成必要检查即提交并推进业务 |
