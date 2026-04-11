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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="flex min-h-screen flex-col">
            {/* Header */}
            <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
              <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
                {/* Logo */}
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-base font-bold tracking-tight text-white">DocuQuery</span>
                    <span className="ml-2 rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-400">Beta</span>
                  </div>
                </div>

                {/* Nav */}
                <a
                  href="https://github.com/Chrainx/docuquery"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
                  </svg>
                  GitHub
                </a>
              </div>
            </header>

            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
