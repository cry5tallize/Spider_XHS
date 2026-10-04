# desktopcheck

从 desktop 运行，只做本地应用验证，不使用 Cookie、不访问小红书、不打开窗口。

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
go run ./cmd/desktopcheck inspect -data-dir ./.task/local-check -note 69ca61ce00000000230172f5
```

theme：1 跟随系统、2 浅色、3 深色。notes：同时执行的笔记数，1～32；每条笔记内部下载项始终串行。参数只设置偏好，下载执行器在 P2c 实现。

db 输出 JSON 含数据目录、schema 版本、数字枚举、毫秒更新时间和 revision。`ephemeral=true` 表示临时数据会在返回前清理。

parse 支持 items 数组或完整 feed JSON（最大 32 MiB），保存每条笔记的全部候选、警告和原始响应，每次导入创建新快照。inspect 默认列出最近 50 条笔记，-note 按当前快照读取完整详情；-out 可将结果写入指定 JSON 文件。parse/inspect 必须指定 -data-dir，导入记录保留以供后续开发。

要在开发应用查看离线导入数据，启动前将 `XHS_DESKTOP_DATA_DIR` 设置为同一个目录的绝对路径。真实接口验证继续使用 xhsapitest；此命令没有在线解析入口。
