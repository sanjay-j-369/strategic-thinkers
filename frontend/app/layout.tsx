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
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <AuthProvider>
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
