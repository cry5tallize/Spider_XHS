# PC xhsapi

用 `NewClient(cookie, Options{})` 创建客户端，结束时调用 `Close()`。单页方法返回 `*Response, error`；`Response.Raw` 是完整原始响应字节，`Data` 可用 `DecodeData` 读取。接口错误时仍返回收到的 Response。

主要方法：GetMe、GetNote、GetHomefeed、GetUserInfo、GetUserNotes、SearchNotes、SearchUsers、GetComments、GetSubComments、GetUnread，以及配置、通知、辅助查询和媒体地址方法。

GetNote 保持原始 feed 查询。GetNoteDetail 会在视频类型时把完整链接交给 GetVideoURL，携带 Cookie、xsec_token、xsec_source 获取网页，返回原始 Response 和 Videos；页面获取失败仍保留 feed 和错误。GetVideoURL 也接受裸 ID，但裸 ID 没有访问 token。og:video 是单个播放地址，不是所有编码/清晰度的流列表。

`Collect*` 方法支持数量、页数限制和 Context 取消，返回已取数据和逐页响应；中途失败保留部分结果。`Options.OnResponse` 可保存每次 HTTP 响应。签名参数使用有序 Params，避免 map 改变字段顺序。

Python 方法对应关系见 [source-map.json](source-map.json)。Live、IM、RWP 不在本包范围。Report* / SyncSearchHistory 是显式写接口，查询不会自动调用。
