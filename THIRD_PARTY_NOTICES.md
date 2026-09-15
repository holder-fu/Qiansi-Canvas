# Third-Party Notices

Qiansi-Canvas 包含第三方软件。第三方组件继续适用各自许可证；Qiansi-Canvas 的 GPL 或商业许可不会替代这些许可证。

以下是当前 `package.json` 直接运行时依赖的许可证概览：

| 组件 | 当前锁定版本 | 许可证 |
| --- | --- | --- |
| `@lobehub/icons-static-svg` | 1.94.0 | MIT |
| `@mediapipe/tasks-vision` | 1.0.1 | Apache-2.0 |
| `@pixiv/three-vrm` | 3.5.5 | MIT |
| `@xyflow/react` | 12.11.2 | MIT |
| `fflate` | 0.8.3 | MIT |
| `lucide-react` | 1.28.0 | ISC |
| `react` | 19.2.8 | MIT |
| `react-dom` | 19.2.8 | MIT |
| `three` | 0.181.1 | MIT |
| `zustand` | 5.0.14 | MIT |

本表是方便阅读的概览，不是完整依赖清单。准确版本和传递依赖以 `package-lock.json` 为准；制作发行包时，应同时保留各依赖包附带的许可证、版权声明和 NOTICE 文件，并对实际打包内容重新执行许可证检查。

仓库随附的 MediaPipe 模型和 WebAssembly 运行文件来源、用途与下载地址记录在 [`public/mediapipe/README.md`](./public/mediapipe/README.md)，其 Apache License 2.0 正文随资源保存在 [`public/mediapipe/LICENSE-APACHE-2.0.txt`](./public/mediapipe/LICENSE-APACHE-2.0.txt)。

用户安装的插件、模型、ComfyUI 工作流、素材、字体、音乐和连接的外部 API 服务不属于上述清单，仍由其提供者的许可证或服务条款约束。

Qiansi Audio Studio 不随本仓库发布；其第一方程序、MIT License、模型安装清单和第三方声明由独立的 `Qiansi-Audio-Studio` 仓库维护。该程序聚合或安装的音频引擎、模型权重、固定音色和运行环境继续适用各自许可证。
