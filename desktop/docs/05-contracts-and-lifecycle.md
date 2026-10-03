# Wails 契约、事件与生命周期

## Wails 3 接入方式

当前 SDK 为 `v3.0.0-beta.27`，已核对本地 `pkg/application/services.go`：

- `ServiceStartup(ctx context.Context, options application.ServiceOptions) error` 按注册顺序执行，ctx 在应用关闭前取消。
- `ServiceShutdown() error` 按反向注册顺序执行，且在用户 OnShutdown hooks 后执行。
- 启动失败时已成功启动的 service 会收到 Shutdown；当前失败 service 自己的部分资源仍必须显式回滚。

用一个 `LifecycleService` 持有 `app.Runtime`，注册在业务桥接服务之前；由它调用 Runtime.Start/Close，其余 service 不各自关闭共享 DB/client。Start/Close 幂等并带 ready/closing 状态，清理最终只执行一次。版本升级后重新核对上述语义，不照搬 Wails 2 的方法。

业务桥接服务是薄适配器：校验请求 DTO，调用模块，返回安全 DTO/结构化错误。Get/List 不启动隐式下载，Start* 不阻塞到任务完成；生成 bindings 不暴露 DB、client、Cookie secret、内部目录锁或 scheduler 指针。

## 主要服务契约

以下是名称/职责基线，具体 TS 调用方式以 Wails 生成绑定为准。

| 服务 | 方法组 | 结果/约束 |
| --- | --- | --- |
| AppService | GetBootstrap、GetRuntimeStatus、GetCapabilities | ready、配置/版本、主题、默认账号、数据目录；不一次带出所有笔记历史 |
| AccountService | List、Create、UpdateCookie、Rename、Validate、SetDefault、SetEnabled、Delete | 列表无 Cookie；Validate 独立超时并可取消，结果含真实账号状态 |
| NoteService | StartParse、GetParseJob、ListParseItems、PauseParse、ResumeParse、CancelParse、RetryFailedParse | 返回 job ID/分页结果；每项 warnings 可查询 |
| NoteService | ListNotes、GetNote、ListSnapshots、GetMediaCandidates | 当前投影/不可变快照、动态全量媒体候选；大型候选详情按需获取 |
| DownloadService | BuildPlan、CreateTask、CreateTasks、ListTasks、GetTask、ListTaskItems | CreateTask 接受一条 note/snapshot，返回一个 task_id；CreateTasks 为 N 条笔记创建 N 个 task，返回 batch_id + task_ids，幂等；列表一行一笔记摘要 |
| DownloadService | Pause、Resume、Cancel、RetryFailed、Reprioritize、ForceRedownload；BatchPause/Resume/Cancel | 默认操作单笔记 task；批量命令逐个作用成员并返回逐任务结果；失败重试不重复成功项，不创建另一条笔记历史 |
| HistoryService | Query、GetRecord、ListRecordItems、CheckFiles、GetDuplicatePreview、Redownload、ClearRecords | Query 返回笔记历史摘要，明细按序展开；按 note/author/type/date/spec/path/state 过滤时同一笔记历史不重复成文件行；清记录不等同删文件 |
| SettingsService | Get、Update、ListPresets、SavePreset、DeletePreset | 校验版本、返回实际生效配置；运行任务采用创建时配置快照 |
| FileService | ChooseOutputDirectory、RevealFile、OpenOutputDirectory、ExportManifest | 使用平台能力，后端校验路径与记录归属；不暴露任意 shell 执行 |
| JobEventService | GetActiveSnapshots、GetChangesSince | 前端加载/重新连接时同步任务状态，事件出口集中管理 |

Bridge DTO 只包含业务需要的字段。生成 types 提供数字 enum 的定义/常量；若当前生成器只产生 number，没有生成完整枚举，补一个**从 Go 常量生成**的契约文件并检查漂移，不在 TS 再手写另一套值。

错误分类为具名 int8：Unknown、Validation、AccountUnavailable、Unauthorized、Restricted、RateLimited、Network、NotFound、Storage、FileSystem、Canceled、Conflict、Internal。保留 upstream code、HTTP status、retryable、job/file ID、messageKey 和必要 field path。后台任务错误在持久化 job/file 结果内保存；桥接创建失败用统一结果/错误适配，避免只返回一个无法识别类别的字符串。

## 事件契约与可靠同步

事件少而明确：`parse:changed`、`downloads:changed`、`accounts:changed`、`settings:changed`、`app:status`。使用 `application.RegisterEvent[T]` 注册类型；事件 payload 带 schema_version，变更契约后重新生成 bindings。

```text
EventBatch {
  schema_version: number
  run_id: string                // 本次进程身份，重启后变化
  sequence: number              // 本次进程全局单调序号，保证 JS 安全整数
  emitted_at_ms: number
  changes: [{job_id, note_id?, current_item_id?, revision, state, progress?, error?}]
}
```

