# plan - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Website cá nhân lưu nguyên văn và các phiên bản transcript cuộc họp; AI tóm tắt, trích Todo, đề xuất theo dõi công việc xuyên ngày và trả lời câu hỏi có dẫn chứng. Giao diện Việt/Anh, nhiều AI provider, chạy trên Vercel hoặc Docker Compose.

**Why this approach:** Lưu dữ liệu trước khi gọi AI và lưu tiến độ từng bước để sự cố không làm mất transcript. Không cần hạ tầng job riêng; xác nhận thay đổi công việc và kiểm tra dẫn chứng giúp hạn chế tác động của suy luận sai.

**What it will NOT do:** Không nhiều người dùng, ghi âm/chuyển giọng nói, bot họp, chat sửa công việc, tự chuyển provider hay tự gộp task. Không bảo đảm xử lý tiếp khi đóng tab; cần mở lại để tiếp tục.

**Effort:** Large — triển khai đầy đủ cả luồng dữ liệu, giao diện, bảo mật, kiểm thử và vận hành.
**Risk:** Medium–High — khác biệt giao thức provider, giới hạn request, chất lượng tìm kiếm xuyên ngôn ngữ và tính nhất quán qua chỉnh sửa/xóa dữ liệu.
**Decisions confirmed after review:** Đã chốt 28 quyết định sản phẩm tại S13. Task mới cần duyệt (hoặc tạo thủ công), có thể nhiều người phụ trách nhưng một trạng thái chung. Xóa cuộc họp vẫn giữ lịch sử chat để xem, không tái sử dụng nội dung phụ thuộc nguồn đã xóa làm ngữ cảnh. Kiểm thử AI chỉ dùng mock, chưa xác nhận chất lượng model thực tế. API on-demand và dọn thùng rác vẫn cần truy cập ứng dụng. Không bổ sung dịch vụ embeddings, job hay email; chưa chạy dual high-accuracy review.

Your next move: Chọn review độ chính xác cao trước, hoặc mở phiên worker để triển khai. Tài liệu này chưa tạo ứng dụng hay chạy kiểm thử sản phẩm. Full execution detail follows below.

---

> TL;DR (machine): Large; medium-high risk; personal bilingual meeting archive, versioned AI analysis, confirmed cross-meeting task tracking, grounded chat; Vercel + Prisma Postgres and portable Docker Compose. Approved requirements; implementation not started.

## Scope
### Must have

### S1. Bối cảnh, phê duyệt và quy ước

- Đây là kế hoạch triển khai toàn bộ yêu cầu, không phải bản rút gọn. Workspace hiện chỉ có `.codegraph/` trước khi tạo tài liệu kế hoạch, chưa có ứng dụng hay test. Codegraph timeout; không dùng kết quả index để suy đoán code tồn tại.
- Người dùng đã duyệt cập nhật sau 28 câu hỏi review và yêu cầu đồng bộ `PLAN.MD` ở root với `.omo/plans/plan.md`. Hai file là bản sao đồng nhất của một kế hoạch; không duy trì hai bộ yêu cầu độc lập. S13 truy vết từng quyết định; schema, nghiệp vụ và QA bên dưới đã được cập nhật tương ứng.
- Chỉ một chủ sở hữu. Quyết định nhiều người dùng ban đầu đã bị người dùng thay thế bằng một người dùng. Không xây multi-tenancy.
- Các đường dẫn source/test dưới đây là **đường dẫn dự kiến cần tạo**, không phải code đã tồn tại. Tham chiếu `S*` là các mục trong chính kế hoạch này; `R*` là tài liệu chính thức ở S12.
- Tiêu đề và phần giải thích dùng tiếng Việt; identifier, tên script và schema dùng tiếng Anh. Không cần hỏi lại các quyết định kỹ thuật đã ghi trong tài liệu.

### S2. Stack, boundaries và cấu trúc

- Node.js 22 LTS, Next.js 16 App Router, React 19, TypeScript strict, pnpm 10; Prisma ORM 7 + `@prisma/adapter-pg` + `pg`, PostgreSQL 17 cho Docker. Dùng release stable mới nhất **trong các major này** tại task 1, pin exact versions và commit lockfile; không chọn prerelease hay tự nâng major. Ghi resolved versions trong `docs/dependencies.md`. Prisma CLI/client/adapter cùng version tương thích. Không dùng Prisma 8 RC.
- Zod 4 tại mọi boundary; Tailwind CSS 4 + Radix primitives cho UI; `next-intl` cho EN/VI; Vitest + Testing Library + Playwright cho tests; Biome cho lint/format và `tsc --noEmit` cho types. Không cần microservices, Redis, vector DB hay AI orchestration framework.
- App Router Route Handlers dùng Node runtime; source dữ liệu luôn server-only, không đặt credential vào `NEXT_PUBLIC_*`. Các route private và response nguồn họp `Cache-Control: private, no-store`; không cache nội dung người dùng ở CDN.
- `src/app/[locale]/`: login, dashboard, projects, meetings/new, meetings/[id], tasks, chat, settings, trash. `/` redirect sang locale đã lưu, mặc định tiếng Việt. Cookie locale cho trang login; profile locale là source of truth sau login.
- `src/app/api/`: HTTP contract, auth/CSRF/parse/error mapping, không đặt business logic ở route.
- `src/server/{auth,db,settings,providers,meetings,analysis,tasks,search,chat,retention}/`: business modules; `src/components/`, `src/messages/{en,vi}.json`, `src/shared/` cho schema không chứa secrets.
- `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`; `scripts/` cho operator và verification; `tests/{unit,integration,e2e,fixtures,providers}/`; `Dockerfile`, `compose.yaml`, `compose.test.yaml`, `docs/`.
- Source module dưới 250 dòng logic thuần khi có thể; tách theo business boundary, không tạo abstraction hoặc adapter chỉ có một wrapper không cần thiết. Errors typed/discriminated; không `any`, không nuốt lỗi.

### S3. Mô hình dữ liệu và invariants

Tất cả ID dùng UUID; timestamps UTC `timestamptz`; ngày deadline dùng PostgreSQL `date`. Mọi bảng nội dung thuộc duy nhất owner hiện tại qua project/conversation; API vẫn kiểm tra ownership để không tin ID client gửi. Thiết kế schema không chứa tenant/team/membership.

| Entity | Trường/quan hệ và invariant chính |
| --- | --- |
| Owner, Session, RateLimitBucket | Singleton owner bằng unique constant key; email normalized unique, passwordHash. Session lưu hash token, expiresAt. Counters atomic trong DB. |
| UserSettings, IdentityAlias | uiLocale, outputLocale, IANA timezone, analysisProfileId, chatProfileId; tên chính và aliases. Alias normalize trim/casefold, không fuzzy-match tự động. |
| ProjectParticipant, ParticipantAlias | Người tham gia theo project, không phải tài khoản; stable ID, displayName, isSelf, mappingVersion. Gộp tên do user xác nhận chỉ đổi resolver cho run tương lai; không rewrite task, assignment snapshot hay lịch sử cũ. Giữ identity cũ để task cũ còn hiển thị đúng. |
| ProviderProfile, ProviderProfileRevision | Tên, loại, baseUrl, model, context budget; immutable config revision, encrypted credential với keyId/nonce/tag, capabilities. Xóa profile vô hiệu hóa sử dụng và xóa credential; provenance chỉ giữ metadata không-secret. |
| Project | name, archivedAt. Project chứa meetings và canonical tasks. Archive không xóa dữ liệu; chặn nhập mới đến khi unarchive. Không hard-delete project có dữ liệu. |
| Meeting | projectId, title, occurredAt, meetingTimezone snapshot, currentRevisionId, activeAnalysisId, deletedAt. Từ chối chuyển project sau khi đã có phân tích để không phá liên kết task. |
| TranscriptRevision | meetingId, revisionNumber unique trong meeting, rawText nguyên văn, sha256, createdAt. Immutable, không normalize rawText tại storage. |
| TranscriptSegment | revisionId, ordinal, raw start/end offsets, speaker label, timestamp nếu có; rawText chỉ slice từ revision. Offset theo JavaScript UTF-16, end-exclusive; test Unicode. |
| MeetingIdentityOverride | meetingId, nhãn speaker, aliases, isSharedSpeaker. Khi nhãn dùng chung không mặc định owner là người đang đăng nhập. |
| AnalysisRun, AnalysisStep | revisionId, profileRevisionId, settings snapshot, prompt/schema version, state, leaseUntil, fencingVersion, attempt count, validated checkpoint JSON, redacted error, usage nếu provider có trả. Unique `(runId, stepKey)`; partial unique active run mỗi meeting. |
| AnalysisVersion, TodoOccurrence | Immutable: summary sections, locale, runId, citations; occurrence có title, assignee snapshots dạng danh sách có thể rỗng, evidence và due-date evidence. Phân biệt ACTION với UPDATE/COMPLETION_REPORT; reported status chỉ là dữ liệu phân tích nội bộ, không là trạng thái Todo chờ duyệt. Chỉ publish khi toàn bộ bước thành công. |
| MeetingAction, MeetingActionOccurrence | Logical action ổn định qua reanalysis, nối một hoặc nhiều occurrences qua join table; title/assignees/date overrides, manuallyEditedAt, reviewState, version counter, optional taskId, sourceChanged flag. Todo chờ duyệt không có status nghiệp vụ; linked action đọc trạng thái Task. Mục cũ đã sửa/duyệt được giữ, nguồn mới nối lại có kiểm soát thay vì tạo bản active trùng. |
| Task, TaskAssignment, TaskEvent, TaskEvidence | Task thuộc project, origin MANUAL/APPROVED_TODO, title, deadline nullable, một status chung, version; assignments 0..n participant IDs kèm tên/mapping snapshot, unique(taskId,participantId). Events lưu before/after, changedFields, recordedAt=effectiveAt tại thời điểm mutation trong app, sourceOccurredAt tách riêng nếu có. TaskEvidence có sourceChanged và nguồn versioned; không cascade-delete Task theo Meeting. |
| TaskProposal, ProposalDecision | CREATE/LINK/UPDATE, source action/evidence, candidateTaskId nullable, expectedTaskVersion, baseFieldVersions, read/write field sets, changes, sourceOccurredAt; pending/accepted/rejected/superseded/stale. Decision lưu semantic fingerprint không phụ thuộc runId, reason và lịch sử; reject không bị xóa khi reanalysis, accept idempotent. |
| SearchDocument | revision/analysis/action/task reference, project/meeting IDs, plain searchable text, `tsvector` generated và GIN indexes qua SQL migration; không cần extension. |
| Conversation, ChatRun, ChatStep, ChatMessage, Citation, ChatMessageDependency | Persisted chat, filter/profile snapshots và checkpoints; citations pin revision/offset hoặc task/event. Dependency edges ghi messages thực sự được gửi làm context và tập nguồn trực tiếp/gián tiếp. Message pending/complete/failed, contextEligible độc lập với khả năng xem history. Purge giữ body và citation label đã lưu, xóa live reference và đánh dấu sourceDeleted, không cascade message; dependent messages bị loại khỏi context mới. |

