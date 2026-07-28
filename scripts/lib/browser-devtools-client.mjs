export async function connectDevTools(url, options = {}) {
  const SocketImpl = options.SocketImpl ?? WebSocket;
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const requestContext = options.requestContext ?? (() => null);
  const socket = new SocketImpl(url);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timeout);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result ?? {});
      return;
    }
    for (const handler of listeners.get(message.method) ?? []) {
      handler(message.params ?? {});
    }
  });
  socket.addEventListener("close", () => {
    for (const [id, request] of pending) {
      clearTimeout(request.timeout);
      request.reject(new Error(`CDP connection closed while waiting for request ${id}`));
    }
    pending.clear();
  });
  return {
    on(method, handler) {
      listeners.set(method, [...(listeners.get(method) ?? []), handler]);
    },
    send(method, params = {}, timeoutMs = requestTimeoutMs) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          const context = requestContext();
          const suffix = context ? ` (${context})` : "";
          reject(new Error(`Timed out waiting for CDP ${method} response after ${timeoutMs}ms${suffix}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitFor(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
        listeners.set(method, [...(listeners.get(method) ?? []), (params) => {
          clearTimeout(timeout);
          resolve(params);
        }]);
      });
    },
    close() {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
  };
}
