# xhs_utils 核心迁移计划

模块：`github.com/cry5tallize/xhs_spider_desktop`。

范围：将 `xhs_utils/xhs_core`、`xhs_utils/xhs_pc` 的 PC Cookie 调用链移植为原生 Go。用户提供完整 Cookie；算法运行不依赖 Python、Node 或 JS 引擎。

源码基线：`ebb6c4fbeaedf1237190ebc0c8e3ae8b7ddd030e`。以下 `core/`、`pc/` 分别指上述两个源目录。

## 当前调用链

```text
Cookie → auth/state → params
  → b1 + MNS → X-s / X-t / X-S-Common
  → 按路由添加 RAP、xy-direction、trace/search 标识
  → DS 锚点缓存 + HTTP 请求
```

Python 的 runtime 子进程调用改为 Go 函数调用；PC JS 中转发到 core 的文件只移植一份。

## 迁移顺序

目标代码集中在 `internal/xhs/`，按任务需要拆文件。

| ID | 源码范围 | Go 交付物 | 验收 |
| --- | --- | --- | --- |
| CORE-00 | 项目初始化 | go.mod、核心包入口 | 模块路径正确，核心包可编译 |
| CORE-01 | core/pc JS、Python 调用参数 | 固定输入输出样本、源文件 hash | 固定时间、随机数、状态，可重复生成 |
| CORE-02 | core/js/b1.js | b1 字段、RC4、编码与基础工具 | 字段顺序及每层输出与样本一致 |
| CORE-03 | core/js/mns.js、密钥流 JSON | MNS 0101/0201/0301、PC dsf | pack、哈希、加密、编码逐层一致 |
| CORE-04 | core/js/sign.js、xs_common.js | X-s、X-t、X-S-Common | 类型标签、CRC、冷态 b1、可选现有 SSK 封装一致 |
| CORE-05 | pc/js/rap.js、rap_crypto.js、aes_*、deflate.js | RAP 完整算法 | 压缩、加密、封包逐层一致 |
| CORE-06 | core/cookies.py、pc/auth.py、state.py、模板 JSON | Cookie、设备、会话状态 | host 隔离、档位、版本、请求计数与原调用一致 |
| CORE-07 | core/http.py、pc/params.py、dsl.py、http.py | 标识、DS 缓存、请求组装、Go 传输 | 签名与实际 query/body 字节一致，缓存与取消有效 |
| CORE-08 | 完整 Cookie 调用链 | Go 与现有实现的对照记录 | 离线样本通过，再用有效 Cookie 做少量只读验证 |

CORE-01 是算法迁移的前置任务；CORE-04 依赖 CORE-02/03，CORE-07 依赖 CORE-04/05/06。HTTP 传输选型可提前验证。

## 需要注意

- b1 的 RC4 处理 JS 字符串，再转 UTF-8；MNS 需对齐 32 位溢出和移位。JSON/query 顺序不能被 Go 默认编码改变。
- RAP 使用自定义 S-box 和压缩逻辑，不能直接用标准 AES/gzip 替换。
- 原传输使用 curl_cffi 模拟 Chrome TLS/HTTP2；Go 传输需单独验证。计数透传和版本默认值按实际样本确认。

自动登录和动态 websectiga 脚本执行不在本轮范围；Cookie 失效由用户更新。profileData、webSsk 激活握手暂不作为 Cookie 主链迁移前置。

进度统一记录在 [PROGRESS.md](PROGRESS.md)，每项完成时补充代码位置、验证结果和提交号（有则记录）。

## 验证命令

在 `desktop/` 运行 `go test ./...`。重新生成参考样本用 `node tools/reference/generate.cjs`，不需要 Python。

线上只读账户校验：在本机设置 `XHS_COOKIE` 环境变量后运行 `go run ./cmd/xhscheck`；可选代理使用 `XHS_PROXY`。工具不输出 Cookie。
