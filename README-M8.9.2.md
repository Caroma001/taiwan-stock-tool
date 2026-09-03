# twstock-M8.9.2 — Display Modal Layer Hotfix

- Display Preferences now renders through React Portal into `document.body`.
- Modal uses a full-viewport fixed backdrop and maximum z-index.
- Header, body and footer are separated; only modal content scrolls.
- Background page scrolling is locked while the modal is open.
- Supports Escape, backdrop click and close button.
- Preserves font size, table density, theme presets, random themes and localStorage persistence.
