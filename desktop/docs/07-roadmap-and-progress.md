# 实施路线与进度台账

更新时间：2026-10-03。当前阶段：P0 完成计划；P1 尚未开始。历史 xhs/Pretty 能力属于已有基础，不计为新应用需求已完成。

## 进度维护规则

状态使用 `TODO / DOING / VERIFY / DONE / BLOCKED / DEFERRED`。同一项只在实现、测试及验收证据齐全后标 DONE；有代码但未验收是 VERIFY。

每次开发只选可完成的连续闭环；开始填写任务状态/负责人，结束填写变更文件、验证命令/结果、commit 或未提交说明、限制。commit 未创建前不得编造 hash。需求变化在下方日志记录，并同步相关设计，不改已完成任务的历史编号。

用户要求每个阶段完成并验收后立即做命名 Git 提交，再进入下一阶段，不能等整个应用完成后一起提交。使用清楚的 Conventional Commit 标题，例如 P0 `docs(desktop): plan note-based download tasks and history`、P1 `feat(desktop): establish application foundation`；提交只包含本阶段授权改动，保留用户独立修改。

任务表是唯一应用进度入口。重大选型追加简短 `decisions/*.md`；错误/障碍注明可复现条件、下一步，不留只有「待优化」的条目。

## 阶段交付

| 阶段 | 目标 | 可运行交付与出口 |
| --- | --- | --- |
| P0 | 调研与计划 | 当前 docs 全部建立，基线、边界、验收和追踪明确 |
| P1 | 工程与生命周期基础 | 干净检出能编译运行；SQLite 迁移/配置可用；主题/懒加载 shell；启动失败/退出可正确释放 |
| P2 | 单条端到端闭环 | UI 保存/验证 Cookie → 详情候选 → 默认计划 → 单连接下载 → 实时进度 → 历史 → 重启查询 |
| P3 | 批量与完整媒体配置 | 多账号调度、用户逐页解析、失败重试；全部/自定义视频图片、LivePhoto 配对、模板与完整配置 |
| P4 | 下载可靠性与智能历史 | 有界笔记并发/笔记内串行、公平/限速、Range/分段、备用/刷新、笔记暂停恢复、默认安全覆盖、按项补缺和故障恢复 |
| P5 | 体验与发布验收 | 明暗/系统全覆盖、性能/泄露验证、Windows 包和干净检出复验、使用说明 |

P2 可以交付早期可测试版本，但仍需明确其只覆盖默认媒体与基础队列。完整需求达到 P5 才完成。可靠性不是全部等到 P4：P2 已要求取消、清理和安全写文件，P4 增强故障恢复与高级调度。

## 任务清单

