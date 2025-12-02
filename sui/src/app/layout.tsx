import { type Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { AppBar } from "@/components/AppBar";
import { Providers } from "./providers";
import "./globals.css";
import "@mysten/dapp-kit/dist/index.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sui Counters - Move Smart Contract Demo",
  description: "Counter smart contracts demo on Sui blockchain using Move",
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
