import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { HubCloseIcon } from "./HubCloseIcon";
import { writeStoredFloatingGeometry } from "./event-workspace-window";
import {
  medicineCreateInput, medicineDayPlusDays, medicineEditInput, medicineFoodRuleLabel,
  medicineLocalDay, medicineManagerDoseRows, medicineSchedulePreview, medicineTreatmentGroup,
  medicineTreatmentProgress, sortMedicineEntities, type MedicineDeleteImpact, type MedicineForm,
  reorderMedicineIds, type MedicineDropEdge, type MedicineManagerDoseRow, type MedicineRecord, type MedicineScheduleDraft,
  type MedicineSnapshot, type MedicineTreatment, type MedicineTreatmentGroup,
} from "./medicine-model";
import { linkifyPlainText, MAX_NOTE_CHARACTERS } from "./rich-notes";
import { useMedicineGraceMinutes } from "./use-medicine-grace-minutes";
import { useWidgetPanelStyle } from "./use-widget-panel-style";
import { WIDGET_PREFERENCES_CHANGED_EVENT, normalizeWidgetPreferences, readWidgetPreferences, writeWidgetPreferences, type WidgetPreferences } from "./widget-preferences";

const emptySnapshot: MedicineSnapshot = { revision: 0, treatments: [], medicines: [], doses: [] };
const medicineForms: Array<{ value: MedicineForm; label: string }> = [
  { value: "tablet", label: "Tablet" }, { value: "capsule", label: "Capsule" },
  { value: "drops", label: "Drops" }, { value: "spray", label: "Spray" },
  { value: "syrup", label: "Syrup" }, { value: "injection", label: "Injection" },
  { value: "other", label: "Other" },
];
const weekdayOptions = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const treatmentGroups: Array<{ id: MedicineTreatmentGroup; label: string }> = [
  { id: "active", label: "Active" }, { id: "upcoming", label: "Upcoming" },
  { id: "finished", label: "Finished" }, { id: "archived", label: "Archived" },
];
type ManagerTab = "schedule" | "today" | "notes";
type DeleteTarget = { kind: "treatment" | "medicine"; id: string };
type MedicineActionIconName = "add" | "archive" | "complete" | "delete" | "edit" | "grip" | "remove" | "reopen" | "restore" | "skip" | "take" | "undo";
type DragItem = { kind: "treatment" | "medicine"; id: string; scope: string };
type DropTarget = DragItem & { edge: MedicineDropEdge };

function MedicineActionIcon({ name }: { name: MedicineActionIconName }) {
  if (name === "grip") return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="8" cy="6" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="18" r="1"/><circle cx="16" cy="18" r="1"/></svg>;
  if (name === "add") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "edit") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>;
  if (name === "delete") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5M14 11v5"/></svg>;
  if (name === "archive" || name === "restore") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8h16v12H4zM3 4h18v4H3z"/>{name === "archive" ? <path d="M9 13h6"/> : <path d="M8 14a4 4 0 1 0 1.2-2.85M8 10v4h4"/>}</svg>;
  if (name === "complete") return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>;
  if (name === "reopen" || name === "undo") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v5h5M5 13a8 8 0 1 0 2-6"/></svg>;
  if (name === "take") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>;
  if (name === "skip") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>;
}

function newDraft(startOn = medicineLocalDay(), endOn = medicineDayPlusDays(startOn, 6)): MedicineScheduleDraft {
  return { name: "", strength: "", form: "other", doseAmount: "", foodRule: "any", times: ["08:00"], dayPattern: { kind: "everyDay" }, startOn, endOn, notes: "" };
}
function draftFromMedicine(medicine: MedicineRecord): MedicineScheduleDraft {
  return { name: medicine.name, strength: medicine.strength, form: medicine.form, doseAmount: medicine.doseAmount, foodRule: medicine.foodRule as MedicineScheduleDraft["foodRule"], times: [...medicine.times], dayPattern: medicine.dayPattern.kind === "weekdays" ? { ...medicine.dayPattern, days: [...medicine.dayPattern.days] } : { ...medicine.dayPattern }, startOn: medicine.startOn, endOn: medicine.endOn, notes: medicine.notes.map((segment) => segment.text).join("") };
}
function dateLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function scheduleLabel(medicine: MedicineRecord) {
  if (medicine.dayPattern.kind === "everyNDays") return `Every ${medicine.dayPattern.interval} days`;
  if (medicine.dayPattern.kind === "weekdays") return medicine.dayPattern.days.map((day) => weekdayOptions[day - 1]).join(", ");
  return "Every day";
}
function doseStateLabel(row: MedicineManagerDoseRow) { return row.state[0].toUpperCase() + row.state.slice(1); }
function deleteImpactLabel(impact: MedicineDeleteImpact) {
  const parts = [];
  if (impact.treatments) parts.push(`${impact.treatments} treatment${impact.treatments === 1 ? "" : "s"}`);
  if (impact.medicines) parts.push(`${impact.medicines} medicine${impact.medicines === 1 ? "" : "s"}`);
  if (impact.doses) parts.push(`${impact.doses} dose record${impact.doses === 1 ? "" : "s"}`);
  return parts.join(", ") || "the selected item";
}