Ràng buộc quan trọng:
- Không có provider secret trong AI prompts, result JSON, error, logs, screenshots hay public response.
- Phân biệt người nói với người nhận việc. Speaker label chỉ là bằng chứng phụ; câu có chủ thể rõ có thể gán người nhận, còn mơ hồ để danh sách assignees rỗng và hiển thị “Chưa xác định”.
- `TODO / IN_PROGRESS / BLOCKED / DONE / CANCELLED` là enum duy nhất. UI dịch label, không đổi DB value.
- Meeting date/time và timezone do form xác nhận; mặc định thời điểm hiện tại trong timezone setting. IANA timezone chỉ lấy trình duyệt lần setup đầu; thay timezone profile không sửa lịch sử.

### S4. Ingestion, phiên bản và phân tích on-demand

1. Paste **plain text**, không audio/file upload. Giới hạn 2 MiB UTF-8 và tối đa 240,000 ký tự; trình duyệt kiểm tra trước gửi, API kiểm tra lại, JSON body dưới 3 MiB. Hỗ trợ fixture 2 giờ (~25,000 words) trong giới hạn; không cắt nội dung im lặng.
2. `POST /api/meetings` lưu meeting + revision nguyên văn trong transaction rồi mới cho phép start analysis. AI lỗi không rollback transcript. Idempotency key chống double submit; cảnh báo hash trùng trong cùng project nhưng vẫn cho lưu cuộc họp khác khi người dùng xác nhận.
3. Parser nhận `Name: text`, timestamp prefix, continuation lines; đoạn không nhận dạng vẫn giữ nội dung với speaker unknown. User có thể đánh dấu speaker chung và mapping theo meeting trước phân tích.
4. Edit tạo revision mới. Mặc định UI/search dùng revision mới; previous analysis được gắn badge cũ, không trình bày như kết quả của bản mới. Old citations vẫn mở được revision cũ khi meeting còn active.
5. Analysis tạo run snapshot revision + provider config revision + outputLocale + identity mapping + timezone + prompt/schema version. Sửa settings sau đó không đổi run. Đổi provider giữa run phải cancel rồi tạo run mới; không trộn kết quả nhiều model âm thầm.
6. Map theo speaker/paragraph boundaries, tối đa 12,000 ký tự và conservative context budget mỗi chunk; overlap tối đa 500 ký tự, giữ offsets gốc. Dedupe exact evidence-span trước reduce. Context mặc định profile 32k tokens, output reserve 4k; ước tính bảo thủ tối đa 1 token/UTF-8 byte để không coi số ký tự là token chính xác. Cho chỉnh budget advanced; mô hình dưới budget báo lỗi rõ, không hứa hỗ trợ mọi model.
7. Mỗi POST step tối đa một provider call. Chuỗi: map chunks → hierarchical reduce (mỗi batch <=8 kết quả và cùng budget) → match canonical tasks theo project trong các batch bounded → publish. Giữ mọi occurrence có evidence hợp lệ, không để reducer tùy ý làm mất action item. Summary reduce chỉ gộp nội dung; proposals riêng, không mutate task.
8. Checkpoint sau từng bước. Lease claim bằng atomic DB conditional update trong transaction ngắn, không giữ transaction qua AI request. Function `maxDuration=300`, work budget 180s, provider timeout 150s, lease 240s. Sau khi lease hết hạn, attempt mới tăng fencingVersion; attempt cũ không được commit. Completed step replay trả stored checkpoint. Client không truyền output model để ghi DB.
9. `ready → running → paused_retryable|failed|completed|cancelled`; step `pending → running → succeeded|retryable_failed|failed`. Timeout/process kill không cần handler chạy cuối: stale lease được reclaim khi user resume. Unique active run bảo vệ hai tab. Cancel/revision replacement/trash làm stale worker không publish được.
10. Client gọi bước tiếp theo khi trang đang active, hiển thị progress và nút Pause/Resume/Retry/Cancel. Không dựa vào `after`, fire-and-forget hay promise chưa await. Đóng tab có thể làm request thất bại; chỉ kết quả đã commit được bảo đảm giữ lại.
11. Không auto-retry provider ở SDK; 429 ghi Retry-After bounded metadata, hiện thời điểm retry. Retry do user có xác nhận nếu có khả năng provider đã tính phí. Không thể bảo đảm exactly-once billing khi provider trả xong nhưng process chết trước DB commit; chỉ bảo đảm idempotent DB effects.
12. Reanalysis tạo AnalysisVersion mới, không overwrite; replace chỉ phần chưa duyệt và chưa chỉnh tay. Giữ nguyên logical MeetingAction đã chỉnh tay/duyệt cùng task/history, hiển thị trong danh sách active đúng một lần. Exact same source span/evidence nối occurrence vào logical action; paraphrase hoặc source sửa khiến matching không chắc thì đưa vào mục đối chiếu nghi trùng, không auto-CREATE/task trùng. Match cùng logical action cần user xác nhận nếu không exact. Mục đã giữ nhưng không tìm thấy ở kết quả mới có badge “Không còn được tìm thấy trong phân tích mới”, không xóa/đóng. Pending proposals cũ superseded, rejected decisions vẫn được dùng để suppression; source analysis cũ vẫn mở xem được.
13. Summary luôn gồm Tổng quan / Cập nhật theo người / Blockers / Quyết định / Todo. Không có bằng chứng thì mục ghi “Không ghi nhận”, không bịa nội dung; speaker chung ghi “Chưa tách được người nói”. Completion report không tạo Todo mới: lưu phần cập nhật, chỉ tạo đề xuất DONE nếu có task tương ứng và công việc chung đã hoàn thành.
14. Sửa transcript đánh dấu TaskEvidence và task liên quan “Nguồn đã thay đổi” ngay, không đổi giá trị task. Phân tích lại đề xuất điều chỉnh có diff để user duyệt; giữ cảnh báo đến khi user review/resolve, không tự biến mất khi sửa thủ công trường không liên quan.

### S5. Todo, dẫn chứng và deadline

