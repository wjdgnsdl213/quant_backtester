"use client";

import { createContext, useContext, useEffect, useState } from "react";

const AdvancedModeContext = createContext<{
  advanced: boolean;
  toggle: () => void;
} | null>(null);

export function AdvancedModeProvider({ children }: { children: React.ReactNode }) {
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    setAdvanced(localStorage.getItem("advancedMode") === "1");
  }, []);

  const toggle = () => {
    setAdvanced((v) => {
      localStorage.setItem("advancedMode", v ? "0" : "1");
      return !v;
    });
  };

  return (
    <AdvancedModeContext.Provider value={{ advanced, toggle }}>
      {children}
    </AdvancedModeContext.Provider>
  );
}

export function useAdvancedMode() {
  const ctx = useContext(AdvancedModeContext);
  if (!ctx) throw new Error("useAdvancedMode must be used within AdvancedModeProvider");
  return ctx;
}
