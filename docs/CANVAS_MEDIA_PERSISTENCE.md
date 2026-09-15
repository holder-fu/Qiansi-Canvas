# 画布媒体持久化与 AI 引用契约

本文是画布项目、媒体原件、缩略图和 AI 参考图之间的实现契约。修改上传、复制节点、导演台、多图引用、项目迁移、素材清理或 AI 提交前，必须同时核对本文、`BRIDGE_PERSISTENCE_V3.md` 和对应回归测试。

## 当前唯一权威

- 本机 Bridge 是项目、工作台、回收站、素材原件、预览和生成结果的唯一永久存储权威。
- 生产环境不再向 `localStorage` 或 IndexedDB 新写画布节点、连线、媒体、预览、回收站或生成结果。
- 浏览器只保存当前项目 ID、界面偏好和会话内缓存；这些内容不能被当作作品备份。
- Bridge 不可用时只能进入明确的“临时会话”状态。页面可以继续编辑或保留临时 `blob:`，但不能显示“已永久保存”，刷新可能丢失临时内容。
- 旧 `localStorage` / IndexedDB 只作为只读迁移源。媒体写入 Bridge、完整回读校验并提交项目修订后，才能删除对应旧记录。
- 本架构消除浏览器 Storage 配额根因；主机磁盘已满、目录无权限、Bridge 断线和修订冲突仍必须作为真实错误处理。

## 这次问题的根因与禁止回归

1. 旧快照把完整 Base64 重复写入 `localStorage`；同一图片出现在 `imageUrl`、`images`、`output`、端口缓存、导演台和复制节点时，很快超过浏览器配额。
2. 旧 IndexedDB 兜底仍受浏览器同源存储配额约束，不能作为无限画布的长期文件系统。
3. `originalUrl`、`previewUrl`、素材 ID 和运行时 `blob:` 曾被混用，导致画布显示正确但 AI 收到缩略图，或换图后旧 `bridgeAssetId` 仍指向上一张图片。
4. 复制节点共享底层文件是正确行为，但节点引用身份、人物 A/B 角色和数组索引不能按 URL 去重；相同文件承担两个语义角色时仍是两个有序引用槽。
5. 异步上传必须冻结 `projectId + workspace + nodeId + source`。只按节点 ID 回填会在切换项目后把项目 A 的图片写进项目 B。
6. 上传文件名只是展示信息。Bridge 必须生成不可碰撞的 `assetId` 和物理文件名；同名文件不得覆盖。日期目录可以作为内部磁盘分片，但不能参与节点身份或公开 URL。
7. 旧数据迁移不能先清空浏览器记录。只有原件与预览完成校验、工作台/回收站写入新修订且回读一致后，才能清除那一批旧记录。
8. LAN 用户写入当前可信直连或已配对主机的 Bridge 数据目录，不能把作品长期保存在客户端浏览器；项目 JSON 必须使用主机无关的稳定相对地址。

## 身份与地址必须分离

| 概念 | 用途 | 是否可复制共享 | 是否可提交 AI |
| --- | --- | --- | --- |
| `assetId` / `bridgeAssetId` | Bridge 原文件身份 | 是 | 不能直接提交，先解析原件 |
| `referenceId` | 节点、连线、人物/场景角色与顺序 | 否 | 用于构建有序清单 |
| `originalUrl` | Bridge 原始清晰度文件地址 | 是 | 是 |
| `previewUrl` | 画布卡片和列表缩略图 | 是 | 核心引用禁止 |
| `/asset-library/files/<assetId>` | 可持久化、主机无关的原件地址 | 是 | 解析当前 Bridge 后可用 |
| `/media-preview/files/<id>` | 可持久化的显示预览 | 是 | 仅显式海报用途可用 |
| `blob:` | 当前页面临时对象地址 | 仅会话内 | 禁止持久化和提交 |
| Base64 Data URL | 旧格式或未保存会话内容 | 仅迁移期间 | 禁止持久化和提交 |
| `qiansi-canvas-media://...` | 旧 IndexedDB 稳定引用 | 仅迁移期间 | 先提升到 Bridge，否则拒绝 |

节点只保存 Bridge 返回的稳定素材身份和相对地址，不能保存宿主绝对磁盘路径、上传临时文件名或固定的 `127.0.0.1:<port>` 地址。LAN 客户端按当前访问的 Bridge 解析相同相对地址，因此主机地址变化不会改写项目 JSON。