- Meeting view có summary S4.13 và Todo mọi người; My/All/Unassigned, multi-assignee và citations. Pending Todo chỉ hiện nội dung, người dự kiến, deadline, nguồn; không hiện status hoặc dùng reported status trong chat. Trạng thái review không phải trạng thái công việc.
- Global self aliases + project participant aliases + meeting override resolve danh tính (meeting override ưu tiên, shared speaker vẫn không đủ căn cứ). User xác nhận gộp tên; mapping mới chỉ áp dụng run tương lai, không merge identity/assignment/history cũ âm thầm. Task có 0..n assignees; My khi danh sách chứa identity snapshot của bạn. Một task nhiều assignees chỉ đếm một lần và có một trạng thái chung, không có tiến độ riêng từng người.
- AI extraction output là dữ liệu không tin cậy: Zod validate, source quote phải khớp nguyên văn một slice; offsets do backend resolve. Nếu quote xuất hiện nhiều lần mà không xác định segment thì cần review, không bịa offset. Invalid output fail step, không silently bỏ Todo. JSON repair nếu user retry vẫn cùng provider và có checkpoint riêng.
- Deadline: explicit ISO/date, tomorrow, next weekday được deterministic resolver xử lý theo local date của meeting. Không có năm thì lấy lần xuất hiện phù hợp sau ngày họp; ambiguous `next Friday`, `soon`, `end of sprint`, locale-dependent numeric date thì để null và hiển thị raw phrase để sửa. AI không tự điền deadline khi chỉ có mong muốn.
- Task chỉ được tạo bằng duyệt CREATE hoặc tạo thủ công trong project. Nội dung rõ ràng là bắt buộc, assignees có thể rỗng và deadline null. Duyệt riêng mặc định TODO, user được đổi status ngay; duyệt hàng loạt chỉ CREATE không nghi trùng, tất cả TODO. UI và API đều chặn bulk LINK/UPDATE/nghi trùng. Batch có idempotency và transaction all-or-nothing; một item không còn hợp lệ trả409 với IDs, không âm thầm duyệt một phần.
- Với LINK/UPDATE phải cùng project, hiển thị before/after + source. Transaction so version và per-field revision: trường trong read/write set đã sửa từ lúc đề xuất thì đánh dấu stale và chặn409, không cho override cảnh báo; trường khác đổi thì revalidate toàn bộ invariant, dùng current version để CAS và giữ nguyên thay đổi không liên quan. Nếu CAS race tiếp thì retry kiểm tra DB, không gọi lại model tự động. Double accept/reject không ghi event hai lần.
- User có thể tìm/chọn task trong cùng project để liên kết thủ công, không cần AI đề xuất; chỉ thêm evidence, không đổi status/date/assignees/title. Unlink cần xác nhận, không xóa task, không auto-requeue action đã duyệt thành CREATE; user chủ động chọn lại nếu muốn. Sửa linked action chuyển rõ sang edit Task; sửa pending action chỉ title/assignees/deadline, không status.
- Sửa sai bằng edit/unlink, luôn ghi history; không nút undo tự động. Task thủ công origin MANUAL không cần citation, có thể nhận evidence từ cuộc họp sau này. TaskEvent gồm CREATE, EDIT, LINK, UNLINK và giá trị trước/sau đủ tái dựng lịch sử.
- Các mutation trong app (kể cả duyệt thông tin họp cũ) effectiveAt=recordedAt theo server clock, không backdate. sourceOccurredAt lưu ngày họp tách biệt; chat không dùng nó viết lại lịch sử task trong app. Đề xuất trạng thái từ cuộc họp cũ hơn lần thay đổi trạng thái đã xác nhận thì chỉ lưu cập nhật lịch sử/đề xuất LINK, không đề xuất ghi đè status hiện tại. Cùng ngày nhưng thiếu thứ tự rõ thì đánh dấu thông tin cũ/chưa chắc, không auto-status proposal.
- Completion report chỉ đề xuất DONE khi có task tương ứng và toàn task xong; một người xong phần riêng chỉ ghi summary. Không task tương ứng thì không tạo CREATE đã hoàn thành. Không tự hoàn thành vì task không được nhắc hôm sau.
- Reject suppression: fingerprint theo meeting + normalized quote/context + logical action/target + loại và thay đổi chuẩn hóa + semantic base values liên quan; không dùng runId, timestamp ingestion, wording AI hay unrelated task version. Same proposal/source semantics không đề xuất lại; nguồn hoặc thay đổi liên quan mới có thể đưa lại với diff rõ. Dedupe exact deterministic; semantic uncertain giữ ở đối chiếu, không auto accept. Revision mới không tự làm mất reject nếu phần bằng chứng không đổi.
- Hai filter độc lập `meetingFrom/meetingTo` và `dueFrom/dueTo`, giao nhau khi cùng có. Ngày họp dùng evidence đang active của ít nhất một meeting trong khoảng, DISTINCT task ID; task thủ công chưa liên kết không match, tuyệt đối không dùng createdAt thay thế. Overdue chỉ là filter ở task list: deadline trước today theo Settings timezone và status khác DONE/CANCELLED; không dashboard widget, notification hay enum mới.

### S6. Provider adapters và bảo mật outbound

- Interface `generateStructured` và `streamText` qua HTTP transport chung, normalize text/usage/error; không dùng SDK retry ngầm. `openai-compatible`: base URL trỏ API root và app nối `/chat/completions`, Bearer auth. `anthropic`: `/v1/messages` chuẩn hóa tránh double `/v1`, `x-api-key`, version header. `gemini`: `/v1beta/models/{encodedModel}:generateContent` hoặc streaming tương ứng, `x-goog-api-key`. Adapter contract fixtures lấy theo R4–R6; không coi ba giao thức giống nhau.
- Profile gồm displayName, providerType, baseUrl, token write-only, model, advanced context budget, structured-output capability. Defaults official endpoints; model user nhập, không hardcode model sẽ lỗi thời. Test connection bằng request nhỏ, ghi testedAt và capability, hiển thị có tính phí. Không tự đổi sang model/provider khác.
- Lưu nhiều profile; hai default selections cho analysis/chat. Request/run snapshot config. Credential AES-256-GCM, random nonce, authenticated metadata owner/profile/revision và keyId; key base64 32 bytes nằm env, không DB. UI chỉ trả `hasToken`, không trả masked phần token thật. Xóa credential không được tiếp tục run pending dùng nó; báo yêu cầu chọn lại/start new run.
- Base URL production phải HTTPS, không userinfo/query/fragment, chỉ port 443 hoặc explicit operator allowlist. Resolve và chặn loopback/private/link-local/multicast/reserved IPv4/IPv6, kể cả mapped IPv6. DNS validation phải pin vào connection qua transport lookup/dispatcher; không chỉ check rồi fetch lại DNS. TLS xác minh hostname ban đầu. Redirect bị chặn, response size cap 2 MiB.
- Test/local có allowlist origin riêng qua env server-only `AI_DEV_ALLOWED_ORIGINS`, chỉ cho exact origin mock provider hoặc endpoint local do operator cấu hình. Nếu `VERCEL` được set thì không cho bật bypass private-network. Không mở broad `ALLOW_ALL`.
- Transcript và retrieved documents luôn untrusted data, không được coi là system instruction. Không tools ghi DB, chạy code, đọc URL hay gửi secrets cho model. Markdown renderer không raw HTML, sanitize links, không tự tải remote images trong chat để tránh exfiltration.

### S7. Search và chat có căn cứ

- Search transcript segments current revision, current valid summary và canonical tasks; indexes core PostgreSQL `english` + `simple`, normalized text cho tên/ID và dấu. Parameterized SQL only; không cần `pgvector`, `pg_trgm`, `unaccent` hay dịch vụ search riêng. Chat history không là knowledge source.
- Chat có conversations và persisted messages, filters project/date/meeting; mặc định all active history. Filters được snapshot mỗi câu hỏi, kiểm tra lại visibility trước khi gửi context và trước khi publish answer.
- Chat cũng dùng client-driven bounded `ChatRun/ChatStep`: (a) lập query plan bằng chat provider, EN keyword expansion từ câu Việt; (b) server retrieval theo schema allowlist; (c) nếu tổng hợp dài, map/reduce từng batch; (d) stream answer cuối. Không cho model sinh hoặc chạy SQL tự do.
- Query plan enum `LOOKUP | LIST_TASKS | TASK_COUNTS | TASK_HISTORY | MEETING_SUMMARY | CLARIFY`, bộ lọc giao với filter user; server không cho mở rộng scope. “Việc tuần này” chưa rõ ngày họp hay deadline phải CLARIFY trước khi truy vấn; lưu lựa chọn vào turn tiếp theo, không tự mặc định. Validate IDs và filter dates server-side.
- LOOKUP lấy top 12 segments, tối đa 3 mỗi meeting, tiebreak deterministic. Answer nêu phạm vi kết quả, không khẳng định bao quát mọi cuộc họp. Nếu không có bằng chứng thì trả không đủ dữ liệu, không dùng kiến thức bên ngoài để điền thông tin họp.
- LIST_TASKS/TASK_COUNTS trả cả hai nhóm tách biệt: task chính thức chưa xong (loại DONE/CANCELLED) và Todo chờ duyệt, không status trên nhóm pending. Liệt kê từng nhóm, nhãn nghi trùng, không cộng hai số thành tổng; mỗi task multi-assignee chỉ đếm một lần. Counts SQL exhaustive, không top-k; danh sách dài phân trang rõ với total riêng, không gọi một page là toàn bộ. Pending đã replaced/superseded hoặc nguồn đã trash không được đếm; linked/accepted action không trở lại pending chỉ vì unlink.
- TASK_HISTORY tái dựng TaskEvents tại mốc hỏi (chỉ task đã tồn tại lúc đó), tách hai phần “Trạng thái đã ghi nhận trong ứng dụng” và “Thông tin từ cuộc họp tính đến mốc đó”. Nêu mâu thuẫn/thiếu dữ liệu; không lấy status hiện tại thay quá khứ, không backdate do nhập transcript muộn. TaskEvent citation xác thực từ DB không bắt buộc có quote transcript, đặc biệt task thủ công. Pending lịch sử chỉ trình bày nếu có snapshot phù hợp, không suy ngược pending hiện tại.
- MEETING_SUMMARY liệt kê tất cả meetings đúng filter trong DB, duyệt batches 20; dùng summaries của current revision. Nếu chưa có summary hợp lệ, map raw chunks on-demand; không âm thầm bỏ meeting. Lưu coveredMeetingIds, missing/failed count; chỉ gọi exhaustive khi mọi mục đã xử lý. Hiển thị số bước ước tính trước khi chạy yêu cầu rộng.
- EN expansion là bước của cùng chat provider, không provider phụ. Expansion lỗi thì run lỗi/retry rõ ràng, không pretend FTS tiếng Việt đã hiểu transcript Anh. Search box thông thường vẫn lexical và ghi rõ giới hạn.
- Answer language theo câu hỏi, fallback uiLocale khi câu hỏi chỉ có số/tên. Summary/Todo generation dùng outputLocale được chọn cho run; đổi setting không tự dịch hoặc tái phân tích mọi dữ liệu lịch sử.
- Citation discriminated union: transcript ID/revision + exact span hoặc task ID/event version; backend validate theo loại với context allowlist, không ép task thủ công có raw quote. Streamed text provisional, final verified sau validation; invented citation failed/unverified. Citation lịch sử có nguồn đã xóa vẫn xem label/text đã lưu với badge “Nguồn đã bị xóa”, không mở transcript và không tái xác thực như nguồn còn tồn tại.
- Không gửi cả lịch sử raw mỗi prompt; tối đa 10 messages contextEligible, ghi dependency edges và source provenance closure của context thực sự sử dụng. Loại khỏi context mọi message trực tiếp hoặc gián tiếp phụ thuộc nguồn đã trash/purge, dù history vẫn xem được; không loại toàn bộ đuôi thread nếu các lượt sau độc lập. Revalidate visibility trước final commit. Session chat không có mutation tools.

