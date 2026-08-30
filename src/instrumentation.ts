import type { Instrumentation } from "next";
import { captureRequestError, initErrorTrackingServer } from "@/lib/error-tracking";

export function register(): void {
  initErrorTrackingServer();
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  captureRequestError(error, request, context);
};
