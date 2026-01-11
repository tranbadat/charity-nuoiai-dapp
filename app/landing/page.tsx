"use client";

import Link from "next/link";
import PageShell from "../../components/PageShell";

export default function LandingPage() {
  return (
    <PageShell
      title="Giới thiệu dự án"
      subtitle="Nuoiai dApp hỗ trợ gây quỹ minh bạch và giải ngân có giám sát cộng đồng."
    >
      <section>
        <div className="landing-hero">
          <div>
            <h2>Nuoiai - quỹ từ thiện on-chain</h2>
            <p className="muted">
              Dự án giúp tạo chiến dịch gây quỹ, ghi nhận đóng góp trên blockchain, và theo dõi
              tiến trình sử dụng nguồn vốn thông qua các bước biểu quyết rõ ràng.
            </p>
            <div className="landing-actions">
              <Link className="button-link" href="/create">
                Tạo chiến dịch
              </Link>
              <Link className="button-link secondary" href="/">
                Xem chiến dịch
              </Link>
              <Link className="nav-link" href="/donate">
                Đóng góp ngay
              </Link>
            </div>
          </div>
          <div className="landing-card">
            <h3>Giá trị cốt lõi</h3>
            <div className="action-list">
              <div>
                <strong>Minh bạch:</strong> Mọi giao dịch và số dư được ghi nhận on-chain.
              </div>
              <div>
                <strong>Giám sát cộng đồng:</strong> Người đóng góp biểu quyết yêu cầu giải ngân.
              </div>
              <div>
                <strong>Tự động:</strong> Điều kiện giải ngân và hoàn tiền được xác định rõ.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2>Flow của một chiến dịch</h2>
        <div className="flow-steps">
          <div className="flow-step">
            <div className="step-badge">1</div>
            <div>
              <strong>Tạo chiến dịch</strong>
              <div className="muted">
                Người tạo nhập thông tin, mục tiêu, hạn chót và bằng chứng. PDA campaign được tạo
                trên chuỗi.
              </div>
            </div>
          </div>
          <div className="flow-step">
            <div className="step-badge">2</div>
            <div>
              <strong>Đóng góp</strong>
              <div className="muted">
                Người ủng hộ gửi SOL vào vault; mỗi đóng góp tạo bản ghi donation.
              </div>
            </div>
          </div>
          <div className="flow-step">
            <div className="step-badge">3</div>
            <div>
              <strong>Yêu cầu giải ngân</strong>
              <div className="muted">
                Chủ chiến dịch gửi yêu cầu giải ngân kèm bằng chứng và thời gian vote.
              </div>
            </div>
          </div>
          <div className="flow-step">
            <div className="step-badge">4</div>
            <div>
              <strong>Biểu quyết</strong>
              <div className="muted">
                Người đóng góp bỏ phiếu đồng ý/từ chối. Trọng số dựa trên tổng đóng góp.
              </div>
            </div>
          </div>
          <div className="flow-step">
            <div className="step-badge">5</div>
            <div>
              <strong>Chốt kết quả</strong>
              <div className="muted">
                Khi hết hạn vote, kết quả được chốt; trạng thái cập nhật trên chuỗi.
              </div>
            </div>
          </div>
          <div className="flow-step">
            <div className="step-badge">6</div>
            <div>
              <strong>Giải ngân hoặc hoàn tiền</strong>
              <div className="muted">
                Nếu được duyệt, chủ chiến dịch thực thi giải ngân. Nếu không, nhà tài trợ có thể
                yêu cầu hoàn tiền theo điều kiện.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="landing-highlight">
          <h2>Bắt đầu ngay</h2>
          <p>
            Tạo chiến dịch mới hoặc kiểm tra các chiến dịch đang hoạt động để đóng góp.
            Quy trình luôn được giữ minh bạch và theo dõi công khai.
          </p>
          <div className="landing-actions">
            <Link className="button-link" href="/create">
              Tạo chiến dịch
            </Link>
            <Link className="button-link secondary" href="/">
              Danh sách chiến dịch
            </Link>
            <Link className="nav-link" href="/request-withdraw">
              Yêu cầu giải ngân
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
