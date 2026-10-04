# desktopcheck

从 desktop 运行，只做本地应用验证，不使用 Cookie、不访问小红书、不打开窗口。download 模式请求本机临时媒体服务器。

```powershell
# 临时 SQLite：完成后关闭连接并移除临时目录
go run ./cmd/desktopcheck db

# 使用明确的持久目录；第二次运行验证设置在重启后保留
go run ./cmd/desktopcheck db -data-dir ./.task/local-check -theme 3 -notes 2
go run ./cmd/desktopcheck db -data-dir ./.task/local-check

# 将三类笔记样本导入实际 SQLite，导出完整 Pretty 结果
go run ./cmd/desktopcheck parse -note-file ./internal/xhsapi/testdata/note_response.json -data-dir ./.task/local-check -out ./.task/notes-pretty.json

# 重启后查询笔记库；加 -note <ID> 查询全部媒体候选和快照详情
go run ./cmd/desktopcheck inspect -data-dir ./.task/local-check
go run ./cmd/desktopcheck inspect -data-dir ./.task/local-check -note <note_id>

# 用本机服务器下载三类笔记；结果保留在该隔离目录的 downloads 下
go run ./cmd/desktopcheck download -fixture-server -data-dir ./.task/download-check
go run ./cmd/desktopcheck download -fixture-server -all -data-dir ./.task/all-media-check
go run ./cmd/desktopcheck inspect -history -data-dir ./.task/download-check
go run ./cmd/desktopcheck inspect -task <task_id> -data-dir ./.task/download-check

# 完全离线模拟用户两页发现/完整详情补全，或重复笔记批量解析
go run ./cmd/desktopcheck collect -fixture -mode users -data-dir ./.task/parse-check -out ./.task/users.json
go run ./cmd/desktopcheck collect -fixture -mode notes -data-dir ./.task/parse-check -out ./.task/batch.json
```

theme：1 跟随系统、2 浅色、3 深色。notes：同时执行的笔记数，1～32；每条笔记内部下载项始终串行，运行中更新会调整新笔记派发数量。

db 输出 JSON 含数据目录、schema 版本、数字枚举、毫秒更新时间和 revision。`ephemeral=true` 表示临时数据会在返回前清理。

parse 支持 items 数组或完整 feed JSON（最大 32 MiB），保存每条笔记的全部候选、警告和原始响应，每次导入创建新快照。inspect 默认列出最近 50 条笔记，-note 按当前快照读取完整详情；-out 可将结果写入指定 JSON 文件。parse/inspect 必须指定 -data-dir，导入记录保留以供后续开发。

download 必须带 -fixture-server，所有待下载媒体 URL 会替换为本机地址。-all 选择全部流/全部图片变体及视频封面，默认仍为 Best。-output 可指定输出目录，-note-file 可指定原始样本；总等待上限 60s。它验证下载/持久化链路，模拟视频是测试数据，不能用作真实播放样本。任务、文件、JSON/manifest 都保留；服务器在命令结束时关闭。fixture 快照中的本机链接随服务器退出失效，后续重新运行该命令生成新快照。

inspect -history 按笔记任务列出历史，-task 读取任务及按序文件结果（成功/失败/跳过/校验摘要/尝试次数）。

collect 必须显式带 -fixture，仅调用内存中的样本适配器；默认三条完整笔记组成两页用户列表，包含一条重复发现的笔记。创建名为 offline-parse-fixture 的合成账号用于验证真实关联/DPAPI，Cookie 不可用于登录；没有真实小红书请求。输出作业计数、全部结果、来源/页数。服务器用户 token 与各笔记 token 分开，检查完整详情补全和按笔记去重。

要在应用查看离线导入数据，关闭应用后将 CLI 的 `-data-dir` 指定为可执行文件旁的 data 目录（例如 `./bin/data`）。应用始终使用该固定目录，不读取 `XHS_DESKTOP_DATA_DIR`。CLI 的显式隔离目录用于本地检查，不改变应用存储规则。应用和 CLI 互斥持有同一数据目录。真实接口验证继续使用 xhsapitest；此命令没有在线解析入口。
