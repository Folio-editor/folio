type LandingAnalyticsEvent =
  | 'landing_viewed'
  | 'web_enter_clicked'
  | 'desktop_download_clicked'
  | 'desktop_download_started'
  | 'desktop_download_failed';

type LandingAnalyticsParams = Record<string, string | number | boolean | undefined>;

function apiBase(): string {
  const url =
    (import.meta.env.VITE_API_URL as string | undefined) ??
    'http://127.0.0.1:8080/api/v1';
  return url.replace(/\/$/, '');
}

function eventId(): string {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clientId(): string {
  const key = 'folio:analytics:client-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = eventId();
  localStorage.setItem(key, next);
  return next;
}

function sessionId(): string {
  const key = 'folio:analytics:session-id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const next = Date.now().toString();
  sessionStorage.setItem(key, next);
  return next;
}

function pageContext(): LandingAnalyticsParams {
  const pathname = window.location.pathname || '/';
  return {
    session_id: sessionId(),
    engagement_time_msec: 1000,
    page_title: document.title || 'Folio',
    page_location: window.location.href,
    screen_name: pathname === '/' ? 'landing' : pathname.replace(/^\//, ''),
  };
}

function compactParams(params: LandingAnalyticsParams): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    }),
  );
}

export function trackLandingEvent(
  name: LandingAnalyticsEvent,
  params: LandingAnalyticsParams,
): void {
  const body = JSON.stringify({
    clientId: clientId(),
    events: [
      {
        id: eventId(),
        name,
        params: compactParams({ ...params, ...pageContext() }),
        createdAt: new Date().toISOString(),
      },
    ],
  });

  const url = `${apiBase()}/analytics/events`;
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(url, blob)) return;
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function currentOs(): string {
  const platform = navigator.platform.toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (platform.includes('win') || ua.includes('windows')) return 'windows';
  if (platform.includes('mac') || ua.includes('mac os')) return 'macos';
  if (platform.includes('linux') || ua.includes('linux')) return 'linux';
  return 'unknown';
}
