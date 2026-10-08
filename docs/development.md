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

## 锁屏同步验收

`npm test` 包括设置迁移、原生调用边界和真实 main 管线的集成测试：用替代的操作系统调用模拟锁屏拒绝，检查桌面状态与历史落盘、轮换保留、警告恢复和关闭设置。测试不会改变主机壁纸，也不能证明 Windows 实际显示效果。

Windows 实机验收需覆盖 Windows 10/11、x64/ARM64、NSIS 安装版/ZIP 便携版：

1. 新用户启动后「同步到锁屏」默认开启；旧版数据升级后保持关闭，提示可开启或保持关闭。选择后重启、修改其他设置，选择均保持。
2. 手动设置、窗口下一张、托盘下一张、定时轮换后，用 Win+L 观察同一用户的锁屏图片。分别验证图片模式和 Windows 聚焦模式，记录是否被聚焦覆盖。使用包含中文、空格、单引号、方括号与 `$` 的本地图片路径。
3. 关闭同步后只更新桌面。开启后从下一次换图开始同步；macOS 不显示开关，仍沿用系统桌面行为。
4. 在禁止更改锁屏的测试策略或接口失败场景中，确认桌面仍更新、当前照片/历史正确、轮换继续，界面与托盘显示独立锁屏警告。连续后台失败不重复弹通知；恢复成功或关闭同步后警告消失。
5. 手工验收前记录原来的桌面、锁屏图片及聚焦模式，结束后在系统设置中恢复。现有 `--wallpaper-test` 不会更改锁屏。

当前开发环境为 macOS，Windows 锁屏 API 与上述安装包矩阵尚未实机验证。

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
