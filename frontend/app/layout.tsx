import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Founder Intelligence Engine",
  description: "Your personal AI intelligence layer for Gmail, Slack, and Calendar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} min-h-screen text-gray-100`}
        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1a2e 40%, #16213e 100%)" }}
      >
        {/* Nav */}
        <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl bg-black/20 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                F
              </div>
              <span className="font-semibold text-lg tracking-tight text-gradient">
                Founder Intelligence
              </span>
            </div>
            <div className="flex gap-1 text-sm">
              {[
                { href: "/", label: "Feed", icon: "⚡" },
                { href: "/guide", label: "Guide", icon: "🧭" },
                { href: "/ingest", label: "Ingest", icon: "📥" },
                { href: "/meetings", label: "Meetings", icon: "📅" },
                { href: "/privacy", label: "Privacy", icon: "🔒" },
              ].map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-150"
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
