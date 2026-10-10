<p align="right"><sub>简体中文 · <a href="README.en.md">English</a></sub></p>

# 拾景 · Scenelet

**让拍过的风景，回到每天的桌面。**

拾景是一款桌面壁纸应用，让自己的照片、喜欢的摄影师作品或 Unsplash 合集，按你设定的间隔出现在桌面上。也支持电脑里的本地照片。

做它的初衷很简单：偶尔看到自己拍过的一张照片，就想起当时的地方和片刻。

**[前往官网下载](https://leoonliang.github.io/Scenelet/)** · [更新记录](CHANGELOG.md) · [问题反馈](https://github.com/LeoonLiang/Scenelet/issues)

![拾景：预览照片、挑选壁纸，让喜欢的风景留在桌面](docs/images/home.jpg)

<sub>上图为浏览器预览，使用示例照片。设置壁纸与自动轮换需下载桌面客户端。</sub>

## 开始使用

支持 **Windows 10/11**（x64 / ARM64）与 **macOS**（Intel / Apple Silicon），无需安装 Node.js。

前往 [拾景官网](https://leoonliang.github.io/Scenelet/) 下载适合你电脑的安装包：

- **Windows**：运行 `setup.exe`
- **macOS**：打开 `installer.dmg`，将 App 拖入「应用程序」

### 使用 Unsplash

1. 在首页粘贴 **Unsplash Access Key**，点击「连接并保存」。\
   已有应用的 Key 可在 [Unsplash 开发者页面](https://unsplash.com/developers) 查看。
2. 照片来源选择 **「作者」**，填入自己的 Unsplash 用户名或主页链接。
3. 选好照片方向和换图间隔，点击 **「保存并收起」**。
4. 选一张照片，点击 **「设为壁纸」**，再在底栏点击 **「继续换图」**，开始轮换。

### 使用本地照片

进入 **「我的图库 → 导入照片」** 添加本地照片或文件夹，再将照片来源选为「我的图库」，无需 Access Key。

> 导入不会移动原图，请保留原文件。

## 日常使用

- **先看看再换**：按屏幕比例预览，从一批候选中挑选；点击「设为壁纸」才会应用。
- **安静地轮换**：自定义间隔，随时暂停或回到上一张；关闭窗口后默认仍在菜单栏 / 托盘运行。
- **留住喜欢的照片**：收藏作品，或分享 Unsplash 链接，让对方导入图库。
- **按自己的习惯**：支持简体中文 / English、浅色 / 深色外观，以及可选的摄影师署名。

<details>
<summary>安装与兼容性说明</summary>

当前安装包未签名，macOS 包未公证。确认下载来自本项目后：

- **macOS**：如被拦截，可在「系统设置 → 隐私与安全性」中选择「仍要打开」；设置壁纸时如请求自动化权限，需允许。
- **Windows**：x64 桌面壁纸已有验证记录；macOS、ARM64 及完整安装更新流程仍需实机验证。

更多信息见 [开发与验证](docs/development.md)、[安装包与更新](docs/releases.md)。

</details>

## Unsplash 使用说明

在线功能使用官方 API，Access Key 加密保存在本机。

根据 [Unsplash API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines)，壁纸应用属于限制用途。个人 Key **不等于** 用途授权，使用与发行前请自行确认许可。

本地照片不依赖此 API。

## 本地开发

需要 **Node.js 22.12+**，在项目目录执行：

```sh
npm ci
npm run dev
```

## 开源协议

本项目代码采用 [MIT License](LICENSE)，允许商用、修改与再分发，需保留版权和许可声明，软件按原样提供，不作担保。

照片版权及 Unsplash API 使用许可不包含在本协议中，仍需遵守各自条款。
