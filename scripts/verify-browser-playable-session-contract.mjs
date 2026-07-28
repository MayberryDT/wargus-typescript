import assert from "node:assert/strict";
import { connectDevTools } from "./lib/browser-devtools-client.mjs";

class FakeSocket {
  static last = null;
  listeners = new Map();
  sent = [];

  constructor() {
    FakeSocket.last = this;
    queueMicrotask(() => this.emit("open", {}));
  }

  addEventListener(type, handler) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.emit("close", {});
  }

  emit(type, event) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

let auditMap = "campaigns/human-exp/levelx12h.smp.gz";
const client = await connectDevTools("ws://example.test", {
  SocketImpl: FakeSocket,
  requestTimeoutMs: 15,
  requestContext: () => auditMap ? `map ${auditMap}` : null
});

const pageEnable = client.send("Page.enable");
const pageEnableRequest = FakeSocket.last.sent.at(-1);
FakeSocket.last.emit("message", {
  data: JSON.stringify({ id: pageEnableRequest.id, result: { enabled: true } })
});
assert.deepEqual(await pageEnable, { enabled: true }, "CDP responses must settle their matching pending request");

await assert.rejects(
  client.send("Runtime.evaluate"),
  (error) => {
    assert.match(error.message, /CDP Runtime\.evaluate response after 15ms/);
    assert.match(error.message, /map campaigns\/human-exp\/levelx12h\.smp\.gz/);
    return true;
  },
  "A missing CDP response must reject within the deadline with method and map evidence"
);

auditMap = "campaigns/human-exp/levelx01h.smp.gz";
const recovery = client.send("Runtime.enable");
const recoveryRequest = FakeSocket.last.sent.at(-1);
FakeSocket.last.emit("message", {
  data: JSON.stringify({ id: recoveryRequest.id, result: {} })
});
assert.deepEqual(await recovery, {}, "A timed-out request must not poison later CDP responses");
client.close();

console.log("Browser playable-session CDP deadlines verified (bounded requests, method/map evidence, and post-timeout recovery).");
