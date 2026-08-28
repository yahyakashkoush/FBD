import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Search", description: "" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-gray-950 text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
