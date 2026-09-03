import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MainNavigation from "./components/MainNavigation";
import PwaRegister from "./components/PwaRegister";
import GlobalUpdateProgress from "@/components/update/GlobalUpdateProgress";
import Swing10CloseReminder from "./components/Swing10CloseReminder";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bruce's 台股決策中心",
  description: "Bruce's 台股籌碼選股、持股管理與技術分析中心",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        <GlobalUpdateProgress />
        <Swing10CloseReminder />
        <MainNavigation />
        {children}
      </body>
    </html>
  );
}