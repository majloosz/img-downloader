# Simple Image Downloader

Simple Image Downloader is a Chrome extension for finding image files on the active tab, sorting them by resolution, previewing dimensions and available size metadata, and downloading selected images.

## Chrome Web Store posture

- Manifest V3 only.
- No remote code.
- No analytics, tracking, ads, accounts, or backend.
- No `host_permissions`; the extension uses `activeTab` only after the user opens the popup on the current tab.
- Single purpose: discover and download images from the page the user is viewing.

## Load locally

```bash
npm run build:icons
```

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project directory.

## Use

1. Open a webpage with JPG, JPEG, PNG, or WEBP images.
2. Click the extension icon.
3. Use the minimum size slider to show only images at or above the selected KB value. The default is `5 KB`.
4. Review images sorted from largest resolution to smallest.
5. Click one or more image rows to select them.
6. Click `Download selected` to save all selected images, or click `Download` next to one image to save only that image.

## Limitations

- Chrome blocks extension scripts on internal pages such as `chrome://extensions`.
- When the popup opens, the extension first uses page metadata for a fast result and then tries `HEAD` plus a tiny `Range` request for images that still show `unknown`.
- Some sites still do not expose usable size headers, so file size can remain `unknown`.
- When the minimum size slider is above `0 KB`, images with unknown size stay visible because the extension cannot confirm whether they are below the selected threshold.
- Lazy-loaded images may appear only after you scroll the page before opening the popup.
- Chrome may show multiple download notifications when several selected images are downloaded.

## Test

```bash
npm test
```

## Package for upload

```bash
npm run package
```

The packaging step recreates a single `dist/` directory and writes the ZIP to `dist/simple-image-downloader.zip`.
