# desktopcheck

从 desktop 运行，只做本地应用验证，不使用 Cookie、不访问小红书、不打开窗口。

```powershell
# 临时 SQLite：完成后关闭连接并移除临时目录
go run ./cmd/desktopcheck db

# 使用明确的持久目录；第二次运行验证设置在重启后保留
go run ./cmd/desktopcheck db -data-dir ./.task/local-check -theme 3 -notes 2
go run ./cmd/desktopcheck db -data-dir ./.task/local-check
```

theme：1 跟随系统、2 浅色、3 深色。notes：同时执行的笔记数，1～32；每条笔记内部下载项始终串行。参数只设置偏好，P1 尚未执行下载。

输出 JSON 含数据目录、schema 版本、数字枚举、毫秒更新时间和 revision。`ephemeral=true` 表示临时数据会在返回前清理。解析与下载子命令随对应阶段实现；原有 API 验证继续用 xhsapitest。
