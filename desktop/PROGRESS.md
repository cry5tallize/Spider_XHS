# 核心迁移进度

更新：2026-10-03。状态：todo / doing / verify / done / blocked / deferred。

| ID | 任务 | 状态 | 证据 / 待办 |
| --- | --- | --- | --- |
| CORE-00 | Go 项目初始化 | done | go.mod；internal/xhs/doc.go；模块检查与编译通过 |
| CORE-01 | 参考样本 | done | Node 生成固定样本与 36 个源文件 hash；Go 测试读取已冻结样本 |
| CORE-02 | b1 与基础编码 | done | b1.go/json.go；5 组 Node 对照通过 |
| CORE-03 | 三档 MNS | done | mns.go；12 组 pack/签名对照通过 |
| CORE-04 | 签名封装 | done | sign.go；12 组对照通过，包含冷态、SSK 和溢出输入 |
| CORE-05 | RAP | done | 9 组逐层 Node 对照；加解密及标准 gzip 解压验证通过 |
| CORE-06 | Cookie 与会话 | done | host 隔离、模板、档位、响应更新及并发计数测试通过 |
| CORE-07 | DS、请求与传输 | done | tls-client v1.16.0 / Chrome 146；DS 缓存、本地 TLS/HTTP2、HPACK 头顺序、正文及四种响应解压测试通过 |
| CORE-08 | 调用链对照 | done | Node 对照与 mock 通过；用户运行 cmd/xhscheck 确认真实账户查询成功，其他 API 在下一阶段逐项验收 |

## 记录

- 2026-10-03：创建独立 Go module，替换上一版扩大范围的计划，仅保留核心迁移与本台账。
- 2026-10-03：按用户要求，测试和样本工具只使用 Node/Go，不运行 Python。
- 2026-10-03：完成核心 Go 实现及离线对照；新增 cmd/xhscheck，用环境变量 Cookie 做一次只读账户校验。
- 初次离线验证：`go test ./...`、`go vet ./...` 通过，CGO_ENABLED=0；当时未配置 Cookie，后续线上结果见用户反馈。
- 2026-10-03：用户反馈 `go run ./cmd/xhscheck` 输出 account check passed；记录账户查询通过，不记录实际账户 ID。
- 2026-10-03：用户确定暂不实现 Live/IM；xhsapi 收窄为 PC，API-04～08 延期，API-09 仅验收当前 PC 范围。

## xhsapi 包进度

计划：[XHSAPI_PLAN.md](XHSAPI_PLAN.md)。

| ID | 任务 | 状态 |
| --- | --- | --- |
| API-00 | PC 包职责、源能力与实施顺序 | done |
| API-01 | Client 与通用请求适配 | done |
| API-02 | PC 基础接口 | done |
| API-03 | PC 剩余接口与分页 | done |
| API-04 | Live HTTP | deferred |
| API-05 | IM HTTP | deferred |
| API-06 | RWP 状态与协议编码 | deferred |
| API-07 | RWP 连接与接收 | deferred |
| API-08 | 文字发送与短链 | deferred |
| API-09 | PC 接口映射与验收 | verify |

后续每次更新记录：日期、任务 ID、代码/提交、验证命令及结果；验收通过后才标记 done。

- 2026-10-03：xhsapi/source-map.json 映射 50 个 Python 公开方法：48 个实现、2 个 Live/RWP 方法延期。接口、域名、分页、响应捕获测试与静态检查通过。
- 2026-10-03：新增 cmd/xhsapitest，godotenv 读取 COOKIE（兼容 XHS_COOKIE），cases.go 保存用户指定链接，逐次原始响应输出到 test-output（已忽略）。
- 2026-10-03：运行 `go run ./cmd/xhsapitest -apis me`，账户查询通过并保存 1 份原始 JSON。笔记链接待用户填写，其余接口真实响应在 API-09 验收，不标为已通过。
- 2026-10-03：按用户要求新增 GetNoteDetail：feed → video 类型判断 → GetVideoURL；note 用例自动调用，原始详情和页面保留，派生地址另存 .video.json。本次遵循不运行代码的要求，新增链路未执行验证。
- 2026-10-03：视频页改为携带完整会话 Cookie 及原链接 xsec_token/xsec_source；note/video 用例保留完整链接，同站重定向保留访问参数并报告错误页。新增静态回归用例，遵循用户不运行代码要求，尚未执行测试或线上验证。
- 2026-10-03：用户确认流信息不全来自账户，恢复 note 为单次 feed 详情查询；删除自动 GetNoteDetail/派生视频输出链路及相关类型和测试，保留独立 GetVideoURL。只静态检查，不运行程序或测试。

## 笔记响应类型整理

计划：[NOTE_RESPONSE_PLAN.md](NOTE_RESPONSE_PLAN.md)。完整保留媒体选项，最佳质量候选排第一；解析与网络、下载、播放职责分开。

