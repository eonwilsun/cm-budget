# CM Budget

A **privacy-first**, client-side budget analyser built with **Next.js + TypeScript + Tailwind CSS**.  
Upload an Excel spreadsheet and instantly see your finances as charts and summary cards — no data ever leaves your browser.

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
| 🔒 GDPR-safe | 100% client-side — no data is uploaded, stored, or shared |

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install & run

```bash
git clone https://github.com/eonwilsun/cm-budget.git
cd cm-budget
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for production

```bash
npm run build
npm start
```

---

## 📄 Spreadsheet Format

The app accepts any `.xlsx` or `.xls` file and can map non-standard column names through its **column mapping step**.

### Option A — Single signed Amount column

| Date | Description | Category | Account | Amount |
|------|-------------|----------|---------|--------|
| 15/01/2024 | … | Groceries | Current | -82.50 |
| 20/01/2024 | … | Income | Savings | 3200.00 |

- **Negative** amounts = expenses  
- **Positive** amounts = income

### Option B — Separate Debit and Credit columns _(recommended for UK bank exports)_

| Date | Description | Category | Account | Debit | Credit |
|------|-------------|----------|---------|-------|--------|
| 15/01/2024 | … | Groceries | Current | 82.50 | |
| 20/01/2024 | … | Income | Savings | | 3200.00 |

- **Debit** column = money going out  
- **Credit** column = money coming in  
- Empty cells are treated as 0

### Date formats supported

| Format | Example |
|--------|---------|
| DD/MM/YYYY *(primary)* | `15/01/2024` |
| YYYY-MM-DD | `2024-01-15` |
| Excel serial number | *(automatic)* |

### Rows ignored automatically

The following row types are silently skipped (common in UK bank statement exports):

- `Totals` / `Total`
- `History Balance`
- `Account Balance`
- `Opening Balance` / `Closing Balance`
- Rows starting with `N/C:`, `Name:`, `Ref:`
- Statement header rows

### Optional columns

| Column | Notes |
|--------|-------|
| `Category` | If absent or blank, transactions are grouped as *Uncategorised* |
| `Account` | If absent or blank, transactions are grouped as *Unknown* |

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
| [Next.js 16](https://nextjs.org) | React framework (App Router) |
| [TypeScript](https://www.typescriptlang.org) | Type safety |
| [Tailwind CSS 4](https://tailwindcss.com) | Styling |
| [@e965/xlsx](https://www.npmjs.com/package/@e965/xlsx) | Client-side Excel parsing (community fork of SheetJS, no known CVEs) |
| [Recharts](https://recharts.org) | Charts (line, bar, pie) |

---

## 📝 Licence

MIT
