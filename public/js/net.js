// Kết nối máy chủ qua WebSocket, tự kết nối lại khi rớt mạng.
export class WSNet {
  constructor(onMsg, onStatus) {
    this.onMsg = onMsg; this.onStatus = onStatus;
    this.ws = null; this.attempt = 0; this.stopped = false; this.queue = [];
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = location.pathname.replace(/[^/]*$/, '');
    this.url = (window.LIB_WS_URL || `${proto}//${location.host}${base}ws`);
  }
  connect(timeoutMs = 4000) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      const timer = setTimeout(() => done(false), timeoutMs);
      this.open(() => { clearTimeout(timer); done(true); }, () => { clearTimeout(timer); done(false); });
    });
  }
  open(onOpen, onFail) {
    let opened = false;
    try { this.ws = new WebSocket(this.url); } catch { onFail?.(); return; }
    this.ws.onopen = () => {
      opened = true; this.everOpened = true; this.attempt = 0; this.onStatus('open');
      for (const m of this.queue.splice(0)) this.ws.send(m);
      onOpen?.();
    };
    this.ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMsg(m); };
    this.ws.onclose = () => {
      if (!opened) { onFail?.(); if (!this.everOpened) return; }
      if (this.stopped) return;
      this.onStatus('offline');
      const wait = Math.min(10000, 1000 * 2 ** this.attempt++);
      setTimeout(() => this.open(), wait);
    };
    this.ws.onerror = () => {};
  }
  send(m) {
    const s = JSON.stringify(m);
    if (this.ws?.readyState === 1) this.ws.send(s);
    else if (m.t !== 'move' && this.queue.length < 50) this.queue.push(s);
  }
  stop() { this.stopped = true; this.ws?.close(); }
}
