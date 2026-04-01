import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nexus - 多游戏社区论坛",
  description: "一个现代、高性能的多游戏在线协作与社交互动社区论坛。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`${inter.className} bg-[#050505] text-white min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
