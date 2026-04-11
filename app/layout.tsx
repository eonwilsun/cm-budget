import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CM Budget – Budget Analyser",
  description: "Upload your Excel budget spreadsheet and visualise income, expenses, categories and trends. All data is processed locally in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

