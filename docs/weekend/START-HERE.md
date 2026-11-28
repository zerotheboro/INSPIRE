# INSPIRE · Bản thử riêng cho bố · 28–29/11/2026

Có thể thử giao diện bằng mô phỏng. Chưa thể đánh giá câu trả lời thật của Luna.

## Chạy trong repository INSPIRE hiện có

Giữ các thay đổi chưa commit. Đọc focused.patch và chạy git apply --check trước khi áp dụng. Không chép đè cả repository hiện hành bằng ZIP này. Nếu baseline không khớp, merge đúng các tệp thay đổi, không reset/restore hàng loạt.

Cần Node tương thích dự án (đợt này dùng 24.22.3), Java 21, dependencies theo hai lockfile và Controller gốc tại .private.local/controller040-preview/INSPIRE_AI_040. Không dùng Controller thay thế. ZIP không chứa private originals, runtime, registry, database hoặc credentials. Giữ các dependency riêng đang có trong repository Windows.

Nếu chưa có dependencies: npm ci và npm --prefix functions ci.

Terminal 1: npm run emulators
Terminal 2: npm run father:weekend
Mở trên cùng máy: http://127.0.0.1:5173/ai-inspire?thu-rieng=1

Nếu Python không ở .tools.local/python312/python.exe, đặt INSPIRE_CONTROLLER_PYTHON đến Python của Controller trước khi chạy.
PowerShell: $env:INSPIRE_CONTROLLER_PYTHON='C:\path\python.exe'
POSIX: export INSPIRE_CONTROLLER_PYTHON=/absolute/path/to/python

Launcher cố định source-free, đường ChatGPT, tắt API-key preview và bỏ API key khỏi môi trường tiến trình con. Nó không đăng nhập hay gửi tới mô hình.
Con kiểm tra danh tính thử dưới “Dành cho con”; bố dùng vùng trò chuyện.

## Bố thử thế nào?

Mở Phieu-thu-cung-bo.html bằng trình duyệt hoặc in ra. Chọn một chuyện tưởng tượng, hỏi tiếp rồi bấm Đính chính trên lời cũ. Không cần chọn tài liệu hoặc nhập prompt.
“Mô phỏng · Chưa dùng AI” chỉ thử đọc/gõ/sửa lời. “ChatGPT · Chưa gửi tới AI” chỉ chuẩn bị lượt.
Dễ theo dõi / Cần xem lại dùng để nhận xét. Ghi chú ở bộ nhớ, tải lại sẽ mất. Không tự thêm lưu trữ.
Hạn mức cũ giữ nguyên. Dừng khi hết lượt, không đổi tài khoản để vượt hạn mức.

## Kiểm chứng đã thực thi

54/54 offline/emulator tests qua, gồm native Controller với candidate tiêm ngoại tuyến.
Hai build và lint backend được sửa qua. Ba lượt HTTP xác thực qua native simulation, gồm follow-up/correction.
Xem ../weekend-checks/summary.json, regression.log, interface.log và adapter-input-trace.json.
interface.log giữ cả lỗi Chromium: môi trường không cho tạo socket.
Chỉ quan sát màn hình tĩnh qua cloud browser, không có backend. Authenticated desktop/mobile browser acceptance: NOT VERIFIED. Không có screenshot hiện tại được bàn giao.

## Rào chắn còn giữ

Đường ChatGPT không hỗ trợ max_output_tokens. Giới hạn đầu ra 2.000 ký tự sau sinh không phải trần 512 token ở provider.
Chưa xác minh tắt được mọi managed retry. Ba dispatch ứng dụng không chứng minh tối đa ba request nội bộ.
Transport live vẫn đóng, không có nút/cấu hình tự gỡ chặn. Không có API-key fallback.
Chủ hệ đã xác nhận kiểm tra thanh toán; không hỏi lại việc đó. Điều này chưa cấp quyền generation.
Nếu giữ nguyên 512 token cứng và không provider retry: route ChatGPT chưa đủ điều kiện. Chỉ Chủ hệ mới quyết định sửa điều kiện thử; không thể phê duyệt thay cho bảo đảm kỹ thuật thiếu.

## Kho riêng chưa kết nối

inspireReviewShelf.ts: verified emulator identity → UID/document/version/hash/section/expiry scope → source/export recheck → hash-only audit.
Chưa có HTTP endpoint, sender hoặc grant writer. Fixture grants chỉ ở demo emulator.
Weekend mode không lấy corpus. Importer/retrieval cũ vẫn được giữ.
Browser chỉ nhận scalar receipt, không nhận prompt/instructions/nguyên văn đoạn nguồn.
Tests chứng minh ranh giới phần mềm; không chứng minh mô hình thật chống prompt injection, trích xuất hay có chất lượng tham vấn.
