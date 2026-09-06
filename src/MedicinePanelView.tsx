import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HubCloseIcon } from "./HubCloseIcon";
import { openMedicineManagerAt, openMedicineManagerWindow } from "./medicine-manager-window";
import { medicineDoseKey } from "./medicine-manager-navigation";
import { MEDICINE_PANEL_CLOSED_EVENT, MEDICINE_PANEL_OPEN_EVENT, MEDICINE_PANEL_READY_EVENT, medicinePanelHeight, type MedicinePanelPayload } from "./medicine-panel-model";
import { medicinePanelPosition } from "./medicine-panel-window";
import { boundedMedicinePanelGroups, medicineDailyTreatments, medicineDoseStateLabel, medicineFoodRuleLabel, type MedicineDailyDoseRow, type MedicineSnapshot } from "./medicine-model";
import { useMedicineGraceMinutes } from "./use-medicine-grace-minutes";
import { useWidgetPanelStyle } from "./use-widget-panel-style";

export function MedicinePanelView() {
  const panelStyle = useWidgetPanelStyle();
  const graceMinutes = useMedicineGraceMinutes();
  const [payload, setPayload] = useState<MedicinePanelPayload | null>(null);
  const [snapshot, setSnapshot] = useState<MedicineSnapshot | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  /* Loading a snapshot and recording a dose fail for different reasons and must
   * read differently. One shared `error` meant a failed Take was indistinguishable
   * from absent data: the footer claimed "No doses scheduled today" while the day's
   * doses were sitting in state, unrendered. Keep them apart. */
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const shown = useRef(false);
  const shellRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let disposed = false;
    const stops: Array<() => void> = [];
    const refresh = async () => {
      try {
        const next = await invoke<MedicineSnapshot>("get_medicine_snapshot");
        // A successful load clears the previous failure: recovery must not keep
        // warning about data that is now present.
        if (!disposed) { setSnapshot(next); setLoadFailure(null); }
      }
      catch (cause) { if (!disposed) setLoadFailure(String(cause)); }
    };
    void listen("medicine-changed", () => void refresh()).then((stop) => disposed ? stop() : stops.push(stop));
    void listen<MedicinePanelPayload>(MEDICINE_PANEL_OPEN_EVENT, ({ payload: next }) => {
      if (disposed) return;
      setPayload(next); setActionError(null); void refresh();
    }).then((stop) => { if (disposed) stop(); else { stops.push(stop); void emitTo("main", MEDICINE_PANEL_READY_EVENT); } });
    return () => { disposed = true; stops.forEach((stop) => stop()); };
  }, []);

  const live = useMemo(() => boundedMedicinePanelGroups(snapshot ? medicineDailyTreatments(snapshot, now, graceMinutes) : []), [snapshot, now, graceMinutes]);
  /* The clock ticks every 30 seconds and can change which treatments and doses
   * are visible. Landing between pressing a button and releasing it, that moves
   * the row under the pointer — and the panel resizes itself around the new
   * content while a finger is still down on it. Hold the rendered view still
   * from the start of an activation until the action it began has settled, then
   * apply whatever arrived meanwhile. Geometry follows `bounded`, so freezing
   * the view freezes the window size with it. */
  const [frozen, setFrozen] = useState<ReturnType<typeof boundedMedicinePanelGroups> | null>(null);
  const bounded = frozen ?? live;
  const pointerDown = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const heldView = useRef<ReturnType<typeof boundedMedicinePanelGroups> | null>(null);
  const checkButtons = useRef(new Map<string, HTMLButtonElement>());
  const moreButton = useRef<HTMLButtonElement>(null);
  const manageButton = useRef<HTMLButtonElement>(null);
  const restoreFocusKey = useRef<string | null>(null);

  const holdView = () => {
    restoreFocusKey.current = document.activeElement?.closest?.("[data-dose-key]")?.getAttribute("data-dose-key") ?? null;
    heldView.current = frozen ?? live;
    setFrozen((current) => current ?? live);
  };
  /* `click` fires after `pointerup`, so the press ends before the action it
   * started exists. Releasing there would drop the hold for exactly the window
   * the mutation runs in. `record` re-asserts it synchronously from the click
   * handler with the same content that was on screen when the press began, and
   * the release is deferred a task so the two normally batch into no repaint at
   * all. Either ordering ends with the pre-press view held. */
  const reholdView = () => {
    const view = heldView.current;
    if (view) setFrozen((current) => current ?? view);
  };
  // Only refs and a state setter, so registering this once is safe: nothing it
  // reads is captured from the render that created it.
  const releaseView = useCallback(() => {
    if (!pendingRef.current && !pointerDown.current) setFrozen(null);
  }, []);

  useEffect(() => {
    const onPointerUp = () => { pointerDown.current = false; window.setTimeout(releaseView, 0); };
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") window.setTimeout(releaseView, 0); };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    // A press that ends outside this window never delivers `pointerup` here.
    // Without this the view would stay held for the rest of the session.
    window.addEventListener("blur", onPointerUp);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onPointerUp);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [releaseView]);

  // Focus survives a frozen stretch untouched, because the DOM does not change
  // while it lasts. It only needs help when the row being acted on left the
  // visible set as the deferred update applied: send it to where that row went.
  useEffect(() => {
    if (frozen !== null) return;
    const key = restoreFocusKey.current;
    restoreFocusKey.current = null;
    const active = document.activeElement;
    if (!key || (active && active !== document.body && shellRef.current?.contains(active))) return;
    (checkButtons.current.get(key) ?? moreButton.current ?? manageButton.current)?.focus();
  }, [frozen]);
  /* "No doses scheduled today" is a claim about the data, so it needs a load
   * that succeeded *and* no outstanding failure behind it. A refresh that failed
   * after an empty load leaves us unable to assert emptiness either: the last
   * answer was "none", but we no longer know whether it still holds. */
  const footerLabel = bounded.visibleRows ? "Today’s medicine record"
    : loadFailure !== null ? "Medicine data is unavailable."
    : snapshot === null ? "Loading today’s medicine record…"
    : "No doses scheduled today.";
  useEffect(() => {
    if (!payload) return;
    const maxHeight = Math.max(120, Math.floor((payload.anchor.monitorBottom - payload.anchor.monitorTop) / payload.anchor.scaleFactor - 12));
    const estimate = medicinePanelHeight(bounded.groups.length, bounded.visibleRows, bounded.hiddenRows > 0);
    const current = getCurrentWindow();

    const applyHeight = async (height: number) => {
      const next = { ...payload, height: Math.min(Math.max(120, height), maxHeight) };
      await current.setSize(new LogicalSize(next.width, next.height));
      await current.setPosition(medicinePanelPosition(next));
      return next.height;
    };

    let disposed = false;
    void (async () => {
      const applied = await applyHeight(estimate);
      if (!shown.current) { shown.current = true; await current.show(); await current.setFocus(); }
      // The estimate above is arithmetic; this is the rendered truth. Correct
      // once on the next frame so a wrapped name or a different line-height
      // cannot clip the footer. `scrollHeight` only exceeds the element when
      // content overflows, so this grows to fit and never oscillates.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const shell = shellRef.current;
      if (disposed || !shell) return;
      const measured = Math.ceil(shell.scrollHeight) + 2;
      if (measured > applied + 1) await applyHeight(measured);
    })();

    return () => { disposed = true; };
  }, [bounded.groups.length, bounded.hiddenRows, bounded.visibleRows, payload]);

  const close = useCallback(async () => {
    await emitTo("main", MEDICINE_PANEL_CLOSED_EVENT).catch(() => undefined);
    await getCurrentWindow().close();
  }, []);
  useEffect(() => {
    // Escape closes lightweight popups. Both windows are read-and-record
    // surfaces with no form to cancel first, so the key is unambiguous here.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        void close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const record = async (row: MedicineDailyDoseRow, action: "taken" | "skipped" | "undo") => {
    const key = medicineDoseKey(row.dose);
    if (pendingRef.current) return;
    // Both synchronous, before any await: the deferred release must be able to
    // see that an action now owns the hold.
    pendingRef.current = key;
    reholdView();
    setPendingKey(key);
    try {
      const skip = action === "skipped" || (action === "undo" && row.state === "skipped");
      const command = skip ? "set_medicine_dose_skipped" : "set_medicine_dose_taken";
      const next = await invoke<MedicineSnapshot>(command, { medicineId: row.dose.medicineId, slotDay: row.dose.slotDay, slotTime: row.dose.slotTime, [skip ? "skipped" : "taken"]: action !== "undo" });
      // A mutation returns the authoritative snapshot, so it also clears a
      // stale load failure. It must never clear one it did not resolve.
      setSnapshot(next); setActionError(null); setLoadFailure(null);
    } catch (cause) { setActionError(String(cause)); }
    finally { setPendingKey(null); pendingRef.current = null; releaseView(); }
  };
  const openManager = async () => { await openMedicineManagerWindow(); await close(); };
  /* `+N more` names a specific dose the panel could not show, so it navigates to
   * that dose rather than dropping the user at whatever the manager happened to
   * have selected. The popup closes only once the manager confirms it moved —
   * otherwise the reason is worth more than a closed window. */
  const openOverflow = async () => {
    const target = bounded.hiddenItems[0];
    if (!target) { await openManager(); return; }
    const result = await openMedicineManagerAt({
      treatmentId: target.treatment.id,
      doseKey: medicineDoseKey(target.dose),
    });
    if (result.applied) await close();
    else setActionError(result.reason ?? "Medicine could not be opened at that dose.");
  };

  return <main
    className="medicine-panel"
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") holdView(); }}
    onPointerDown={() => { pointerDown.current = true; holdView(); }}
    ref={shellRef}
    style={panelStyle}
  >
    <button aria-label="Close Medicine panel" className="hub-close-button medicine-panel__close" onClick={() => void close()} type="button"><HubCloseIcon /></button>
    <header className="medicine-panel__toolbar"><strong>Medicine</strong><button aria-label="Manage medicines" onClick={() => void openManager()} ref={manageButton} type="button">Manage medicines</button></header>
    {snapshot?.recoveredFromBackup && <p className="medicine-recovery-notice" role="status">Showing recovered Medicine backup data.</p>}
    {bounded.groups.map((group) => <section aria-labelledby={`medicine-panel-${group.treatment.id}`} key={group.treatment.id}>
      <header><div><strong id={`medicine-panel-${group.treatment.id}`}>{group.treatment.name}</strong><span>Day {group.progress.day} of {group.progress.total}</span></div>
        <div aria-label={`Day ${group.progress.day} of ${group.progress.total}`} aria-valuemax={group.progress.total} aria-valuemin={0} aria-valuenow={group.progress.day} aria-valuetext={`Day ${group.progress.day} of ${group.progress.total}`} className="medicine-panel__progress" role="progressbar"><i style={{ width: `${group.progress.fraction * 100}%` }} /></div></header>
      <ol>{group.rows.map((row) => { const recorded = row.state === "taken" || row.state === "skipped"; const foodRule = medicineFoodRuleLabel(row.medicine.foodRule); const key = medicineDoseKey(row.dose); return <li data-dose-key={key} data-state={row.state} key={key}>
        {/* State is named in text, not carried by the border colour alone:
            Due and Missed are otherwise indistinguishable here. */}
        <time>{row.dose.slotTime}</time><div><strong>{row.medicine.name}{row.medicine.strength || row.medicine.doseAmount ? ` · ${[row.medicine.strength, row.medicine.doseAmount].filter(Boolean).join(" ")}` : ""}</strong><small>{medicineDoseStateLabel(row.state)}{foodRule === "Any time" ? "" : ` · ${foodRule}`}</small></div>
        {!recorded && <button aria-label={`Skip ${row.medicine.name}`} disabled={pendingKey !== null} onClick={() => void record(row, "skipped")} type="button">Skip</button>}
        <button aria-label={`${recorded ? "Undo" : "Take"} ${row.medicine.name}`} className="medicine-panel__check" disabled={pendingKey !== null} onClick={() => void record(row, recorded ? "undo" : "taken")} ref={(element) => { if (element) checkButtons.current.set(key, element); else checkButtons.current.delete(key); }} type="button"><span aria-hidden="true">{row.state === "taken" ? "✓" : row.state === "skipped" ? "–" : ""}</span></button>
      </li>; })}</ol>
      <footer>{group.takenToday} of {group.totalToday} taken today</footer>
    </section>)}
    {bounded.hiddenRows > 0 && <button className="medicine-panel__more" onClick={() => void openOverflow()} ref={moreButton} type="button">+{bounded.hiddenRows} more</button>}
    <footer className="medicine-panel__footer"><span>{footerLabel}</span></footer>
    {/* Loading and recovery are announced politely; a failure the user can act
     * on is an alert. Only a successful, empty load may claim there is nothing
     * scheduled — see `footerLabel`. */}
    {loadFailure && <p className="medicine-panel__error" role="alert">{snapshot
      ? "Medicine data could not be refreshed. These records may be out of date."
      : "Medicine data could not be loaded."}</p>}
    {actionError && <p className="medicine-panel__error" role="alert">{actionError}</p>}
  </main>;
}
