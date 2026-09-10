import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/AppShell";

// Load custom fonts from @agterra/ui/fonts
const inter = localFont({
  src: "../../node_modules/@agterra/ui/fonts/Inter-Variable.woff2",
  variable: "--inter-font",
  weight: "100 900",
  display: "swap",
});

const sourceSerifSemibold = localFont({
  src: "../../node_modules/@agterra/ui/fonts/SourceSerif4-Semibold.woff2",
  variable: "--source-serif-font",
  weight: "600",
  display: "swap",
});

const jetbrainsMonoRegular = localFont({
  src: "../../node_modules/@agterra/ui/fonts/JetBrainsMono-Regular.woff2",
  variable: "--jetbrains-mono-font",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgTerra Intelligence",
  description: "AI-powered agricultural land investment intelligence platform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerifSemibold.variable} ${jetbrainsMonoRegular.variable}`}
    >
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
