# 持久化、数据模型与集中 SQL

## 连接与迁移

- 使用 `database/sql` + `_ "modernc.org/sqlite"`，不引入 ORM。modernc 版本实施时核对当前稳定版、Go 要求和 Windows 构建兼容，锁入 go.mod/go.sum。
- 首发 Windows；数据库在 `os.UserConfigDir()` 下应用专属数据目录，开发用独立子目录。路径由 `platform/paths` 统一决定并回显设置页。
- 一个数据库、一个应用实例。启用 Wails 单实例并验证第二实例不会在拿到实例控制权前打开 DB 或启动 worker；必要的数据目录锁归 app 生命周期所有。
- 初始一个 writer `*sql.DB`（MaxOpenConns=1）和只读 reader pool（初始最多 4）；写事务经集中存储层串行进入。状态写入避免与同一 writer 的外层事务互相等待。
- WAL、`foreign_keys=ON`、`busy_timeout=5000`；默认 `synchronous=FULL`，保证已确认关键事务的耐久性。通过 modernc 支持的 DSN `_pragma`/连接初始化给每条连接设置连接级 PRAGMA，不能只 Exec 一次便认为整个池生效。
- reader 使用只读连接，创建/迁移先由 writer 完成，再打开 reader。开发内存库采用同名共享 DSN 并保留 anchor connection，或直接使用临时文件库。
- 所有查询 `QueryContext/ExecContext`；及时关闭 Rows，检查 Rows.Err。短事务，不在事务内做网络、下载、目录遍历或前端事件回调。
- `schema_migrations(version, filename, checksum, applied_at_ms)` 记录已应用版本。迁移 SQL 按编号嵌入，逐版本事务执行；文件发布后不可修改，校验和不一致应拒绝启动。
- 升级前使用 SQLite 一致性备份方案，不能复制仍在写入的 `.db` 而遗漏 WAL。降级发现更高 schema version 时拒绝直接打开，并显示可操作错误。
- 初始化/迁移失败回滚并关闭所有已建立连接；提供故障说明，不能自动删库重建。正常退出先停止任务写入，再关闭读写池。

## 数据类型规则

| 数据 | Go | SQLite | 前端/JSON |
| --- | --- | --- | --- |
| 应用枚举 | 具名 `int8` | INTEGER，CHECK 枚举允许值 | 生成数字值，显式标签映射 |
| ID | string | TEXT | string |
| 时间戳 | int64 / *int64 | INTEGER / NULL | `*_at_ms` number / null |
| 持续时间 | int64，后缀 MS | INTEGER，后缀 `_ms` | number，后缀 MS |
| 字节、计数 | int64 | INTEGER，非负 CHECK | 安全范围内 number |
| 未知上游 codec/scene/type | string | TEXT | string |
| 业务结构化快照 | 明确结构 + 版本 | TEXT JSON | 类型化 DTO |
| Cookie | secrets 保护后的 []byte | BLOB 或安全存储引用 | 普通查询不返回原文 |

业务枚举不得把外部所有字符串强行列死；原始 response 的 number/string 等保持在独立原文中。SQL enum CHECK 与 Go 显式常量需同步测试，新增值必须迁移。

## 表设计基线

字段清单是迁移实现依据，实际长度/索引由验证决定。通用 `created_at_ms/updated_at_ms` 均由服务注入 Clock 生成；可选未发生时间保存 NULL，不混用 0。

