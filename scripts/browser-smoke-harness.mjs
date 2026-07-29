import { BrowserExecutionController } from "./lib/browser-execution-controller.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function createBrowserExecutionController(options) {
  return new BrowserExecutionController(options);
}

export async function startViteServer({ controller, port, mode = "dev", stdio = "ignore" }) {
  return controller.startViteServer({ port, mode, stdio });
}

export async function startChrome({ controller, chromeBin, debugPort, profilePrefix, extraArgs = [] }) {
  const profilePath = mkdtempSync(path.join(tmpdir(), profilePrefix));
  const child = await controller.startChrome({ chromeBin, debugPort, profilePath, extraArgs });
  return { child, profilePath };
}

export async function waitForHttp(url, timeoutMs, details = () => "") {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the process opens the port.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}${details() ? `; server output:\n${details()}` : ""}`);
}

export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

export async function waitForPageTarget(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const targets = await fetchJson(url);
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (page) {
      return page;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for a Chrome page target.");
}

export async function connectDevTools(url) {
  const socket = new WebSocket(url);
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
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result ?? {});
      }
      return;
    }
    const handlers = listeners.get(message.method) ?? [];
    for (const handler of handlers) {
      handler(message.params ?? {});
    }
  });
  return {
    on(method, handler) {
      listeners.set(method, [...(listeners.get(method) ?? []), handler]);
    },
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    waitFor(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const handlers = (listeners.get(method) ?? []).filter((candidate) => candidate !== handler);
          listeners.set(method, handlers);
          reject(new Error(`Timed out waiting for ${method}`));
        }, timeoutMs);
        const handler = (params) => {
          clearTimeout(timeout);
          const handlers = (listeners.get(method) ?? []).filter((candidate) => candidate !== handler);
          listeners.set(method, handlers);
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), handler]);
      });
    },
    close() {
      socket.close();
    }
  };
}

export async function waitForExpression(client, expression, timeoutMs, smokeReader) {
  const start = Date.now();
  let lastValue = null;
  while (Date.now() - start < timeoutMs) {
    const result = await client.send("Runtime.evaluate", { expression, returnByValue: true });
    lastValue = result.result?.value ?? null;
    if (result.result?.value === true) {
      return;
    }
    await delay(250);
  }
  const smokeState = await (smokeReader ? smokeReader() : readSmokeState(client));
  throw new Error(`Timed out waiting for browser expression: ${expression}; last=${JSON.stringify(lastValue)}; smoke=${JSON.stringify(smokeState)}`);
}

export async function evalValue(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return result.result?.value ?? null;
}

export async function readSmokeState(client) {
  return evalValue(client, "window.__WARGUS_TS_SMOKE_STATE__");
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function removeProfile(profilePath) {
  if (!profilePath) {
    return;
  }
  rmSync(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
