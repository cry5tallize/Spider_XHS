# xhsapi 包实现计划

当前范围：参考 `apis/xhs_pc_apis.py` 实现 PC API。Live、IM 和 RWP 暂不实现。现有 Go 账户校验已通过。

## 包与职责

目标目录 `desktop/internal/xhsapi/`，包路径 `github.com/cry5tallize/xhs_spider_desktop/internal/xhsapi`。

- `Client` 直接提供 PC 方法，接收用户 Cookie，管理同一账户的 Session 和 HTTP 传输。
- 覆盖账户、用户、笔记、搜索、评论、通知及配置接口。
- 复用 `internal/xhs` 的签名、Cookie、DS、RAP 和传输；调用方依赖 `internal/xhsapi` 提供的类型与方法。

按需拆分 `client.go`、`user.go`、`note.go`、`search.go`、`comment.go`、`notification.go`、`config.go`、`media.go`、`types.go`、`errors.go`。

## 先补齐核心调用能力

现有 `xhs.Client.Do` 只支持部分固定路由，需要补齐 PC 接口的请求描述与响应处理。

1. 显式指定目标域名、方法、有序 query/body 和额外头，覆盖 edith、so 及无需签名和 Cookie 的公开页面请求。
2. 按接口处理标准 `success/code` envelope、其他 JSON 和 HTML。错误返回 Go `error`，保留业务码、HTTP 状态及必要原始数据。

## 分批实现

| ID | 内容 | 验收重点 |
| --- | --- | --- |
| API-00 | PC 范围与接口盘点 | 每个源方法标明 Go 对应项或延期原因 |
| API-01 | Client、请求描述、参数/结果类型与错误模型 | 多域名、头模板、有序参数、Cookie 更新；复用核心算法 |
| API-02 | PC 基础接口：GetMe、用户信息、推荐、详情、用户笔记、搜索 | 对应源路由、必需参数、xsec_token/source、RAP/xy 规则一致 |
| API-03 | 喜欢/收藏、评论及子评论、通知、配置/热词/辅助查询、上报、媒体地址及分页 | 单页与遍历分开；正确处理 JSON、HTML 和图片 URL |
| API-09 | PC 接口映射与集成验收 | 当前范围逐项覆盖，离线测试与真实只读验证通过 |

顺序：API-01 → API-02 → API-03 → API-09。原 API-04～08 保留编号，在进度台账标为 deferred。

## 对照时不能省略的细节

- 搜索使用 so 域名；搜索历史同步也在 so，不能只按 `/v2/search/` 前缀判断。分页保持同一 search_id；当前 Python 每次搜索请求新建 session_id，先保留这一行为。
- 分页先保留本页数据，再判断结束；支持数量/页数限制、取消、空页和重复游标，中途错误返回已取数据及错误。
- 参数使用 Options/枚举；单页接口与自动遍历分开，按接口确认响应 envelope。
- `get_celestial_lt`、直播栏等为 Live/RWP 服务的源方法一起延期，不扩展 token、WebSocket、protobuf 或短链 RSA。

## 验证方式

只使用 Node/Go：固定请求样本，mock HTTP 检查域名、参数、签名、分页、错误与取消，再分批做真实只读查询。账户校验成功只证明 GetMe。

上报等写操作先用 mock 验证，实际执行由用户明确触发。状态见 [PROGRESS.md](PROGRESS.md)。
