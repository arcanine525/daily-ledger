import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AppFrame } from "../../components/app-frame";
export default async function LocaleLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "vi" && locale !== "en") notFound();
  return <AppFrame locale={locale}>{children}</AppFrame>;
}
