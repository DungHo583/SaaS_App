import type { Metadata, Viewport } from "next";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./globals.css";

// CSS của FontAwesome đã import ở trên; tắt tự chèn CSS lúc chạy để tránh icon nháy to khi tải trang.
config.autoAddCss = false;

export const metadata: Metadata = {
  title: "Bếp Nhà - Gọi món",
  description: "Thực đơn nhà hàng và giỏ món trực tuyến",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
