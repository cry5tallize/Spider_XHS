# PC xhsapi

用 `NewClient(cookie, Options{})` 创建客户端，结束时调用 `Close()`。单页方法返回 `*Response, error`；`Response.Raw` 是完整原始响应字节，`Data` 可用 `DecodeData` 读取。接口错误时仍返回收到的 Response。

主要方法：GetMe、GetNote、GetHomefeed、GetUserInfo、GetUserNotes、SearchNotes、SearchUsers、GetComments、GetSubComments、GetUnread，以及配置、通知、辅助查询和媒体地址方法。

GetNote 只获取原始 feed 详情，包括服务端返回的视频流信息。GetVideoURL 保留为独立方法，接受完整链接或裸 ID，不会由详情查询自动调用；og:video 是单个播放地址，不是所有编码/清晰度的流列表。

笔记类型整理使用 `response.DecodeNotes()`；本地 `data.items` 项数组使用 `ParseNoteItems(raw)`。返回 `[]Note` 和带字段路径的解析错误；部分字段异常时仍返回已解析结果。类型整理不会请求网络。

- `note.Video.Streams`：全部编码/清晰度的动态列表，最佳可用质量候选在前。`StreamsForCodec("EF7")` 或 `StreamsForCodec("h265")` 可筛选，未知编码仍保留。
- `stream.CandidateURLs()`：主地址、兼容 url、全部备用地址的非空去重候选；单条流的 `URL` / `BackupURLs` 同样排除重复和空值，不重复包含主地址。只有跨 media/media_v2 确认重复的记录才一对一合并，不同编码/规格的流仍保留。
- `note.Images`：保持笔记顺序。每张图的 `Variants` 按完整 URL 精确去重，优先使用 `WB_DFT`（兼容 WebDft / WEB_DFT）作为合并记录；所有场景、URL 别名和各自元数据保存在 `variant.Sources`，来源中不重复存 URL。同优先级有尺寸依据时按像素数排序，全部不同地址保留。`VariantsForScene("WB_DFT")` / `VariantsForScene("WebDft")` 会同时查询合并来源。
- `image.MotionStreams`：LivePhoto 的全部动态流，与静态图归属同一图片；可用 `MotionStreamsForCodec` 筛选。缺失的动态尺寸/时长不会从静态图补造，LivePhoto 标志和普通笔记类型分别保留。
- `NormalizeImageVariants` 返回去重合并并排序的新列表，空地址仅保留在原始图像记录中。`SortVideoStreams` / `SortImageVariants` 只排序并返回新切片；业务可自行筛选或改变排序。视频按可用地址、分辨率、FPS，再按编码和同编码码率排序，不跨编码用码率判定画质。

ID 无损转换为字符串；计数及可选数值使用指针，区分缺失与 0。`CreatedAtMS` / `UpdatedAtMS`、流的 `DurationMS` 使用毫秒；视频元数据的 `DurationSec` / `CapaDurationSec` 使用秒。未知字段及不兼容的已知字段保存在 `Extra`；原始记录可在 Go 中从 `Raw` / `Sources[].Raw` 读取，Pretty JSON 不嵌入 Raw，完整输入单独保存。去重不改写 URL 或签名参数，参数不同的完整地址仍视为不同候选。

`Collect*` 方法支持数量、页数限制和 Context 取消，返回已取数据和逐页响应；中途失败保留部分结果。`Options.OnResponse` 可保存每次 HTTP 响应。签名参数使用有序 Params，避免 map 改变字段顺序。

Python 方法对应关系见 [source-map.json](source-map.json)。Live、IM、RWP 不在本包范围。Report* / SyncSearchHistory 是显式写接口，查询不会自动调用。
