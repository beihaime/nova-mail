/* eslint-env serviceworker */
/**
 * Web Push handlers for Nova Mail.
 *
 * This file is NOT a service worker of its own: vite-plugin-pwa generates the
 * Workbox worker and pulls this in through `workbox.importScripts`, so the app
 * keeps one registration, one scope and one update cycle.
 *
 * The payload is intentionally tiny (sender + subject only, see
 * `pushService.notifyNewMail`) — an endpoint or a mail body never reaches the
 * browser here.
 */

const DEFAULT_TITLE = 'Nova Mail';
const ICON_PATH = 'icons/nova-mail-192.png';

function resolveIcon(scope) {
  try {
    return new URL(ICON_PATH, scope).href;
  } catch {
    return ICON_PATH;
  }
}

function readPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json() || {};
  } catch {
    return { body: event.data.text() || '' };
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);

  const title = payload.title || DEFAULT_TITLE;
  const lines = [];

  if (payload.body) lines.push(payload.body);
  if (payload.subject) lines.push(payload.subject);

  const scope = self.registration.scope;
  const emailId = Number(payload.emailId) || 0;

  event.waitUntil(self.registration.showNotification(title, {
    body: lines.join('\n'),
    icon: resolveIcon(scope),
    badge: resolveIcon(scope),
    // One conversation replaces its own previous notification.
    tag: emailId ? `nova-mail-${emailId}` : 'nova-mail',
    renotify: false,
    data: {
      url: payload.url || '',
      emailId,
    },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const scope = self.registration.scope;
  const target = event.notification.data?.url || '.';

  let url;
  try {
    // The payload URL is scope-relative so a sub-path deployment keeps working.
    url = new URL(target, scope).href;
  } catch {
    url = scope;
  }

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const targetOrigin = new URL(url).origin;

    // Focus an existing tab first: opening a second copy of the app would fight
    // over the single service worker registration.
    for (const client of windowClients) {
      try {
        if (new URL(client.url).origin !== targetOrigin) continue;
        await client.focus();
        if (typeof client.navigate === 'function') await client.navigate(url);
        return;
      } catch {
        // Client disappeared between matchAll and focus; try the next one.
      }
    }

    await self.clients.openWindow(url);
  })());
});
