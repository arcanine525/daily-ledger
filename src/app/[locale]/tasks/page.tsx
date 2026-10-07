import { TasksList } from "../../../components/tasks/list";
import { requireOwner } from "../../owner";
export default async function Page({
  params,
}: {
  readonly params: Promise<{ locale: "vi" | "en" }>;
}) {
  const { locale } = await params;
  await requireOwner(locale);
  return <TasksList locale={locale} />;
}