### S8. Auth, settings, UI và operations

- Một owner được tạo bằng `pnpm admin:create-owner` CLI, nhập email và password bằng prompt ẩn; không truyền password trong argv, không public signup. Hash dùng `node:crypto` scrypt N=131072,r=8,p=1, random salt16 bytes, output64 bytes, maxmem >=256MiB; constant-time compare, stored algorithm params, verify performance trên Node runtime.
- Session opaque 32 random bytes, DB lưu SHA-256 token, TTL 7 ngày, không sliding renewal; cookie HttpOnly, SameSite=Lax, Secure cloud, Path=/; logout/reset revoke sessions. API guard là bắt buộc, không chỉ middleware/UI.
- Mutations yêu cầu exact allowed Origin và CSRF token gắn session, kể cả login origin check. Login error không tiết lộ email đúng/sai. DB atomic rate limits: login 5 failures/15min mỗi IP và 20/15min cho account; analysis start 10/hour; AI execution steps 30/min; chat starts 30/hour. Trả 429 + Retry-After, không process-local counters.
- `pnpm admin:reset-password` kết nối trực tiếp DB bằng credential operator từ env và hidden prompt, revoke tất cả sessions trong transaction. Vercel operator chạy CLI từ máy tin cậy trỏ Prisma Postgres direct connection. Không tạo public recovery endpoint hay gửi email.
- Timezone capture lần đầu nếu setting null, validate IANA. App setup hiển thị timezone để sửa. Secrets backup riêng DB; mất encryption key thì không khôi phục token được, cần nhập lại. Runbook rotate key với keyring cũ/mới và transaction batches; không log plaintext.
- UI desktop sidebar và mobile navigation; meeting editor raw text/preview, tabs Summary/Todos/Transcript/Versions, proposal before-after dialog, settings provider test, progress/resume, empty/loading/error states. EN/VI đầy đủ, keyboard/focus/labels, semantic heading, contrast AA. Không cần brand/design clone hay motion phức tạp.

### S9. Trash, purge và provenance

- Trash áp dụng meeting và toàn bộ revisions/analyses liên quan. Canonical tasks không tự bị xóa: đây là dữ liệu công việc người dùng đã xác nhận; dùng CANCELLED khi không còn cần, không thêm task-trash ngoài yêu cầu.
- Soft-delete `deletedAt` loại meeting khỏi dashboard/search/context ngay, invalidates active analysis/chat steps dựa trên nguồn đó. Restore trước khi purge cho phép truy cập lại, không tự áp lại proposals.
- Không scheduler/cron. Sau login/app load, frontend gọi `POST /api/maintenance/purge-expired` có auth/CSRF; xử lý tối đa 10 meetings/request rồi lặp khi trang mở, DB lease tránh hai tab purge cùng lúc. Expired nghĩa là deletedAt + 30*24h, không phải business day. Quá 30 ngày nhưng chưa truy cập có thể vẫn còn vật lý; UI ghi rõ.
- Hard purge xóa revisions, segments, analysis JSON/raw provider responses, search docs, meeting actions, proposals chưa xác nhận và quote caches ngoài lịch sử chat. TaskEvidence thành tombstone; task title/status/edits vẫn giữ. Accepted/rejected decision provenance phải scrub nguồn/quote khi purge, không để nội dung source ẩn trong fingerprint payload/history. FK tách live reference khỏi tombstone, không orphan/cascade nhầm message/task.
- Giữ nguyên body lịch sử chat và citation text đã hiển thị khi hard purge; badge “Nguồn đã bị xóa”, link raw disabled. Không redact body, không xóa phần tiếp nối hay thread. Đây là ngoại lệ retention được user chấp thuận: trích đoạn/diễn giải trong chat có thể vẫn còn sau xóa nguồn. Confirmation dialog nói rõ không phải xóa sạch mọi dấu vết.
- Chỉ khả năng dùng làm context bị thu hồi: đánh contextEligible=false cho messages phụ thuộc trực tiếp/gián tiếp nguồn trash/purge theo dependency closure, áp dụng cả user turn nếu nó có contextual dependency, không chỉ assistant citation. App gửi lịch sử qua bộ lọc này trước mỗi request; không đọc quote trong chat cũ như knowledge source. Soft restore có thể tính lại eligibility nếu mọi nguồn còn hợp lệ; hard-purged dependency không được dùng lại. Các messages độc lập vẫn dùng bình thường.
- User có thể hard-delete ngay sau confirmation dialog nhập tên meeting. Concurrent in-flight model commit kiểm tra visibility/version trong transaction nên không hồi sinh dữ liệu đã xóa.
- Xóa DB hiện hành không đồng nghĩa xóa ngay backup managed provider hoặc data provider AI đã nhận. Runbook giải thích retention của nhà cung cấp, backup thủ công có thể giữ nội dung cũ.

### S10. API contract

Responses JSON errors `{code,messageKey,retryable,requestId,details?}`; không raw stack/token/transcript. 400/422 validation, 401 session, 403 CSRF, 404 missing/invisible, 409 version/lease conflict, 413 size, 429 throttle, 502 provider, 504 app timeout. Idempotency-Key với body hash cho create/run/confirm; reuse key khác payload →409.

| Routes | Contract |
| --- | --- |
| `/api/auth/login`, `/logout`, `/session` | Credentials, cookie session, safe profile; logout POST. |
| `/api/settings`, `/api/identity-aliases` | GET/PATCH; validate locale/timezone and aliases. |
| `/api/providers`, `/[id]`, `/[id]/test` | CRUD config, immutable revision on update, test POST, no token echo. |
| `/api/projects`, `/[id]` | Create/read/update/archive; no destructive project cascade. |
| `/api/projects/[id]/participants`, `/participants/[participantId]`, `/participants/[participantId]/aliases` | CRUD danh tính/aliases theo project; merge mapping explicit chỉ future resolver, không migration task cũ; không hard-delete identity đang được tham chiếu. |
| `/api/meetings`, `/[id]`, `/[id]/revisions`, `/[id]/identity` | Pagination keyset, create/edit-version, override mappings. |
| `/api/meetings/[id]/analysis-runs` | POST create/join active run; explicit fresh-run after completed. |
| `/api/analysis-runs/[id]`, `/[id]/step`, `/[id]/cancel` | GET persisted state; POST expected step claim/execute; completed replay; authenticated cancel. |
| `/api/meeting-actions/[id]`, `/api/tasks`, `/api/tasks/[id]` | PATCH optimistic version; POST task thủ công; multi-assignees, separate meeting/deadline filters, list/read/events; pending PATCH không nhận status. |
| `/api/meeting-actions/[id]/link`, `/unlink` | POST user chọn task cùng project hoặc bỏ liên kết; append event, không tự sửa fields Task. |
| `/api/task-proposals/[id]/decision`, `/api/task-proposals/bulk-create` | POST accept/reject với per-field revalidation; bulk chỉ CREATE không nghi trùng, status TODO, all-or-nothing/idempotent. |
| `/api/search` | GET lexical query + filters; no side effects. |
| `/api/conversations`, `/[id]/messages`, `/api/chat-runs/[id]/step` | Create thread, enqueue user message/run, bounded steps; last step SSE token/citation/done/error events. Status GET supports reconnect. |
| `/api/meetings/[id]/trash`, `/restore`, `/purge` | POST authenticated confirmation, visibility fenced. |
| `/api/maintenance/purge-expired` | POST batch cleanup only, no mutation on GET. |
| `/api/health/live`, `/api/health/ready` | Minimal public status, no secret or DB URL; readiness DB check bounded. |

### S11. Deployment contract

- `.env.example`: DATABASE_URL, DIRECT_URL, APP_ORIGIN, PROVIDER_ENCRYPTION_KEY, PROVIDER_ENCRYPTION_KEY_ID, optional previous key for rotation, AI_DEV_ALLOWED_ORIGINS (local/test only). No default admin password. AI profiles are configured after login, not hardcoded env-only.
- Vercel runtime uses pooled standard PostgreSQL URL; Prisma CLI migrations use direct URL through `prisma.config.ts`. Do not mix Prisma 8 CLI commands with pinned ORM7. `prisma generate` in build, `prisma migrate deploy` in serialized release step; never destructive `db push` in production. Preview deployments must use separate DB/credentials, never production data by default.
- Node runtime/Fluid compute, 300s function max for AI steps; work budgets much lower per S4. Same-region app/DB where provider offers it; document chosen region from actual account. No cron entry, no queue service, no Vercel-specific storage binding in domain modules.
- Docker multistage non-root standalone Next server, copy static/public correctly; services `db` (Postgres17 persistent named volume + healthcheck), `migrate` (one-shot), `web` (wait successful migration). No worker service. Local HTTP cookie exception only outside cloud. Bind DB to loopback if exposing port for tooling.
- `compose.test.yaml` adds test DB and deterministic mock AI server on exact allowed origin. Production builds must reject test mode on Vercel production; fixtures/test credentials never bundled into production.
- `docs/runbook.md`: setup/build/deploy, initial owner/reset, DB backups/restore, key backups/rotation, migration/rollback via forward fix and pre-migration backup, provider faults, stale run resume, lazy purge limits. Do not advertise free-tier capacity as guaranteed; usage/cost depends actual provider plans.

### S12. Evidence and primary references

