import { ReviewInbox } from "../../../components/tasks/review-inbox";
import { requireOwner } from "../../owner";
export default async function Page({
  params,
}: {
  readonly params: Promise<{ locale: "vi" | "en" }>;
}) {
  const { locale } = await params;
  await requireOwner(locale);
  return (
    <main className="workspace">
      <ReviewInbox locale={locale} />
    </main>
  );
}
