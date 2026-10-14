import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "旅行手記｜行程・住宿・預算",
  description:
    "整理每日行程、住宿與預算，留下屬於你的旅行手記。資料儲存於此瀏覽器，支援備份還原。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
