import type { Metadata } from "next";

import { ThemeProvider } from "@/shared/theme/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/shared/theme/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "Tracking Money",
  description: "AIを活用した家計簿・資産管理アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // data-theme は head スクリプトが上書きするため suppressHydrationWarning を付与（Next 16 ガイド準拠）
    <html lang="ja" data-theme="light" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
