/* Stayboard service worker.
 *
 * Two responsibilities:
 *   1. Receive Web Push messages and surface them as system notifications.
 *      The push payload is JSON: { title, body, url?, tag? }
 *   2. When the user clicks a notification, focus an existing tab on the
 *      target URL or open a new one.
 *
 * Intentionally NOT caching anything yet — Stayboard is a real-time
 * dashboard so stale-while-revalidate would hide the wrong things. We
 * register the SW solely for the push capability + PWA installability.
 */

self.addEventListener("install", (event) => {
  // Skip the default lifecycle wait — we want push to start working ASAP.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Stayboard", body: "", url: "/", tag: undefined };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch (_e) {
    // Not JSON — fall back to raw text.
    payload.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Stayboard", {
      body: payload.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: payload.url || "/" },
      tag: payload.tag,
      // Re-stacks notifications with the same tag so we don't blast the user
      // with N copies if a webhook retries.
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Focus an existing tab if it's already on the right page
        if (client.url.endsWith(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
