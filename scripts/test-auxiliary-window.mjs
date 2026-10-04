import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString("base64")}`;
const lifecycleSource = await readFile(new URL("../src/auxiliary-window-lifecycle.ts", import.meta.url), "utf8");
const lifecycleUrl = dataModule(lifecycleSource);
const { createReadyAuxiliaryWindow, AuxiliaryWindowDeadlineError } = await import(lifecycleUrl);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = { label: "today", requestId: "request-one" };
let passed = 0;
async function test(name, run) { await run(); passed += 1; console.log(`ok - ${name}`); }

await test("dispatch success alone times out and removes its ready listener", async () => {
  let stopped = 0, resolved = 0;
  await assert.rejects(createReadyAuxiliaryWindow({ ...request, timeoutMs: 25,
    subscribe: async () => () => { stopped += 1; }, create: async () => undefined,
    resolveWindow: async () => { resolved += 1; },
  }), AuxiliaryWindowDeadlineError);
  await tick();
  assert.equal(stopped, 1); assert.equal(resolved, 0);
});

await test("listener is installed before creation; both native success and matching view readiness are required", async () => {
  let announce, settled = false, stopped = 0;
  const native = deferred();
  const window = { label: "today" };
  const operation = createReadyAuxiliaryWindow({ ...request, timeoutMs: 250,
    subscribe: async (ready) => { announce = ready; return () => { stopped += 1; }; },
    create: async () => { assert.equal(typeof announce, "function"); await native.promise; },
    resolveWindow: async () => window,
  }).then((result) => { settled = true; return result; });
  await tick();
  announce({ ...request, requestId: "old-request" });
  announce({ ...request, label: "medicine" });
  native.resolve(); await tick(); assert.equal(settled, false);
  announce(request);
  assert.equal(await operation, window);
  await tick(); assert.equal(stopped, 1);
});

await test("view readiness arriving before the native response is retained", async () => {
  const native = deferred(); let announce, settled = false;
  const operation = createReadyAuxiliaryWindow({ ...request, timeoutMs: 250,
    subscribe: async (ready) => { announce = ready; return () => undefined; },
    create: () => native.promise, resolveWindow: async () => "window",
  }).then((value) => { settled = true; return value; });
  await tick(); announce(request); await tick(); assert.equal(settled, false);
  native.resolve(); assert.equal(await operation, "window");
});

await test("native rejection disposes the listener and never resolves a window", async () => {
  let stopped = false, resolved = false;
  await assert.rejects(createReadyAuxiliaryWindow({ ...request,
    subscribe: async () => () => { stopped = true; },
    create: async () => { throw new Error("native failure"); },
    resolveWindow: async () => { resolved = true; },
  }), /native failure/);
  await tick(); assert.equal(stopped, true); assert.equal(resolved, false);
});

await test("a late subscription is disposed without starting creation after timeout", async () => {
  const registration = deferred(); let stopped = false, created = false;
  await assert.rejects(createReadyAuxiliaryWindow({ ...request, timeoutMs: 25,
    subscribe: () => registration.promise,
    create: async () => { created = true; }, resolveWindow: async () => undefined,
  }), AuxiliaryWindowDeadlineError);
  registration.resolve(() => { stopped = true; });
  await tick(); assert.equal(stopped, true); assert.equal(created, false);
});

await test("late native completion and ready events cannot resume an expired request", async () => {
  const native = deferred(); let announce, resolved = false;
  await assert.rejects(createReadyAuxiliaryWindow({ ...request, timeoutMs: 25,
    subscribe: async (ready) => { announce = ready; return () => undefined; },
    create: () => native.promise, resolveWindow: async () => { resolved = true; },
  }), AuxiliaryWindowDeadlineError);
  announce(request); native.resolve(); await tick(); assert.equal(resolved, false);
});

// Run the real Tauri adapter against mocked native ports. Only the deadline is
// shortened; production control flow, URL serialization and notices are intact.
const shortLifecycleUrl = dataModule(lifecycleSource.replace("10_000", "30"));
const mockUrl = dataModule(`
const fixture = globalThis.__auxiliaryFixture;
export const invoke = (...args) => fixture.invoke(...args);
export const listen = async (name, ready) => { fixture.ready = ready; return () => { fixture.stops += 1; }; };
export const emit = async () => undefined;
export const emitTo = async (...args) => { fixture.notices.push(args); };
export const getCurrentWindow = () => ({ label: "main" });
export class WebviewWindow { static getByLabel(label) { return fixture.getByLabel(label); } }
`);
const adapterSource = (await readFile(new URL("../src/auxiliary-window.ts", import.meta.url), "utf8"))
  .replaceAll(/"@tauri-apps\/api\/[^"\n]+"/g, JSON.stringify(mockUrl))
  .replace('"./auxiliary-window-lifecycle"', JSON.stringify(shortLifecycleUrl));
const fixture = globalThis.__auxiliaryFixture = { notices: [], stops: 0, ready: null, invoke: null, getByLabel: null };
const adapter = await import(dataModule(adapterSource));
const nativeWindow = { label: "today", isVisible: async () => true };

await test("concurrent creation is coalesced and existing query parameters reach native creation", async () => {
  let invokes = 0, lookup = 0;
  fixture.invoke = async (command, { options }) => {
    invokes += 1; assert.equal(command, "create_auxiliary_window"); assert.equal(options.label, "today");
    const url = new URL(options.url, "http://tauri.localhost");
    assert.equal(url.searchParams.get("window"), "today"); assert.equal(url.searchParams.get("focus"), "a/b");
    assert.ok(url.searchParams.get("auxiliaryRequestId"));
    fixture.ready({ payload: { label: "today", requestId: url.searchParams.get("auxiliaryRequestId") } });
  };
  fixture.getByLabel = async () => { lookup += 1; return nativeWindow; };
  const first = adapter.createAuxiliaryWindow("today", { url: "/?window=today&focus=a%2Fb", visible: false });
  assert.equal(adapter.createAuxiliaryWindow("today", { url: "/" }), first);
  assert.equal(await first, nativeWindow); assert.equal(invokes, 1); assert.equal(lookup, 1);
});

await test("native failure is sanitized and a later retry can open normally", async () => {
  fixture.notices.length = 0;
  fixture.invoke = async () => { throw new Error("C:/private/profile https://private-feed.example/secret"); };
  await assert.rejects(adapter.createAuxiliaryWindow("medicine", { url: "/" }), /Medicine manager could not be opened/);
  assert.equal(fixture.notices[0][0], "main");
  assert.ok(!JSON.stringify(fixture.notices).includes("private"));
  await tick();
  fixture.invoke = async (_, { options }) => fixture.ready({ payload: {
    label: "medicine", requestId: new URL(options.url, "http://tauri.localhost").searchParams.get("auxiliaryRequestId"),
  } });
  fixture.getByLabel = async () => ({ label: "medicine" });
  assert.equal((await adapter.createAuxiliaryWindow("medicine", { url: "/" })).label, "medicine");
});

await test("a phantom registered label cannot hang a lookup silently", async () => {
  fixture.getByLabel = async () => ({ isVisible: () => new Promise(() => undefined) });
  await assert.rejects(adapter.findAuxiliaryWindow("advanced"), /Settings could not be opened/);
});

await test("a hidden view times out and visibility polling stops after failure", async () => {
  let queries = 0;
  await assert.rejects(adapter.waitForAuxiliaryWindowVisible({ label: "today", isVisible: async () => { queries += 1; return false; } }), /Today could not be opened/);
  const atTimeout = queries; await pause(70); assert.equal(queries, atTimeout);
});

await test("revealing waits for native visibility after showing and focusing", async () => {
  const calls = [];
  await adapter.revealAuxiliaryWindow({ label: "advanced",
    unminimize: async () => { calls.push("unminimize"); }, show: async () => { calls.push("show"); },
    setFocus: async () => { calls.push("focus"); }, isVisible: async () => { calls.push("visible"); return true; },
  });
  assert.deepEqual(calls, ["unminimize", "show", "focus", "visible"]);
});
delete globalThis.__auxiliaryFixture;
console.log(`${passed} auxiliary-window behavior checks passed`);
