# Daily Ledger

Lưu transcript cuộc họp daily, trích xuất công việc và tra cứu lịch sử bằng AI.

## Trạng thái dự án

Dự án đã có **Phase 1 (Tasks 1–5)**: nền tảng Next.js, Prisma schema/migrations,
đăng nhập, cấu hình provider và workspace. Transcript, phân tích AI, task và chat
chưa được triển khai; thuộc Phase 2–4.

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
layout sản phẩm đầy đủ theo wireframe thuộc các task UI tiếp theo.

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

Provider profiles có API lưu/sửa/xóa và mã hóa AES-GCM. `/api/providers/[id]/test`
hiện xác thực session và kiểm tra cấu hình, trả `ADAPTER_PENDING_TASK_9`; chưa gọi AI
hay tuyên bố kết nối thành công. Protocol adapters và streaming sẽ có ở Task 9.

## Tài liệu

| File | Nội dung |
| --- | --- |
| [`PLAN.MD`](PLAN.MD) | Yêu cầu, 28 quyết định đã duyệt, 20 task triển khai và 4 task kiểm chứng cuối |
| [`WIREFRAME-FLOWS.md`](WIREFRAME-FLOWS.md) | Danh mục 21 màn hình, các luồng và nhánh trạng thái của wireframe |
| [`DESIGN.md`](DESIGN.md) | Quy ước thiết kế chỉ dành cho wireframe, chưa phải design system production |
| [`wireframe.html`](wireframe.html) | Prototype HTML độc lập, không dependencies bên ngoài |

## Giới hạn và bảo mật

- Đóng tab không bảo đảm phân tích tiếp tục; thiết kế on-demand cần mở lại để tiếp tục.
- Kiểm thử AI theo kế hoạch chỉ dùng mock, không đánh giá chất lượng model thật.
- Kiểm tra wireframe không thay thế kiểm thử bảo mật, accessibility hoặc backend production.
- Không commit `.env`, credential, SSH key, transcript thật, DB dump hoặc backup.
- `.gitignore` hỗ trợ ngăn file local phổ biến; luôn kiểm tra diff trước khi commit.

## Bước tiếp theo

Tiếp theo là Task 6: nhập transcript và immutable revisions. Không bắt đầu Phase 2
trừ khi có yêu cầu mới. Quy tắc mỗi task một commit + push nằm trong `AGENT.MD`.
