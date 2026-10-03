# 验证与验收方案

本文件是实施阶段的测试计划，不代表这些检查已经运行。测试使用 Go/Node/TypeScript，不写 Python；自动测试通过本地 fixture、临时 SQLite 和本地 HTTP server，不依赖真实账号，不自动请求小红书。

## 测试层次

| 层次 | 工具/边界 | 重点 |
| --- | --- | --- |
| 纯业务 | Go test | config、候选选择、状态机、身份置信度、命名/聚合 |
| 持久化 | modernc + 临时文件库 | 真 SQL、迁移、约束、事务、分页、并发 claim |
| API 适配 | 既有 fixture + mock Transport | user list → summary → feed、token/source、warnings、账号隔离 |
| 下载集成 | Go httptest/local server + 临时目录 | streaming、重定向、备用、Range、失败注入、旧文件覆盖 |
| 资源生命周期 | 可计数 fake + 反复 Start/Close | body/file/lease/goroutine/timer/DB 释放，失败回滚 |
| 前端 | Vitest + React Testing Library | 主题、路由、事件合并/cleanup、表单与筛选语义 |
| 前端端到端 | Playwright + mock bridge | 多页完整流程、主题截图、虚拟列表与性能 |
| 原生验收 | Windows Wails 应用 + 用户手动测试 | 对话框/路径/真实关闭/第二实例、Cookie 真实接口、打包 |

不测简单可逆样式实现细节，不用纯镜像实现的断言堆测试数；重点保护可能造成丢数据、误过滤、重复下载或资源泄露的行为。

## 必须覆盖的场景

### 数据与 SQL

1. 空库建立、逐版本升级、checksum 不符、SQL 中途失败回滚、更高版本拒绝降级、一致备份恢复。
2. 每条连接外键/超时生效；两个并发默认账号更新只留下一个默认；账号删除不丢历史关联。
3. 同用户页重复保存幂等，游标和条目同事务；非法/未知 enum 拒绝，毫秒时间不截断成秒，大 ID 无精度损失。
4. 每个单笔记任务最多一条 history；下载项结果/笔记计数/顺序指针/历史更新同事务。失败项重试不新增 history，重新下载新建 task/history；模拟提交失败不留下「任务成功但无历史」的半成功状态。
5. 相同排序时间的多个记录 keyset 分页无漏/重；组合筛选不会把上一页 cursor 用到新条件。
6. 100,000 条合成笔记历史及多项明细运行 EXPLAIN QUERY PLAN；常用 note/author/date/asset 查询走预期索引，笔记列表仅返回 bounded DTO，按明细条件筛选不出现重复历史行。
7. 扫描业务/bridge/adapters 源码，没有新增业务 SQL；SQL 仅集中 storage/sql 及 storage 连接管理，命名参数和 scan 有对应检查。

### 账号和解析

1. 两账号 session/Cookie 完全隔离，更新凭据时旧 lease 可取消/释放，禁用后不再取新工作，所有 client 最终 Close。
2. Cookie 不出现在列表 DTO/事件/log/普通 manifest；SecretStore 失败不静默改存明文。
3. 多行分享文本、重复/无效链接、短链循环/过多跳转/错误域，错误定位到原输入。
4. 用户列表不是详情；每条 note 保留自身 token/source；暂停/崩溃后恢复下一页无丢失，has_more/空页/重复 cursor 有可追踪原因。
5. 沿用 `internal/xhsapi/testdata/note_response.json` 视频、8 张 LivePhoto、普通图文；另外构造未知 codec/EF7、多 EF4、多 scene、任意数量候选、缺规格/partial 错误。
6. all/custom/best 模式只选择对应候选，不修改原快照；WebDft 第一、URL 精确去重、同规格不同流仍各自保留。

### 下载和历史

