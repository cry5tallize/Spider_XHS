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
