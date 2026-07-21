/**
 * Fetch-based SSE client for React Native.
 *
 * React Native does not ship a native `EventSource`, so we use XMLHttpRequest
 * whose `onprogress` callback fires every time new bytes land — effectively
 * giving us streaming without pulling in a third-party package.
 *
 * Usage:
 *   const sse = new SseClient();
 *   const off = sse.onEvent((event, data) => { ... });
 *   sse.connect(url, token);   // call when driver goes online
 *   sse.disconnect();          // call when driver goes offline / on unmount
 *   off();                     // remove a specific listener
 */

type EventListener = (event: string, data: unknown) => void;
type StatusListener = (status: SseStatus) => void;

export type SseStatus = "idle" | "connecting" | "open" | "closed" | "reconnecting";

const MAX_BACKOFF_MS = 30_000;

export class SseClient {
  private xhr: XMLHttpRequest | null = null;
  private status: SseStatus = "idle";
  private intentionallyClosed = false;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // SSE parse state
  private lastIndex = 0;
  private buffer = "";
  private currentEvent = "message";
  private currentDataLines: string[] = [];

  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();

  // Stored so we can reconnect automatically
  private _url = "";
  private _token = "";

  // ─── Public API ────────────────────────────────────────────────────

  getStatus(): SseStatus { return this.status; }

  onEvent(fn: EventListener): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  connect(url: string, token: string): void {
    this.intentionallyClosed = false;
    this._url = url;
    this._token = token;
    this._open();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this._clearReconnect();
    this._abortXhr();
    this.retry = 0;
    this._setStatus("closed");
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private _setStatus(s: SseStatus): void {
    if (this.status === s) return;
    this.status = s;
    for (const fn of this.statusListeners) { try { fn(s); } catch {} }
  }

  private _open(): void {
    this._abortXhr();
    this.lastIndex = 0;
    this.buffer = "";
    this.currentEvent = "message";
    this.currentDataLines = [];

    this._setStatus(this.retry > 0 ? "reconnecting" : "connecting");

    const xhr = new XMLHttpRequest();
    this.xhr = xhr;

    xhr.open("GET", this._url);
    xhr.setRequestHeader("Authorization", `Bearer ${this._token}`);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");

    xhr.onprogress = () => {
      // responseText accumulates — slice only the new portion
      const full: string = xhr.responseText ?? "";
      if (full.length <= this.lastIndex) return;
      const chunk = full.slice(this.lastIndex);
      this.lastIndex = full.length;

      if (this.status !== "open") {
        this.retry = 0;
        this._setStatus("open");
      }

      this.buffer += chunk;
      this._parseBuffer();
    };

    xhr.onload = () => {
      // Server closed the connection (normal for long-poll or server restart)
      if (!this.intentionallyClosed) this._scheduleReconnect();
    };

    xhr.onerror = () => {
      console.warn("[SSE] network error — will reconnect");
      if (!this.intentionallyClosed) this._scheduleReconnect();
    };

    xhr.ontimeout = () => {
      if (!this.intentionallyClosed) this._scheduleReconnect();
    };

    // No hard timeout — SSE streams are long-lived; the server sends
    // keep-alive comments every 25s so the connection stays warm.
    xhr.timeout = 0;

    xhr.send();
  }

  private _parseBuffer(): void {
    // Split on newlines; keep the last (possibly incomplete) line in the buffer
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.replace(/\r$/, ""); // strip CR for Windows-style endings

      if (line.startsWith("event:")) {
        this.currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        this.currentDataLines.push(line.slice(5).trim());
      } else if (line === "") {
        // Empty line = end of event block
        if (this.currentDataLines.length > 0) {
          this._dispatchEvent(this.currentEvent, this.currentDataLines.join("\n"));
        }
        this.currentEvent = "message";
        this.currentDataLines = [];
      }
      // Lines starting with ":" are comments / keep-alives — ignore.
    }
  }

  private _dispatchEvent(eventName: string, raw: string): void {
    let data: unknown = raw;
    try { data = JSON.parse(raw); } catch {}
    for (const fn of this.eventListeners) {
      try { fn(eventName, data); } catch (e) {
        console.warn("[SSE] listener error", e);
      }
    }
  }

  private _scheduleReconnect(): void {
    this._abortXhr();
    this.retry += 1;
    const jitter = 0.7 + Math.random() * 0.6;
    const delay = Math.min(MAX_BACKOFF_MS, Math.round(1_000 * Math.pow(1.7, this.retry) * jitter));
    this._setStatus("reconnecting");
    this._clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionallyClosed) this._open();
    }, delay);
  }

  private _clearReconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  private _abortXhr(): void {
    if (this.xhr) {
      try { this.xhr.abort(); } catch {}
      this.xhr = null;
    }
  }
}

// Module-level singleton — survives re-renders, destroyed only when the driver
// explicitly disconnects. Exported so it can be replaced in tests.
let _driverSse: SseClient | null = null;
export function getDriverSseClient(): SseClient {
  if (!_driverSse) _driverSse = new SseClient();
  return _driverSse;
}
