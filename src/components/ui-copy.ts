import en from "../messages/en.json";
import vi from "../messages/vi.json";
export const uiMessages = { en, vi } as const;
export type UiLocale = "en" | "vi";
export function errorText(code: string, locale: UiLocale) {
  if (!code) return "";
  const exact = Object.entries(uiMessages[locale]).find(
    ([key]) => key === `error_${code}`,
  )?.[1];
  return (
    exact ??
    `${uiMessages[locale].error_generic}${/^[A-Z][A-Z0-9_]{0,79}$/u.test(code) ? ` (${code})` : ""}`
  );
}
export function runStateText(state: string, locale: UiLocale) {
  return (
    Object.entries(uiMessages[locale]).find(
      ([key]) => key === `state_${state}`,
    )?.[1] ?? state
  );
}
