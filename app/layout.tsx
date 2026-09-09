import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CineGraph — Movie Feedback Intelligence",
  description:
    "A live movie knowledge graph that classifies feedback, detects trends, and answers questions with evidence.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
