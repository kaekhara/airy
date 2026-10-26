import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Upskill Airy — твой путь к росту",
  description: "Личный дневник навыков с Микой: практика, дерево прогресса и достижения.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
