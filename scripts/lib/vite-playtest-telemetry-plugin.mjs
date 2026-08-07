import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const CAPTURE_PATH = "/__wargus/playtest-telemetry";
const LOG_ROOT = "playtest-logs";
const SESSIONS_DIR = path.join(LOG_ROOT, "sessions");
const LATEST_PATH = path.join(LOG_ROOT, "latest.json");
const INDEX_PATH = path.join(LOG_ROOT, "index.json");
const MAX_INDEX_ENTRIES = 200;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function ensureLogDirs() {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function safeSessionId(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function sessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadSession(sessionId) {
  const filePath = sessionPath(sessionId);
  const existing = readJson(filePath, null);
  if (existing && typeof existing === "object" && Array.isArray(existing.entries)) {
    return existing;
  }
  const nowIso = new Date().toISOString();
  return {
    sessionId,
    startedAt: nowIso,
    updatedAt: nowIso,
    closed: false,
    entryCount: 0,
    client: null,
    entries: []
  };
}

function mergeEntries(session, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return session;
  }
  const seen = new Set();
  for (const entry of session.entries) {
    if (entry && typeof entry.seq === "number") {
      seen.add(entry.seq);
    }
  }
  for (const entry of incoming) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    if (typeof entry.seq === "number" && seen.has(entry.seq)) {
      continue;
    }
    if (typeof entry.seq === "number") {
      seen.add(entry.seq);
    }
    session.entries.push(entry);
  }
  session.entryCount = session.entries.length;
  return session;
}

function updateIndex(summary) {
  const index = readJson(INDEX_PATH, []);
  const list = Array.isArray(index) ? index : [];
  const next = list.filter((row) => row?.sessionId !== summary.sessionId);
  next.unshift(summary);
  writeJson(INDEX_PATH, next.slice(0, MAX_INDEX_ENTRIES));
}

function handleCapture(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "method-not-allowed" }));
    return;
  }

  const chunks = [];
  let total = 0;
  req.on("data", (chunk) => {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "payload-too-large" }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    try {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : {};
      const sessionId = safeSessionId(body.sessionId);
      if (!sessionId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "invalid-session-id" }));
        return;
      }

      ensureLogDirs();
      const session = loadSession(sessionId);
      if (!session.startedAt) {
        session.startedAt = new Date().toISOString();
      }
      mergeEntries(session, body.entries);
      session.updatedAt = new Date().toISOString();
      if (body.closed === true) {
        session.closed = true;
      }
      if (body.client && typeof body.client === "object") {
        session.client = {
          ...(session.client && typeof session.client === "object" ? session.client : {}),
          ...body.client
        };
      }

      const filePath = sessionPath(sessionId);
      writeJson(filePath, session);

      const summary = {
        sessionId,
        path: filePath,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        closed: Boolean(session.closed),
        entryCount: session.entryCount
      };
      writeJson(LATEST_PATH, summary);
      updateIndex(summary);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({
        ok: true,
        sessionId,
        entryCount: session.entryCount,
        path: filePath
      }));
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "invalid-payload"
      }));
    }
  });
}

function attachMiddleware(server) {
  server.middlewares.use((req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";
    if (url !== CAPTURE_PATH) {
      next();
      return;
    }
    handleCapture(req, res);
  });
}

/**
 * Vite plugin: POST /__wargus/playtest-telemetry -> playtest-logs/sessions/*.json
 * Also exposes GET-friendly files: playtest-logs/latest.json and index.json
 */
export function playtestTelemetryCapturePlugin() {
  return {
    name: "wargus-playtest-telemetry-capture",
    configureServer(server) {
      ensureLogDirs();
      attachMiddleware(server);
    },
    configurePreviewServer(server) {
      ensureLogDirs();
      attachMiddleware(server);
    }
  };
}

export function listPlaytestSessions() {
  ensureLogDirs();
  return readdirSync(SESSIONS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(SESSIONS_DIR, name));
}