1. 超过 API 32 MiB 限制的大文件能够 streaming 保存，内存增长与文件总大小无关；文件类型/长度/hash 错误拒绝成功。
2. 正常覆盖：先有旧文件，下载中旧文件仍可读取，失败旧内容不变，完成后新内容正确；Windows 实测替换行为。
3. 主 URL 失败、多个 backup、429/Retry-After、5xx、超时、网络中断、预算耗尽；退避不占 worker，未来重试时间为毫秒。
4. Range 206、服务端忽略 Range 返回 200、Content-Range 错误、416、ETag 改变、备用 URL validator 不同：不能拼出损坏文件。
5. 分段缺块/重复块/校验失败自动退回或报错，最终完整内容正确，进度不重复计入重传。
6. 403/过期详情刷新一次，匹配同资产；新响应多条相同规格时不随意切换，缺失/变更保留错误与新快照。
7. 模拟 N 条笔记各含多个下载项，默认并发 4 时活跃笔记不超过 4，每笔记 Running/Finalizing 项不超过 1；A1 与 B1 可并行，A1 与 A2 不可并行。单项分段连接不计成多条笔记；主机/账号额度独立生效。
8. 两任务同目标或 strong 资产并发 claim 只允许一个安全写；等待者重新检查历史与路径策略。
9. 同 note 不同 codec/分辨率、LivePhoto 静态已成功动态未成功、全部 variant 部分成功，智能过滤只跳过正确资产。
10. SameOutput 更换根目录会下载；AnyValidCopy 返回已有路径；弱身份不跨快照误过滤；签名变化的 strong 资产可正确复用。
11. 历史文件被删/改小/hash 损坏不能跳过；SkipExisting 不写伪成功历史；ForceRedownload 绕过历史且默认覆盖。
12. part 中途退出、替换前/后退出、DB 提交失败、journal 损坏、磁盘满：重启不会虚报成功，也不会删除原有非本任务文件。
13. 当前项退避时释放全局笔记执行槽，但同笔记下一项/另一 task 不抢先执行；到期重试当前项。暂停 A 只影响 A，B 继续；动态调小笔记并发不增同笔记内部并发。
14. 重启恢复/RetryFailed 按原 item_sequence 处理未完成/失败项，已成功项不重下，聚合计数不重复累计；同一个笔记不同任务不同时拥有 note_claim。
15. 一个含 20 个下载项的笔记在任务/历史主列表各只占一个管理单位，包含 Partial/Failed/Canceled 状态；其 20 项仅作可展开明细。批量提交 10 条笔记产生 10 个任务，batch 本身不算第 11 个任务。

### 事件与前端

1. 首次订阅和 snapshot 之间收到完成事件仍正确显示；重复/乱序 revision 忽略，sequence 缺段/溢出/run_id 变化触发同步。
2. StrictMode 和 50 次路由切换后仍单一 runtime 监听，不增加 theme/observer/timer；root 卸载后监听数归零。
3. 任务在页面离开时继续执行，页面回到任务中心状态正确；用户显式取消生效，不是仅停止进度展示。
4. System 下系统 theme change 立即生效，Light/Dark 手动覆盖不被系统改掉；首帧、Modal/Drawer/message、图片预览都无错误主题。
5. 下载行按笔记展示整体及当前项进度；不确定总量不显示错误 100%，部分成功状态/失败重试/限额停止原因明确；不会逐文件弹数百 toast。
6. 检查生产 bundle，未访问页面不提前加载，点击路由加载相应 chunk；1,000 活跃摘要/大量候选时仅相关行更新。

## 生命周期与资源验收

