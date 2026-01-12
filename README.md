# Nuoiai dApp (Frontend)

Nuoiai dApp là giao diện web cho dự án gây quỹ on-chain trên Solana. Ứng dụng giúp tạo chiến dịch, ghi nhận đóng góp, theo dõi tiến độ và thực hiện quy trình giải ngân minh bạch với cơ chế biểu quyết của cộng đồng.

## Chức năng chính
- Tạo chiến dịch gây quỹ với mục tiêu, hạn chót và metadata CID.
- Upload bằng chứng lên IPFS thông qua proxy API.
- Danh sách chiến dịch và trang tổng quan chi tiết từng chiến dịch.
- Đóng góp SOL vào chiến dịch (tạo DonationRecord).
- Tạo yêu cầu giải ngân kèm bằng chứng và thời gian biểu quyết.
- Biểu quyết phê duyệt/từ chối giải ngân theo trọng số đóng góp.
- Chốt kết quả biểu quyết và thực thi giải ngân.
- Hoàn tiền khi chiến dịch không đạt mục tiêu hoặc rơi vào các điều kiện hoàn tiền.
- Hỗ trợ chế độ ký giao dịch bằng local signer qua API backend.

## Công nghệ sử dụng
- Next.js 14 (App Router), React 18
- Solana Web3.js + Anchor
- Solana Wallet Adapter
- IPFS (proxy qua API `/api/ipfs/add`)

## Cấu trúc chính
- `app/`: các trang Next.js (landing, list, create, donate, request-withdraw, vote, finalize, execute, refund)
- `app/api/ipfs/add`: proxy upload IPFS
- `app/api/tx`: API ký giao dịch khi bật local signer
- `idl/nuoiai.json`: IDL của chương trình Solana
- `lib/`: helper Anchor, PDA, format, local signer

## Program ID
- `Ctfz2Ksrytewrtgc6UF2WB6FAfHhPHJRmJFcBGe8r7qS` (lấy từ `idl/nuoiai.json`)

## Màn hình và hiển thị
### Landing (`/landing`)
- Giới thiệu dự án, lợi ích (minh bạch, giám sát cộng đồng, tự động).
- Flow 6 bước: tạo chiến dịch → đóng góp → yêu cầu giải ngân → biểu quyết → chốt kết quả → giải ngân/hoàn tiền.
- CTA: tạo chiến dịch, xem danh sách, đóng góp, yêu cầu giải ngân.

### Danh sách chiến dịch (`/`)
- Hiển thị danh sách campaign đọc từ on-chain.
- Nút tải lại danh sách, tổng số campaign.
- Mỗi card campaign gồm: tiêu đề (metadata CID hoặc fallback), trạng thái, campaign id, mục tiêu (SOL), đã gây quỹ (SOL), deadline (định dạng thời gian + unix).
- Link đến trang chi tiết campaign.

### Tổng quan campaign (`/campaign`)
- Form nhập `creator` (public key) và `campaignId` để tải campaign.
- Hiển thị trạng thái, số thứ tự yêu cầu rút tiếp theo.
- Hiển thị Campaign PDA + Vault PDA (kèm copy).
- Thông tin chính: creator, mục tiêu, đã gây quỹ, hạn chót, metadata CID + link IPFS (nếu có).
- Lịch sử đóng góp: danh sách donor, số tiền, trạng thái hoàn.
- Danh sách yêu cầu giải ngân: index, đã duyệt, đã chốt, đã giải ngân, số tiền, CID bằng chứng, trọng số approve/reject, thời gian vote.

### Chi tiết campaign theo PDA (`/campaign/[campaign]`)
- Hiển thị đầy đủ thông tin campaign theo địa chỉ PDA.
- Có các hành động nhanh dẫn đến donate/request-withdraw/vote/finalize/execute/refund (tuỳ trạng thái).

### Tạo chiến dịch (`/create`)
- Nhập campaignId, mục tiêu (SOL), hạn chót, metadata CID.
- Tạo ID/CID demo nhanh.
- Upload bằng chứng lên IPFS và lấy CID.

### Đóng góp (`/donate`)
- Nhập creator + campaignId để suy ra Campaign PDA/Vault PDA.
- Nhập số tiền SOL và gửi donation.

### Yêu cầu giải ngân (`/request-withdraw`)
- Nhập creator + campaignId, tải campaign.
- Nhập số tiền, CID bằng chứng, thời gian vote (giây).

### Biểu quyết (`/vote`)
- Nhập creator + campaignId + request index.
- Chọn phê duyệt hoặc từ chối, gửi phiếu.

### Chốt biểu quyết (`/finalize`)
- Nhập creator + campaignId + request index.
- Chốt kết quả biểu quyết.

### Giải ngân (`/execute`)
- Nhập creator + campaignId + request index.
- Thực thi giải ngân sau khi đã chốt.

### Hoàn tiền (`/refund`)
- Nhập creator + campaignId (+ request index tuỳ chọn).
- Hiển thị gợi ý điều kiện hoàn tiền (deadline, trạng thái refunding, vote bị từ chối, quá hạn thực thi...).
- Thực hiện claim refund.

## Yêu cầu môi trường
Sao chép `.env.example` sang `.env` và cấu hình các biến cần thiết.

Các biến thường dùng:
- `NEXT_PUBLIC_RPC_URL`: RPC URL của Solana
- `NEXT_PUBLIC_USE_LOCAL_SIGNER`: bật chế độ local signer (`true`/`false`)
- `LOCAL_SIGNER_KEYPAIR`: keypair dạng JSON array (chỉ dùng khi local signer)
- `LOCAL_SIGNER_KEYPAIR_PATH`: đường dẫn keypair (tuỳ chọn)
- `NEXT_PUBLIC_IPFS_API_URL`: endpoint IPFS API (tuỳ chọn)

## Chạy dự án
```bash
npm install
npm run dev
```

Truy cập `http://localhost:3000`.

## Scripts
- `npm run dev`: chạy môi trường phát triển
- `npm run build`: build production
- `npm run start`: chạy production server
- `npm run lint`: lint
- `npm run seed:campaigns`: seed dữ liệu chiến dịch (nếu có kịch bản)

## Ghi chú
- Khi bật `NEXT_PUBLIC_USE_LOCAL_SIGNER=true`, các giao dịch sẽ đi qua API `app/api/tx`.
- Upload bằng chứng sẽ gửi file đến proxy `app/api/ipfs/add`, sau đó trả về CID để lưu vào chiến dịch.
