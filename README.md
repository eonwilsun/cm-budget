# CM Budget

A **privacy-first**, client-side budget analyser built with **Vite + React + TypeScript + Tailwind CSS**.  
Upload an Excel spreadsheet and instantly see your finances as charts and summary cards — no data ever leaves your browser.

🌐 **Live site:** [https://eonwilsun.github.io/cm-budget/](https://eonwilsun.github.io/cm-budget/)

---

## ✨ Features

| Feature | Detail |
|---|---|
| 📤 Excel upload | Drag-and-drop or click to upload `.xlsx` / `.xls` files |
| 🗺️ Column mapping | Auto-detects headers; shows a mapping UI if needed |
| 💰 Summary cards | Total income, total expenses, net balance, transaction count |
| 🥧 Category charts | Pie **or** bar chart, filterable by income / expenses / all |
| 📈 Monthly trend | Line chart showing income, expenses and net by month |
| 🏦 Account breakdown | Bar chart + table per bank account / card |
| 📋 Transaction table | Searchable, paginated list of all transactions |
| 📊 Budget report | Collapsible INCOME / EXPENDITURE sections with monthly columns |
| 🖼️ Export | Download dashboard or report as PNG or PDF (client-side) |
| 🔒 GDPR-safe | 100% client-side — no data is uploaded, stored, or shared |

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install & run locally

```bash
git clone https://github.com/eonwilsun/cm-budget.git
cd cm-budget
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for production

```bash
npm run build
npm run preview
```

The built static site is output to `dist/`.

---

## 🌐 GitHub Pages Deployment

The site is automatically deployed to GitHub Pages on every push to `main` via the workflow in `.github/workflows/pages.yml`.

### Setup (one-time)

1. Go to your repo → **Settings → Pages**
2. Under **Build and deployment → Source**, select **GitHub Actions**
3. Push to `main` — the workflow builds and deploys automatically
4. Visit: `https://eonwilsun.github.io/cm-budget/`

---

## 📄 Spreadsheet Format

The app accepts any `.xlsx` or `.xls` file and can map non-standard column names through its **column mapping step**.

### Budget Report format

Rows are grouped into INCOME / EXPENDITURE sections with month columns:

| Code | Name | Budget 2025 | Jan | Feb | … | Dec | Total |
|------|------|-------------|-----|-----|---|-----|-------|
| | INCOME | | | | | | |
| 1000 | Grants | 50000 | 4000 | 4000 | | 4000 | 48000 |

- Accounting-style negatives `(7,035)` are parsed as -7035
- Totals rows are used when present

### Transaction list format

#### Option A — Single signed Amount column

| Date | Description | Category | Account | Amount |
|------|-------------|----------|---------|--------|
| 15/01/2024 | … | Groceries | Current | -82.50 |
| 20/01/2024 | … | Income | Savings | 3200.00 |

#### Option B — Separate Debit and Credit columns _(recommended for UK bank exports)_

| Date | Description | Category | Account | Debit | Credit |
|------|-------------|----------|---------|-------|--------|
| 15/01/2024 | … | Groceries | Current | 82.50 | |
| 20/01/2024 | … | Income | Savings | | 3200.00 |

### Date formats supported

| Format | Example |
|--------|---------|
| DD/MM/YYYY *(primary)* | `15/01/2024` |
| YYYY-MM-DD | `2024-01-15` |
| Excel serial number | *(automatic)* |

---

## 🔒 Privacy & GDPR

- **No server processing.** The file is read entirely in your browser using the [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader).
- **No data is transmitted.** Nothing from your spreadsheet is sent over the network.
- **No persistence.** No `localStorage`, cookies, or any storage mechanism is used. When you close the tab, all data is gone.
- **No tracking.** There is no analytics, telemetry, or third-party scripts.

---

## 🛠 Tech Stack

| Library | Purpose |
|---------|---------|
| [Vite](https://vitejs.dev) | Build tool (static output to `dist/`) |
| [React 19](https://react.dev) | UI framework |
| [TypeScript](https://www.typescriptlang.org) | Type safety |
| [Tailwind CSS 4](https://tailwindcss.com) | Styling |
| [@e965/xlsx](https://www.npmjs.com/package/@e965/xlsx) | Client-side Excel parsing (community fork of SheetJS, no known CVEs) |
| [Recharts](https://recharts.org) | Charts (line, bar, pie) |
| [html2canvas](https://html2canvas.hertzen.com) | PNG export |
| [jsPDF](https://github.com/parallax/jsPDF) | PDF export |

---

## 📝 Licence

MIT