- 连续 100 次 Start → 创建模拟任务 → Pause/Cancel → Close，instrumented body/file/lease/DB handle 计数最终归零；goroutine 数稳定，不随循环线性增长。
- 对每个启动步骤注入失败，已创建资源逆序关闭；同一 Close 调用两次不 panic/重复关 channel。
- 取消正在阻塞的网络读取、限速等待、退避、DB 等待，worker 在受控截止时间退出；默认 Close 总预算 10s，记录实际耗时。
- 最终 checkpoint 使用 cleanup context，不能因 Wails 已取消 root ctx 而丢状态；DB Close 后不能再出现后台写入。
- 原生窗口关掉后进程退出，无残留下载文件句柄；再次启动能处理 part/journal/claims，不重复预占。
- 第二实例不打开同一数据目录执行任务；热重载/dev 数据不污染 release 用户数据。

## 性能记录

在实施机器记录 CPU、RAM、SSD、Go/Node/Wails/WebView 版本和样本规模，至少包括：

| 指标 | 初始验收目标/记录方式 |
| --- | --- |
| streaming 内存 | 1/4/16 条笔记并发，每条含多个 256 MiB/1 GiB 下载项串行执行；稳态内存由当前项连接/buffer 数决定，不随累计文件大小增长 |
| 事件 | 每 200ms 合批，状态及时到达；记录 event/s、payload bytes、前端合并耗时，慢消费者内存仍有界 |
| SQL | 100k history 常用筛选第一页目标 p95 ≤100ms（本地 SSD，不含磁盘 hash）；记录 query plan 和实际基线 |
| 前端 | 首屏 JS gzip 目标 ≤350 KiB；1,000 任务摘要滚动/进度无持续 >50ms 长任务，记录 trace |
| 关闭 | 正常模拟任务取消后 ≤10s 清理完成，active resource 计数归零 |
| 长时间稳定 | 连续 30min 模拟创建/完成/失败/清理后缓存/队列有界，无持续线性内存增长 |

目标如因组件或实测环境需要调整，记录数据与原因并更新计划，不能为了通过默默删测试条件。沿用现有 note benchmark；只有修改了相关解析逻辑才重新跑该性能回归。

## 实施阶段标准命令

在 desktop 执行 Go 检查，在 frontend 执行前端检查；这些是后续工程建立脚本后的标准命令，本次规划不执行依赖安装/构建。

```powershell
# desktop
go test ./...
go vet ./...
# 有相应工具链时，对并发核心执行 race；Windows race 需要支持的 C 工具链
go test -race ./internal/modules/... ./internal/storage/...
# Wails 当前 Taskfile 流程
wails3 task common:generate:bindings
wails3 build

# desktop/frontend（ENG-03 新增相应 scripts）
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# repository
git diff --check
```

race 工具链要求不改变 SQLite 使用 pure Go driver 的选型；未具备时记录未运行，并用资源计数/压力测试覆盖可执行的验证。Playwright mock bridge 不能替代原生 WebView 和 Windows 文件系统验收。

## 用户可测试的交付

P2 开始每个闭环都提供 desktopcheck 子命令/示例、本地模拟数据、输出 JSON/manifest 位置，以及 Wails GUI 的明确操作步骤。真实接口测试账号与笔记由用户指定；不将 Cookie、签名 URL、运行 DB、真实下载文件放进版本库。

P5 发布说明标注已支持配置与当前限制、数据库目录/升级行为、默认覆盖/去重规则、LivePhoto 保存形式、主题和恢复方式。进度台账引用实际测试证据，而不是只写「功能已完成」。

## 后续实现查阅入口

- [Wails 3 官方文档](https://v3.wails.io/)：必须对照锁定 SDK 的 Go 源码核实生命周期与生成绑定。
- [modernc SQLite driver](https://pkg.go.dev/modernc.org/sqlite)、[database/sql](https://pkg.go.dev/database/sql)：DSN PRAGMA、连接池、事务和 driver 版本要求。
- [React Router createHashRouter](https://reactrouter.com/api/data-routers/createHashRouter)：data router、lazy route、错误边界与 loader。
- [Ant Design ConfigProvider](https://ant.design/components/config-provider/)、[Table](https://ant.design/components/table/)：主题、上下文、虚拟列表；不明确的版本 API 优先查询 Ant Design MCP。
