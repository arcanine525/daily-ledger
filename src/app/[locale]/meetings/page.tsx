import { MeetingsList } from "../../../components/meetings/list";
import { requireOwner } from "../../owner";
export default async function Page({
  params,
}: {
  readonly params: Promise<{ locale: "vi" | "en" }>;
}) {
  const { locale } = await params;
  await requireOwner(locale);
  return <MeetingsList locale={locale} />;
}
