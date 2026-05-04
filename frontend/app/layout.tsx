import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { NavBar } from "@/components/layout/nav-bar";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DemoControls } from "@/components/DemoControls";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Founder OS",
  description:
    "A sleek and approachable founder command center for live context, strategic guidance, and privacy controls.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <AuthProvider>
            <NavBar />
            <main className="mx-auto max-w-7xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
              {children}
            </main>
            <DemoControls />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
