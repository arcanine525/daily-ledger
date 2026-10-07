import { MeetingDetail } from "../../../../components/meetings/detail";
import { requireOwner } from "../../../owner";
export default async function Page({
  params,
}: {
  readonly params: Promise<{ locale: "vi" | "en"; id: string }>;
}) {
  const { locale, id } = await params;
  await requireOwner(locale);
  return <MeetingDetail locale={locale} id={id} />;
}
