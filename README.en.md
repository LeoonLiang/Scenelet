<p align="right"><sub><a href="README.md">简体中文</a> · English</sub></p>

# Scenelet · 拾景

**Bring the places you've photographed back to your desktop.**

Scenelet is a desktop wallpaper app that rotates your own photos, a favorite photographer's work, or an Unsplash collection at an interval you choose. It also supports local photos on your computer.

It began with a simple idea: seeing a photo I'd taken could bring back a place and a moment.

**[Download from the website](https://leoonliang.github.io/Scenelet/)** · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/LeoonLiang/Scenelet/issues)

![Scenelet: preview photos, choose wallpapers, and keep your favorite scenery on your desktop](docs/images/home.jpg)

<sub>The screenshot shows the browser preview with sample photos. Setting wallpapers and automatic rotation require the desktop app.</sub>

## Getting started

Supports **Windows 10/11** (x64 / ARM64) and **macOS** (Intel / Apple Silicon). No Node.js installation is required.

Visit the [Scenelet website](https://leoonliang.github.io/Scenelet/) to download the installer for your computer:

- **Windows**: Run `setup.exe`.
- **macOS**: Open `installer.dmg` and drag the app into Applications.

### Using Unsplash

1. Paste your **Unsplash Access Key** on the home page and click **Connect and save**.\
   You can find the key for an existing app on the [Unsplash developer page](https://unsplash.com/developers).
2. Select **Photographer** as the photo source and enter your Unsplash username or profile link.
3. Choose a photo orientation and rotation interval, then click **Save and collapse**.
4. Choose a photo and set it as your wallpaper, then click **Resume rotation** in the bottom bar to start rotating photos.

### Using local photos

Go to **My library → Import photos** to add local photos or folders, then select **My library** as the photo source. No Access Key is needed.

> Importing does not move your original photos. Keep the original files in place.

## Everyday use

- **Preview before applying**: Preview photos at your screen's aspect ratio and choose from a batch of candidates. A photo is applied only when you set it as your wallpaper.
- **Let photos rotate quietly**: Set your own interval, pause anytime, or return to the previous photo. By default, the app keeps running in the menu bar or system tray after you close the window.
- **Keep your favorites**: Save photos to your favorites or share an Unsplash link so someone else can import it into their library.
- **Make it yours**: Choose Simplified Chinese or English, light or dark appearance, and optional photographer credits.

<details>
<summary>Installation and compatibility notes</summary>

The current installers are unsigned, and the macOS package is not notarized. After confirming that your download comes from this project:

- **macOS**: If the app is blocked, open **System Settings → Privacy & Security** and choose **Open Anyway**. Allow Automation access if prompted when setting a wallpaper.
- **Windows**: Desktop wallpaper support has been verified on x64. macOS, ARM64, and the full installation and update flows still need testing on actual devices.

See [Development and verification](docs/development.md) and [Installers and updates](docs/releases.md) for more details (in Chinese).

</details>

## Unsplash usage

Online features use the official API. Your Access Key is encrypted and stored locally on your computer.

The [Unsplash API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) restrict use in wallpaper apps. A personal key **does not grant permission for this use**. Confirm the applicable permissions before using or distributing the app.

Local photos do not depend on this API.

## Local development

Requires **Node.js 22.12+**. Run these commands in the project directory:

```sh
npm ci
npm run dev
```

## License

The project's code is licensed under the [MIT License](LICENSE), which permits commercial use, modification, and redistribution. Retain the copyright and permission notices. The software is provided as is, without warranty.

Photo copyrights and Unsplash API permissions are not covered by this license and remain subject to their respective terms.
