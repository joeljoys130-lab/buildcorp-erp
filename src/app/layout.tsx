import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BuildCorp ERP - Enterprise Construction Management",
  description: "Next-gen ERP platform for contracts, work orders, material tracking, stock, and project execution management.",
};

const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const htmlContent = (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head />
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );

  if (hasClerkKey) {
    return <ClerkProvider dynamic>{htmlContent}</ClerkProvider>;
  }

  return htmlContent;
}
