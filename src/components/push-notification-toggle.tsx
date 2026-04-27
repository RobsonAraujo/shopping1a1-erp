"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type SubscriptionState = {
  vapidPublicKey: string | null;
  subscribed: boolean;
};

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export function PushNotificationToggle() {
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window);
    setPermission(Notification.permission);

    void fetch("/api/push/subscriptions")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as SubscriptionState;
      })
      .then((data) => {
        if (!data) return;
        setEnabled(data.subscribed);
        setVapidPublicKey(data.vapidPublicKey);
      })
      .catch(() => {});
  }, []);

  async function enablePush() {
    if (!supported || !vapidPublicKey) return;
    setLoading(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            base64UrlToUint8Array(vapidPublicKey) as unknown as BufferSource,
        }));

      const serialized = subscription.toJSON();
      await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: serialized.endpoint,
          keys: serialized.keys,
        }),
      });
      setEnabled(true);
    } finally {
      setLoading(false);
    }
  }

  async function disablePush() {
    if (!supported) return;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      } else {
        await fetch("/api/push/subscriptions", { method: "DELETE" });
      }

      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  return (
    <Button
      type="button"
      variant={enabled ? "default" : "outline"}
      size="sm"
      onClick={() => void (enabled ? disablePush() : enablePush())}
      disabled={loading || permission === "denied" || !vapidPublicKey}
      title={
        permission === "denied"
          ? "Permissão de notificações bloqueada no navegador."
          : undefined
      }
      className="gap-2"
    >
      {enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
      {enabled ? "Alertas losing ativos" : "Ativar alertas losing"}
    </Button>
  );
}
