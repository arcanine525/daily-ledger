import { TaskDetail } from "../../../../components/tasks/detail";
import { requireOwner } from "../../../owner";
export default async function Page({
  params,
}: {
  readonly params: Promise<{ locale: "vi" | "en"; id: string }>;
}) {
  const { locale, id } = await params;
  await requireOwner(locale);
  return <TaskDetail locale={locale} id={id} />;
}
