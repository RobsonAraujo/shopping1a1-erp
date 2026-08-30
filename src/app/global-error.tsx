"use client";

import { useEffect } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { FullPageError } from "@/components/ui/full-page-error";
import { GENERIC_USER_ERROR } from "@/lib/api-client-error";
import { captureError } from "@/lib/error-tracking";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "app/global-error" });
  }, [error]);

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
        <FullPageError
          description={GENERIC_USER_ERROR}
          digest={error.digest}
          onRetry={unstable_retry}
        />
      </body>
    </html>
  );
}
