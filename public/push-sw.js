self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "ERP 1a1", body: event.data.text() };
  }

  const title = payload.title || "ERP 1a1";
  const body = payload.body || "Atualização de catálogo";
  const url = payload.url || "/dashboard/catalog-report";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      tag: payload.tag || undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard/catalog-report";
  const target = new URL(targetUrl, self.location.origin);
  const isSameOrigin = target.origin === self.location.origin;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        if (!isSameOrigin) {
          return clients.openWindow ? clients.openWindow(target.href) : undefined;
        }

        for (const client of windowClients) {
          if ("focus" in client && client.url.includes(self.location.origin)) {
            client.navigate(target.href);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(target.href);
        }
      }),
  );
});
