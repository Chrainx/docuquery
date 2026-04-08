import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DocuQuery — Ask Your PDFs Anything",
  description:
    "Upload a PDF, ask questions in plain English, and get answers with exact page citations. 100% local, 100% free.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-gray-200 bg-white">
              <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <svg
                    className="h-8 w-8 text-brand-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
                    />
                  </svg>
                  <span className="text-xl font-bold text-gray-900">
                    DocuQuery
                  </span>
                </div>
                <a
                  href="https://github.com/Chrainx/docuquery"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 transition-colors hover:text-gray-900"
                >
                  GitHub
                </a>
              </div>
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
