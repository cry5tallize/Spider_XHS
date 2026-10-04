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
go run ./cmd/desktopcheck inspect -history -data-dir ./.task/download-check
go run ./cmd/desktopcheck inspect -task <task_id> -data-dir ./.task/download-check
```

theme：1 跟随系统、2 浅色、3 深色。notes：同时执行的笔记数，1～32；每条笔记内部下载项始终串行，运行中更新会调整新笔记派发数量。

db 输出 JSON 含数据目录、schema 版本、数字枚举、毫秒更新时间和 revision。`ephemeral=true` 表示临时数据会在返回前清理。

parse 支持 items 数组或完整 feed JSON（最大 32 MiB），保存每条笔记的全部候选、警告和原始响应，每次导入创建新快照。inspect 默认列出最近 50 条笔记，-note 按当前快照读取完整详情；-out 可将结果写入指定 JSON 文件。parse/inspect 必须指定 -data-dir，导入记录保留以供后续开发。

download 必须带 -fixture-server，所有待下载媒体 URL 会替换为本机地址。-output 可指定输出目录，-note-file 可指定原始样本；总等待上限 60s。它验证的是下载/持久化链路，模拟视频是测试数据，不能用作真实播放样本。任务、文件、JSON/manifest 都保留；服务器在命令结束时关闭。fixture 快照中的本机链接随服务器退出失效，后续重新运行该命令生成新快照。

inspect -history 按笔记任务列出历史，-task 读取任务及按序文件结果（成功/失败/跳过/校验摘要/尝试次数）。

要在开发应用查看离线导入数据，启动前将 `XHS_DESKTOP_DATA_DIR` 设置为同一个目录的绝对路径。应用和 CLI 互斥持有该数据目录，关闭应用后才能操作同一目录。真实接口验证继续使用 xhsapitest；此命令没有在线解析入口。