function MedicineEditor({ draft, onChange, onSubmit, onCancel, pending, medicine }: { draft: MedicineScheduleDraft; onChange: (draft: MedicineScheduleDraft) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void; pending: boolean; medicine?: MedicineRecord }) {
  const [newTime, setNewTime] = useState("12:00");
  const previewId = useId();
  const preview = medicineSchedulePreview(draft);
  const update = <Key extends keyof MedicineScheduleDraft>(field: Key, value: MedicineScheduleDraft[Key]) => onChange({ ...draft, [field]: value });
  const addTime = () => { if (!draft.times.includes(newTime) && draft.times.length < 12) update("times", [...draft.times, newTime].sort()); };
  return <form aria-describedby={previewId} className="medicine-manager__editor" onSubmit={onSubmit} onKeyDown={(event) => { if (event.key === "Escape" && !pending) { event.preventDefault(); event.stopPropagation(); onCancel(); } }}>
    <h4>{medicine ? "Edit medicine" : "New medicine"}</h4>
    <fieldset className="medicine-manager__fields" disabled={pending}>
      <legend className="sr-only">Medicine details</legend>
      <label className="medicine-manager__field-wide">Medicine name<input autoFocus maxLength={80} onChange={(event) => update("name", event.target.value)} required value={draft.name} /></label>
      <label>Strength or concentration<input maxLength={32} onChange={(event) => update("strength", event.target.value)} placeholder="For example, 500 mg" value={draft.strength} /></label>
      <label>Form<select onChange={(event) => update("form", event.target.value as MedicineForm)} value={draft.form}>{medicineForms.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Dose amount<input maxLength={32} onChange={(event) => update("doseAmount", event.target.value)} placeholder="For example, 1 or 5 ml" value={draft.doseAmount} /></label>
      <label>Food timing<select onChange={(event) => update("foodRule", event.target.value as MedicineScheduleDraft["foodRule"])} value={draft.foodRule}><option value="any">Any time</option><option value="beforeFood">Before food</option><option value="withFood">With food</option><option value="afterFood">After food</option></select></label>
      <fieldset className="medicine-manager__field-wide medicine-manager__times"><legend>Dose times</legend><div className="medicine-manager__time-chips">{draft.times.map((time) => <span key={time}><time>{time}</time><button aria-label={`Remove ${time} dose time`} className="medicine-manager__icon-action" onClick={() => update("times", draft.times.filter((value) => value !== time))} title="Remove time" type="button"><MedicineActionIcon name="remove" /></button></span>)}</div><div className="medicine-manager__add-time"><input aria-label="New dose time" onChange={(event) => setNewTime(event.target.value)} type="time" value={newTime} /><button disabled={draft.times.includes(newTime) || draft.times.length >= 12} onClick={addTime} type="button">Add time</button></div></fieldset>
      <label className="medicine-manager__field-wide">Day pattern<select onChange={(event) => { const kind = event.target.value; update("dayPattern", kind === "everyNDays" ? { kind, interval: 2 } : kind === "weekdays" ? { kind, days: [1, 2, 3, 4, 5] } : { kind: "everyDay" }); }} value={draft.dayPattern.kind}><option value="everyDay">Every day</option><option value="everyNDays">Every N days</option><option value="weekdays">Selected weekdays</option></select></label>
      {draft.dayPattern.kind === "everyNDays" && <label className="medicine-manager__field-wide">Repeat every<span className="medicine-manager__interval"><input max={30} min={2} onChange={(event) => update("dayPattern", { kind: "everyNDays", interval: Number(event.target.value) })} type="number" value={draft.dayPattern.interval} /> days</span></label>}
      {draft.dayPattern.kind === "weekdays" && <fieldset className="medicine-manager__field-wide medicine-manager__weekdays"><legend>Weekdays</legend>{weekdayOptions.map((label, index) => { const day = index + 1; const checked = draft.dayPattern.kind === "weekdays" && draft.dayPattern.days.includes(day); return <label key={label}><input checked={checked} onChange={() => { if (draft.dayPattern.kind !== "weekdays") return; update("dayPattern", { kind: "weekdays", days: checked ? draft.dayPattern.days.filter((value) => value !== day) : [...draft.dayPattern.days, day].sort() }); }} type="checkbox" />{label}</label>; })}</fieldset>}
      <label>Start date<input onChange={(event) => update("startOn", event.target.value)} required type="date" value={draft.startOn} /></label><label>End date<input min={draft.startOn} onChange={(event) => update("endOn", event.target.value)} required type="date" value={draft.endOn} /></label>
      <label className="medicine-manager__field-wide">Medicine notes and links<textarea maxLength={MAX_NOTE_CHARACTERS} onChange={(event) => update("notes", event.target.value)} placeholder="Optional medicine-specific notes" value={draft.notes} /></label>
    </fieldset>
    <p aria-live="polite" className="medicine-manager__preview" data-valid={preview.valid || undefined} id={previewId}>{preview.message}</p><p className="medicine-manager__hint">Changing descriptive details or notes updates how earlier records are described. Create a new medicine for a real regimen change.</p>
    <div className="medicine-manager__form-actions"><button className="medicine-manager__primary" disabled={pending || !preview.valid} type="submit">{pending ? "Saving…" : medicine ? "Save changes" : "Add medicine"}</button><button disabled={pending} onClick={onCancel} type="button">Cancel</button></div>
  </form>;
}

export function MedicineManagerView() {
  const panelStyle = useWidgetPanelStyle();
  const graceMinutes = useMedicineGraceMinutes();
  const [snapshot, setSnapshot] = useState<MedicineSnapshot>(emptySnapshot);
  const [now, setNow] = useState(() => new Date());
  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string | null>(null);
  const [tab, setTab] = useState<ManagerTab>("schedule");
  const [showNewTreatment, setShowNewTreatment] = useState(false);
  const [treatmentName, setTreatmentName] = useState("");
  const [treatmentStart, setTreatmentStart] = useState(medicineLocalDay);
  const [treatmentEnd, setTreatmentEnd] = useState(() => medicineDayPlusDays(medicineLocalDay(), 6));
  const [renamingTreatment, setRenamingTreatment] = useState(false);
  const [editTreatmentName, setEditTreatmentName] = useState("");
  const [showNewMedicine, setShowNewMedicine] = useState(false);
  const [editingMedicineId, setEditingMedicineId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MedicineScheduleDraft>(() => newDraft());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<MedicineDeleteImpact | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteTreatmentId, setNoteTreatmentId] = useState<string | null>(null);
  const [noteBaseline, setNoteBaseline] = useState<number | null>(null);
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteConflict, setNoteConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [showInWidget, setShowInWidget] = useState(() => readWidgetPreferences().showMedicinePanel);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const saving = useRef(false), mounted = useRef(false), noteTextRef = useRef(""), noteSaveSequence = useRef(0);
  const dragItemRef = useRef<DragItem | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const addMedicineButton = useRef<HTMLButtonElement>(null), addTreatmentButton = useRef<HTMLButtonElement>(null), renameButton = useRef<HTMLButtonElement>(null);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const treatmentButtons = useRef(new Map<string, HTMLButtonElement>()), medicineDeleteButtons = useRef(new Map<string, HTMLButtonElement>()), treatmentDeleteButton = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => { try { const next = await invoke<MedicineSnapshot>("get_medicine_snapshot"); if (mounted.current) setSnapshot(next); } catch { if (mounted.current) setError("Medicine data could not be loaded."); } }, []);
  useEffect(() => {
    mounted.current = true; let disposed = false; const cleanups: Array<() => void> = []; const keep = (stop: () => void) => { if (disposed) stop(); else cleanups.push(stop); }; const current = getCurrentWindow();
    void refresh(); void listen("medicine-changed", () => void refresh()).then(keep); void listen<Partial<WidgetPreferences>>(WIDGET_PREFERENCES_CHANGED_EVENT, ({ payload }) => { if (!disposed) setShowInWidget(normalizeWidgetPreferences(payload).showMedicinePanel); }).then(keep);
    void current.onMoved(({ payload }) => writeStoredFloatingGeometry("medicine", payload)).then(keep); void current.onResized(async ({ payload }) => writeStoredFloatingGeometry("medicine", payload.toLogical(await current.scaleFactor()))).then(keep);
    return () => { mounted.current = false; disposed = true; cleanups.forEach((stop) => stop()); };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = medicineLocalDay(now);
  const orderedTreatments = sortMedicineEntities(snapshot.treatments);
  const selected = orderedTreatments.find((item) => item.id === selectedTreatmentId) ?? orderedTreatments[0] ?? null;
  const medicines = sortMedicineEntities(snapshot.medicines.filter((item) => item.treatmentId === selected?.id));
  const doseRows = selected ? medicineManagerDoseRows(snapshot, selected.id, now, graceMinutes) : { today, todayRows: [], recentRows: [] };
  useEffect(() => {
    if (!selected) { setNoteTreatmentId(null); setNoteBaseline(null); setNoteDirty(false); setNoteConflict(false); setNoteText(""); noteTextRef.current = ""; return; }
    const storedText = selected.notes.map((segment) => segment.text).join("");
    if (noteTreatmentId !== selected.id || !noteDirty) { setNoteText(storedText); noteTextRef.current = storedText; setNoteTreatmentId(selected.id); setNoteBaseline(selected.notesRevision); setNoteDirty(false); setNoteConflict(false); } else if (noteBaseline !== selected.notesRevision) setNoteConflict(true);
  }, [noteBaseline, noteDirty, noteTreatmentId, selected]);

  const runMutation = async (command: string, args: Record<string, unknown>, success?: string) => {
    if (saving.current) return null; saving.current = true; setPending(true); setError(""); setStatus("");
    try { const next = await invoke<MedicineSnapshot>(command, args); if (mounted.current) { setSnapshot(next); if (success) setStatus(success); } return next; }
    catch (reason) { if (mounted.current) setError(String(reason)); return null; }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  };
  const closeMedicineEditor = () => { const previousId = editingMedicineId; setShowNewMedicine(false); setEditingMedicineId(null); requestAnimationFrame(() => (previousId ? editButtons.current.get(previousId) : addMedicineButton.current)?.focus()); };
  const closeTreatmentEditor = () => { setShowNewTreatment(false); requestAnimationFrame(() => addTreatmentButton.current?.focus()); };
  const closeRename = () => { setRenamingTreatment(false); requestAnimationFrame(() => renameButton.current?.focus()); };
  const saveTreatment = async (event: FormEvent) => { event.preventDefault(); if (!treatmentName.trim()) return; const next = await runMutation("create_treatment", { input: { name: treatmentName, notes: [], startOn: treatmentStart, endOn: treatmentEnd } }, "Treatment created."); if (next) { setSelectedTreatmentId(next.treatments[next.treatments.length - 1]?.id ?? null); setTreatmentName(""); setShowNewMedicine(false); setEditingMedicineId(null); setRenamingTreatment(false); closeTreatmentEditor(); } };
  const saveMedicine = async (event: FormEvent, medicine?: MedicineRecord) => { event.preventDefault(); if (!selected || !draft.name.trim()) return; const next = medicine ? await runMutation("update_medicine", { medicineId: medicine.id, input: medicineEditInput(medicine, draft) }, "Medicine updated.") : await runMutation("create_medicine", { input: medicineCreateInput(selected.id, draft) }, "Medicine added."); if (next) closeMedicineEditor(); };
  const saveTreatmentName = async (event: FormEvent) => { event.preventDefault(); if (!selected || !editTreatmentName.trim()) return; const next = await runMutation("update_treatment", { treatmentId: selected.id, input: { name: editTreatmentName, startOn: selected.startOn, endOn: selected.endOn } }, "Treatment renamed."); if (next) closeRename(); };
  const selectTreatment = async (id: string) => {
    if (!await saveNotes()) return;
    setSelectedTreatmentId(id); setTab("schedule"); setRenamingTreatment(false); setShowNewMedicine(false); setEditingMedicineId(null); setDeleteTarget(null); setDeleteImpact(null); setError("");
  };
  const updateShowInWidget = (checked: boolean) => { const next = writeWidgetPreferences({ showMedicinePanel: checked }); setShowInWidget(next.showMedicinePanel); void emit(WIDGET_PREFERENCES_CHANGED_EVENT, next); };
  const moveTabFocus = (current: ManagerTab, direction: -1 | 1) => { const tabs: ManagerTab[] = ["schedule", "today", "notes"]; const next = tabs[(tabs.indexOf(current) + direction + tabs.length) % tabs.length]; setTab(next); requestAnimationFrame(() => document.getElementById(`medicine-tab-${next}`)?.focus()); };
  const tabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ManagerTab) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveTabFocus(current, event.key === "ArrowLeft" ? -1 : 1); } };
  const persistTreatmentOrder = async (items: MedicineTreatment[], orderedIds: string[], movedName: string) => {
    if (orderedIds.every((id, index) => id === items[index]?.id)) return;
    await runMutation("reorder_treatments", { orderedIds }, `${movedName} reordered.`);
  };
  const persistMedicineOrder = async (orderedIds: string[], movedName: string) => {
    if (orderedIds.every((id, index) => id === medicines[index]?.id)) return;
    await runMutation("reorder_medicines", { orderedIds }, `${movedName} reordered.`);
  };
  const keyboardReorder = (event: KeyboardEvent<HTMLButtonElement>, kind: DragItem["kind"], items: Array<MedicineTreatment | MedicineRecord>, index: number) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? -1 : 1;
    const item = items[index], target = items[index + direction];
    if (!item || !target) return;
    const orderedIds = reorderMedicineIds(items.map(({ id }) => id), item.id, target.id, direction < 0 ? "before" : "after");
    if (kind === "treatment") void persistTreatmentOrder(items as MedicineTreatment[], orderedIds, item.name);
    else void persistMedicineOrder(orderedIds, item.name);
  };
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, item: DragItem) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragItemRef.current = item;
    setDragItem(item);
    dropTargetRef.current = null;
    setDropTarget(null);
  };
  const clearDrag = () => { dragItemRef.current = null; dropTargetRef.current = null; setDragItem(null); setDropTarget(null); };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragItemRef.current;
    if (!current) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const row = element?.closest<HTMLElement>("[data-reorder-kind]");
    if (!row || row.dataset.reorderKind !== current.kind || row.dataset.reorderScope !== current.scope || row.dataset.reorderId === current.id) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }
    const bounds = row.getBoundingClientRect();
    const edge: MedicineDropEdge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    const target: DropTarget = { kind: current.kind, scope: current.scope, id: row.dataset.reorderId ?? "", edge };
    dropTargetRef.current = target;
    setDropTarget(target);
  };
  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>, items: Array<MedicineTreatment | MedicineRecord>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const current = dragItemRef.current;
    const target = dropTargetRef.current;
    clearDrag();
    if (!current || !target || current.kind !== target.kind || current.scope !== target.scope || !items.some(({ id }) => id === current.id)) return;
    const moved = items.find(({ id }) => id === current.id);
    if (!moved) return;
    const orderedIds = reorderMedicineIds(items.map(({ id }) => id), current.id, target.id, target.edge);
    if (target.kind === "treatment") void persistTreatmentOrder(items as MedicineTreatment[], orderedIds, moved.name);
    else void persistMedicineOrder(orderedIds, moved.name);
  };

  const saveNotes = async (expected = noteBaseline) => {
    if (!selected || expected === null || !noteDirty) return true;
    const treatmentId = selected.id, sentText = noteTextRef.current, sequence = ++noteSaveSequence.current;
    try {
      const next = await invoke<MedicineSnapshot>("save_treatment_notes", { treatmentId, expectedNotesRevision: expected, notes: linkifyPlainText(sentText) });
      if (!mounted.current || sequence !== noteSaveSequence.current) return true;
      setSnapshot(next); const saved = next.treatments.find((item) => item.id === treatmentId); if (!saved) return false;
      setNoteBaseline(saved.notesRevision); setNoteDirty(noteTextRef.current !== sentText); setNoteConflict(false); setError(""); setStatus("Notes saved locally."); return true;
    } catch (reason) {
      if (mounted.current && sequence === noteSaveSequence.current) { const message = String(reason); setNoteConflict(message.includes("notes changed in another window")); setError(message); }
      return false;
    }
  };
  useEffect(() => { if (!noteDirty || noteConflict || !selected) return; const timer = window.setTimeout(() => void saveNotes(), 850); return () => window.clearTimeout(timer); }, [noteConflict, noteDirty, noteText, selected]);
  const loadTheirNotes = () => { if (!selected) return; const value = selected.notes.map((segment) => segment.text).join(""); setNoteText(value); noteTextRef.current = value; setNoteBaseline(selected.notesRevision); setNoteDirty(false); setNoteConflict(false); setError(""); };
  const recordDose = async (row: MedicineManagerDoseRow, action: "taken" | "skipped" | "undo") => { const undoTaken = action === "undo" && row.dose.takenAt !== null; const command = action === "skipped" || (action === "undo" && !undoTaken) ? "set_medicine_dose_skipped" : "set_medicine_dose_taken"; const key = command.includes("skipped") ? "skipped" : "taken"; await runMutation(command, { medicineId: row.dose.medicineId, slotDay: row.dose.slotDay, slotTime: row.dose.slotTime, [key]: action !== "undo" }, `${row.medicine.name}: ${action === "undo" ? "record cleared" : action}.`); };
  const prepareDelete = async (target: DeleteTarget) => { try { const impact = await invoke<MedicineDeleteImpact>("get_medicine_delete_impact", { entity: target.kind, id: target.id }); setDeleteTarget(target); setDeleteImpact(impact); setError(""); requestAnimationFrame(() => document.getElementById("medicine-delete-confirm")?.focus()); } catch (reason) { setError(String(reason)); } };
  const cancelDelete = () => { const target = deleteTarget; setDeleteTarget(null); setDeleteImpact(null); requestAnimationFrame(() => (target?.kind === "medicine" ? medicineDeleteButtons.current.get(target.id) : treatmentDeleteButton.current)?.focus()); };
  const confirmDelete = async () => {
    if (!deleteTarget || !deleteImpact?.id) return; setPending(true); setError(""); const previousTreatmentIndex = orderedTreatments.findIndex((item) => item.id === deleteTarget.id), previousMedicineIndex = medicines.findIndex((item) => item.id === deleteTarget.id);
    try { const command = deleteTarget.kind === "treatment" ? "delete_treatment" : "delete_medicine", idKey = deleteTarget.kind === "treatment" ? "treatmentId" : "medicineId"; const next = await invoke<MedicineSnapshot>(command, { [idKey]: deleteTarget.id, expectedRevision: deleteImpact.medicineRevision }); setSnapshot(next); setDeleteTarget(null); setDeleteImpact(null); setStatus(`${deleteImpact.name ?? "Item"} deleted.`); if (deleteTarget.kind === "treatment") { const remaining = sortMedicineEntities(next.treatments); const adjacent = remaining[Math.min(Math.max(previousTreatmentIndex, 0), remaining.length - 1)]; setSelectedTreatmentId(adjacent?.id ?? null); requestAnimationFrame(() => adjacent && treatmentButtons.current.get(adjacent.id)?.focus()); } else { const remaining = sortMedicineEntities(next.medicines.filter((item) => item.treatmentId === selected?.id)); const adjacent = remaining[Math.min(Math.max(previousMedicineIndex, 0), remaining.length - 1)]; requestAnimationFrame(() => (adjacent ? editButtons.current.get(adjacent.id) : addMedicineButton.current)?.focus()); } }
    catch (reason) { setError(String(reason)); try { setDeleteImpact(await invoke<MedicineDeleteImpact>("get_medicine_delete_impact", { entity: deleteTarget.kind, id: deleteTarget.id })); } catch { setDeleteTarget(null); setDeleteImpact(null); } }
    finally { if (mounted.current) setPending(false); }
  };
  const treatmentRow = (item: MedicineTreatment, items: MedicineTreatment[], index: number, group: MedicineTreatmentGroup) => {
    const progress = medicineTreatmentProgress(item, today);
    const target = dropTarget?.kind === "treatment" && dropTarget.id === item.id ? dropTarget : null;
    return <li className="medicine-manager__treatment-row" data-dragging={dragItem?.kind === "treatment" && dragItem.id === item.id || undefined} data-drop-edge={target?.edge} data-reorder-id={item.id} data-reorder-kind="treatment" data-reorder-scope={group} key={item.id}>
      <button aria-label={`Reorder ${item.name}. Drag, or press Alt plus Up or Down arrow.`} className="medicine-manager__drag-handle" disabled={pending || items.length < 2} onKeyDown={(event) => keyboardReorder(event, "treatment", items, index)} onPointerCancel={clearDrag} onPointerDown={(event) => beginDrag(event, { kind: "treatment", id: item.id, scope: group })} onPointerMove={moveDrag} onPointerUp={(event) => finishDrag(event, items)} title="Drag to reorder; Alt+Up/Down also moves" type="button"><MedicineActionIcon name="grip" /></button>
      <button aria-current={selected?.id === item.id ? "page" : undefined} className="medicine-manager__treatment-select" disabled={pending} onClick={() => void selectTreatment(item.id)} ref={(element) => { if (element) treatmentButtons.current.set(item.id, element); else treatmentButtons.current.delete(item.id); }} type="button"><span>{item.name}</span><small>{dateLabel(item.startOn)} – {dateLabel(item.endOn)}</small><span aria-label={`Day ${progress.day} of ${progress.total}`} aria-valuemax={progress.total} aria-valuenow={progress.day} className="medicine-manager__course-progress" role="progressbar"><i style={{ width: `${progress.fraction * 100}%` }} /></span></button>
    </li>;
  };
  const doseList = (rows: MedicineManagerDoseRow[], recent = false) => <ol className="medicine-manager__doses">{rows.map((row) => {
    const recorded = row.state === "taken" || row.state === "skipped", canUndo = recorded && row.dose.slotDay === doseRows.today;
    return <li data-state={row.state} key={`${row.dose.medicineId}:${row.dose.slotDay}:${row.dose.slotTime}`}><div><time>{recent ? `${dateLabel(row.dose.slotDay)}, ${row.dose.slotTime}` : row.dose.slotTime}</time><span className="medicine-manager__dose-state">{doseStateLabel(row)}</span></div><div><strong>{row.medicine.name}{row.medicine.strength ? ` · ${row.medicine.strength}` : ""}</strong><small>{[row.medicine.doseAmount, medicineFoodRuleLabel(row.medicine.foodRule)].filter(Boolean).join(" · ")}</small></div><div className="medicine-manager__dose-actions">{canUndo ? <button aria-label={`Undo ${row.medicine.name} dose record`} className="medicine-manager__icon-action" disabled={pending} onClick={() => void recordDose(row, "undo")} title="Undo" type="button"><MedicineActionIcon name="undo" /></button> : !recent && !recorded ? <><button aria-label={`Skip ${row.medicine.name} dose`} className="medicine-manager__icon-action" disabled={pending} onClick={() => void recordDose(row, "skipped")} title="Skip" type="button"><MedicineActionIcon name="skip" /></button><button aria-label={`Take ${row.medicine.name} dose`} className="medicine-manager__icon-action medicine-manager__primary" disabled={pending} onClick={() => void recordDose(row, "taken")} title="Take" type="button"><MedicineActionIcon name="take" /></button></> : null}</div></li>;
  })}</ol>;

  const closeManager = async () => { if (await saveNotes()) await getCurrentWindow().close(); };
  return <main className="medicine-manager" style={panelStyle}><header className="medicine-manager__header"><div><h1>Medicine tracker</h1></div><label className="medicine-manager__widget-toggle"><input checked={showInWidget} onChange={(event) => updateShowInWidget(event.target.checked)} type="checkbox" />Show in widget</label><button aria-label="Close Medicine" className="hub-close-button" onClick={() => void closeManager()} type="button"><HubCloseIcon /></button></header><div className="medicine-manager__body">
    <aside aria-label="Treatments"><div className="medicine-manager__aside-heading"><h2>Treatments <span>{snapshot.treatments.length}</span></h2><button aria-expanded={showNewTreatment} aria-label="Add treatment" className="medicine-manager__icon-action medicine-manager__primary" disabled={pending} onClick={() => { setShowNewTreatment(true); setError(""); }} ref={addTreatmentButton} title="Add treatment" type="button"><MedicineActionIcon name="add" /></button></div><div className="medicine-manager__treatment-groups">{treatmentGroups.map((group) => { const items = orderedTreatments.filter((item) => medicineTreatmentGroup(item, today) === group.id); if (!items.length) return null; return <section key={group.id}><h3>{group.label} <span>{items.length}</span></h3><ul>{items.map((item, index) => treatmentRow(item, items, index, group.id))}</ul></section>; })}</div>{showNewTreatment && <form className="medicine-manager__new" onSubmit={(event) => void saveTreatment(event)} onKeyDown={(event) => { if (event.key === "Escape" && !pending) { event.preventDefault(); closeTreatmentEditor(); } }}><h3>New treatment</h3><label>Treatment name<input autoFocus disabled={pending} maxLength={80} onChange={(event) => setTreatmentName(event.target.value)} required value={treatmentName} /></label><label>Start date<input disabled={pending} onChange={(event) => setTreatmentStart(event.target.value)} required type="date" value={treatmentStart} /></label><label>End date<input disabled={pending} min={treatmentStart} onChange={(event) => setTreatmentEnd(event.target.value)} required type="date" value={treatmentEnd} /></label><p className="medicine-manager__hint">Dates adjust when you add medicines.</p><div className="medicine-manager__form-actions"><button className="medicine-manager__primary" disabled={pending || !treatmentName.trim()} type="submit">{pending ? "Saving…" : "Create"}</button><button disabled={pending} onClick={closeTreatmentEditor} type="button">Cancel</button></div></form>}</aside>
    <section aria-label="Selected treatment" className="medicine-manager__detail">{error && <p className="medicine-manager__error" role="alert">{error}</p>}<p aria-live="polite" className="sr-only">{status}</p>{selected ? <><header className="medicine-manager__treatment"><div className="medicine-manager__section-heading"><div><h2>{selected.name}</h2><p className="medicine-manager__range"><span>Course dates</span> {dateLabel(selected.startOn)} – {dateLabel(selected.endOn)}</p></div><div className="medicine-manager__treatment-actions"><button aria-expanded={renamingTreatment} aria-label={`Rename ${selected.name}`} className="medicine-manager__icon-action" disabled={pending} onClick={() => { setEditTreatmentName(selected.name); setRenamingTreatment(true); }} ref={renameButton} title="Rename" type="button"><MedicineActionIcon name="edit" /></button><button aria-label={selected.completedAt ? `Reopen ${selected.name}` : `Complete ${selected.name}`} className="medicine-manager__icon-action" disabled={pending} onClick={() => void runMutation("set_treatment_completed", { treatmentId: selected.id, completed: selected.completedAt === null }, selected.completedAt ? "Treatment reopened." : "Treatment marked complete.")} title={selected.completedAt ? "Reopen" : "Complete"} type="button"><MedicineActionIcon name={selected.completedAt ? "reopen" : "complete"} /></button><button aria-label={selected.archivedAt ? `Restore ${selected.name}` : `Archive ${selected.name}`} className="medicine-manager__icon-action" disabled={pending} onClick={() => void runMutation("set_treatment_archived", { treatmentId: selected.id, archived: selected.archivedAt === null }, selected.archivedAt ? "Treatment restored." : "Treatment archived.")} title={selected.archivedAt ? "Restore" : "Archive"} type="button"><MedicineActionIcon name={selected.archivedAt ? "restore" : "archive"} /></button><button aria-label={`Delete ${selected.name}`} className="medicine-manager__icon-action is-danger" disabled={pending || (selected.completedAt === null && selected.archivedAt === null)} onClick={() => void prepareDelete({ kind: "treatment", id: selected.id })} ref={treatmentDeleteButton} title={selected.completedAt === null && selected.archivedAt === null ? "Complete or archive this treatment before deleting it" : "Delete"} type="button"><MedicineActionIcon name="delete" /></button></div></div><p className="medicine-manager__hint">Course dates come from the earliest start and latest end of your medicines.</p>{renamingTreatment && <form className="medicine-manager__rename" onSubmit={(event) => void saveTreatmentName(event)} onKeyDown={(event) => { if (event.key === "Escape" && !pending) { event.preventDefault(); closeRename(); } }}><label>Treatment name<input autoFocus disabled={pending} maxLength={80} onChange={(event) => setEditTreatmentName(event.target.value)} required value={editTreatmentName} /></label><div className="medicine-manager__form-actions"><button className="medicine-manager__primary" disabled={pending || !editTreatmentName.trim()} type="submit">Save name</button><button disabled={pending} onClick={closeRename} type="button">Cancel</button></div></form>}</header>
      <div aria-label="Treatment sections" className="medicine-manager__tabs" role="tablist">{(["schedule", "today", "notes"] as const).map((item) => <button aria-controls={`medicine-panel-${item}`} aria-selected={tab === item} id={`medicine-tab-${item}`} key={item} onClick={() => setTab(item)} onKeyDown={(event) => tabKeyDown(event, item)} role="tab" tabIndex={tab === item ? 0 : -1} type="button">{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      {tab === "schedule" && <section aria-labelledby="medicine-tab-schedule" className="medicine-manager__tab-panel" id="medicine-panel-schedule" role="tabpanel"><div className="medicine-manager__section-heading"><div><h3>Medicines <span>{medicines.length}</span></h3></div><button aria-expanded={showNewMedicine} aria-label="Add medicine" className="medicine-manager__icon-action medicine-manager__primary" disabled={pending} onClick={() => { setDraft(newDraft(selected.startOn, selected.endOn)); setEditingMedicineId(null); setShowNewMedicine(true); setError(""); }} ref={addMedicineButton} title="Add medicine" type="button"><MedicineActionIcon name="add" /></button></div>{showNewMedicine && <MedicineEditor draft={draft} onChange={setDraft} onSubmit={(event) => void saveMedicine(event)} onCancel={closeMedicineEditor} pending={pending} />}<ul className="medicine-manager__schedule">{medicines.map((item, index) => editingMedicineId === item.id ? <li className="medicine-manager__schedule-editor" key={item.id}><MedicineEditor draft={draft} onChange={setDraft} onSubmit={(event) => void saveMedicine(event, item)} onCancel={closeMedicineEditor} pending={pending} medicine={item} /></li> : <li data-dragging={dragItem?.kind === "medicine" && dragItem.id === item.id || undefined} data-drop-edge={dropTarget?.kind === "medicine" && dropTarget.id === item.id ? dropTarget.edge : undefined} data-reorder-id={item.id} data-reorder-kind="medicine" data-reorder-scope={selected.id} key={item.id}><button aria-label={`Reorder ${item.name}. Drag, or press Alt plus Up or Down arrow.`} className="medicine-manager__drag-handle" disabled={pending || medicines.length < 2} onKeyDown={(event) => keyboardReorder(event, "medicine", medicines, index)} onPointerCancel={clearDrag} onPointerDown={(event) => beginDrag(event, { kind: "medicine", id: item.id, scope: selected.id })} onPointerMove={moveDrag} onPointerUp={(event) => finishDrag(event, medicines)} title="Drag to reorder; Alt+Up/Down also moves" type="button"><MedicineActionIcon name="grip" /></button><div aria-label="Dose times" className="medicine-manager__time">{item.times.map((time) => <time key={time}>{time}</time>)}</div><div><strong className="medicine-manager__medicine-name">{item.name}{item.strength ? ` · ${item.strength}` : ""}</strong><p className="medicine-manager__metadata">{[item.doseAmount, medicineForms.find((option) => option.value === item.form)?.label, scheduleLabel(item), medicineFoodRuleLabel(item.foodRule)].filter(Boolean).join(" · ")}</p><p className="medicine-manager__metadata">{dateLabel(item.startOn)} – {dateLabel(item.endOn)}</p></div><div className="medicine-manager__row-actions"><button aria-label={`Edit ${item.name}`} className="medicine-manager__icon-action" disabled={pending} onClick={() => { setEditingMedicineId(item.id); setShowNewMedicine(false); setDraft(draftFromMedicine(item)); setError(""); }} ref={(element) => { if (element) editButtons.current.set(item.id, element); else editButtons.current.delete(item.id); }} title="Edit" type="button"><MedicineActionIcon name="edit" /></button><button aria-label={`Delete ${item.name}`} className="medicine-manager__icon-action is-danger" disabled={pending} onClick={() => void prepareDelete({ kind: "medicine", id: item.id })} ref={(element) => { if (element) medicineDeleteButtons.current.set(item.id, element); else medicineDeleteButtons.current.delete(item.id); }} title="Delete" type="button"><MedicineActionIcon name="delete" /></button></div></li>)}</ul>{medicines.length === 0 && <p className="medicine-manager__empty">No medicines in this treatment yet. Add a medicine to set its schedule.</p>}</section>}
      {tab === "today" && <section aria-labelledby="medicine-tab-today" className="medicine-manager__tab-panel medicine-manager__today" id="medicine-panel-today" role="tabpanel"><div className="medicine-manager__section-heading"><div><h3>Today</h3><p className="medicine-manager__hint">{dateLabel(doseRows.today)}</p></div><span>{doseRows.todayRows.length} scheduled</span></div>{doseRows.todayRows.length ? doseList(doseRows.todayRows) : <p className="medicine-manager__empty">No doses are scheduled for this treatment today.</p>}<div className="medicine-manager__section-heading medicine-manager__recent-heading"><div><h3>Recent</h3><p className="medicine-manager__hint">Last 20 taken, skipped, or missed doses.</p></div></div>{doseRows.recentRows.length ? doseList(doseRows.recentRows, true) : <p className="medicine-manager__empty">No recorded or missed doses yet.</p>}</section>}
      {tab === "notes" && <section aria-labelledby="medicine-tab-notes" className="medicine-manager__tab-panel medicine-manager__notes" id="medicine-panel-notes" role="tabpanel"><label htmlFor="medicine-treatment-notes">Treatment notes</label><textarea id="medicine-treatment-notes" maxLength={MAX_NOTE_CHARACTERS} onChange={(event) => { noteTextRef.current = event.target.value; setNoteText(event.target.value); setNoteDirty(true); }} placeholder="Treatment notes and links" value={noteText} /><div className="medicine-manager__notes-status"><span>{[...noteText].length} / {MAX_NOTE_CHARACTERS}</span><span>{noteDirty ? "Saving locally…" : "Saved locally."}</span></div>{noteConflict && <div className="medicine-manager__notes-conflict" role="alert"><p>These notes changed in another window. Your text is still here.</p><button autoFocus onClick={() => void saveNotes(selected.notesRevision)} type="button">Keep mine</button><button onClick={loadTheirNotes} type="button">Load theirs</button></div>}</section>}
      {deleteImpact && deleteTarget && <div aria-labelledby="medicine-delete-title" className="medicine-manager__delete-confirm" onKeyDown={(event) => { if (event.key === "Escape" && !pending) { event.preventDefault(); cancelDelete(); } }} role="alert"><h3 id="medicine-delete-title">Delete {deleteImpact.name ?? deleteTarget.kind}?</h3><p>This permanently removes {deleteImpactLabel(deleteImpact)} from local Medicine data.</p><div className="medicine-manager__form-actions"><button className="is-danger" disabled={pending} id="medicine-delete-confirm" onClick={() => void confirmDelete()} type="button">Delete permanently</button><button disabled={pending} onClick={cancelDelete} type="button">Cancel</button></div></div>}
    </> : <div className="medicine-manager__empty"><h2>Your treatments</h2><p>Create a treatment, then add medicines and their scheduled doses.</p></div>}<footer className="medicine-manager__privacy">Stored only on this device, separately from workspace exports. Medicine data is saved as an unencrypted file in your Windows profile.</footer></section>
  </div></main>;
}