### LAN 与开发代理地址规范化

- 受管媒体只认三个根路径族：`/asset-library/files/...`、`/media-preview/files/...` 和 `/output/...`。开发环境的 `/__qiansi_bridge` 只是 Vite 转发到 Bridge 的运行时 base，不属于可持久化媒体身份。
- 兼容读取旧快照时，地址解析会先移除旧 origin、当前 Bridge base 和重复的开发代理前缀，把受管地址规范成上述根相对形式；运行时再相对当前 Bridge 解析，并且最多补一次 `/__qiansi_bridge`。例如旧值 `http://localhost:2895/__qiansi_bridge/asset-library/files/<id>` 在 LAN 页面上不会再变成 `/__qiansi_bridge/__qiansi_bridge/asset-library/files/<id>`。
- 工作台节点、嵌套媒体字段、`manifest.assets` 和 LAN 协作轮询的完整项目快照使用同一套便携化/本地化规则。写入 Bridge JSON 时保存根相对地址；读取后才得到适合当前本机、LAN 或开发代理入口的可请求 URL。
- 规范化只作用于当前 Bridge 或已知旧回环 Bridge 的受管媒体路径。第三方 HTTP(S) URL 即使路径文字相似也必须原样保留，不能被改写到本机 Bridge。
- 这是对旧地址的兼容读取和后续保存规则，不代表历史修订已经被批量迁移或重写；不得为修复显示问题直接改写用户的已有 revision 或媒体文件。

## 上传与自动保存

```text
用户选择原文件
  → 节点先进入上传中或临时会话状态
  → Bridge 生成唯一 assetId 和临时文件
  → 校验 MIME、签名、大小及可用时的媒体元数据
  → 写入原文件并 fsync
  → 生成独立 preview 并 fsync
  → 原子更新素材索引
  → 客户端完整回读并校验原件身份/大小/哈希
  → 用稳定 originalUrl / previewUrl / assetId 更新被捕获的节点
  → 以 expectedRevision 原子提交工作台或回收站
  → Bridge 回读内容与新 revision 一致后显示“已保存”
```

任一步失败都不能把临时 `blob:`、Base64、浏览器文件地址或旧 IndexedDB URI写进 Bridge JSON。异步完成时只允许回填最初捕获的项目、工作台、节点和源修订；用户已经换图或切项目时，旧结果不得覆盖新状态。

所有持久化写入经过一个项目级队列和 `expectedRevision` CAS。工作台、项目元数据、素材目录与回收站不能由两个独立客户端 writer 并发覆盖。旧 LAN 同步只观察远端修订和报告冲突，不再另行 `PUT` 项目副本。

## 原图与缩略图门禁

1. `previewUrl`、`imagePreviewPosterUrl`、`directorThumbnailUrl`、`maskPreview` 和 `composerReferences[].previewUrl` 只用于显示。
2. `imagePreviewUrl` / `videoPreviewUrl` 是继承的原始源，不得在迁移时降级为海报。
3. 核心人物、场景、标注源、蒙版和导演台图片必须从 `assetId` 或 `originalUrl` 解析原文件。
4. `/media-preview/`、preview 查询地址、旧 IndexedDB preview、Base64、`blob:`、`file:` 和无效素材 ID 必须在付费请求前拒绝。
5. 原件缺失时停止生成并说明“原图不可用”，绝不能静默使用缩略图。
6. 视频模型的显式特效海报回退使用独立 `videoPosterFallbackImages` 通道，不能混入核心人物/场景数组。

## 多节点、复制与导演台

- 复制节点复制稳定素材引用，不复制或覆盖底层文件；编辑副本产生新的素材身份。
- `assetId` 与 `referenceId` 不得互相替代。相同原件可以同时是人物、场景或风格参考。
- 节点、边、引用数组和导演台人物编号必须保序；底层 URL 相同不代表语义槽相同。
- 2D 导演保持 `[控制图, 场景, 人物 A, 人物 B…]` 与标签、提示词编号一致。
- 3D 导演的动画帧和支持引用同样按槽位保留，不能在服务边界用 `Set(URL)` 折叠人物 A/B。
- AI 提交前冻结一份有序清单。解析素材地址只能替换地址，不能重新排序、合并角色或改变数量。

## 旧浏览器数据迁移