| 表 | 关键字段 | 关系与用途 |
| --- | --- | --- |
| `accounts` | id, name, xhs_user_id?, nickname, status, enabled, is_default, secret_blob, secret_provider, secret_version, credential_version, validated_at_ms?, last_error_code?, created_at_ms, updated_at_ms, deleted_at_ms? | 本地凭据配置；status 为 int8。昵称/登录用户 ID 来自 GetMe；Cookie 版本更新不能影响既有历史归属 |
| `authors` | user_id PK, nickname, avatar_url, profile_json, fetched_at_ms, created_at_ms, updated_at_ms | 笔记作者，区别于 accounts；同一作者被多账号解析仍只有一条 |
| `notes` | note_id PK, author_user_id FK, kind, raw_kind, title, description, has_live_photo, published_at_ms?, modified_at_ms?, fetched_at_ms, current_snapshot_id?, created_at_ms, updated_at_ms | 通用检索投影；kind 为 int8，LivePhoto 是图片属性，不创建互斥的第三种上游类型 |
| `note_snapshots` | id, note_id FK, parser_version, account_id?, credential_version?, pretty_json, raw_json?, raw_sha256?, warnings_json, fetched_at_ms | 一次详情解析的不可变快照，保存全部候选；Pretty 不内嵌 Raw。raw_json 按配置保留，无请求头/Cookie |
| `note_access_refs` | id, note_id FK, account_id FK, credential_version, source, token_protected, input_url_protected?, observed_at_ms | xsec_token/source 的请求上下文；按账号/版本隔离，不把最近一个 token 覆盖成全局值 |
| `parse_jobs` | id, request_id UNIQUE, state, mode, account_id?, config_json, discovered_count, resolved_count, failed_count, created_at_ms, started_at_ms?, finished_at_ms?, updated_at_ms, revision | 持久化单条/批量/用户解析作业，mode/state 为 int8 |
| `parse_sources` | id, job_id FK, input_index, input_protected, source_kind, author_user_id?, next_cursor, pages_completed, source_state, limit_reason?, updated_at_ms | 每个用户或直接输入的分页状态；用户多来源时游标分别保存 |
| `parse_items` | id, job_id FK, source_id FK, note_id?, access_ref_id?, snapshot_id?, state, error_json, created_at_ms, updated_at_ms | 一条输入或发现笔记的独立结果；同一 job 解析同一 note 只执行一次，其全部输入来源单独保留 |
| `parse_item_sources` | item_id FK, source_id FK, input_index, observed_at_ms | 多链接/多个用户发现同一笔记时，保留来源追踪，复合唯一约束 |
| `download_presets` | id, name, schema_version, config_json, created_at_ms, updated_at_ms | 下载配置模板；任务创建时复制完整配置，修改模板不改旧任务 |
| `download_batches` | id, request_id UNIQUE, parse_job_id?, name, created_at_ms | 可选的批量提交分组；一批创建多个单笔记 task，仅用于来源追踪和批量操作，不是执行任务，状态从成员汇总 |
| `download_tasks` | id, request_id UNIQUE, batch_id?, note_id FK, snapshot_id FK, account_id?, state, priority, config_version, config_json, plan_hash, next_item_sequence, planned_items, successful_items, skipped_items, failed_items, stats_json, created_at_ms, started_at_ms?, finished_at_ms?, updated_at_ms, revision | 一条笔记对应一个任务；配置/解析快照固定，next_item_sequence 决定串行恢复位置。重复下载同一笔记产生不同 task |
| `download_files` | id, task_id FK, item_sequence, image_index?, media_kind, asset_key, identity_confidence, representation_json, candidate_json, selected_url_protected?, refreshed_snapshot_id?, target_path, target_path_key, temporary_path?, state, transferred_bytes, total_bytes?, retry_count, next_retry_at_ms?, etag?, last_modified_header?, checksum?, error_json, created_at_ms, completed_at_ms?, updated_at_ms, revision | DownloadItem 的文件明细；通过 task 关联 note/snapshot，不维护另一套笔记归属。必须按 item_sequence 串行；HTTP Last-Modified 原始字符串另存 |
| `download_attempts` | id, file_id FK, attempt_no, endpoint_index, account_id?, credential_version?, http_status?, error_code?, transferred_bytes, started_at_ms, finished_at_ms? | 重试与备用 URL 追踪；不保存含 Cookie 的请求头 |
| `download_history` | id, task_id UNIQUE FK, note_id FK, snapshot_id FK, author_user_id?, account_id?, state, plan_hash, output_root_key, output_directory, planned_items, successful_items, skipped_items, failed_items, fulfilled_items, total_bytes, created_at_ms, started_at_ms, finished_at_ms?, updated_at_ms, title_snapshot, author_snapshot | 一次单笔记任务一条历史；第一次执行时创建，逐项更新，包含成功/部分成功/失败/取消结果。下载项保留在子表，不以每个文件单独充当历史单位 |
| `download_history_files` | id, history_id FK, file_id UNIQUE FK, item_sequence, state, skip_reason?, reused_history_file_id?, asset_key, identity_confidence, media_kind, codec_group?, container?, width?, height?, fps?, scene?, target_path, target_path_key, representation_json, bytes, file_mtime_ms?, checksum?, file_validity, verified_at_ms?, completed_at_ms?, error_json | 一条笔记历史下的下载项结果，按序展开；记录成功/失败/跳过及复用出处，提供逐资产去重依据。失败重试更新本任务明细，不新增笔记历史 |
| `note_claims` | note_id PK FK, task_id UNIQUE FK, acquired_at_ms | 同一笔记同时只允许一个任务拥有执行权；不以文件行数作为并发数量 |
| `asset_claims` | claim_key PK, task_id FK, file_id FK, asset_key, output_root_key, target_path_key, acquired_at_ms | 并发资产/路径预占；唯一键保证两个任务不能同时覆盖同一文件，事务维护，不靠内存 map 保证正确性 |
| `app_settings` | key PK, schema_version, value_json, updated_at_ms | 按小型配置组保存：主题、网络、并发、默认输出、历史过滤；JSON 内 enum 为数字 |

