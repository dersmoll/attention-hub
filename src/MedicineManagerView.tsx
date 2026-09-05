import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HubCloseIcon } from "./HubCloseIcon";
import { writeStoredFloatingGeometry } from "./event-workspace-window";
import { medicineFoodRuleLabel } from "./medicine-model";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import { WIDGET_PREFERENCES_CHANGED_EVENT, readWidgetPreferences, writeWidgetPreferences } from "./widget-preferences";

type Treatment = { id: string; name: string; startOn: string; endOn: string; completedAt: string | null; archivedAt: string | null; notesRevision: number };
type Medicine = { id: string; treatmentId: string; name: string; strength: string; doseAmount: string; foodRule: string; times: string[]; startOn: string; endOn: string };
type Dose = { medicineId: string; slotDay: string; slotTime: string; takenAt: string | null; skippedAt: string | null };
type Snapshot = { revision: number; treatments: Treatment[]; medicines: Medicine[]; doses: Dose[] };

function today() { return new Date().toISOString().slice(0, 10); }
function plusDays(day: string, days: number) { const value = new Date(`${day}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); }
const emptySnapshot: Snapshot = { revision: 0, treatments: [], medicines: [], doses: [] };

export function MedicineManagerView() {
  const panelStyle = useWidgetPanelStyle();
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string | null>(null);
  const [treatmentName, setTreatmentName] = useState("");
  const [treatmentStart, setTreatmentStart] = useState(today);
  const [treatmentEnd, setTreatmentEnd] = useState(() => plusDays(today(), 6));
  const [medicineName, setMedicineName] = useState("");
  const [medicineTime, setMedicineTime] = useState("08:00");
  const [medicineFoodRule, setMedicineFoodRule] = useState("any");
  const [medicineStart, setMedicineStart] = useState(today);
  const [medicineEnd, setMedicineEnd] = useState(() => plusDays(today(), 6));
  const [editTreatmentName, setEditTreatmentName] = useState("");
  const [editTreatmentStart, setEditTreatmentStart] = useState("");
  const [editTreatmentEnd, setEditTreatmentEnd] = useState("");
  const [editingMedicineId, setEditingMedicineId] = useState<string | null>(null);
  const [editMedicineName, setEditMedicineName] = useState("");
  const [editMedicineTime, setEditMedicineTime] = useState("08:00");
  const [editMedicineFoodRule, setEditMedicineFoodRule] = useState("any");
  const [editMedicineStart, setEditMedicineStart] = useState("");
  const [editMedicineEnd, setEditMedicineEnd] = useState("");
  const [error, setError] = useState("");
  const [showInWidget, setShowInWidget] = useState(() => readWidgetPreferences().showMedicinePanel);
  const refresh = useCallback(async () => {
    try { setSnapshot(await invoke<Snapshot>("get_medicine_snapshot")); setError(""); }
    catch { setError("Medicine data could not be loaded."); }
  }, []);
  useEffect(() => { void refresh(); const current = getCurrentWindow(); let unlistenChanged: (() => void) | undefined; let unlistenMoved: (() => void) | undefined; let unlistenResized: (() => void) | undefined; void (async () => { unlistenChanged = await listen("medicine-changed", () => void refresh()); unlistenMoved = await current.onMoved(({ payload }) => writeStoredFloatingGeometry("medicine", payload)); unlistenResized = await current.onResized(async ({ payload }) => writeStoredFloatingGeometry("medicine", payload.toLogical(await current.scaleFactor()))); })(); return () => { unlistenChanged?.(); unlistenMoved?.(); unlistenResized?.(); }; }, [refresh]);
  const selected = snapshot.treatments.find((item) => item.id === selectedTreatmentId) ?? snapshot.treatments[0] ?? null;
  const medicines = useMemo(() => snapshot.medicines.filter((item) => item.treatmentId === selected?.id), [snapshot, selected]);
  useEffect(() => { if (selected) { setEditTreatmentName(selected.name); setEditTreatmentStart(selected.startOn); setEditTreatmentEnd(selected.endOn); setMedicineStart(selected.startOn); setMedicineEnd(selected.endOn); } }, [selected]);
  const saveTreatment = async () => { if (!treatmentName.trim()) return; try { const next = await invoke<Snapshot>("create_treatment", { input: { name: treatmentName, notes: [], startOn: treatmentStart, endOn: treatmentEnd } }); const created = next.treatments[next.treatments.length - 1]; setSnapshot(next); setSelectedTreatmentId(created?.id ?? null); setTreatmentName(""); } catch (reason) { setError(String(reason)); } };
  const saveMedicine = async () => { if (!selected || !medicineName.trim()) return; try { await invoke("create_medicine", { input: { treatmentId: selected.id, name: medicineName, strength: "", form: "other", doseAmount: "", foodRule: medicineFoodRule, times: [medicineTime], dayPattern: { kind: "everyDay" }, startOn: medicineStart, endOn: medicineEnd, notes: [] } }); setMedicineName(""); await refresh(); } catch (reason) { setError(String(reason)); } };
  const saveTreatmentChanges = async () => { if (!selected || !editTreatmentName.trim()) return; try { const next = await invoke<Snapshot>("update_treatment", { treatmentId: selected.id, input: { name: editTreatmentName, notes: [], startOn: editTreatmentStart, endOn: editTreatmentEnd } }); setSnapshot(next); setError(""); } catch (reason) { setError(String(reason)); } };
  const beginMedicineEdit = (item: Medicine) => { setEditingMedicineId(item.id); setEditMedicineName(item.name); setEditMedicineTime(item.times[0] ?? "08:00"); setEditMedicineFoodRule(item.foodRule || "any"); setEditMedicineStart(item.startOn); setEditMedicineEnd(item.endOn); };
  const saveMedicineChanges = async (item: Medicine) => { try { const next = await invoke<Snapshot>("update_medicine", { medicineId: item.id, input: { treatmentId: item.treatmentId, name: editMedicineName, strength: item.strength, form: "other", doseAmount: item.doseAmount, foodRule: editMedicineFoodRule, times: [editMedicineTime], dayPattern: { kind: "everyDay" }, startOn: editMedicineStart, endOn: editMedicineEnd, notes: [] } }); setSnapshot(next); setEditingMedicineId(null); setError(""); } catch (reason) { setError(String(reason)); } };
  const updateShowInWidget = (checked: boolean) => { const next = writeWidgetPreferences({ showMedicinePanel: checked }); setShowInWidget(next.showMedicinePanel); void emit(WIDGET_PREFERENCES_CHANGED_EVENT, next); };
  return <main className="medicine-manager" style={panelStyle}>
    <header className="medicine-manager__header">
      <div><p>MEDICINE</p><h1>Medicine tracker</h1></div>
      <label className="medicine-manager__widget-toggle"><input checked={showInWidget} onChange={(event) => updateShowInWidget(event.target.checked)} type="checkbox" /> Show in widget</label>
      <button aria-label="Close Medicine" className="hub-close-button" onClick={() => void getCurrentWindow().close()} type="button"><HubCloseIcon /></button>
    </header>
    <div className="medicine-manager__body">
      <aside>
        <div className="medicine-manager__aside-heading"><p>TREATMENTS</p><span>{snapshot.treatments.length}</span></div>
        <ul>{snapshot.treatments.map((item) => <li key={item.id}><button aria-pressed={selected?.id === item.id} onClick={() => setSelectedTreatmentId(item.id)} type="button"><span>{item.name}</span><small>{item.startOn} – {item.endOn}</small></button></li>)}</ul>
        <div className="medicine-manager__new">
          <p>NEW TREATMENT</p>
          <input aria-label="New treatment name" onChange={(event) => setTreatmentName(event.target.value)} placeholder="Treatment name" value={treatmentName}/>
          <div><input aria-label="Treatment start" onChange={(event) => setTreatmentStart(event.target.value)} type="date" value={treatmentStart}/><input aria-label="Treatment end" min={treatmentStart} onChange={(event) => setTreatmentEnd(event.target.value)} type="date" value={treatmentEnd}/></div>
          <button onClick={() => void saveTreatment()} type="button">Add treatment</button>
        </div>
      </aside>
      <section className="medicine-manager__detail">
        {selected ? <>
          <form className="medicine-manager__treatment" onSubmit={(event) => { event.preventDefault(); void saveTreatmentChanges(); }}>
            <div className="medicine-manager__section-heading"><div><p>TREATMENT DETAILS</p><h2>Course</h2></div><button type="submit">Save name</button></div>
            <label>NAME<input aria-label="Treatment name" onChange={(event) => setEditTreatmentName(event.target.value)} value={editTreatmentName}/></label>
            <div className="medicine-manager__range"><span>COURSE RANGE</span><strong>{selected.startOn} – {selected.endOn}</strong></div>
            <p className="medicine-manager__hint">The course range is calculated from the earliest and latest medicine dates.</p>
          </form>
          {error && <p className="medicine-manager__error" role="alert">{error}</p>}
          <div className="medicine-manager__section-heading medicine-manager__schedule-heading"><div><p>SCHEDULE</p><h2>Medicines</h2></div><span>{medicines.length}</span></div>
          <ul className="medicine-manager__schedule">{medicines.map((item) => editingMedicineId === item.id ? <li className="medicine-manager__schedule-editor" key={item.id}>
            <label>MEDICINE<input aria-label="Medicine name" onChange={(event) => setEditMedicineName(event.target.value)} value={editMedicineName}/></label>
            <label>TIME<input aria-label="Dose time" onChange={(event) => setEditMedicineTime(event.target.value)} type="time" value={editMedicineTime}/></label>
            <label>FOOD<select aria-label="Food timing" onChange={(event) => setEditMedicineFoodRule(event.target.value)} value={editMedicineFoodRule}><option value="any">Any time</option><option value="beforeFood">Before food</option><option value="withFood">With food</option><option value="afterFood">After food</option></select></label>
            <label>START<input aria-label="Medicine start" onChange={(event) => setEditMedicineStart(event.target.value)} type="date" value={editMedicineStart}/></label>
            <label>END<input aria-label="Medicine end" min={editMedicineStart} onChange={(event) => setEditMedicineEnd(event.target.value)} type="date" value={editMedicineEnd}/></label>
            <div className="medicine-manager__row-actions"><button onClick={() => void saveMedicineChanges(item)} type="button">Save</button><button onClick={() => setEditingMedicineId(null)} type="button">Cancel</button></div>
          </li> : <li key={item.id}><time>{item.times.join(", ")}</time><div><span>{item.name}</span><small>{medicineFoodRuleLabel(item.foodRule)} · {item.startOn} – {item.endOn}</small></div><button onClick={() => beginMedicineEdit(item)} type="button">Edit</button></li>)}</ul>
          <div className="medicine-manager__create"><p>ADD MEDICINE</p><input aria-label="Medicine name" onChange={(event) => setMedicineName(event.target.value)} placeholder="Medicine name" value={medicineName}/><input aria-label="Dose time" onChange={(event) => setMedicineTime(event.target.value)} type="time" value={medicineTime}/><select aria-label="Food timing" onChange={(event) => setMedicineFoodRule(event.target.value)} value={medicineFoodRule}><option value="any">Any time</option><option value="beforeFood">Before food</option><option value="withFood">With food</option><option value="afterFood">After food</option></select><input aria-label="Medicine start" onChange={(event) => setMedicineStart(event.target.value)} type="date" value={medicineStart}/><input aria-label="Medicine end" min={medicineStart} onChange={(event) => setMedicineEnd(event.target.value)} type="date" value={medicineEnd}/><button onClick={() => void saveMedicine()} type="button">Add medicine</button></div>
          <p className="medicine-manager__privacy">Medicine data is stored locally as plaintext JSON under your Windows user profile. It is not included in workspace export.</p>
        </> : <p className="medicine-manager__empty">Create a finite treatment course to add medicines and scheduled doses.</p>}
        {!selected && error && <p className="medicine-manager__error" role="alert">{error}</p>}
      </section>
    </div>
  </main>;
}
