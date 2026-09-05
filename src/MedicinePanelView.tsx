import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState } from "react";
import { HubCloseIcon } from "./HubCloseIcon";
import { openMedicineManagerWindow } from "./medicine-manager-window";
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
  const [error, setError] = useState<string | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let disposed = false;
    const stops: Array<() => void> = [];
    const refresh = async () => {
      try { const next = await invoke<MedicineSnapshot>("get_medicine_snapshot"); if (!disposed) setSnapshot(next); }
      catch (cause) { if (!disposed) setError(String(cause)); }
    };
    void listen("medicine-changed", () => void refresh()).then((stop) => disposed ? stop() : stops.push(stop));
    void listen<MedicinePanelPayload>(MEDICINE_PANEL_OPEN_EVENT, ({ payload: next }) => {
      if (disposed) return;
      setPayload(next); setError(null); void refresh();
    }).then((stop) => { if (disposed) stop(); else { stops.push(stop); void emitTo("main", MEDICINE_PANEL_READY_EVENT); } });
    return () => { disposed = true; stops.forEach((stop) => stop()); };
  }, []);

  const bounded = useMemo(() => boundedMedicinePanelGroups(snapshot ? medicineDailyTreatments(snapshot, now, graceMinutes) : []), [snapshot, now, graceMinutes]);
  useEffect(() => {
    if (!payload) return;
    const naturalHeight = medicinePanelHeight(bounded.groups.length, bounded.visibleRows, bounded.hiddenRows > 0);
    const maxHeight = Math.max(120, Math.floor((payload.anchor.monitorBottom - payload.anchor.monitorTop) / payload.anchor.scaleFactor - 12));
    const next = { ...payload, height: Math.min(naturalHeight, maxHeight) };
    const current = getCurrentWindow();
    void current.setSize(new LogicalSize(next.width, next.height)).then(() => current.setPosition(medicinePanelPosition(next))).then(async () => {
      if (!shown.current) { shown.current = true; await current.show(); await current.setFocus(); }
    });
  }, [bounded.groups.length, bounded.hiddenRows, bounded.visibleRows, payload]);

  const close = async () => {
    await emitTo("main", MEDICINE_PANEL_CLOSED_EVENT).catch(() => undefined);
    await getCurrentWindow().close();
  };
  const record = async (row: MedicineDailyDoseRow, action: "taken" | "skipped" | "undo") => {
    const key = `${row.dose.medicineId}:${row.dose.slotDay}:${row.dose.slotTime}`;
    if (pendingKey) return;
    setPendingKey(key);
    try {
      const skip = action === "skipped" || (action === "undo" && row.state === "skipped");
      const command = skip ? "set_medicine_dose_skipped" : "set_medicine_dose_taken";
      const next = await invoke<MedicineSnapshot>(command, { medicineId: row.dose.medicineId, slotDay: row.dose.slotDay, slotTime: row.dose.slotTime, [skip ? "skipped" : "taken"]: action !== "undo" });
      setSnapshot(next); setError(null);
    } catch (cause) { setError(String(cause)); }
    finally { setPendingKey(null); }
  };
  const openManager = async () => { await openMedicineManagerWindow(); await close(); };

  return <main className="medicine-panel" style={panelStyle}>
    <button aria-label="Close Medicine panel" className="hub-close-button medicine-panel__close" onClick={() => void close()} type="button"><HubCloseIcon /></button>
    <header className="medicine-panel__toolbar"><strong>Medicine</strong><button aria-label="Manage medicines" onClick={() => void openManager()} type="button">Manage medicines</button></header>
    {bounded.groups.map((group) => <section aria-labelledby={`medicine-panel-${group.treatment.id}`} key={group.treatment.id}>
      <header><div><strong id={`medicine-panel-${group.treatment.id}`}>{group.treatment.name}</strong><span>Day {group.progress.day} of {group.progress.total}</span></div>
        <div aria-label={`Day ${group.progress.day} of ${group.progress.total}`} aria-valuemax={group.progress.total} aria-valuemin={0} aria-valuenow={group.progress.day} aria-valuetext={`Day ${group.progress.day} of ${group.progress.total}`} className="medicine-panel__progress" role="progressbar"><i style={{ width: `${group.progress.fraction * 100}%` }} /></div></header>
      <ol>{group.rows.map((row) => { const recorded = row.state === "taken" || row.state === "skipped"; const key = `${row.dose.medicineId}:${row.dose.slotDay}:${row.dose.slotTime}`; return <li data-state={row.state} key={key}>
        <time>{row.dose.slotTime}</time><div><span className="sr-only">{medicineDoseStateLabel(row.state)}: </span><strong>{row.medicine.name}{row.medicine.strength || row.medicine.doseAmount ? ` · ${[row.medicine.strength, row.medicine.doseAmount].filter(Boolean).join(" ")}` : ""}</strong><small>{medicineFoodRuleLabel(row.medicine.foodRule)}</small></div>
        {!recorded && <button aria-label={`Skip ${row.medicine.name}`} disabled={pendingKey !== null} onClick={() => void record(row, "skipped")} type="button">Skip</button>}
        <button aria-label={`${recorded ? "Undo" : "Take"} ${row.medicine.name}`} className="medicine-panel__check" disabled={pendingKey !== null} onClick={() => void record(row, recorded ? "undo" : "taken")} type="button"><span aria-hidden="true">{row.state === "taken" ? "✓" : row.state === "skipped" ? "–" : ""}</span></button>
      </li>; })}</ol>
      <footer>{group.takenToday} of {group.totalToday} taken today</footer>
    </section>)}
    {bounded.hiddenRows > 0 && <button className="medicine-panel__more" onClick={() => void openManager()} type="button">+{bounded.hiddenRows} more</button>}
    <footer className="medicine-panel__footer"><span>{bounded.visibleRows ? "Today’s medicine record" : "No doses scheduled today."}</span></footer>
    {error && <p className="medicine-panel__error" role="status">{error}</p>}
  </main>;
}
