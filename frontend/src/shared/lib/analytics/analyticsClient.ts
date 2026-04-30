import type {
  AnalyticsEventName,
  AnalyticsParams,
  QueuedAnalyticsEvent,
} from './analyticsEvents';
import {
  enqueueAnalyticsEvent,
  getQueuedAnalyticsCount,
  incrementAnalyticsRetry,
  readQueuedAnalyticsEvents,
  removeAnalyticsEvents,
} from './analyticsQueue';
import { countBucket } from './analyticsBuckets';
import { sanitizeAnalyticsParams } from './analyticsPrivacy';

type AnalyticsFlushResponse = {
  accepted: string[];
  rejected: Array<{ id: string; reason: string }>;
};

let flushing = false;
let initialized = false;

function apiUrl(): string {
  const url = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api/v1';
  return url.replace(/\/$/, '');
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function newEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getClientId(): string {
  const key = 'folio:analytics:client-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = newEventId();
  localStorage.setItem(key, next);
  return next;
}

function getSessionId(): string {
  const key = 'folio:analytics:session-id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const next = Date.now().toString();
  sessionStorage.setItem(key, next);
  return next;
}

function pageContext(): {
  session_id: string;
  engagement_time_msec: number;
  page_title: string;
  page_location: string;
  screen_name: string;
} {
  const pathname = window.location.pathname || '/';
  return {
    session_id: getSessionId(),
    engagement_time_msec: 1000,
    page_title: document.title || 'Folio',
    page_location: window.location.href,
    screen_name: pathname === '/' ? 'editor' : pathname.replace(/^\//, ''),
  };
}

async function postEvents(events: QueuedAnalyticsEvent[]): Promise<AnalyticsFlushResponse> {
  const token = await window.folio.auth.getAccessToken().catch(() => null);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${apiUrl()}/analytics/events`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      clientId: getClientId(),
      events: events.map((event) => ({
        id: event.id,
        name: event.name,
        params: event.params,
        createdAt: event.createdAt,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Analytics flush failed: ${response.status}`);
  }

  return (await response.json()) as AnalyticsFlushResponse;
}

export async function flushAnalytics(): Promise<void> {
  if (flushing || !isOnline()) return;

  flushing = true;
  try {
    const events = await readQueuedAnalyticsEvents();
    if (events.length === 0) return;

    const response = await postEvents(events);
    const removeIds = [
      ...response.accepted,
      ...response.rejected.map((event) => event.id),
    ];
    await removeAnalyticsEvents(removeIds);

    const retainedIds = events
      .map((event) => event.id)
      .filter((id) => !removeIds.includes(id));
    await incrementAnalyticsRetry(retainedIds);
  } catch {
    const events = await readQueuedAnalyticsEvents();
    await incrementAnalyticsRetry(events.map((event) => event.id));
  } finally {
    flushing = false;
  }
}

export async function trackAnalytics<TName extends AnalyticsEventName>(
  name: TName,
  params: AnalyticsParams<TName>,
): Promise<void> {
  const sanitized = sanitizeAnalyticsParams(name, {
    ...params,
    ...pageContext(),
    offline_queued: !isOnline(),
  });

  await enqueueAnalyticsEvent({
    id: newEventId(),
    name,
    params: sanitized,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });

  if (isOnline()) {
    void flushAnalytics();
  }
}

export function initAnalyticsLifecycle(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('online', () => {
    getQueuedAnalyticsCount()
      .then((count) =>
        trackAnalytics('online_restored', {
          queued_event_count_bucket: countBucket(count),
        }),
      )
      .finally(() => void flushAnalytics());
  });

  window.addEventListener('offline', () => {
    getQueuedAnalyticsCount().then((count) =>
      trackAnalytics('offline_entered', {
        queued_event_count_bucket: countBucket(count),
      }),
    );
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushAnalytics();
    }
  });
}

export const analytics = {
  track: trackAnalytics,
  flush: flushAnalytics,
  init: initAnalyticsLifecycle,
};
