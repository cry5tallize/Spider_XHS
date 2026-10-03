# PC 接口测试 cmd

在 `desktop/` 的 `.env` 配置 `COOKIE='完整PC请求Cookie'`，由 godotenv 加载。兼容已有 XHS_COOKIE；可选 PROXY / XHS_PROXY。

编辑 [cases.go](cases.go) 的 noteURL1、noteURL2，并在 testNoteURLs 列表增加需要测试的常量。使用完整小红书链接，保留 xsec_token / xsec_source。

在 `desktop/` 运行：

```powershell
go run ./cmd/xhsapitest
go run ./cmd/xhsapitest -apis me,note,comments,widgets
go run ./cmd/xhsapitest -apis me,search -query "关键词"
go run ./cmd/xhsapitest -apis me,posted -user "用户主页完整链接"
go run ./cmd/xhsapitest -apis search-pages -query "关键词" -limit 40 -pages 3
go run ./cmd/xhsapitest -list
go run ./cmd/xhsapitest -note-file ./internal/xhsapi/testdata/note_response.json
```

默认仅执行 me、note；空笔记列表会跳过，等待你填写。`-apis all` 执行列出的查询用例，建议先按需选择。CLI 不调用历史同步、指标上报等写接口。

`note` 用例获取 feed 详情，保存完整原始响应及类型整理后的笔记，视频类型不追加网页请求。需要单独获取页面 og:video 地址时，可显式选择 `-apis video`。

`-note-file` 在加载 dotenv、Cookie 和初始化客户端之前进入离线解析；支持笔记项数组、`{"items":[...]}` 以及完整 feed 响应。输出 `notes.raw.json`（输入原文）和 `notes.pretty.json`（类型整理结果）。有部分解析错误时仍保存可用结果及 `notes.errors.txt`，命令返回非零状态；不会请求网络。

响应保存在 `test-output/运行时间/`（可用 `-out` 修改）：

- `.json`：原始完整响应，不重排字段或重编码；接口错误也保存。
- `.meta.json`：用例、接口路径、状态、耗时等元数据，不保存 Cookie 或 Set-Cookie。
- `.notes.pretty.json`：在线 feed 的类型整理结果；保留全部视频编码/流、不同备用地址、图片场景及 LivePhoto 动态流。图片按 URL 去重，WB_DFT（WebDft）优先，别名和元数据收在 Sources；最佳候选排在各列表第一位。Raw 不嵌入 Pretty，完整原文独立保存。解析异常也会保存可用结果并报告字段路径。
- `.body.txt`：服务端返回 HTML/文本时保留原文；不把无效 JSON 冒充 `.json`。

每页分页响应独立保存。Ctrl+C 可取消请求；部分用例失败后继续其他用例，最终返回非零退出码。`.env` 和默认输出目录已加入 Git 忽略。
