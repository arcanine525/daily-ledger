import { TaskForm } from "../../../../components/tasks/form";
import { requireOwner } from "../../../owner";
export default async function Page({
  params,
}: {
  readonly params: Promise<{ locale: "vi" | "en" }>;
}) {
  const { locale } = await params;
  await requireOwner(locale);
  return (
    <main className="workspace">
      <h1>
        {locale === "en" ? "Create a manual task" : "Tạo công việc thủ công"}
      </h1>
      <TaskForm locale={locale} />
    </main>
  );
}