| ID | Source | What is grounded / how used |
| --- | --- | --- |
| R1 | https://vercel.com/docs/functions/limitations | Read during planning: Fluid Hobby max 300s, request/response payload 4.5MB; on-demand steps stay below limits. |
| R2 | https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package | Read during planning: waitUntil uses function deadline; not durable background jobs. |
| R3 | https://www.prisma.io/docs/guides/postgres/vercel ; https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql | Context7: Vercel integration, ORM7 adapter-pg, direct CLI URL and pooled runtime URL. |
| R4 | https://platform.openai.com/docs/api-reference/chat ; https://platform.openai.com/docs/guides/structured-outputs | Implementation contract reference for OpenAI-compatible adapter; compatibility of custom gateways is not assumed, prove with fixtures and connection test. |
| R5 | https://docs.anthropic.com/en/api/messages | Implementation contract reference for native Messages adapter, headers, content blocks and streaming; verify against selected model. |
| R6 | https://ai.google.dev/api/generate-content | Implementation contract reference for native Gemini adapter and structured/stream output; verify selected model support. |
| R7 | https://nextjs.org/docs/app/api-reference/config/next-config-js/output ; https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config | Context7: standalone output, use generated server.js in Docker, route maxDuration. |
| R8 | https://www.postgresql.org/docs/17/textsearch.html | Core FTS contract for SQL migrations/tests; English stemming alone does not bridge Vietnamese questions. |

Metis gap analysis received in session `ses_eef8fe136ffevXM4LEBkc8aeHG`; recommendations are not independent proof. Adopted: fenced claims, strict evidence validation, explicit lexical cross-language bridge, raw-first save, direct operator reset. Purge behavior subsequently replaced by user decisions Q1/Q6: preserve chat, exclude affected context. Rejected as scope creep: file uploads, automatic dual-language output for every run, custom provider override at every level, public recovery API. No high-accuracy dual review requested or claimed.

### S13. Quyết định sau review (đã duyệt, không còn câu hỏi mở)

Ledger để worker truy vết; mỗi quyết định đã được tích hợp vào schema/nghiệp vụ ở trên và QA bên dưới, không phải phụ lục ghi đè mâu thuẫn.

| Câu | Chọn | Quy tắc đã chốt | Nơi triển khai/kiểm chứng |
| --- | --- | --- | --- |
| Q1 | A | Purge giữ nguyên chat, nguồn đã xóa không mở được | S9, tasks15–16 |
| Q2 | B | Duyệt trước tạo canonical task, Todo có ngay ở meeting/chờ duyệt | S5, tasks10–12 |
| Q3 | A | Reanalysis giữ phần đã sửa/duyệt, thay phần chưa duyệt, không active duplicate | S4.12, tasks10–11 |
| Q4 | C | Quá khứ: tách app history và meeting evidence, chỉ rõ mâu thuẫn | S7, task14 |
| Q5 | C | Mock-only AI tests; chất lượng model thật chưa được đánh giá | Verification, tasks9/19–20 |
| Q6 | A | Chat có nguồn đã xóa chỉ để xem, không context mới kể cả phụ thuộc gián tiếp | S7/S9, tasks14–16 |
| Q7 | C | Liệt kê hai nhóm approved/pending, không tổng chung | S7, tasks14/16 |
| Q8 | A | Summary: tổng quan, theo người, blockers, quyết định, Todo | S4.13, tasks7/10/12 |
| Q9 | A | Participant/aliases theo project, không tài khoản, không AI tự merge | S3/S5, tasks2/5 |
| Q10 | A | Bulk chỉ CREATE không nghi trùng; LINK/UPDATE duyệt riêng | S5, tasks11–12 |
| Q11 | A | Report completed vào summary; task có sẵn mới đề xuất DONE | S4.13/S5, tasks7/10–11 |
| Q12 | A | Nhiều assignees, My nếu có bạn, count DISTINCT task | S3/S5, tasks2/11/14 |
| Q13 | A | Một trạng thái chung, một người xong chưa đủ DONE | S5, tasks7/11 |
| Q14 | A | Source edit giữ task, flag nguồn thay đổi và đề xuất điều chỉnh | S4.14, tasks6/10–12 |
| Q15 | A | Meeting date/deadline filters riêng; chat hỏi lại nếu mơ hồ | S5/S7, tasks12–14 |
| Q16 | B | Overdue chỉ filter task list, không dashboard widget/notification | S5, task12 |
| Q17 | A | Manual link cùng project, chỉ thêm source | S5, tasks11–12 |
| Q18 | A | Sửa sai bằng edit/unlink có audit history, không auto undo | S5, tasks11–12 |
| Q19 | A | Không lặp reject không đổi; khác biệt liên quan mới phải có diff | S5, tasks10–11 |
| Q20 | B | Alias merge chỉ future analysis; task/lịch sử cũ giữ nguyên | S3/S5, tasks5/7/11 |
| Q21 | A | Duyệt chỉ bắt buộc nội dung, assignees/date có thể trống | S5, tasks11–12 |
| Q22 | A | Task thủ công theo project, không citation bắt buộc, liên kết sau được | S3/S5, tasks11–12 |
| Q23 | A | Manual task chưa có meeting không match meeting-date filter | S5/S7, tasks13–14 |
| Q24 | A | Meeting cũ không đề xuất ghi đè status xác nhận mới hơn | S5, tasks10–11 |
| Q25 | B | Manual status effective tại lúc sửa app, không backdate | S3/S5/S7, tasks11/14 |
| Q26 | A | Conflict field: stale/chặn; unrelated fields: revalidate cho phép | S5, task11 |
| Q27 | B | Pending Todo không status trong UI/chat | S3/S5/S7, tasks12/14 |
| Q28 | A | Create mặc định TODO, single có thể đổi; bulk luôn TODO | S5, tasks11–12 |

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No multi-user/team sharing, public signup, OAuth, email delivery, audio recording/transcription, meeting bots, uploads, calendar/Jira sync, notifications, subscriptions or billing UI.
- No automatic task merge/status changes on existing work without confirmation; no chat mutation tools; no silent provider/model fallback.
- No automatic undo, per-assignee progress/status, historical backdating, dashboard overdue widget, pending business-status display, live-model evaluation or implicit alias merge of old tasks. Không xóa chat vì xóa source hoặc tái dùng nguồn đã xóa qua chat history.
- No durable always-running background jobs, cron, workers, Redis, vector DB or embeddings service. Do not claim on-demand finishes after closing tab.
- No loss of raw transcript on AI failure, overwrite of old revisions, silent truncation/top-k presented as exhaustive, ungrounded citations, secrets in browser/logs.
- No product implementation by the planner; this artifact is instructions for a separate worker. No production deploy, remote DB creation, paid provider calls or git push without the execution session's authorization/environment.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: **TDD** for domain rules, API/security and state machines; Vitest unit + real PostgreSQL integration, Testing Library components, Playwright E2E. Red-green-refactor within every task. LLM tests use deterministic fixtures, not real paid calls.
- Q5: mọi test AI, connection-test QA, E2E và smoke chỉ gọi deterministic mock, không gọi model thật kể cả free tier. Kiểm chứng protocol/plumbing không chứng minh độ chính xác extraction, translation, retrieval hay grounded answer trên model thật. Bàn giao bắt buộc ghi “Chưa đánh giá chất lượng AI thực tế”; nút Test connection vẫn là tính năng cho user tự dùng, không được test suite gọi live.
- Review regressions bắt buộc: preserved chat + transitive context exclusion; bulk-create eligibility/defaults; reanalysis exact/uncertain match và edited item retention; rejected semantic fingerprint; same-field vs unrelated-field CAS; participant mapping future-only; multi-assignee DISTINCT; manual task/date filters; historical app-vs-meeting split/no-backdate; old-meeting status protection; summary sections/completion reports; pending no status; overdue list-only. Chạy ở commands/task hiện có, không thêm wave triển khai rời rạc.
- Evidence: <attemptDir>/task-<N>-plan.<ext> (attemptDir = currentAttemptDir from 'omo ulw-loop status --json', .omo/evidence/ulw/<session>/<goalId>/a<attempt>; outside ulw-loop use .omo/evidence/)

