"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { errorText } from "./ui-copy";
export function useUiError() {
  const [code, setCode] = useState(""),
    locale = usePathname().startsWith("/en") ? "en" : "vi";
  return [errorText(code, locale), setCode] as const;
}