`accounts` 默认软删除：不再选用，释放 client，清除 secret；历史中的 account_id 保持可追溯。`authors/notes/snapshots` 不随账号删除级联。业务清理先检查引用；不允许删除仍被下载任务引用的快照。

`download_history` 按笔记任务展示整体结果，`download_history_files` 保留其逐项成功、失败、跳过及覆盖情况。相同笔记的失败项重试仍属于原任务/原历史；用户显式重新下载则创建新任务/新历史，默认按笔记分组展示。清除历史不会默认删除磁盘文件，删除文件必须是单独明确命令。任务归档、快照/raw 保留时长、attempt 保留数量提供设置，清理任务使用短批次并支持取消。

归档有历史关联的任务时保留必要的 task/file/snapshot 身份与结果，不直接级联删除历史。原始响应正文可按保留配置清理，快照结构和下载时规格仍保留；真正删除关联记录需一个可审查的清理事务，遵守外键与活动任务引用约束。

## 关键索引与约束

- accounts：部分唯一索引约束唯一 `is_default=1 AND deleted_at_ms IS NULL`；设置默认账号的取消旧默认/设置新默认同事务。
- notes：`(author_user_id, published_at_ms DESC, note_id)`、`(kind, fetched_at_ms DESC, note_id)`；NULL 发布时间的排序明确落后已知时间。
- note_snapshots：`(note_id, fetched_at_ms DESC, id)`；可按相同 raw hash 重用内容，但保留解析访问记录，不丢来源账号。
- parse_items：`(job_id, state, id)`，以及 job 内非空 note_id 唯一约束；无合法 ID 的输入也能保留失败记录。
- parse_sources：`(job_id, source_state, id)`；同一来源下一页游标更新和该页条目写入同事务。
- download_tasks：`(state, priority DESC, created_at_ms, id)`、`(note_id, created_at_ms DESC, id)`、`(batch_id, created_at_ms, id)`、`(updated_at_ms DESC, id)`；同一批 note_id 唯一，独立重新下载不受跨批唯一约束影响。
- download_files：`(task_id, item_sequence)` 唯一、`(task_id, state, item_sequence)`、`(state, next_retry_at_ms, id)`、`(asset_key, task_id)`；任务内资产/目标路径按规划规则唯一。增加 task_id 的部分唯一索引，约束 Running/Finalizing 的下载项同时最多一条。
- download_history：`task_id` 唯一、`(note_id, started_at_ms DESC, id)`、`(author_user_id, started_at_ms DESC, id)`、`(started_at_ms DESC, id)`、`(state, updated_at_ms DESC, id)`。
- download_history_files：`(history_id, item_sequence)` 唯一、`(asset_key, state, completed_at_ms DESC, id)`、`(target_path_key, completed_at_ms DESC)`；按 note/author 查询时关联笔记历史，只有成功且有效的明细可用于资产复用。
- note_claims：note_id 和 task_id 各自唯一；重启回收旧进程占用，排队/暂停的另一任务不能并行运行同一笔记。
- asset_claims：独立唯一目标路径约束；另对可去重的强身份资产 + 输出根的预占建立唯一约束，弱身份不错误拦截不同候选。
- 状态值、非负计数、revision、可空时间范围用 CHECK；索引不是越多越好，结合真实查询 EXPLAIN QUERY PLAN 验证。