- 业务模块通过 EventSink port 发出业务变更，bridge event adapter 是唯一 Wails Emit 出口。SQLite 事务提交之后才能发布成功/最终状态。
- 下载事件以单笔记 task_id 聚合，包含 note_id、当前下载项顺序/进度及整个笔记的已完成项数/字节；batch 只提供成员汇总，不另算执行任务或并发数量。
- 高频 bytes 事件可覆盖合并；状态变更必须持久化并可通过 snapshot/revision 恢复。事件不是 durable queue，也不是 UI 的唯一真相来源。
- 后端使用有界聚合队列与有限近期事件 ring buffer；慢前端不能使下载 worker 阻塞，更不能无限累积事件内存。缓冲溢出返回 needs_resync，前端重读摘要。
- 前端启动先注册唯一全局监听并缓冲，再 GetActiveSnapshots（返回同 run_id/sequence checkpoint），再按 sequence/revision 合并 buffered changes；避免先查再订阅丢掉中间完成事件。
- 同 job/file revision 相同或落后时忽略事件；发现缺段调用 GetChangesSince，ring 已淘汰则完整同步。run_id 变化清除旧序号缓存重新同步。
- 页面只订阅 store 中所需 ID/字段，不自己向 Wails Events.On 注册重复订阅。前端卸载 root 时调用 SDK 返回的取消函数；开发 StrictMode mount/unmount/mount 后仍只有一份监听。
- UI 高频进度每批更新 store 一次，持久数据 Query cache 按状态完成/结构变更精准 invalidate；不能每 200ms 重查历史全表。

## 启动顺序

1. 配置静态应用信息和单实例策略；获得实例/数据目录使用权后再打开持久化资源。
2. 准备系统路径、结构化日志、SecretStore、Clock 与 IDs。目录权限/不可写时返回明确启动故障。
3. 打开 writer → migrate/verify schema → reader；加载并校验设置/默认账号元信息。
4. 加载解析/下载中未完成项，回收旧 claims，核对 finalize journal；不盲目标成功，不默认自动开始历史任务。
5. 构造账号 manager、XHS/媒体适配器、模块 service、scheduler、事件聚合器。
6. 在应用 root context 下启动有界 worker/后台 housekeeping。每个 Start 有对应 Close/Wait；模块全部 ready 后允许桥接命令。
7. 前端拿 bootstrap 并完成主题/账号状态初始化、任务摘要同步；关键能力失败时显示故障/重试入口，不呈现空白窗口。

实现时 app.New/单实例检查/Wails ServiceStartup 的实际先后顺序需走查；如果 SDK 单实例通知时机晚于想要的 DB 初始化，增加数据目录锁并保持无副作用的构造函数。不能假定配置 SingleInstance 就自动保护之前执行的初始化代码。

## 关闭顺序

Wails startup ctx 在 shutdown 前已取消，**最终状态落库不能继续使用已取消 ctx**。Runtime.Close 建立单独带截止时间的 cleanup context（默认总预算 10s），只用于受控收尾，不启动新任务。

1. 原子切换 closing，拒绝新命令/解析分页/派发；发布 app stopping 状态。
2. 取消 job/request context，停止 scheduler/重试 timer/限速等待。Finalizing 内短小文件替换和成功提交按一致性规则收尾。
3. WaitGroup/errgroup 等待 active workers；已退出的请求关闭 body、file，释放 account lease/slot。超时必须记录具体未退出资源/任务，不能正常路径直接忽略。
4. 使用 cleanup context 将未完成笔记任务及当前项标 Interrupted，同步其历史、落串行恢复位置与 checkpoint、结算 attempts、处理 note/asset claims；运行网络请求不在 DB 锁内等待。
5. 停止清理/轮转任务，刷新并关闭 event aggregator，停止向失效窗口 Emit。
6. 确认 lease 已归零，关闭 account clients、streaming HTTP idle connections，关闭 SecretStore/锁资源。
7. 关闭 reader/writer，flush 日志，释放目录锁。顺序需要保证没有 worker 在 DB Close 后写状态。

启动任一步失败使用逆序 rollback。main 的错误退出必须发生在 runtime cleanup 之后，不能 `log.Fatal` 跳过 defer。Runtime.Close 与 app.Run 返回后的防御性 Close 使用同一个 once/状态机，不能重复关闭 channel。

默认关闭窗口即退出并保留任务 Interrupted；托盘/关闭隐藏可作为后续明确设置，首版不能隐藏常驻工作让用户误以为已退出。

## 资源所有权表

| 资源 | 唯一 owner | 正常释放点 | 失败/取消检查 |
| --- | --- | --- | --- |
| DB reader/writer | Runtime/Store | worker 停止后的 Store.Close | 初始化失败逆序关闭；Rows/Tx 就地释放 |
| 账号 client/session | AccountManager | lease 归零且版本淘汰/应用关闭 | 替换/禁用期间不悬空，计数回到 0 |
| 媒体 HTTP client | mediahttp adapter | Runtime.Close | 所有 response body 关闭，取消中断 Read |
| job context | job manager | 终态/暂停/取消/关闭 | children 不脱离父生命周期 |
| 文件与 buffer | file executor | 单次 attempt defer | 所有 return 路径释放，池内数量有界 |
| timer/ticker/limiter | scheduler/aggregator | cancel + Stop + Wait | 不在无限 Sleep 循环中延迟退出 |
| event listener | frontend root provider | effect cleanup | StrictMode/重载/路由切换不重复注册 |
| system theme listener | ThemeProvider | effect cleanup | 改为手动模式时解除不需要的监听 |
| preview URL/observer | preview component | unmount/asset change | revokeObjectURL、disconnect、取消读取 |
| 目录锁/日志/secret handle | Runtime/platform owner | 最后阶段 Close | 启动失败同样释放 |

所有 goroutine 必须可指出 owner、退出条件和等待位置。只有 cleanup deadline 等受控位置可使用新的 Background context；禁止后台 worker 私自 `context.Background()` 逃离应用取消。
