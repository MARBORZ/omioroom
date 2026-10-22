import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import type { Lang, Translations } from "./types.js";
import { en } from "./translations/en.js";
import { ru } from "./translations/ru.js";

const LANG_STORAGE_KEY = "omioroom_language";

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLanguage(): Lang {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  if (saved === "en" || saved === "ru") {
    return saved;
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    if (navigator.language.toLowerCase().startsWith("ru")) {
      return "ru";
    }
  }
  return "en";
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(getInitialLanguage);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem(LANG_STORAGE_KEY, newLang);
  };

  const toggleLang = () => {
    setLang(lang === "en" ? "ru" : "en");
  };

  const t = useMemo(() => (lang === "ru" ? ru : en), [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}
