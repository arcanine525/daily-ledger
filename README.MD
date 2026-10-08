# Daily Ledger

Lưu transcript cuộc họp daily, trích xuất công việc và tra cứu lịch sử bằng AI.

## Trạng thái dự án

Dự án đã có **Phase 1–3 (Tasks 1–15)**: nền tảng Next.js, đăng nhập/settings,
lưu transcript và phiên bản, phân tích có checkpoint, quản lý/duyệt task,
giao diện cuộc họp/công việc, PostgreSQL lexical search, chat backend có dẫn chứng
và trash/restore/purge an toàn. **Phase 4 Task16 đã bổ sung Chat UI** tại `/vi/chat`
và `/en/chat`; **Task17 đã bổ sung giao diện thùng rác và kiểm chứng EN/VI,
accessibility, responsive**. **Task18 có cấu hình Vercel và Docker standalone đã
kiểm chứng trên stack test riêng.** **Task19 đã chạy whole-suite xanh hai lượt**,
bao gồm recovery/concurrency/adversarial checks. Task20 và F1–F4 còn lại chưa hoàn tất.
Xem `docs/phase-3.md` và `docs/phase-4.md` cho phạm vi và bằng chứng kiểm chứng.

Task 3 đã bổ sung session cá nhân và form đăng nhập. Chép `.env.example` thành
`.env`, tạo key mã hóa ngẫu nhiên theo hướng dẫn trong file rồi chạy:

```bash
pnpm admin:create-owner
pnpm dev
# Khi cần khôi phục (sẽ thu hồi mọi session):
pnpm admin:reset-password
```

CLI dùng `DIRECT_URL`, nhập mật khẩu ẩn (ít nhất 12 ký tự), không nhận password
qua argv. Login ở `/vi/login`; test account chỉ được tạo trong DB test.

Wireframe sử dụng dữ liệu mô phỏng trong trình duyệt, không kết nối AI hoặc DB.
Không nhập transcript nhạy cảm, mật khẩu hay API token thật vào bản demo.

## Xem wireframe

1. Mở [`wireframe.html`](wireframe.html) bằng trình duyệt, không cần cài dependencies.
2. Bấm **Vào bản demo** để khám phá, hoặc dùng mật khẩu demo `wireframe`.
3. Vào **Sơ đồ luồng** để xem các journey và mở màn hình tương ứng.
4. Dùng **Kịch bản demo** để xem trạng thái trống, đề xuất lỗi thời, nguồn đã xóa
   và lịch sử mâu thuẫn. **Đặt lại demo** khôi phục dữ liệu mẫu.

Nếu cần chạy qua HTTP, tại thư mục project:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Mở <http://127.0.0.1:8765/wireframe.html>. Đây chỉ là server phục vụ file wireframe,
không phải server của ứng dụng. Dừng bằng `Ctrl+C`.

**Ghi chú PLAN** và **Sơ đồ luồng** là công cụ duyệt wireframe, không phải chức năng
của ứng dụng production. Nút VI/EN chuyển nhãn giao diện; dữ liệu mẫu giữ ngôn ngữ gốc.

## Chức năng dự kiến

- Một tài khoản cá nhân, không đăng ký công khai.
- Quản lý cuộc họp theo dự án; lưu transcript gốc và các phiên bản chỉnh sửa.
- Summary gồm tổng quan, cập nhật theo người, blockers, quyết định và Todo.
- Phân tích AI on-demand, lưu checkpoint để tiếp tục sau gián đoạn.
- Todo chờ duyệt và task chính thức tách biệt; hỗ trợ task thủ công, nhiều người
  phụ trách và một trạng thái chung cho mỗi task.
- Đề xuất liên kết/cập nhật công việc xuyên ngày cần xác nhận, không tự gộp task.
- Cấu hình nhiều provider: OpenAI-compatible, Anthropic và Gemini; chọn riêng
  provider/model cho phân tích và chat.
- Tên và aliases của bạn, danh tính người tham gia theo dự án và mapping theo cuộc họp.
- Chat chỉ đọc, có bộ lọc và dẫn chứng; phân biệt lịch sử trạng thái trong app
  với thông tin từ cuộc họp.
- Giao diện Việt/Anh, ngôn ngữ đầu ra và múi giờ cấu hình riêng.
- Thùng rác 30 ngày, dọn khi truy cập. Xóa nguồn họp vẫn giữ lịch sử chat để xem,
  nhưng không dùng phần phụ thuộc nguồn đã xóa làm ngữ cảnh mới.

## Stack đã chốt

| Thành phần | Lựa chọn |
| --- | --- |
| Ứng dụng | Next.js App Router, React, TypeScript strict |
| Hosting chính | Vercel |
| Truy cập DB | Prisma ORM |
| Database cloud | Prisma Postgres |
| Local / máy khác | Docker Compose + PostgreSQL |
| Kiểm thử | TDD, Vitest, integration PostgreSQL, Playwright E2E |

FE và BE tạm thời cùng ứng dụng Next.js. Business logic dự kiến nằm trong
`src/server/`, Route Handlers là lớp HTTP mỏng để có thể tách BE sau này.

Nền tảng yêu cầu Node22 và pnpm10 (xem `.node-version` và `package.json`).

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

Playwright hiện dùng Chrome đã cài trên máy. Integration suite dùng PostgreSQL thật
ở DB test riêng; fixture AI là dữ liệu giả lập, không gửi request provider thật.

