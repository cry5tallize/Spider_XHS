# 前端工程与 UI/UX

## 技术基线与版本

继续使用 React + TypeScript + Vite + pnpm。引入安装时最新稳定版 `antd`、兼容的 `@ant-design/icons`、React Router、TanStack Query、Zustand；核对 React/ReactDOM 同版及组件 peer dependencies，必要时成套升级 React 与 types。提交精确 lockfile，生产构建用 frozen lockfile，不在 runtime 依赖里长期留 `latest`。

Ant Design MCP 本次查到 6.6.4 changelog，以及 ConfigProvider/Table API。组件不明确时用 `antd_doc`、`antd_info`、`antd_demo`、`antd_token` 查询，不沿用旧版废弃属性。AntD 版本以实际安装结果为准，将已核对版本记录到 ENG-03 验收证据。

不引入 Ant Design Pro 全套框架来包裹简单桌面应用；使用组件和统一 design tokens。图标按组件导入，不加载整个图标集合。

## 路由和加载

使用 React Router `createHashRouter`，规避桌面嵌入资源服务器对子路径刷新/rewrite 的额外要求；业务 path 仍为正常静态树。`RouterProvider` 由 root 提供，shell 常驻，页面/重型详情动态导入。

| 路由 | 页面 | 默认加载策略 |
| --- | --- | --- |
| `/`、`/parse` | 解析工作台 | lazy；首页只加载当前需要的模块 |
| `/notes` | 笔记库与筛选 | lazy |
| `/notes/:noteId` | 笔记详情与媒体候选 | lazy；候选表/大预览再按需拆分 |
| `/downloads` | 下载任务中心 | lazy；全局任务摘要无需先加载整个页面 |
| `/downloads/:taskId` | 单笔记任务与有序下载项详情 | lazy |
| `/history` | 下载历史 | lazy |
| `/accounts` | Cookie 账号管理 | lazy |
| `/settings` | 全局设置与下载模板 | lazy；高级配置折叠区域按需加载 |

示意契约：

```tsx
const router = createHashRouter([
  {
    Component: AppShell,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, lazy: () => import('@/features/parsing/route') },
      { path: 'parse', lazy: () => import('@/features/parsing/route') },
      { path: 'notes', lazy: () => import('@/features/notes/route') },
      { path: 'downloads', lazy: () => import('@/features/downloads/route') },
      { path: 'history', lazy: () => import('@/features/history/route') },
      { path: 'accounts', lazy: () => import('@/features/accounts/route') },
      { path: 'settings', lazy: () => import('@/features/settings/route') },
    ],
  },
]);
```

模块导出该版 Router 支持的 `Component/ErrorBoundary/loader` 等成员；真实实现补详情路由。路由定义不能 import 所有页面组件或通过大 barrel 间接提前引入。不要在同步 shell/provider 中导入详情预览和高级表单。

避免路由和 Query 重复请求：route loader 仅在需要时预热同一个 Query key，页面复用缓存。列表筛选/页 cursor 放 URL search params，窗口刷新保留视图。hover/focus 可预取当前可见下一目的页面，但不启动时预取全部 feature。

## 状态分工

| 状态 | owner | 规则 |
| --- | --- | --- |
| 账号/笔记/历史/设置查询 | TanStack Query | 有分页边界、合理 staleTime；命令成功精准 invalidate |
| 高频进度和运行中任务摘要 | Zustand task store | root events 唯一更新；selector 只订阅所需行 |
| 输入文本、表单、选中候选 | 局部状态 / Ant Form | 路由离开可保留轻量草稿，不持有所有 raw 响应 |
| 主题与系统变化 | ThemeProvider | DB 为配置权威，localStorage 仅无敏感主题启动镜像 |
| 持久化任务/配置/去重决策 | Go 服务 | 前端不能自己用 localStorage 管理任务队列或 Cookie |

后台 job 与页面请求使用不同生命周期：页面卸载取消不再需要的列表/详情调用，任务本身继续运行。Wails 调用的实际取消能力先核对该版本 runtime，再通过 shared/bridge 统一包装；不能仅丢弃 Promise 便声称取消了后端长任务。

