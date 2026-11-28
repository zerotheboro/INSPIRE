# Gửi file, retrieval và khoảng 100 tin nhắn

Gửi vài trích đoạn nhỏ đã được phép có thể giảm công chuẩn bị. Không có căn cứ bảo đảm thời gian trả lời nhanh hơn. File ID không làm nội dung miễn token hoặc chỉ xử lý một lần.
Với thư viện và khoảng 100 tin nhắn, nên dùng retrieval hiện có: import/index một lần; mỗi lượt tối đa ba đoạn/4.200 ký tự đủ quyền cùng ngữ cảnh. Không cần thêm hosted vector database trước cuối tuần. Chưa benchmark inference nên không công bố latency/chi phí tiết kiệm.
Đường ChatGPT plan không hỗ trợ Files upload API/hosted file_search. Không dùng hướng dẫn API-key làm bằng chứng chúng hoạt động trên app-server.
Nguồn:
https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
https://developers.openai.com/api/docs/guides/file-inputs
https://developers.openai.com/api/docs/guides/latency-optimization

100 tổng cả hai bên là khoảng 50 câu hỏi; 100 câu hỏi của bố là khoảng 100 lần sinh.
Test 100 user turns qua store/engine, chia 10 ca, không phải 100 calls hoặc quyền chạy 100 lần.
Existing limits giữ nguyên: guest 10 completed replies tổng; đăng nhập 30/tháng; IP 30/ngày và 10/10 phút; mỗi context tối đa 31 messages/24.000 ký tự. Ledger ChatGPT còn ba attempts chưa release.
Muốn thử 50–100 lần cần quyết định evaluation riêng về số attempts/thời hạn/dừng, tách quota sản phẩm. Bản này không thêm bypass hay tăng quota.

Chưa cấp quyền export cho nguồn nào.
Website source trong ZIP, 34.137 bytes, LF SHA-256:
cef55cbb7beb4e5fce5950635219daa256ca9975f7e41bd71d0b994bb676789a
Cùng nội dung đổi LF thành CRLF có hash đề xuất cũ:
043141d04d32a5d6c46601232a9aba3a117434188114d04cae850de4afc3c6f4
Đối chiếu newline không chuyển grant giữa hai bytes. Giữ bản gốc; quyết định export cần bind đúng bytes/sections.
71 receipts là bằng chứng lịch sử trong ZIP, không phải 71 tài liệu đã được cấp quyền hay được import lại trong đợt này.

Quyết định còn thiếu:
- Giữ hay sửa điều kiện token/retry theo giới hạn thật của route.
- Nếu dùng nguồn: đúng collection/bytes/sections và phạm vi export. Nếu chưa quyết định, giữ source-free.
- Sau khi đủ kỹ thuật: release đúng attempt. Phiên 50–100 câu là quyết định riêng, không dùng grant một lần cũ.
Không cấp Architecture Approval, clinical validation, Actual Permission hoặc Deployment Permission.