- Commands established in task 1: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit -- <file>`, `pnpm test:integration -- <file>`, `pnpm test:e2e -- <file>`, `pnpm build`, `pnpm verify`. `test:unit`/`test:integration` use explicit Vitest configs; command must fail if no tests found. Playwright saves trace/video/screenshot on failure.
- `pnpm verify`: lint + types + unit + integration against isolated real DB + build + E2E against built app. Exit nonzero on any failed/skipped required assertion. Save logs with exit code, test count and environment versions, not just green summaries.
- Fixed clock injected into domain services; DST tests, browser timezone `Asia/Ho_Chi_Minh`, additional `America/New_York` fixture. Pure test setup may advance time; no production HTTP clock override.
- Fixtures: 2-hour English transcript, duplicate/shared speaker, no action items, explicit/missing/ambiguous dates, prompt injection, repeated quote, Unicode, VN cross-language query, >12-meeting aggregation, profile 401/429/timeout/malformed JSON, concurrent tabs, process crash before checkpoint, stale proposal, soft/hard delete mid-request.
- Integration tests run database migrations, FTS SQL and constraints on PostgreSQL17. Repeated test runs must not need real AI/network credentials. Test adapter byte-level requests separately for all three provider protocols.
- Vercel production-like smoke is mandatory for hosting claim but conditional on provisioned isolated preview credentials. If missing, mark deployment verification BLOCKED, not passed; complete local/Compose verification meanwhile. Do not fabricate remote deployment.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 — Foundation: tasks 1–5 (bootstrap, schema, auth, providers, projects/settings). Task 1 then 2; 3–5 can be parallel with file ownership boundaries.
- Wave 2 — Analysis: tasks 6–10 (transcripts, domain extraction, step engine, provider contracts, orchestration). Dependency order within wave is mandatory; wave is not a promise all tasks run simultaneously.
- Wave 3 — Product flows: tasks 11–15 (canonical tasks, meeting/task UI, FTS, chat, trash).
- Wave 4 — Delivery: tasks 16–20 (chat UI, locale/accessibility, deployment, adversarial tests, runbook/release verification).
- Final wave — F1–F4 read-only verification after all implementation work. Findings loop back to responsible task; no self-certified completion.
- Highest risk path: 1→2→4→9→10→13→14→16→19→20; checkpoint path 6→8→10 also gates chat. Do not create separate implementation plans per wave.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | — | 2–5 | — |
| 2 | 1 | 3–8,11,13,15 | — |
| 3 | 1,2 | 5,6,8,14–18 | 4 |
| 4 | 1,2 | 9,10,14 | 3,5 |
| 5 | 1,2,3 | 6,7,12,17 | 4 |
| 6 | 2,3,5 | 7,8,10,12,13,15 | 9 |
| 7 | 2,5,6 | 10,11 | 8,9 |
| 8 | 2,3,6 | 10,14,15 | 7,9 |
| 9 | 4 | 10,14 | 6–8 |
| 10 | 4,6,7,8,9 | 11–15 | — |
| 11 | 2,7,10 | 12–15 | — |
| 12 | 5,6,10,11 | 17,19 | 13–15 |
| 13 | 2,6,10,11 | 14,19 | 12 |
| 14 | 3,4,8–11,13 | 15,16,19 | 12 |
| 15 | 2,6,8,10,11,14 | 16,19 | 12 |
| 16 | 14,15 | 17,19 | 18 |
| 17 | 5,12,16 | 19 | 18 |
| 18 | 3,4,9,10,14 | 19,20 | 16,17 |
| 19 | 12–18 | 20 | — |
| 20 | 18,19 | F1–F4 | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Bootstrap typed Next app và deterministic test harness
  - What: tạo package/config/source layout theo S2; exact dependency lock, scripts theo Verification; fake AI protocol fixtures, isolated DB config, fail-on-zero-tests; baseline EN/VI shell. Không gọi AI thật. Kiểm tra existing/untracked files trước tạo; không overwrite `.codegraph/` hay file người dùng. Kiểm tra `PLAN.MD` và canonical copy giống nhau, không overwrite nếu phát hiện chỉnh sửa chưa đồng bộ.
  - Parallelization: Wave 1; depends —; blocks 2–5.
  - References: S1–S2, S11, R7; `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.*.config.ts`, `playwright.config.ts`, `tests/unit/env.test.ts`.
  - Acceptance: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test:unit -- tests/unit/env.test.ts && pnpm build` pass; resolved stable majors recorded.
  - QA happy: command above boots valid env fixture; failure: same test asserts missing DATABASE_URL/invalid encryption key fails with redacted config error; zero-test command exits nonzero. Evidence `.omo/evidence/task-1-plan.txt`.
  - Commit: Y | `chore(app): bootstrap typed app and test harness`.

- [x] 2. Tạo Prisma schema, SQL constraints và migration baseline
  - What: model S3 bao gồm participants/assignment snapshots, logical actions/occurrence joins, proposal decision fingerprints, per-field history và message dependency/tombstone; unique/partial indexes, FTS, Prisma7 adapter/direct URL. Test seed only, short transactions, không vector extension.
  - Parallelization: Wave 1; depends 1; blocks 3–8,11,13,15.
  - References: S3, S9, S11, R3/R8; `prisma/schema.prisma`, `prisma.config.ts`, `prisma/migrations/`, `src/server/db/`, `tests/integration/schema.test.ts`.
  - Acceptance: `pnpm exec prisma validate && pnpm exec prisma migrate deploy && pnpm test:integration -- tests/integration/schema.test.ts` on isolated DATABASE_URL/DIRECT_URL; all required foreign keys and unique indexes asserted via database queries.
  - QA happy: empty DB migrate then seed relations; failure: duplicate owner, duplicate step and second active run rejected, deleting revision cannot leave dangling citation. Evidence `.omo/evidence/task-2-plan.txt`.
  - Commit: Y | `feat(db): model versioned meetings tasks and runs`.

- [x] 3. Single-owner login, session, CSRF và operator recovery
  - What: S8 auth endpoints/guards, DB rate limits, owner creation/reset CLI hidden prompt. No signup/recovery HTTP route. Session revoke after reset. API endpoints default-deny unauthenticated access.
  - Parallelization: Wave 1; depends 1,2; blocks 5,6,8,14–18.
  - References: S8/S10; `src/server/auth/`, `src/app/api/auth/`, `scripts/admin/`, `tests/integration/auth.test.ts`, `tests/e2e/login.spec.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/auth.test.ts && pnpm test:e2e -- tests/e2e/login.spec.ts`; cookie flags/reset revocation asserted.
  - QA happy: owner seed→login→private route→logout; failure: sixth failed IP login returns429, forged Origin/CSRF403, old session401 after CLI reset. CLI tested via pseudo-terminal so password absent argv/logs. Evidence `.omo/evidence/task-3-plan.txt` and Playwright trace.
  - Commit: Y | `feat(auth): secure single owner sessions and recovery`.

- [x] 4. Provider profiles, encryption và SSRF-safe transport
  - What: S6 config revisions, write-only secrets, safe outbound transport, test connection plumbing, independent default slots; mock exact-origin bypass only in test/local. DNS pinning, no redirects and response cap shared by every adapter.
  - Parallelization: Wave 1; depends 1,2; blocks 9,10,14.
  - References: S3/S6/S8; `src/server/providers/{profiles,crypto,transport}/`, `src/app/api/providers/`, `tests/integration/provider-security.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/provider-security.test.ts`; all config reads/logs lack plaintext, tampered GCM data fails closed.
  - QA happy: encrypt/save/read metadata/rotate test key; failure: private IPv4/IPv6, DNS rebinding, redirect, URL credentials rejected before socket request; cloud bypass rejected. Evidence `.omo/evidence/task-4-plan.txt`.
  - Commit: Y | `feat(providers): protect configurable AI endpoints and secrets`.

- [x] 5. Projects, identity settings, locale và timezone setup
  - What: project create/archive, settings, global self aliases và project participants/aliases, explicit future-only merge mapping; profile slots/timezone/locale. No sharing/membership.
  - Parallelization: Wave 1; depends 1,2,3; blocks 6,7,12,17.
  - References: S3/S5/S8; `src/server/settings/`, `src/server/meetings/projects.ts`, `src/app/[locale]/settings/`, `tests/integration/settings.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/settings.test.ts`; browser timezone stored once and explicit change accepted.
  - Review QA (same command): alias merge affects next analysis only; existing assignments/display snapshots and TaskEvents unchanged; shared labels remain unresolved. Assert no extra login account created.
  - QA happy: save aliases, separate profile slots and switch locale; failure: second device timezone cannot silently overwrite, invalid IANA or missing profile rejected, archived project cannot accept new meeting. Evidence `.omo/evidence/task-5-plan.txt`.
  - Commit: Y | `feat(settings): add projects identity and bilingual preferences`.

- [x] 6. Raw-first transcript ingestion và immutable revisions
  - What: S4 steps1–4, byte/char limits, parser offsets, speaker overrides, idempotent save, revision picker API. Read source source-of-truth, preserve whitespace/newlines.
  - Parallelization: Wave 2; depends 2,3,5; blocks 7,8,10,12,13,15.
  - References: S3–S5/S10; `src/server/meetings/`, `src/app/api/meetings/`, `tests/integration/transcripts.test.ts`, English 2-hour fixture.
  - Acceptance: `pnpm test:integration -- tests/integration/transcripts.test.ts`; byte-for-byte roundtrip and version immutability.
  - Review QA (same command): edit revision sets sourceChanged on linked tasks without changing status/deadline; task with several source meetings retains all other evidence.
  - QA happy: save 2-hour fixture and edit into v2, v1 unchanged; failure: oversize413, same idempotency key changed body409, provider outage does not affect save, parser unknown lines retained. Evidence `.omo/evidence/task-6-plan.txt`.
  - Commit: Y | `feat(meetings): preserve raw transcripts and revisions`.

- [x] 7. Evidence, assignee và deadline domain rules
  - What: pure Zod extraction contract với five-section summary, multi-assignees, ACTION vs COMPLETION_REPORT; quote verifier, versioned identity resolver, deterministic dates/chunks. No model call trong pure modules; không expose reported status thành pending status.
  - Parallelization: Wave 2; depends 2,5,6; blocks 10,11.
  - References: S3–S5; `src/server/analysis/{contracts,evidence,identity,dates,chunking}/`, `tests/unit/extraction.test.ts`.
  - Acceptance: `pnpm test:unit -- tests/unit/extraction.test.ts`; shared speaker fixture yields empty assignees, clear named assignees accepted, Unicode exact offsets.
  - Review QA (same command): shared speaker gets unresolved summary label; empty sections không fabricated facts; one-of-two assignees done does not yield whole-task DONE; completed report without matching task yields no CREATE.
  - QA happy: tomorrow from past meeting date→correct date regardless today's date; failure: ambiguous Friday stays null, fabricated quote rejected, overlap exact duplicate collapses, all input ranges covered. Evidence `.omo/evidence/task-7-plan.txt`.
  - Commit: Y | `feat(analysis): validate grounded actions and due dates`.

