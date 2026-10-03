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
```

默认仅执行 me、note；空笔记列表会跳过，等待你填写。`-apis all` 执行列出的查询用例，建议先按需选择。CLI 不调用历史同步、指标上报等写接口。

`note` 用例获取 feed 后，若 note_card.type 为 video，会继续调用 GetVideoURL，携带会话 Cookie 和原链接的 xsec_token/xsec_source 获取页面的 og:video 地址；图文不追加页面请求。同站页面重定向最多跟随 5 次，错误页跳转明确报出原因。feed 原始 JSON 保留，页面 HTML 也单独保存。地址提取失败会报告错误，并保留已取得的详情。

响应保存在 `test-output/运行时间/`（可用 `-out` 修改）：

- `.json`：原始完整响应，不重排字段或重编码；接口错误也保存。
- `.meta.json`：用例、接口路径、状态、耗时等元数据，不保存 Cookie 或 Set-Cookie。
- `.body.txt`：服务端返回 HTML/文本时保留原文；不把无效 JSON 冒充 `.json`。
- `.video.json`：从页面解析的 note_id、url、source，以及可能的错误；这是派生结果，不替代 feed 原始 JSON。

每页分页响应独立保存。Ctrl+C 可取消请求；部分用例失败后继续其他用例，最终返回非零退出码。`.env` 和默认输出目录已加入 Git 忽略。