1. 首屏只按需读取当前 Bridge 工作台；旧浏览器数据作为兼容种子，不再成为自动保存权威。
2. 后台串行扫描旧项目、工作台分片、素材目录、回收站和已知 IndexedDB 媒体记录。
3. Base64 或旧 IndexedDB original 与 preview 分别写入 Bridge，并逐个回读验证；preview 永远不能替代 original。
4. 在内存中生成不含 Base64、`blob:`、`file:` 或 `qiansi-canvas-media:` 的完整工作台。
5. 使用当前 `expectedRevision` 提交；远端已有不同内容时停止并提示冲突，不能采用 local-wins。
6. 工作台、素材目录和回收站全部回读一致后，才调用该迁移事务的旧记录清理。
7. 某个清理动作失败时 Bridge 修订仍是成功状态，只保留冗余旧记录供下次清理；不能重提旧 revision 或把项目标记为未保存。
8. 一个项目全部完成后删除其旧分片。所有旧项目都完成且根值未变化后，才删除旧画布根键和共享素材键。

旧 IndexedDB API 只允许 `open-if-exists`、读取、验证和删除；不得通过升级回调创建新数据库或写入新媒体。Bridge 离线时迁移暂停，原始旧数据继续保留。

## Bridge 磁盘与容量边界

- 项目工作台与回收站使用临时文件、`fsync` 和原子替换；每次提交保留不可变修订，当前修订指针只在完整写入后推进。
- 物理素材文件使用 Bridge 生成的唯一名称；用户原始文件名只作显示元数据。
- 每个项目只保留有界修订历史；单次项目 JSON 有明确字节上限，避免异常节点文本拖垮 Bridge。
- 以后容量管理针对主机磁盘：项目/素材占用、可用空间、孤立文件扫描、未引用素材清理、临时文件 TTL 和失败上传清理。
- 删除底层素材前必须扫描所有项目工作台、素材目录、回收站和未解决冲突引用；任何快照读取失败都应停止删除。

## 导出边界

- 工作流 JSON 只包含图结构和稳定 Bridge 引用，不等于包含原文件的跨设备备份。
- 素材 ZIP 必须读取 original；preview-only、原件缺失或校验失败应中止导出，不能生成看似成功的不完整包。
- 旧 IndexedDB original 在迁移完成前仍可由兼容导出读取；旧 preview 不能替代原件。
- 真正的跨设备项目包需要图结构、所有工作台、素材 Blob 和 ID 映射，不能仅复制浏览器存储。

## 必须保留的回归测试

1. localStorage 和 IndexedDB 访问均抛配额错误时，新项目仍可通过 Bridge 保存并回读。
2. Bridge 断线时不产生浏览器作品写入，界面明确显示临时会话；恢复后可重试。
3. 同名文件与同一文件重复上传不会覆盖；节点只使用 Bridge 返回的唯一 `assetId`。
4. 相同 Base64 出现在多个字段和复制节点时只持久化一次，引用顺序和角色不变。
5. 两张不同图片在复制、排序、切项目、连线和刷新后不交换，旧 `bridgeAssetId` 不会复活。
6. 画布显示 preview，但图片、人物、场景、标注和导演台的 AI 请求收到 original；preview-only 必须拒绝。
7. 2D/3D 导演中相同原件的人物 A/B 仍是两个有序槽，标签和提示词编号不漂移。
8. 上传期间切换项目或换图不会跨项目回填，同一媒体事务不会重复上传。
9. Bridge 工作台、manifest 和 trash JSON 不含 Base64、`blob:`、`file:`、`filesystem:` 或旧 IndexedDB URI。
10. 旧 Base64/IndexedDB 媒体只有在 Bridge 回读和项目修订成功后删除；中途失败原记录完整保留。
11. 清理旧记录失败不会重提已经成功的 Bridge revision，也不会显示假失败。
12. LAN 与本机保存使用相同相对 URL；LAN 观察器不再产生第二路 `PUT`。
13. 并发客户端用旧 revision 保存收到冲突，主机数据保持不变。
14. 临时文件写入或目录索引更新中断不会损坏上一个可读取修订。
15. 浏览器新会话不产生画布、媒体、回收站或生成结果的 IndexedDB/localStorage 写入。
16. 旧 `localhost:2895/__qiansi_bridge/...` 原件、预览和输出地址在 LAN 入口只出现一次代理前缀；工作台与 `manifest.assets` 读取一致，第三方 URL 保持不变。
