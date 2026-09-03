"use client";

import { useEffect } from "react";
import { FullPageError } from "@/components/ui/full-page-error";
import { GENERIC_USER_ERROR } from "@/lib/api/api-client-error";
import { captureError } from "@/lib/infra/error-tracking";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "app/error" });
  }, [error]);

  return (
    <FullPageError
      description={GENERIC_USER_ERROR}
      digest={error.digest}
      onRetry={unstable_retry}
    />
  );
}
