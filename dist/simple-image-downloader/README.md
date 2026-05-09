# Simple Image Downloader

Simple Image Downloader is a Chrome extension for finding image files on the active tab, sorting them by resolution, previewing dimensions and available size metadata, and downloading one selected image.

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
3. Review images sorted from largest resolution to smallest.
4. Click `Download` next to the image you want to save.

## Limitations

- Chrome blocks extension scripts on internal pages such as `chrome://extensions`.
- Some sites do not expose transfer-size metadata, so file size can show as `unknown`.
- Lazy-loaded images may appear only after you scroll the page before opening the popup.
- The first version downloads one image at a time.

## Test

```bash
npm test
```

## Package for upload

```bash
npm run package
```

The ZIP is created in `dist/simple-image-downloader.zip`.