- [x] 8. Durable checkpoints cho on-demand bounded execution
  - What: run/step engine S4 including claims, leases, fencing, cancel/resume, no outbound side effect during DB transaction. Shared primitive reusable by chat without exposing arbitrary job execution API.
  - Parallelization: Wave 2; depends 2,3,6; blocks 10,14,15.
  - References: S3/S4/S10; `src/server/analysis/runs/`, `tests/integration/run-engine.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/run-engine.test.ts`; concurrent request tests use real DB and controlled barriers, not sequential mock assertions.
  - QA happy: finish step1 then reload/resume step2; failure: kill worker before commit, expire lease, reclaim, stale attempt commit rejected; completed replay no new rows; cancel cannot publish. Evidence `.omo/evidence/task-8-plan.txt`.
  - Commit: Y | `feat(runs): add fenced resumable on-demand steps`.

- [x] 9. Native protocol adapters cho ba loại provider
  - What: OpenAI-compatible, Anthropic, Gemini structured/stream contracts; capabilities; typed 401/429/refusal/context errors; disable transport retries. Connection test integrates profiles. Validate official formats R4–R6 at implementation time.
  - Parallelization: Wave 2; depends 4; blocks 10,14.
  - References: S6, R4–R6; `src/server/providers/adapters/`, `tests/providers/adapters.test.ts`, `tests/fixtures/providers/`.
  - Acceptance: `pnpm test:unit -- tests/providers/adapters.test.ts`; assertions inspect URL/header/payload and streamed event parser for each protocol.
  - QA happy: three fixture providers normalize structured output and stream; failure:401/429/timeout/malformed response/unsupported schema surfaced, no second provider request, no token in error. Evidence `.omo/evidence/task-9-plan.txt`.
  - Commit: Y | `feat(ai): implement native provider protocol adapters`.

- [x] 10. End-to-end analysis map/reduce và atomic publish
  - What: connect6–9; five-section summary, chunk/reduce/match, participant snapshots; publish logical actions/occurrences/proposals theo S4.12–14. Reanalysis retains edited/approved actions once, replaces only unreviewed untouched items; reject suppression and uncertain-duplicate reconciliation; no silent partial publish.
  - Parallelization: Wave 2; depends 4,6,7,8,9; blocks 11–15.
  - References: S3–S6/S10; `src/server/analysis/pipeline/`, `src/app/api/analysis-runs/`, `tests/integration/analysis-pipeline.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/analysis-pipeline.test.ts`; 2-hour fixture full coverage, no action lost at reduction, completed run output committed once.
  - Review QA (same command): second analysis preserves manual edits, absent retained action flagged, same-span result not duplicate active action; paraphrase uncertain goes reconciliation; unchanged rejected proposal stays suppressed, changed relevant evidence shows diff. Old meeting completion cannot overwrite newer confirmed status; source edit produces adjustment proposal only.
  - QA happy: pause/resume multi-chunk analysis→summary and grounded actions; failure: step3 returns429 then explicit retry reuses steps1–2; v2 edit/trash before finish blocks v1 publish; invalid JSON leaves raw intact. Evidence `.omo/evidence/task-10-plan.txt`.
  - Commit: Y | `feat(analysis): publish versioned grounded meeting results`.

- [x] 11. Canonical tasks và confirmation workflow
  - What: S5 CREATE/LINK/UPDATE and immutable decisions; bulk-safe CREATE transaction, manual task/link/unlink, multi-assignees with one shared status, optional assignees/date, per-field proposal invalidation, app-time history/no-backdate, old-source guard. No automatic undo or unapproved status changes.
  - Parallelization: Wave 3; depends 2,7,10; blocks 12–15.
  - References: S3–S5; `src/server/tasks/`, `src/app/api/task-proposals/`, `tests/integration/tasks.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/tasks.test.ts`; before confirmation task unchanged; acceptance creates one event; repeat response idempotent.
  - QA happy: day2 links day1 task and confirms progress; bulk creates TODO with empty assignees/date allowed; manual task links later without field mutations. Failure: cross-project/repeated confirmation blocked or replayed; relevant-field stale409, unrelated edit revalidated and preserved, bulk LINK/UPDATE/suspect rejected; reanalysis cannot revert DONE. Evidence `.omo/evidence/task-11-plan.txt`.
  - Review QA (same command): single approval allows explicit status, bulk all TODO; no auto-undo endpoint; status event effectiveAt equals save time even for old report; new assignee mapping does not change old task; completed part of one assignee never auto-completes shared task; rejection fingerprint stable under rewording/unrelated updates.
  - Commit: Y | `feat(tasks): track confirmed work across meetings`.

- [x] 12. Meeting editor, progress, Todo và task management UI
  - What: project participant UI, five-section summary, pending queue without status, safe bulk approval, manual task and same-project link/unlink, multi-assignee list/My, source-change/reconciliation banners. Separate meeting-date/deadline and overdue list-only filters; no dashboard overdue widget; paste/raw/version/progress flows retained.
  - Parallelization: Wave 3; depends 5,6,10,11; blocks 17,19.
  - References: S4/S5/S8; `src/app/[locale]/{meetings,tasks,projects}/`, `src/components/meetings/`, `tests/e2e/meetings-tasks.spec.ts`.
  - Acceptance: `pnpm test:e2e -- tests/e2e/meetings-tasks.spec.ts`; reload resumes persisted state; edit/version/citation flows work by browser clicks.
  - Review QA (same command): pending shows no status picker; single approval TODO default editable vs bulk TODO fixed; missing owner/date accepted; manual task appears under deadline but not meeting-date filter before linking; shared task counted once; same-field stale proposal cannot confirm.
  - QA happy: paste→analyze→view quote→confirm cross-day task; failure: provider unavailable shows retry without losing raw, second tab cannot duplicate actions, unknown owner not shown under My. Evidence `.omo/evidence/task-12-plan/` screenshots/trace.
  - Commit: Y | `feat(ui): deliver meeting and task workflows`.

- [x] 13. PostgreSQL lexical retrieval và visibility boundaries
  - What: index current raw segments, valid current summary and tasks; ranked FTS + exact normalized names/IDs, deterministic paging, project/date/meeting intersection, no stale/trash documents. Index creation done via SQL migrations.
  - Parallelization: Wave 3; depends 2,6,10,11; blocks 14,19.
  - References: S3/S7/S9,R8; `src/server/search/`, `prisma/migrations/`, `tests/integration/search.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/search.test.ts`; query actual PostgreSQL rather than mocked repository; EXPLAIN confirms appropriate GIN index on seeded volume when selective.
  - Review QA (same command): meeting-range EXISTS over active evidence, DISTINCT IDs for multi-meeting/multi-assignee; manual unlinked task excluded only from meeting-date filter, not unfiltered/deadline list; due-range intersection exact; replaced pending excluded.
  - QA happy: English stemming and exact ticket/name lookup, stable pagination; failure: trash/current-revision/filter boundary excludes old docs, SQL-injection text treated literal, pure Vietnamese lexical limitation not mislabeled semantic. Evidence `.omo/evidence/task-13-plan.txt`.
  - Commit: Y | `feat(search): add scoped PostgreSQL transcript retrieval`.

- [x] 14. Grounded read-only chat orchestration và aggregates
  - What: S7 allowlisted pipeline, TASK_HISTORY/CLARIFY, separate approved/pending lists, app-time vs meeting-evidence answers, Vietnamese→English expansion, SQL aggregates, source dependency closure and per-type citations; no live-model evaluation.
  - Parallelization: Wave 3; depends 3,4,8–11,13; blocks 15,16,19.
  - References: S6/S7/S10; `src/server/chat/`, `src/app/api/{conversations,chat-runs}/`, `tests/integration/chat.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/chat.test.ts`; Vietnamese query finds English source through fixture expansion; aggregate test >12 meetings includes every relevant ID/count.
  - Review QA (same command): historical question uses events at cutoff and separately late-ingested meeting evidence, exposes conflict; never current status as past. Ambiguous date asks clarification before data query. Lists approved unfinished and pending without pending status/combined total; manual task citations valid without raw quote; indirect deleted-source message not included in provider request payload.
  - QA happy: scoped question→verified citation; all-task question matches SQL count; failure: malicious transcript cannot mutate task, invented citation fails validation, no-match says insufficient evidence, expansion401 no silent fallback. Evidence `.omo/evidence/task-14-plan.txt`.
  - Commit: Y | `feat(chat): answer across history with verified sources`.

- [x] 15. Trash, lazy purge và deletion-safe dependent data
  - What: S9 soft-delete/restore/hard purge with30-day clock and10-meeting batches, run invalidation and source tombstones. Preserve history body/citation text, revoke direct/transitive context eligibility without deleting chat. Only authenticated visit/user POST, no scheduler.
  - Parallelization: Wave 3; depends 2,6,8,10,11,14; blocks 16,19.
  - References: S9/S10; `src/server/retention/`, `src/app/api/maintenance/`, `tests/integration/retention.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/retention.test.ts`; fake clock day29 restore, day31 lazy purge, no visit means no job execution.
  - QA happy: trash excludes retrieval, history still readable with unavailable-source label; restore recomputes eligibility. Failure: purge during request prevents resurrection; raw/analysis/operational quote caches gone, approved task and chat body byte-identical; direct/indirect dependent messages excluded from next model request, independent later messages still eligible. Evidence `.omo/evidence/task-15-plan.txt`.
  - Commit: Y | `feat(retention): safely purge meetings on demand`.

