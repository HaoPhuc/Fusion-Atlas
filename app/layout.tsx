import type { Metadata } from "next";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fusion Atlas · Research discovery",
  description:
    "Trace fusion research from topics and institutions to papers, people, and undergraduate internship leads.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
