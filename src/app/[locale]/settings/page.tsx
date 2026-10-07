import { notFound } from "next/navigation";
import { Management } from "../../../components/management";
import { requireOwner } from "../../owner";

export default async function SettingsPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "vi" && locale !== "en") notFound();
  await requireOwner(locale);
  return <Management locale={locale} />;
}
