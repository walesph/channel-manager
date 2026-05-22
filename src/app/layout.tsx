import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { AppProvider } from "@/lib/app-context";
import { MaybeClerkProvider } from "@/components/MaybeClerkProvider";
import { detectLang, type Lang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Stayboard — Channel Manager",
  description: "Hotel channel manager + PMS for Korean OTAs and global channels.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Stayboard",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

const LANG_COOKIE = "stayboard-lang";
const VALID_LANGS = new Set<Lang>(["ko", "en", "ja", "zh"]);

async function pickInitialLang(): Promise<Lang> {
  // Cookie wins (user-explicit choice from a prior visit) → Accept-Language
  // header → "ko" default. Done at request time so SSR markup uses the right
  // <html lang> from the first byte.
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LANG_COOKIE)?.value as Lang | undefined;
  if (fromCookie && VALID_LANGS.has(fromCookie)) return fromCookie;
  const h = await headers();
  return detectLang(h.get("accept-language"));
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await pickInitialLang();
  return (
    <MaybeClerkProvider>
      <html lang={lang}>
        <body>
          <AppProvider initialLang={lang}>{children}</AppProvider>
        </body>
      </html>
    </MaybeClerkProvider>
  );
}
