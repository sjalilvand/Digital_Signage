import { useAuth } from './store/auth';
import type { WsEvent } from './types';

/**
 * اتصال WebSocket داشبورد با احراز JWT و اتصال مجدد خودکار با backoff.
 * onMessage با رویدادهای device.updated / deployment.updated فراخوانی می‌شود.
 */
export function openDashboardSocket(
  onMessage: (event: WsEvent) => void,
  onOpen?: () => void,
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    const token = useAuth.getState().access;
    if (!token) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = import.meta.env.VITE_WS_BASE || `${proto}://${window.location.host}`;
    try {
      ws = new WebSocket(`${host}/ws/dashboard/?token=${encodeURIComponent(token)}`);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      attempt = 0;
      onOpen?.();
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Partial<WsEvent>;
        if (
          data &&
          (data.type === 'device.updated' || data.type === 'deployment.updated')
        ) {
          onMessage(data as WsEvent);
        }
      } catch {
        /* رویداد نامعتبر — نادیده گرفته می‌شود */
      }
    };
    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const delay = Math.min(30000, 1000 * 2 ** attempt);
    attempt += 1;
    timer = setTimeout(connect, delay);
  };

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  };
}
