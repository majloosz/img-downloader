# Chrome Web Store Listing Draft

## Single purpose

Simple Image Downloader has one single purpose: help users find image files on the current webpage, review them by resolution, and download a selected image.

## Short description

Find JPG, JPEG, PNG, and WEBP images on the current page, sort by resolution, preview metadata, and download one image.

## Detailed description

Simple Image Downloader scans the page you are currently viewing only when you open the extension popup. It lists JPG, JPEG, PNG, and WEBP images, sorts them from largest resolution to smallest, and shows a preview with dimensions and available size metadata. Click `Download` next to an image to save it through Chrome.

The extension does not collect personal data, does not track browsing, does not use analytics, and does not send page data to a server.

## Permissions justification

- `activeTab`: Allows the extension to inspect only the current tab after the user opens the popup. This avoids broad host permissions.
- `scripting`: Injects the local scanner script into the current tab after user action.
- `downloads`: Saves the selected image through Chrome's download manager.

## Privacy practices

- Data handling: processed locally in Chrome.
- Data sale: no data is sold.
- Data transfer: no data is transferred to the developer or third parties.
- Remote code: none.
- Ads: none.
- Analytics: none.

## Suggested category

Productivity

## Suggested screenshots

- Popup showing several detected images sorted by resolution.
- Popup after a successful download button click.