## SQL 组织规则

所有业务 SQL 的唯一位置为 `internal/storage/sql/`。例如：

```text
sql/queries/accounts/list_active.sql
sql/queries/accounts/set_default.sql
sql/queries/parsing/upsert_page_item.sql
sql/queries/downloads/claim_file.sql
sql/queries/downloads/mark_success.sql
sql/queries/history/list_recent.sql
sql/queries/history/list_by_note.sql
sql/queries/history/list_by_author.sql
sql/queries/history/find_asset_success.sql
```

每个命名文件一个查询/命令，使用 `go:embed`；`queries.go` 以明确名称导出内部注册引用，不自造复杂 SQL DSL。repository 负责参数绑定、scan 和类型转换；业务接口看不到 SQL 字符串。

1. SELECT 明列字段，禁止生产查询 `SELECT *`；多表 alias 清楚，排序含唯一 ID，参数含义在 query/repository 注释对应。
2. 所有值参数化。排序、列名不能直接传用户字符串，必须从固定白名单映射到集中定义的 SQL 模板。
3. 常见历史查询按时间、笔记、作者分开定义，避免巨大万能查询。组合过滤需要动态条件时，模板片段仍置于 sql/queries，只允许在 storage 查询组装器拼固定片段并绑定值。
4. 列表分页默认 limit 50、最大 200；历史/任务采用时间 + ID keyset cursor。游标绑定过滤与排序指纹，过滤变更时重置，不能继续用旧游标。
5. 复杂去重、批次写入、成功提交有专用 repository 方法和命名 SQL。查询结果声明类型，不传 `map[string]any` 给业务。
6. 禁止把状态更新、历史查询散到 bridge、worker、模块 service。SQLite PRAGMA/迁移管理 SQL 也集中在 storage，不作为例外散出去。

## 必须原子完成的操作

| 操作 | 同一事务的内容 |
| --- | --- |
| Cookie 更新 | 替换受保护凭据、credential_version++、状态重置、access ref 版本隔离 |
| 用户一页收集 | notes 轻量投影、parse_items/来源、next_cursor、页数/计数 |
| 详情完成 | author/note 投影、不可变 snapshot、access ref、parse_item 结果 |
| 创建下载任务 | 单个 task 的 note/snapshot/固定配置/有序 items；批量请求另创建 batch 和每个 note 的 task，同 request_id 重试返回相同 batch/task 列表 |
| 开始笔记任务 | 申请 note_claim、设置运行状态、首次创建唯一笔记 history；恢复/重试复用已有 history |
| 开始下载项 | 确认本任务有笔记执行权、当前 item_sequence 及无其他 Running/Finalizing 项，检查成功历史明细/asset/path claim，写状态与 attempt；文件有效性在事务外校验后再短事务复核 |
| 下载项结算 | 更新 file + attempt、upsert history_files、更新任务/笔记历史计数与覆盖情况、推进 next_item_sequence（仅已结算当前项）、释放 item claim |
| 笔记任务结算 | 汇总全部下载项状态、更新任务及唯一笔记 history 的最终状态/时间，释放 note_claim |
| 暂停/取消/失败 | 文件/任务状态和尝试结算、释放或保留明确的占用规则，不留下永久 claim |
| 重启恢复 | 运行中笔记及当前项改 Interrupted、同步笔记 history、回收旧 note/asset claims；从当前未完成项恢复，后续项不得抢先执行 |

文件系统与 SQLite 无法同一个 ACID 事务提交。先校验并完成文件替换，再提交成功事务；保留可恢复的 finalize 标记。若替换成功但 DB 写入失败，重启核对 target/manifest/checksum 后补写或提示，不能无依据声称成功，详见下载设计。
