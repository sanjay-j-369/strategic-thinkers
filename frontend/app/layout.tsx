import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/site-header";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DemoControls } from "@/components/DemoControls";

import "./globals.css";

export const metadata: Metadata = {
  title: "Founder OS",
  description:
    "A monochrome founder command center for live context, strategic guidance, and privacy controls.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <AuthProvider>
            <div className="pointer-events-none fixed inset-0 -z-10">
              <div className="theme-surface absolute inset-0" />
            </div>

            <div className="px-4 pb-10 pt-4 sm:px-6 lg:px-8">
              <SiteHeader />
              <main className="mx-auto max-w-7xl">{children}</main>
            </div>
            <DemoControls />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
