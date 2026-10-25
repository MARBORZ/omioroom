import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "system" | "dark" | "light";
export type DensityMode = "default" | "compact";
export type ReducedMotionMode = "system" | "reduce" | "normal";
export const CHAT_TEXT_SCALE_MIN = 0.8;
export const CHAT_TEXT_SCALE_MAX = 1.5;

export interface SettingsState {
  theme: ThemeMode;
  density: DensityMode;
  reducedMotion: ReducedMotionMode;
  soundNotifications: boolean;
  /** Chat text and bubbles scale, 1 = normal. */
  chatTextScale: number;
  setChatTextScale: (scale: number) => void;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityMode) => void;
  setReducedMotion: (mode: ReducedMotionMode) => void;
  setSoundNotifications: (enabled: boolean) => void;
}

const STORAGE_KEY_THEME = "omioroom_theme";
const STORAGE_KEY_DENSITY = "omioroom_density";
const STORAGE_KEY_MOTION = "omioroom_reduced_motion";
const STORAGE_KEY_SOUND = "omioroom_sound_notifications";
const STORAGE_KEY_CHAT_TEXT = "omioroom_chat_text_size";

const SettingsContext = createContext<SettingsState | null>(null);

function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return mode;
}

function resolveReducedMotion(mode: ReducedMotionMode): boolean {
  if (mode === "reduce") return true;
  if (mode === "normal") return false;
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof localStorage === "undefined") return "system";
    return (localStorage.getItem(STORAGE_KEY_THEME) as ThemeMode) || "system";
  });

  const [density, setDensityState] = useState<DensityMode>(() => {
    if (typeof localStorage === "undefined") return "default";
    return (localStorage.getItem(STORAGE_KEY_DENSITY) as DensityMode) || "default";
  });

  const [reducedMotion, setReducedMotionState] = useState<ReducedMotionMode>(() => {
    if (typeof localStorage === "undefined") return "system";
    return (localStorage.getItem(STORAGE_KEY_MOTION) as ReducedMotionMode) || "system";
  });

  const [soundNotifications, setSoundNotificationsState] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return true;
    const stored = localStorage.getItem(STORAGE_KEY_SOUND);
    return stored === null ? true : stored === "true";
  });

  const [chatTextScale, setChatTextScaleState] = useState<number>(() => {
    if (typeof localStorage === "undefined") return 1;
    const stored = localStorage.getItem(STORAGE_KEY_CHAT_TEXT);
    // Older versions stored "small" | "default" | "large"
    if (stored === "small") return 0.9;
    if (stored === "large") return 1.2;
    const n = Number(stored);
    return stored !== null && Number.isFinite(n) && n >= CHAT_TEXT_SCALE_MIN && n <= CHAT_TEXT_SCALE_MAX ? n : 1;
  });

  const setChatTextScale = (scale: number) => {
    const clamped = Math.min(Math.max(Math.round(scale * 100) / 100, CHAT_TEXT_SCALE_MIN), CHAT_TEXT_SCALE_MAX);
    setChatTextScaleState(clamped);
    try {
      localStorage.setItem(STORAGE_KEY_CHAT_TEXT, String(clamped));
    } catch {}
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--chat-font-scale", String(chatTextScale));
  }, [chatTextScale]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, newTheme);
    } catch {}
  };

  const setDensity = (newDensity: DensityMode) => {
    setDensityState(newDensity);
    try {
      localStorage.setItem(STORAGE_KEY_DENSITY, newDensity);
    } catch {}
  };

  const setReducedMotion = (newMotion: ReducedMotionMode) => {
    setReducedMotionState(newMotion);
    try {
      localStorage.setItem(STORAGE_KEY_MOTION, newMotion);
    } catch {}
  };

  const setSoundNotifications = (enabled: boolean) => {
    setSoundNotificationsState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY_SOUND, String(enabled));
    } catch {}
  };

  // Sync theme to DOM and listen to system color scheme changes
  useEffect(() => {
    const applyTheme = () => {
      const resolved = resolveTheme(theme);
      document.documentElement.setAttribute("data-theme", resolved);
    };

    applyTheme();

    if (theme === "system" && window.matchMedia) {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => applyTheme();
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }
  }, [theme]);

  // Sync density to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  // Sync reduced motion to DOM and listen to system media queries
  useEffect(() => {
    const applyMotion = () => {
      const isReduced = resolveReducedMotion(reducedMotion);
      if (isReduced) {
        document.documentElement.setAttribute("data-reduced-motion", "reduce");
      } else {
        document.documentElement.removeAttribute("data-reduced-motion");
      }
    };

    applyMotion();

    if (reducedMotion === "system" && window.matchMedia) {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const handler = () => applyMotion();
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }
  }, [reducedMotion]);

  return (
    <SettingsContext.Provider
      value={{
        theme,
        density,
        reducedMotion,
        soundNotifications,
        chatTextScale,
        setChatTextScale,
        setTheme,
        setDensity,
        setReducedMotion,
        setSoundNotifications,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsState {
  const context = useContext(SettingsContext);
  if (!context) {
    return {
      theme: "system",
      density: "default",
      reducedMotion: "system",
      soundNotifications: true,
      chatTextScale: 1,
      setChatTextScale: () => {},
      setTheme: () => {},
      setDensity: () => {},
      setReducedMotion: () => {},
      setSoundNotifications: () => {},
    };
  }
  return context;
}
