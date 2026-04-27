"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type SubscriptionState = {
  vapidPublicKey: string | null;
  subscribed: boolean;
  pushConfigured?: boolean;
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
  const [statusText, setStatusText] = useState<string | null>(null);

  useEffect(() => {
    const pushSupported =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    setSupported(pushSupported);
    if (!pushSupported) {
      setStatusText("Este navegador não suporta notificações push.");
      return;
    }
    setPermission(Notification.permission);
    if (Notification.permission === "denied") {
      setStatusText("Permissão de notificações bloqueada no navegador.");
    }

    void fetch("/api/push/subscriptions")
      .then(async (response) => {
        if (response.status === 401) {
          setStatusText("Sessão expirada. Entre novamente para ativar alertas.");
          return null;
        }
        if (!response.ok) {
          setStatusText("Não foi possível verificar alertas.");
          return null;
        }
        return (await response.json()) as SubscriptionState;
      })
      .then((data) => {
        if (!data) return;
        setEnabled(data.subscribed);
        setVapidPublicKey(data.vapidPublicKey);
        if (!data.vapidPublicKey) {
          setStatusText("Push ainda não configurado no servidor.");
        }
      })
      .catch(() => {
        setStatusText("Não foi possível verificar alertas.");
      });
  }, []);

  async function enablePush() {
    if (!supported) return;
    if (!vapidPublicKey) {
      setStatusText("Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.");
      return;
    }
    setLoading(true);
    setStatusText(null);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setStatusText("Permissão de notificações não concedida.");
        return;
      }

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
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: serialized.endpoint,
          keys: serialized.keys,
        }),
      });
      if (!response.ok) {
        setStatusText("Não foi possível ativar alertas neste dispositivo.");
        return;
      }
      setEnabled(true);
      setStatusText("Alertas de catálogo ativos neste dispositivo.");
    } finally {
      setLoading(false);
    }
  }

  async function disablePush() {
    if (!supported) return;
    setLoading(true);
    setStatusText(null);
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
      setStatusText("Alertas de catálogo desativados neste dispositivo.");
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  const disabled = loading || permission === "denied" || !vapidPublicKey;
  const title =
    permission === "denied"
      ? "Permissão de notificações bloqueada no navegador."
      : !vapidPublicKey
        ? "Configuração Web Push ausente no servidor."
        : statusText ?? undefined;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={() => void (enabled ? disablePush() : enablePush())}
        disabled={disabled}
        title={title}
        className="gap-2"
      >
        {enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        {enabled ? "Alertas de catálogo ativos" : "Ativar alertas de catálogo"}
      </Button>
      {statusText ? (
        <span className="max-w-[14rem] text-right text-[11px] leading-tight text-[var(--muted-foreground)]">
          {statusText}
        </span>
      ) : null}
    </div>
  );
}
