import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS Dicomp — Tickets automáticos",
  description: "Tickets gerados automaticamente a partir dos chats do Umbler Talk",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
