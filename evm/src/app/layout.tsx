import { type Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { AppBar } from "@/components/AppBar";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EVM Counters",
  description: "Owned and Shared Counter dApps on Ethereum",
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-background">
            <AppBar />
            <main>{children}</main>
          </div>
          <Toaster richColors />
        </Providers>
      </body>
    </html>
  );
}
