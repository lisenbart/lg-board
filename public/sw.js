self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

async function paintBadge(count) {
  try {
    if (navigator.setAppBadge) {
      if (count > 0) await navigator.setAppBadge(count);
      else await navigator.clearAppBadge();
    }
  } catch {
    /* Android Chrome without Badging */
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "LG Board";
  const body = data.body || "New on the board";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      windows.forEach((client) => {
        client.postMessage({ type: "push-notice", taskId: data.taskId || "" });
      });
      // Always paint an OS notification. Skipping when a window is "visible"
      // ate the test ping: send-then-lock found a still-visible PWA and
      // never put a popup on the lock screen.
      await self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/favicon-32.png",
        silent: false,
        vibrate: [70, 40, 90],
        tag: data.tag || data.taskId || "lg-board",
        renotify: true,
        data: { url: data.url || "/", taskId: data.taskId || "" },
      });
      const notes = await self.registration.getNotifications();
      await paintBadge(Math.max(1, notes.length));
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId || "";
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          client.postMessage({ type: "open-task", taskId });
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
