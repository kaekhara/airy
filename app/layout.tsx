import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Upskill — дневник роста",
  description: "Визуальный дневник навыков с древом прогресса, заданиями и диалогами.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