## 界面布局与视觉基线

首版主窗口建议 1200×800、最小 960×640；可折叠侧栏约 216px/64px，56px 顶栏，主内容自适应。左侧只放解析、笔记、任务、历史、账号、设置；顶栏显示当前账号与运行任务摘要。不为了填空增加没有业务价值的仪表盘。

视觉：中性灰背景、清楚的内容层次、少量蓝紫主色（初始 `#4F6BFF`）、细边框、适度 10px 圆角。间距按 4/8px 基准，主内容 24px；中文使用本地系统字体，不依赖远端字体。light/dark 均通过 token 生成，卡片/弹层/输入/hover 层级一致。

优先密度适当的可扫描列表和详情，不堆大标题、渐变玻璃效果、装饰统计卡。颜色主要表达操作/状态，同一状态全应用一致；状态同时带文字/图标，不能只靠红绿区分。

## 主要页面与用户流程

### 解析工作台

- 单条、批量、用户三种明确入口，输入区支持多行链接、粘贴分享文本、导入文本。账号 selector、必要范围配置靠近主动作。
- 展开前给出输入校验摘要、去重数和无效行；一次解析结果保留来源账号和响应时间。
- 结果列表展示作者、笔记类型、图片数、LivePhoto 数、视频编码/最高已知规格、warnings；列表预览不自动拉所有大图/播放视频。
- 用户任务展示来源/页数/发现/完成/失败及限额停止原因。可暂停、取消、重试失败，页面离开后顶部任务摘要仍可到达该作业。
- 点击结果打开详情；「创建下载」先进入计划预览/配置抽屉，清楚列出将下载多少文件、预计大小、重复跳过和警告。

### 笔记详情

- 信息区显示作者、标题正文、标签、发布时间、解析时间/账号、原始 type 和警告。
- 图片按原顺序，静态/LivePhoto 标识一致；每图展开全部唯一 Variants，显示 scene、合并 Sources、格式/尺寸和可选状态。WebDft 在前，不把 PRV 放成默认最高质量。
- 视频和 LivePhoto 动态流以动态表格显示 codec/group、容器、分辨率、FPS、码率、大小、时长、HDR/质量标签、备用 URL 数；未知显示「未知」，支持按编码/规格筛选和多选。
- 首个默认候选突出但全部选择可见；EF7/未来编码不硬编码成固定四项 tab。大候选列表 virtual，行 key 使用 candidate ID。
- 链接详情按需展开，避免页面重复显示同一 URL。签名链接复制是显式操作；普通界面不展示 Cookie/token 原文。

### 下载任务中心

- 顶部展示排队/运行/暂停/失败笔记数和总速度；主体可按状态筛选、搜索笔记/作者、批量暂停/恢复/重试。下载并发控件明确标注「同时下载的笔记数」。
- 一行表示一条笔记任务，显示封面/作者/标题；展开为按序下载项列表，当前项突出显示，后续项等待。批量提交可按分组折叠，但不能把一批当一个任务行混淆并发数。
- 笔记汇总进度显示百分比或未知总量、已完成/全部项数、bytes、速度和 ETA，附当前项进度；能定位 LivePhoto 静态/动态独立结果。失败显示具体原因、已尝试备用地址、下一次重试时间。
- 任务配置快照可查看，运行中的配置改变仅影响未来任务/明确支持的并发参数。取消与暂停文案、图标、结果明确区分。
- 完成/部分完成后直接打开输出目录、manifest 或失败项，避免用户翻日志找路径。

### 下载配置

- 基础区：输出目录、媒体范围、质量模式、配置模板、历史过滤、已存在文件策略；默认覆盖直接可见。
- 高级区：动态 codec/scene/custom 选择、路径模板、LivePhoto、完整 metadata、网络/笔记并发/重试/Range/校验。「单下载项分段连接」是独立高级字段，不提供同笔记多项并行配置。
- 高级字段给简短用途/单位/生效范围，依赖条件禁用并解释。不能让「图片格式」暗示自动转码。
- 模板可保存/复制，计划显示所用版本；预览路径、碰撞、过滤差异由后端返回。

