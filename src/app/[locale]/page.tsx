import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authenticate, HttpError } from "../../server/auth/session";

export default async function Workspace({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "vi" && locale !== "en") notFound();
  try {
    const jar = await cookies();
    await authenticate(
      new Request("http://localhost/session", {
        headers: { cookie: jar.toString() },
      }),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      redirect(`/${locale}/login`);
    throw error;
  }
  const english = locale === "en";
  return (
    <main className="shell">
      <nav aria-label={english ? "Language" : "Ngôn ngữ"}>
        <Link href="/vi">Tiếng Việt</Link>
        <Link href="/en">English</Link>
      </nav>
      <p className="eyebrow">DAILY LEDGER / PHASE 1</p>
      <h1>
        {english
          ? "A record of work, not just words."
          : "Ghi lại cuộc họp. Theo dõi công việc."}
      </h1>
      <p>
        {english
          ? "Your workspace foundation is ready. Meeting analysis will arrive in Phase 2."
          : "Nền tảng workspace đang được xây dựng. Phân tích cuộc họp sẽ được triển khai ở Phase 2."}
      </p>
      <Link href={`/${locale}/settings`}>
        {english ? "Open workspace settings" : "Mở cài đặt workspace"}
      </Link>
      <section>
        <h2>{english ? "Getting started" : "Bắt đầu"}</h2>
        <p>
          {english
            ? "Personal sign-in, projects and AI settings are next."
            : "Đăng nhập cá nhân, dự án và cấu hình AI là các bước tiếp theo."}
        </p>
      </section>
    </main>
  );
}