- [x] 16. Chat UI với filters, streaming, citations và resume
  - What: threads/history, independent date filters and clarification turn, two-group task replies, historical app/evidence split, progress/stream/citation; deleted-source badge leaves old answer readable, raw navigation disabled. No mutation affordances.
  - Parallelization: Wave 4; depends 14,15; blocks 17,19.
  - References: S7–S9; `src/app/[locale]/chat/`, `src/components/chat/`, `tests/e2e/chat.spec.ts`.
  - Acceptance: `pnpm test:e2e -- tests/e2e/chat.spec.ts`; cited old revision opens exact source, read-only prompt leaves DB tasks unchanged.
  - QA happy: Vietnamese query→filtered citation; history before/after purge keeps same body with source-deleted badge. Failure: disconnect→incomplete/resume, deleted raw cannot open or enter next context, HTML/image payload not executed/fetched. Evidence `.omo/evidence/task-16-plan/` screenshots/trace.
  - Commit: Y | `feat(ui): add source-grounded bilingual chat`.

- [ ] 17. Hoàn thiện EN/VI, accessibility và responsive states
  - What: complete translation keys across all pages/errors/dialogs, locale persistence, output locale distinct, keyboard/focus/contrast, no content clipping at 390/768/1440px. Apply same design system to trash/settings/auth.
  - Parallelization: Wave 4; depends 5,12,16; blocks 19.
  - References: S8, S7 language contract; `src/messages/`, `src/components/`, `tests/e2e/locale-accessibility.spec.ts`.
  - Acceptance: `pnpm test:e2e -- tests/e2e/locale-accessibility.spec.ts`; key completeness checker; axe no critical/serious violations plus screenshot inspection.
  - QA happy: EN→VI navigation + reload, keyboard confirm/reject dialog; failure: long Vietnamese text and error message at390px has no horizontal overflow, changing UI language does not regenerate old summary. Evidence `.omo/evidence/task-17-plan/` six locale/viewport screenshots minimum.
  - Commit: Y | `feat(i18n): polish accessible English Vietnamese UI`.

- [ ] 18. Vercel release config và portable Docker Compose
  - What: S11 standalone image, healthchecks, persistent Postgres, one-shot migration, no worker/cron; env validation, preview DB isolation, Vercel Node timeouts. Add compose.test fixture provider, admin CLI runtime target and backup commands.
  - Parallelization: Wave 4; depends 3,4,9,10,14; blocks 19,20.
  - References: S2/S11,R1–R3/R7; `Dockerfile`, `compose*.yaml`, `.env.example`, `scripts/deploy/`, `tests/integration/deployment.test.ts`.
  - Acceptance: `docker compose config && docker compose up --build -d && pnpm test:integration -- tests/integration/deployment.test.ts`; db survives down/up without `-v`; static assets/login/AI mock flow work in production image.
  - QA happy: fresh volume migration + owner CLI + ready endpoint; failure: missing encryption key/unhealthy DB fail readiness without secret leak; production Vercel env with test bypass fails startup. Evidence `.omo/evidence/task-18-plan.txt`.
  - Commit: Y | `build(deploy): support Vercel and standalone Compose`.

- [ ] 19. Adversarial regression và whole-stack verification
  - What: cross-boundary tests for concurrency, crash/retry, injection, SSRF, long transcript, cross-language retrieval and retained-chat/context-revocation races; exercise all Q1–Q28 regressions from S13 on built app + real DB + mock AI only. Fix owning modules, do not weaken assertions or infer live-model quality.
  - Parallelization: Wave 4; depends 12–18; blocks20.
  - References: S3–S11 and Verification; `tests/e2e/adversarial.spec.ts`, `tests/integration/concurrency.test.ts`, `scripts/verify.ts`.
  - Acceptance: `pnpm verify` clean twice on isolated seeds; `pnpm test:integration -- tests/integration/concurrency.test.ts && pnpm test:e2e -- tests/e2e/adversarial.spec.ts`; no required test skipped.
  - QA happy: 2-hour paste→resume→confirm→cross-day query→trash/restore across Compose; failure: process death, simultaneous accept, invalid secret, lease stale commit, prompt requesting deletion all fail safely. Evidence `.omo/evidence/task-19-plan/` logs+traces+row-count assertions.
  - Commit: Y | `test(system): cover recovery security and data lifecycle`.

- [ ] 20. Runbook, deployment smoke và bàn giao vận hành
  - What: finish S11 docs, Q1–Q28 decision map and dependency versions; CLI ops tests on disposable DB, isolated preview only with credentials/authorization. Preview smoke uses public HTTPS deterministic mock fixture endpoint under test allowlist, never real model; no private-network bypass or production test mode. State blocked preview honestly and “Chưa đánh giá chất lượng AI thực tế” even if all mocks pass.
  - Parallelization: Wave 4; depends18,19; blocksF1–F4.
  - References: S1/S8/S9/S11; `README.md`, `docs/{runbook,dependencies,architecture}.md`, `scripts/smoke.ts`, `tests/integration/operations.test.ts`.
  - Acceptance: `pnpm test:integration -- tests/integration/operations.test.ts`; `pnpm smoke -- --base-url "$PREVIEW_URL"` against isolated preview when available; structural check `PLAN.MD` matches canonical plan copy.
  - QA happy: backup→restore→login→read preserved raw hash; preview save/analyze fixture/citation/health; failure: wrong encryption key surfaces reconfiguration rather than silent credential loss, reset revokes prior cookie. Missing preview access produces explicit BLOCKED evidence. Evidence `.omo/evidence/task-20-plan/` and runbook command transcript.
  - Commit: Y | `docs(ops): document deployment recovery and verification`.

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  - Read-only compare S1–S13 and20 todos against code/tests; verify root/canonical copies, every Q1–Q28 regression and mock-only caveat. Run `pnpm verify`, inspect counts/DB assertions not just logs; corrected single-user scope preserved. Evidence `.omo/evidence/F1-compliance.md`; APPROVE or blocking gaps. Commit: N.
- [ ] F2. Code quality review
  - Run `pnpm lint && pnpm typecheck && pnpm build`; inspect auth, encryption, pinned DNS transport, fenced transactions, SQL parameters, dependencies and secret scans. Reject arbitrary model tools, plaintext credentials, unsafe renderer, long DB transaction around network I/O. Evidence `.omo/evidence/F2-quality.md`; APPROVE required. Commit: N.
- [ ] F3. Real manual QA
  - Agent actually operates built app in browser (not human checklist): login→paste→analyze→close/resume→confirm task→Vietnamese chat→citation→edit version→trash/restore/purge→logout; EN/VI at390/768/1440px. Run `pnpm test:e2e`, inspect screenshots/traces and preview smoke when available. Missing preview is BLOCKED for remote deploy claims. Evidence `.omo/evidence/F3-qa/`; APPROVE required. Commit: N.
- [ ] F4. Scope fidelity
  - Read-only diff/file inventory vs guardrails; confirm no queue/cron/worker/multi-user/signup/file-upload scope creep, no silent fallback and no fake exhaustive search. Verify unrelated files untouched, Docker persistence, documented retention limitations and root plan mirror. Evidence `.omo/evidence/F4-scope.md`; APPROVE required. Commit: N.

## Commit strategy

- Environment reported no Git repository; worker first inspects actual status and parent boundaries. Do not initialize git, create branches, push or publish a PR implicitly. If no authorized repository exists, keep changes uncommitted and report that limitation; task commit messages are the intended grouping once Git is authorized.
- One coherent implementation+tests commit per todo, adjust only to keep commits buildable. Never commit `.env`, real transcripts, DB dumps, credentials, node_modules or test artifact secrets. Preserve unrelated user files.
- Do not deploy production or migrate a production DB merely because local tests pass. Preview verification uses isolated credentials; failure/rollback instructions required before production handoff.

## Success criteria

- One user can sign in, configure aliases/providers/languages/timezone, paste English daily transcripts into projects, and find all saved raw versions even after AI errors.
- A 2-hour fixture completes through bounded on-demand requests on Compose and a provisioned Vercel preview; interruption resumes from committed checkpoints without duplicate DB actions. Cloud verification is explicitly blocked if no preview provisioned.
- Analyzed Todo có nguồn và không hiện status khi chờ duyệt; manual task có origin rõ không cần transcript. Multi-assignee dùng một status chung và DISTINCT count; unknown có thể rỗng. Summary năm phần, completion reports không tạo task mới; edits/approved actions sống qua reanalysis không active duplicate.
- Cross-day update explicit/same-project; bulk chỉ CREATE không nghi trùng và TODO mặc định. Manual link chỉ thêm nguồn, edit/unlink có history/no undo. Same-field stale chặn, unrelated changes revalidate; reject suppression không bị reset bởi run mới; alias mapping chỉ future analysis.
- OpenAI-compatible/Anthropic/Gemini protocol fixtures all pass; independent analysis/chat selections work; token never reaches browser/logs; no silent provider fallback.
- Mock fixtures chứng minh chat pipeline VI/EN, date clarification, independent filters, app-history vs meeting-evidence, approved/pending lists tách biệt và no mutation. Không dùng kết quả mock để tuyên bố chất lượng AI thực tế; app history không backdate, old meetings không ghi đè status mới.
- Trash biến mất khỏi retrieval ngay; purge xóa source và operational artifacts nhưng giữ task chính thức và body/citation text của lịch sử chat theo ngoại lệ đã duyệt. Không hồi sinh nguồn qua in-flight requests; direct/transitive affected messages chỉ xem lại, không context mới. UI nêu rõ xóa source không xóa sạch mọi nội dung từng xuất hiện trong chat.
- EN/VI interface, responsive states, accessible controls, Prisma migrations, secure operator reset, backup/restore and Docker persistence are verified with repeatable evidence.
- All 20 implementation tasks and four final verification verdicts approved; user receives results and explicitly accepts completion. No claim that this planning document itself constitutes implementation or executed QA.