### 账号管理

- 账号列表展示昵称/用户 ID、状态、默认标识、最近验证时间；新增/更新 Cookie 使用受控输入且默认遮盖。
- 保存、验证、设默认、禁用各有明确结果。当前无有效账号时解析入口显示就近配置入口，已有历史/任务仍能查看。
- 账号错误在账号行和相关任务中可定位，不弹同一个全局 toast 数十次。

### 下载历史

- 默认一行一条笔记历史（一次笔记任务），重复下载可按 note_id 折叠查看多次记录；按作者/批量来源分组可选。下载项在记录内展开，不以每个文件充当历史主单位。
- 筛选日期、笔记结果、媒体类型、编码/分辨率、输出根和有效/缺失/损坏状态；文件条件命中该笔记任一明细时主列表仍只出现这条历史一次。
- 显示下载时标题/作者快照及当前关联笔记、已满足/失败/跳过项数；可定位目录、检查明细文件、查看配置、只补缺或整条强制重下。原任务失败重试更新原历史。
- 跳过原因可追溯到历史记录与实际有效副本；「清除记录」与「删除文件」是不同动作。
- 大量数据用后端分页，文件有效性按需/后台批量校验，不在表格 render 中同步遍历磁盘。

### 设置

主题模式、默认输出/下载模板、解析并发与同时下载笔记数、独立主机连接额度、网络代理/超时、缓存/raw/笔记历史保留、启动恢复策略、数据目录及版本信息。显示配置有效范围，错误输入不覆盖原有效设置。

## 明暗模式

ThemeMode int8：Unknown=0、System=1、Light=2、Dark=3；默认 System。

1. root 启动从无敏感的主题镜像与 `matchMedia('(prefers-color-scheme: dark)')` 确定首帧，避免白屏闪烁；bootstrap 返回 DB 配置后校正。
2. ConfigProvider 使用 `theme.defaultAlgorithm/theme.darkAlgorithm`，统一 token/CSS variable；应用树包含 Ant `App`。
3. message/notification/modal 通过 `App.useApp()` 或 hooks 实例使用，不能使用丢失 ConfigProvider context 的全局 static 调用。
4. System 模式监听系统变化；切换为手动模式立即生效并持久化，移除不需要的监听。切回 System 使用当前系统值而非上次缓存。
5. CSS 使用语义 token，不在每个页面独立硬编码暗色。图片预览、弹层、进度、空状态、原生窗口背景一起验收。

## 性能、交互和可访问性

- Table `virtual` 时配置数值 `scroll.x/scroll.y`，用稳定 rowKey；大量候选/任务按行 selector 更新，昂贵格式化缓存到数据适配阶段。
- 主要列表后端分页 50 条/页，大数据详情按需加载；不能把 10 万 history 一次传入 WebView。raw JSON 导出读文件/后端流，不塞进所有列表 DTO。
- 路由 chunk loading、查询 loading、应用 startup loading 分开处理；保持 shell 和当前数据可见，避免全部画面因操作闪白。
- 图片 `loading=lazy`、固定占位尺寸、小缩略图优先；视频仅用户点击才加载，候选 URL 不逐一自动探测。
- 共享 skeleton/empty/error 状态，错误有就近可执行动作；批量完成汇总提示一次。破坏性删除文件用具体数量/路径的确认，正常解析/下载不加多余确认。
- 支持键盘焦点与 Enter 主操作，焦点样式清晰；工具栏控件有 label，状态文本可读，常规文字对比度目标至少 4.5:1，尊重 reduced-motion。
- 性能初始目标：首屏 JS gzip ≤350 KiB（实测并记录必要调整）；1,000 活跃任务摘要模拟中列表滚动流畅，事件处理无持续 >50ms 主线程长任务；懒加载通过产物检查验证，不只看源代码写了 lazy。
