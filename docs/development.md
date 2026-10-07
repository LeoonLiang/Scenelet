# 开发与验证

用户介绍与使用步骤见 [README](../README.md)。

## 项目入口

`electron/main.cjs` 处理官方 API、凭据、缓存、系统壁纸和托盘；`electron/core.cjs` 提供来源与筛选逻辑；`electron/retry.cjs` 处理有限网络重试；`src/App.tsx` 提供界面。

用户看到的名称是「拾景 · Scenelet」，包名、appId、IPC、图片协议和数据目录保留 framewall 标识，以兼容既有数据。Windows ZIP 的可执行文件名为 `Scenelet.exe`。

## 常用命令

需 Node.js 22.12+。在项目根目录执行：

```sh
npm install
npm run dev
npm run build
npm test
npm start
```

`npm run dev` 同时运行 Vite 和 Electron；`npm run dev:web` 仅运行浏览器预览。PowerShell 如遇脚本执行策略限制，使用 `npm.cmd`。

Windows 便携包：

```sh
npm run build
npm exec -- electron-builder --win zip
```

产物在 `release/`。macOS 必须在 Mac 上构建与验证，目前不提供已验证的 Mac 发行包。

## 桌面 smoke 检查

Windows 项目根目录：

```powershell
node_modules\.bin\electron.cmd . --smoke-test
```

使用 `.smoke-data/` 隔离数据。检查本地导入、真实尺寸、图片协议渲染、收藏、旧列表兼容、IPC 隔离、作者来源、自定义间隔、凭据加密读写与移除。使用假 Key 和模拟网络验证连接超时后重试成功，不向 Unsplash 发送测试 Key。

加 `--wallpaper-test` 会短暂修改 Windows 壁纸，在 finally 中恢复并核对系统壁纸路径。仅在了解该行为的测试环境使用。报告存于 `artifacts/`；这些临时文件与发行包不进入仓库。

## 已验证与待验证

- 当前 18 项核心测试通过，最终 Windows 0.4 包的 smoke 检查通过；打包的核心原生文件与源文件一致。
- Windows 系统 API 设置及恢复测试壁纸已验证；未通过截图核验多显示器视觉效果。
- 真实账户的在线连接、配额和下载尚未完成端到端验证。
- macOS 尚未完成构建与实机测试；首次运行可能涉及系统自动化权限，布局目前由系统管理。
- 截图来自浏览器界面预览，图库使用示例照片，示例尺寸不代表在线 API 返回的真实元数据。

## 发行注意事项

当前 Windows 包未签名。0.5 安装版支持检查、下载更新并确认重启安装，便携版与未签名 Mac 采用下载更新。Electron 的便携包约 149 MB，项目的简洁主要指使用流程。构建矩阵与 Changelog 约定见 [发布文档](releases.md)。

此前锁文件检查仍报告 8 项中等级问题，位于 electron-builder 下载/打包工具链（sprintf-js → roarr → global-agent）。严重与高等级问题已移除；此记录不是实时审计结果，发行前应重新检查依赖并处理上游公告与代码签名。

公开发行前还需确认 Unsplash 的 API 用途许可，详见 [README 的使用说明](../README.md#unsplash-使用说明)。本地照片功能不依赖该 API。

## 截图与文档

README 的截图保存在 `docs/images/`，属于正式文档资源；使用相对路径，使仓库页面也能显示。临时调试截图保存在被忽略的 `artifacts/`。

公开下载统一使用 [GitHub Releases](https://github.com/LeoonLiang/Scenelet/releases)。介绍页在 site/，独立 gh-pages 分支启用方法见 [发布文档](releases.md)。