| ID | 阶段 | 内容与明确验收 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| PLAN-01 | P0 | 核对代码、建立 docs、链接/需求覆盖/状态一致性检查 | — | DONE |
| ENG-01 | P1 | app/bridge/modules 基础；删除演示循环/Greet；现有 xhs CLI 保持可用 | PLAN-01 | TODO |
| ENG-02 | P1 | 修正 build 配置忽略、应用元信息与构建任务；干净检出可构建 | ENG-01 | TODO |
| ENG-03 | P1 | 核对并锁定 Wails/runtime/最新 AntD/Router/React 依赖；统一 pnpm/TS 脚本和生成契约 | ENG-01 | TODO |
| DB-01 | P1 | modernc writer/reader、PRAGMA、迁移/checksum/备份；从空库与失败迁移可恢复 | ENG-01 | TODO |
| DB-02 | P2→P3 | 分闭环落地全数据模型/枚举/索引，typed repository，所有业务 SQL 集中；schema 与查询测试 | DB-01 | TODO |
| DB-03 | P4 | cursor/组合过滤/索引实测、短事务并发、清理与备份恢复；无全表 UI 扫描 | DB-02、HIS-02 | TODO |
| LIFE-01 | P1→P4 | Runtime Start/Close、单实例、逆序回滚、root context、lease/worker 退出和重启恢复 | ENG-01、DB-01 | TODO |
| FE-01 | P1 | 工程化目录、createHashRouter route.lazy、providers/shell/错误边界；产物确实拆页 | ENG-03 | TODO |
| FE-02 | P1→P5 | Ant tokens、System/Light/Dark、首帧镜像与监听清理；弹层/原生背景全验收 | FE-01 | TODO |
| ACC-01 | P2 | Account repository/手动 Cookie CRUD/默认/启用；DPAPI；列表与日志无原文 | DB-02、LIFE-01 | TODO |
| ACC-02 | P2 | 独立 client/lease、GetMe 校验、凭据更新轮换；旧 client 引用归零关闭 | ACC-01 | TODO |
| ACC-03 | P3 | 固定/来源分配/受控轮询、账号冷却、禁用取消；每次切换可追踪 | ACC-02 | TODO |
| PAR-01 | P2 | 详情适配与快照、全部候选/Partial warnings、单条 StartParse/GetResult | ACC-02、DB-02 | TODO |
| PAR-02 | P3 | 文本输入提取/短链展开/批量幂等/有界队列/部分失败/失败重试 | PAR-01 | TODO |
| PAR-03 | P3 | 用户轻量列表适配、逐页事务/游标恢复/背压、单独 note token 补详情、多用户 | PAR-02 | TODO |
| PAR-04 | P3 | 类型/日期/范围/cache/raw 配置与警告；达到上限不会伪报全量 | PAR-03 | TODO |
| DL-01 | P2→P3 | 纯 Planner/candidate 身份/config Validate；先默认 Best，再全部/自定义/LivePhoto/模板预览 | PAR-01 | TODO |
| DL-02 | P2 | 流式单连接 executor/临时文件/校验/默认安全覆盖/成功入库；大文件不整体载入内存 | DL-01、DB-02 | TODO |
| DL-03 | P2→P4 | 单笔记 task/有序 item 状态机、有界笔记 pool、每笔记同时一项、暂停/取消；再加公平配额/热更新/限速/当前项退避后继续 | DL-02、LIFE-01 | TODO |
| EVT-01 | P2→P4 | 类型化批量事件、唯一监听/清理、revision、snapshot 同步、ring 溢出恢复 | DL-03、FE-01 | TODO |
| HIS-01 | P2 | 一笔记任务一历史、项结果明细、作者/账号关联、失败重试沿用原记录；笔记分页/目录定位、重启可读 | DL-02 | TODO |
| FE-03 | P2 | 单笔记、账号、默认配置、任务、历史的完整界面闭环；真实命令替换 mock | PAR-01、DL-03、EVT-01、HIS-01 | TODO |
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

## 设计变更日志

| 日期 | 决定 | 影响 |
| --- | --- | --- |
| 2026-10-03 | 应用 enum int8、时间戳毫秒、开放上游值保留字符串 | schema/DTO/适配一致；不破坏未知 codec/scene 与既有签名参数 |
| 2026-10-03 | SQL 与迁移集中 storage/sql，模块通过 typed ports 访问 | 业务/bridge/worker 不散布 SQL；方便审查与查询性能验证 |
| 2026-10-03 | 下载独立 streaming 适配；默认安全覆盖；逐资产历史过滤 | 大文件有界内存、保留旧文件、不同规格/LivePhoto 部分结果可补缺 |
| 2026-10-03 | root 持有任务，页面路由懒加载、唯一事件订阅 | 页面切换不取消后台任务、不增监听；重启/重载可同步状态 |
| 2026-10-03 | 用户修正：一笔记一下载任务/历史，笔记并发、下载项串行 | 移除 TaskNote 中间层与文件并发配置；batch 仅分组，历史增加项明细，补缺仍核对逐资产有效文件；每阶段验收后立即命名提交 |
