import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { BattleToastProvider } from "@/components/battle-toast";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "معركة الأسئلة - تحدي القراءة المتحررة والنصوص",
  description: "ادخل ساحة المعركة وتنافس مع أصدقائك في تحديات القراءة المتحررة والنصوص! لعبة مسابقات جماعية أونلاين بالذكاء الاصطناعي.",
  keywords: ["معركة الأسئلة", "قراءة متحررة", "نصوص", "تحدي", "لعبة تعليمية", "عربي", "مسابقات"],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={cairo.variable}>
      <body className="antialiased bg-background text-foreground min-h-screen font-[var(--font-cairo)]">
        {children}
        <BattleToastProvider />
      </body>
    </html>
  );
}
