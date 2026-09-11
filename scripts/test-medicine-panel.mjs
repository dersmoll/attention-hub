import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/medicine-panel-model.ts", import.meta.url);
const sourceText = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(sourceText, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, fileName: sourceUrl.pathname, reportDiagnostics: true });
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const panel = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
// Chrome that is always present: the toolbar and the panel footer.
assert.equal(panel.medicinePanelHeight(0, 0, false), 88);
assert.equal(panel.medicinePanelHeight(1, 1, false), 182);
// §4b bounds: at most 3 treatment headings and 8 dose rows, plus the more row.
assert.equal(panel.medicinePanelHeight(3, 8, true), 590);
assert.equal(panel.medicinePanelHeight(99, 99, true), 590);
// Bounds clamp rather than grow, so an overfull day cannot outgrow a full one.
assert.equal(panel.medicinePanelHeight(4, 9, true), panel.medicinePanelHeight(3, 8, true));
// Negative and fractional inputs floor rather than shrinking the panel.
assert.equal(panel.medicinePanelHeight(-3, -1, false), 88);
assert.equal(panel.medicinePanelHeight(1.9, 1.9, false), 182);

// A dose row must be budgeted at its rendered height, not its `min-height`.
// With `line-height: 1.5` the stacked 11px name and 9px detail plus 4px
// padding and 2px border come to 36px, and the 2px grid gap makes 38. Budgeting
// the 32px `min-height` instead clipped the footer once five rows were shown,
// so this pins the row cost rather than the total it happens to produce.
assert.equal(
  panel.medicinePanelHeight(1, 2, false) - panel.medicinePanelHeight(1, 1, false),
  38,
  "each dose row must be budgeted at its rendered height",
);
assert.equal(
  panel.medicinePanelHeight(2, 0, false) - panel.medicinePanelHeight(1, 0, false),
  56,
  "each treatment heading must be budgeted at its rendered height",
);
// The real-world case from the M19 review: two treatments, five doses.
assert.ok(
  panel.medicinePanelHeight(2, 5, false) >= 386,
  "must cover the measured height of a two-treatment, five-dose day",
);

const view = await readFile(new URL("../src/MedicinePanelView.tsx", import.meta.url), "utf8");

/* "No doses scheduled today" is a claim about the data. The popup used to make
 * it whenever nothing was rendered — while still loading, and after a load
 * failed — so an empty day and unreachable data read identically. */
assert.match(
  view,
  /const footerLabel = bounded\.visibleRows \? "[^"]*"\s*: loadFailure !== null \? "Medicine data is unavailable\."\s*: snapshot === null \? "Loading[^"]*"\s*: continuingTreatments\.length > 0 \?[^;]+\s*: "No doses scheduled today\."/,
  "emptiness may be claimed only with a successful load and no outstanding failure behind it",
);

/* A failed Take must not be mistaken for absent data: it leaves the loaded
 * doses on screen and reports itself separately. */
assert.match(view, /const \[loadFailure, setLoadFailure\]/, "load status must be its own state");
assert.match(view, /const \[actionError, setActionError\]/, "dose-action failures must be their own state");
assert.match(view, /catch \(cause\) \{ setActionError\(String\(cause\)\); \}/, "a failed dose action must not be reported as a load failure");
assert.match(view, /if \(!disposed\) \{ setSnapshot\(next\); setLoadFailure\(null\); \}/, "a successful load must clear the previous failure");
assert.match(view, /\{loadFailure && <p className="medicine-panel__error" role="alert">/, "an actionable failure must be an alert, not a polite status");
assert.match(view, /\{actionError && <p className="medicine-panel__error" role="alert">\{actionError\}<\/p>\}/, "a failed action must be an alert");
assert.match(view, /role="status">Showing recovered Medicine backup data\./, "recovery stays a polite status");

/* The 30-second tick must not move a row out from under a press, or resize the
 * window around it, while the action it started is still in flight. */
assert.match(view, /const bounded = frozen \?\? live;/, "the rendered view must be holdable");
assert.match(view, /onPointerDown=\{\(\) => \{ pointerDown\.current = true; holdView\(\); \}\}/, "a press must hold the view");
assert.match(view, /if \(!pendingRef\.current && !pointerDown\.current\) setFrozen\(null\)/, "the view must stay held until both the pointer and the pending action release it");
assert.match(view, /finally \{ setPendingKey\(null\); pendingRef\.current = null; releaseView\(\); \}/, "a settled action must apply whatever arrived while it ran");
/* `click` fires after `pointerup`, so the press is over before the action it
 * started exists. Releasing on the press ending would drop the hold for exactly
 * the window the mutation runs in. */
assert.match(view, /pendingRef\.current = key;\s*reholdView\(\);/, "the action must take ownership of the hold before it awaits");
assert.match(view, /window\.setTimeout\(releaseView, 0\)/, "the release must not pre-empt the click that starts the action");

/* Today runs the same dose controls off a one-second tick, so it needs the same
 * hold — a row must not move out from under a press there either. */
const today = await readFile(new URL("../src/TodayPopupView.tsx", import.meta.url), "utf8");
assert.match(today, /frozenDoses \?\? liveDoses/, "Today's dose list must be holdable");
assert.match(today, /onPointerDown=\{\(\) => \{ dosePointerDown\.current = true; holdDoses\(\); \}\}/, "a press in Today must hold the dose list");
assert.match(today, /if \(!dosePending\.current && !dosePointerDown\.current\) setFrozenDoses\(null\)/, "Today must stay held until both the pointer and the pending action release it");
assert.match(today, /dosePending\.current = true;\s*reholdDoses\(\);/, "Today's dose action must take ownership of the hold before it awaits");
assert.match(today, /window\.setTimeout\(releaseDoses, 0\)/, "Today's release must not pre-empt the click that starts the action");
assert.match(today, /finally \{ dosePending\.current = false; releaseDoses\(\); \}/, "a settled dose action in Today must apply the deferred update");

console.log("medicine panel checks passed");