| ID | 任务 | 状态 |
| --- | --- | --- |
| NOTE-00 | 三类样本核对与类型整理计划 | done |
| NOTE-01 | 笔记类型与基础解析入口 | done |
| NOTE-02 | 视频全量流、双来源合并及元数据 | done |
| NOTE-03 | 图片场景与 LivePhoto 动态流 | done |
| NOTE-04 | 保留全部选项的质量排序 | done |
| NOTE-05 | cmd 离线解析输出与样本验证 | done |
| NOTE-06 | URL 去重、WebDft 优先与性能优化 | done |

- 2026-10-03：用 Node 只读检查 note_response.json：视频含 5 路流，8 张 LivePhoto 各含 1 路动态流，普通图文含 1 张图片；图片 Scene 为 WB_PRV/WB_DFT。仅新增计划及进度项，未修改 Go 实现、运行项目测试或发起网络请求。
- 2026-10-03：补充动态全量解析要求：编码分组、组内流、备用地址、图片及 Scene 均不限样本数量；同 Scene 多地址与未知编码保留；跨来源仅一对一合并确认重复的流。新增对应变体验收要求，尚未实现。
- 2026-10-03：NOTE-01～04 完成。新增 note_types.go、note_fields.go、note_decode.go、note_pretty.go：DecodeNotes/ParseNoteItems、动态编码与流列表、media_v2 对象/字符串、跨来源一对一合并、图片所有场景/别名、LivePhoto 动态流、独立质量排序及筛选方法；可选值和时长单位明确，未知/不兼容字段及原始记录可追溯。
- 2026-10-03：NOTE-05 完成。cmd/xhsapitest 新增 -note-file，支持本地数组/data/完整响应，启动在 Cookie/客户端初始化之前；保存 notes.raw.json、notes.pretty.json，部分错误额外保存 notes.errors.txt。在线 feed 同时保存 .notes.pretty.json，原始响应字节保持不变。
- 2026-10-03：冻结 internal/xhsapi/testdata/note_response.json，SHA256 与用户样本一致；Go 测试覆盖三类样本、25 路动态流（多 EF4/EF7/未知编码）、13 张图片及同 Scene 多候选、完整备用地址、8 张 LivePhoto、跨来源一对一匹配、大 ID、显式 0、空字段、部分错误及原始响应保存。`go test ./internal/xhsapi ./cmd/xhsapitest`、`go vet ./internal/xhsapi ./cmd/xhsapitest`、`git diff --check` 通过；未发起小红书请求。
- 2026-10-03：NOTE-06 完成。每张图片按完整非空 URL 去重，优先 WB_DFT/WebDft，所有场景与元数据并入 Sources，Scene 筛选兼容合并来源；样本每张图从 5 个含别名/空值记录整理为 2 个不同地址。每条视频流的主/兼容/备用 URL 去重，签名参数不同的地址仍保留；Raw 仅保留于内存和独立原文文件，Pretty 不嵌入重复链接。
- 2026-10-03：性能优化预计算排序字段，改用小索引列表排序；流合并按编码分组和主 URL 建索引，一对一匹配并移除已匹配项；热点元数据匹配/补齐使用静态类型，减少重复 JSON 解码、Raw 拷贝和缺失字段记账。新增 note_pretty_test.go、note_benchmark_test.go，覆盖别名合并、WebDft 冲突优先、所有元数据字段冲突/补齐、同 URL 不同规格、一对一顺序、输入不可变及排序分配上限；Go 测试、vet 和 diff 检查通过，无小红书请求。

性能记录：Windows amd64 / Ryzen 7 8745HS；同机 `go test ./internal/xhsapi -run '^$' -bench 'BenchmarkNote' -benchmem -benchtime=200ms -count=3`，各项取 3 次中位数。样本耗时变化较小，主要收益为分配减少；1000 路合成数据用于验证列表处理性能。

| 基准 | 耗时前 → 后 | B/op 前 → 后 | allocs/op 前 → 后 |
| --- | --- | --- | --- |
| 三类笔记样本解析 | 2.23 ms → 2.13 ms | 1,046,096 → 806,934 | 7,444 → 6,053 |
| 1000 路流排序 | 24.63 ms → 0.46 ms | 26,507,423 → 425,993 | 162,210 → 2 |
| 两来源各 1000 路流合并 | 2.44 ms → 1.39 ms | 2,489,690 → 1,955,612 | 9,002 → 5,007 |

- 2026-10-03：提交前整理：删除与测试夹具 SHA256 相同的根目录 note_response.json 和旧 out 构建产物；release 加入忽略，保留本地登录数据；迁移文档路径对齐 internal/xhsapi，离线命令改用唯一测试夹具。包含用户设置的 Chrome_152_PSK 及旧视频补充链路删除；完整模块 `go test ./...`、`go vet ./...` 与 diff 检查通过。
