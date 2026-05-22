"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LANGS, type Lang } from "./i18n";

interface AppContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Cycles through all 4 supported locales. Kept named `toggleLang` for
   *  backwards compatibility with existing call sites that expected ko↔en. */
  toggleLang: () => void;
  dark: boolean;
  setDark: (d: boolean) => void;
  toggleDark: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const LANG_COOKIE = "stayboard-lang";

function readLangCookie(): Lang | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]+)`));
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return (LANGS as readonly string[]).includes(v) ? (v as Lang) : null;
}

function writeLangCookie(l: Lang) {
  if (typeof document === "undefined") return;
  // 1-year persistence; same-site default.
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

export function AppProvider({ children, initialLang = "ko" }: { children: ReactNode; initialLang?: Lang }) {
  // Server already picked initialLang from cookie/Accept-Language so SSR
  // markup is correct. The mount effect persists the cookie when the user's
  // first visit had no cookie (we want stable lang on subsequent visits).
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const fromCookie = readLangCookie();
    if (!fromCookie && typeof navigator !== "undefined") {
      // Persist server-detected lang so the user can see / change it.
      writeLangCookie(initialLang);
    }
  }, [initialLang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    writeLangCookie(l);
  };
  const toggleLang = () => {
    const idx = LANGS.indexOf(lang);
    const next = LANGS[(idx + 1) % LANGS.length];
    setLang(next);
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        dark,
        setDark,
        toggleDark: () => setDark((d) => !d),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