Sau đăng nhập, mở `/vi/settings` hoặc `/en/settings` để lưu tên/aliases, ngôn ngữ,
múi giờ, các provider, dự án và người tham gia. Giao diện Phase 1 là foundation;
layout cuộc họp, hộp chờ duyệt và công việc đã có trong Phase 3.

### PostgreSQL local và test (Task 2)

```bash
docker compose up -d --wait db
pnpm exec prisma migrate deploy
pnpm exec prisma generate
docker compose -f compose.test.yaml up -d --wait test-db
DIRECT_URL=postgresql://ledger:ledger@127.0.0.1:55433/ledger_test pnpm exec prisma migrate deploy
pnpm test:integration
```

Test DB riêng ở port55433; database sử dụng local ở port55432 có volume bền vững.
Không dùng database cloud/production cho integration tests.

Provider profiles có API lưu/sửa/xóa và mã hóa AES-GCM. Native adapters cho
OpenAI-compatible, Anthropic và Gemini hỗ trợ JSON có schema và streaming.
`/api/providers/[id]/test` gửi request model nhỏ khi user xác nhận (có thể tính phí);
kiểm thử tự động chỉ dùng fixtures, chưa đánh giá chất lượng AI thực tế.

## Tài liệu

| File | Nội dung |
| --- | --- |
| [`PLAN.MD`](PLAN.MD) | Yêu cầu, 28 quyết định đã duyệt, 20 task triển khai và 4 task kiểm chứng cuối |
| [`WIREFRAME-FLOWS.md`](WIREFRAME-FLOWS.md) | Danh mục 21 màn hình, các luồng và nhánh trạng thái của wireframe |
| [`DESIGN.md`](DESIGN.md) | Quy ước wireframe và contract giao diện ứng dụng Phase 1/3 |
| [`docs/phase-3.md`](docs/phase-3.md) | Tasks 11–15, API chat/retention, kết quả kiểm chứng và giới hạn |
| [`wireframe.html`](wireframe.html) | Prototype HTML độc lập, không dependencies bên ngoài |

## Giới hạn và bảo mật

- Đóng tab không bảo đảm phân tích tiếp tục; thiết kế on-demand cần mở lại để tiếp tục.
- Kiểm thử AI theo kế hoạch chỉ dùng mock, không đánh giá chất lượng model thật.
- Kiểm tra wireframe không thay thế kiểm thử bảo mật, accessibility hoặc backend production.
- Không commit `.env`, credential, SSH key, transcript thật, DB dump hoặc backup.
- `.gitignore` hỗ trợ ngăn file local phổ biến; luôn kiểm tra diff trước khi commit.

## Bước tiếp theo

### API cuộc họp và phân tích (Phase 2)

- `POST /api/meetings`: gửi projectId, title, occurredAt (UTC ISO), meetingTimezone,
  rawText và header `Idempotency-Key`; raw được lưu trước khi gọi AI.
- `GET /api/meetings`: trả `{ items, nextCursor }`; hỗ trợ cursor và projectId.
- `GET /api/meetings/[id]`: xem raw revisions, analyses và actions/proposals hiện hành.
- `POST /api/meetings/[id]/revisions`: rawText + expectedRevision, không ghi đè v1.
- `POST /api/meetings/[id]/identity`: mapping speaker/participantIds/isSharedSpeaker.
- `POST /api/meetings/[id]/analysis-runs`: tạo hoặc tham gia run đang hoạt động.
- `GET /api/analysis-runs/[id]`: trạng thái/checkpoint metadata và thứ tự steps.
- `POST /api/analysis-runs/[id]/step`: `{ stepKey }`, mỗi request xử lý một bước.
- `POST /api/analysis-runs/[id]/cancel`: hủy run, vô hiệu hóa commit từ request cũ.

Mutations cần cookie session, Origin đúng APP_ORIGIN và `x-csrf-token` (lấy từ
login hoặc GET session). Không gửi token AI từ frontend. Client chỉ gọi bước kế
tiếp khi đang mở; backend không có worker/cron tự hoàn tất khi đóng trang.

Test E2E dùng server fixture local ở3201 với `AI_DEV_ALLOWED_ORIGINS` exact origin;
ngoại lệ này bị vô hiệu hóa khi có biến VERCEL. Không bật allowlist test trên cloud.
Xem `docs/phase-2.md` cho phạm vi và bằng chứng kiểm chứng.

Phase 3 đã hoàn thành Tasks 11–15. Bước tiếp theo, khi được yêu cầu, là Phase 4
Task 16: Chat UI với filters, streaming, citations và resume. Quy tắc mỗi task
một commit + push nằm trong `AGENT.MD`.

### Retention đã triển khai

Trash loại nguồn khỏi search/context ngay và hủy run phụ thuộc. Có thể restore
trong 30 ngày. Sau đăng nhập/app load, trình duyệt gọi API bảo trì có auth/CSRF,
mỗi request xóa tối đa 10 cuộc họp quá hạn và tiếp tục khi trang còn mở.
Không có worker/cron; nếu không truy cập, dữ liệu quá hạn có thể còn trong DB.

Purge giữ task đã xác nhận và body/quote/label của lịch sử chat, nhưng loại nguồn
khỏi ngữ cảnh mới, kể cả phụ thuộc gián tiếp. Vì vậy purge **không xóa sạch mọi
trích đoạn đã xuất hiện trong chat**, backup hoặc dữ liệu provider AI đã nhận.
