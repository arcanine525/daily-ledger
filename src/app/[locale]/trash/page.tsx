import { Trash } from "../../../components/trash";
import { requireOwner } from "../../owner";
export default async function Page({
  params,
}: {
  readonly params: Promise<{ locale: "en" | "vi" }>;
}) {
  const { locale } = await params;
  await requireOwner(locale);
  return <Trash locale={locale} />;
}
