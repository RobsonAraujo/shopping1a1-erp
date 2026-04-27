"use client";

import { useEffect } from "react";

export function PwaSwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/push-sw.js");
  }, []);

  return null;
}
