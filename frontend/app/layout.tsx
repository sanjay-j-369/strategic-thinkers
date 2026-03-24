import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Founder Intelligence Engine",
  description: "Your personal AI intelligence layer for Gmail, Slack, and Calendar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <span className="font-semibold text-lg tracking-tight">
            Founder Intelligence
          </span>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="/" className="hover:text-white transition-colors">Feed</a>
            <a href="/guide" className="hover:text-white transition-colors">Guide</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
