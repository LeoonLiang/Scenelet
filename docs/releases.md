# 版本发布与自动更新

仓库：[LeoonLiang/Scenelet](https://github.com/LeoonLiang/Scenelet)。应用使用公开的 GitHub Releases，不需要用户填写 GitHub Token。

## 推荐流程：GitHub Actions

公开仓库的标准托管运行器可以免费构建。`.github/workflows/release.yml` 在推送 `vX.Y.Z` Tag 时运行；四个构建全部通过，才上传一个 Draft Release。Release 正文取自 `CHANGELOG.md` 对应版本，下载文件附带 SHA256 校验清单。

临时 Actions 构建产物保留一天，Release 上传成功后自动清理；正式 Release 资产保留。已公开的 Release 不允许工作流覆盖资产，修复请发布新的版本号。

版本号采用 `主版本.次版本.修订号`：修复问题增加修订号（例如 `0.5.1`），新增兼容功能增加次版本（例如 `0.6.0`）；稳定的首个完整版本使用 `1.0.0`，以后不兼容的变化增加主版本。每个版本对应唯一的 `vX.Y.Z` Tag 和一条 Changelog。测试版可另用预发布 Release，但当前脚本只发布稳定版本，客户端也只检查稳定版本。

每次发版：

```sh
git switch main
git pull --ff-only
npm ci
npm run release:prepare -- 0.6.0
```

编辑 `CHANGELOG.md` 中新增章节，替换 TODO，写清功能、修复和兼容性变化。准备脚本同步 package.json、锁文件和界面版本，不自动提交或推送。

```sh
npm test
npm run build
npm run release:check
git add package.json package-lock.json src/version.ts CHANGELOG.md
git commit -m "Release 0.6.0"
npm run release:tag
git push origin main v0.6.0
```

Tag 脚本要求 main 分支、干净工作区、正式 SemVer、有效 Changelog，不自动推送。检查 [Actions](https://github.com/LeoonLiang/Scenelet/actions)，构建成功后在 [Releases](https://github.com/LeoonLiang/Scenelet/releases) 打开草稿，检查附件，点击 **Publish release**。只有发布后的稳定版本才会进入自动更新和网站推荐下载。

若某个构建失败，修正工作流后可手动选择已有 Tag 重跑；若代码有变化，请使用新版本号与新 Tag，不移动已发布版本的 Tag。

## 安装包矩阵

| 系统 | 架构 | 推荐安装版 | 免安装 / 归档版 |
| --- | --- | --- | --- |
| Windows 10/11 | x64：Intel / AMD | `Scenelet-X.Y.Z-windows-x64-setup.exe` | `Scenelet-X.Y.Z-windows-x64-portable.zip` |
| Windows ARM | arm64 | `Scenelet-X.Y.Z-windows-arm64-setup.exe` | `Scenelet-X.Y.Z-windows-arm64-portable.zip` |
| macOS Intel | x64 | `Scenelet-X.Y.Z-macos-x64-installer.dmg` | `Scenelet-X.Y.Z-macos-x64-app.zip` |
| macOS Apple Silicon | arm64 | `Scenelet-X.Y.Z-macos-arm64-installer.dmg` | `Scenelet-X.Y.Z-macos-arm64-app.zip` |

Mac 的 DMG 通过拖到 Applications 安装；ZIP 解压后仍需将 App 放入固定位置。未签名包可能受系统限制，不提供绕过系统保护的脚本。

Electron 当前运行时不支持 Windows 7/8；暂不构建 Windows 32 位或 Linux。不同 Windows 架构是处理器版本，不是不同的 Windows 系统主题。每个版本单独一个 Release，用附件文件名区分系统、架构和安装方式。

## 更新策略

- **Windows 安装版**：启动 30 秒后检查，以后每 6 小时检查；发现稳定新版自动下载，用户点击「重启并安装」后更新。下载使用 electron-updater 的校验机制；不会自动降级，也不会拉取预发布版本。
- **Windows 便携版**：检查版本，提供当前架构的新 ZIP 下载入口，退出后替换文件。已有本机数据独立保存。
- **当前 macOS 未签名包**：检查并下载对应芯片的 DMG，手动安装。Mac 原生自动安装需要有效的 Apple Developer 签名与公证条件，目前没有这些凭据，不宣称支持。
- **开发、浏览器预览、smoke 模式**：禁用自动检查、下载和安装。
- **安装时正在设置壁纸**：阻止立即重启，待任务完成后再更新。

Windows 元数据为 `latest-x64.yml` 和 `latest-arm64.yml`，Mac 元数据为 `latest-x64-mac.yml` 和 `latest-arm64-mac.yml`，不会因并行构建同名文件而覆盖另一架构。NSIS 的 blockmap 与 Mac ZIP 元数据一起上传。不要手工修改校验值。

当前 Windows 安装包未签名。未来添加 Windows 签名证书与 Apple 签名/公证时，应通过 GitHub Secrets 注入，不能提交证书、密码或 Token 到源码。当前工作流刻意没有签名秘密。

## 本地构建与上传备用方案

Actions 不可用时，使用同一套构建脚本。Windows 可构建 x64 / ARM64；Mac 包需要在 Mac 上运行。

```sh
npm ci
npm test
npm run build
npm run release:check
node scripts/build-release.cjs win32 x64
node scripts/build-release.cjs win32 arm64
# 在 Mac 上执行：
node scripts/build-release.cjs darwin x64
node scripts/build-release.cjs darwin arm64
```

产物放在 `release/vX.Y.Z/平台-架构/`，不会混进上一版本。使用 `gh release create vX.Y.Z --draft --verify-tag --notes-file release-notes.md` 建立草稿，再上传各系统 EXE/DMG/ZIP、更新 YAML 和 blockmap；Release 正文可通过 `node scripts/check-release.cjs vX.Y.Z release-notes.md` 生成。本地同样要核对全部附件再发布。

## GitHub Pages 介绍页

`site/` 是静态介绍页源码，不需要打包；`gh-pages` 是只含站点文件的独立分支。源码和站点分支通过下面的脚本同步：

```sh
git add site
git commit -m "Update landing page"
npm run site:publish
```

首次启用：仓库 **Settings → Pages → Deploy from a branch → gh-pages → /(root)**。预期地址为 `https://leoonliang.github.io/Scenelet/`；仅推送站点分支不会自动开启 Pages，此设置由仓库维护者完成。

当前仓库已有上述 Pages 配置，介绍页已经部署到 [在线介绍页](https://leoonliang.github.io/Scenelet/)。更新站点分支会触发 GitHub 的 Pages 构建，无需在应用发版时重新部署页面。

下载页读取 GitHub 最新正式 Release 的实际资产，默认推荐安装版。草稿、预发布和不存在的附件不会被推荐；网络失败时退回 Releases 页面。浏览器无法准确识别 Mac 芯片时需要用户选择，不通过图形渲染器猜测硬件。
