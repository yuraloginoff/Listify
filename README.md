# Listify

A clean, minimal start page for organizing your favorite links into groups. All data is stored in your browser's localStorage — no backend required.

**Live demo:** [listify-black.vercel.app](https://listify-black.vercel.app)

## Features

- **Link groups** — organize links into named lists (Work, Social, News, etc.)
- **Full CRUD** — create, edit, and delete both groups and individual links
- **Auto title fetch** — paste a URL and the title is auto-filled from the page's `<title>` tag
- **Change parent group** — move a link to a different group via the dropdown in the edit modal
- **Reorder links** — move links up and down within a group
- **Web search** — search bar submits queries to DuckDuckGo in the current tab
- **Clock** — 24-hour time and formatted date (e.g. "Thursday, 30 July") in the header
- **Dark / light mode** — auto-detects system preference, manually toggleable
- **Export / Import** — backup and restore all data as a JSON file
- **Responsive** — works great on desktop and mobile
- **Favicons** — automatically fetches website icons

## Tech

- Vanilla HTML, CSS, JavaScript — no frameworks, no dependencies
- Data persisted in browser localStorage
- Cabinet Grotesk + Satoshi fonts via Fontshare

## Usage

1. Open `index.html` in any modern browser, or visit the [live demo](https://listify-black.vercel.app)
2. Click "New Group" to create a link group
3. Click "Add link" within any group, paste a URL — the title fills in automatically
4. Hover over links to reveal reorder, edit, and delete buttons
5. Use the export/import buttons in the header to backup your data

## License

MIT
