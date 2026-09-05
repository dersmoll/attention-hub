use crate::{external_url, local_store, workspace, workspace::NoteSegment};
use chrono::{
    DateTime, Datelike, Duration, Local, LocalResult, NaiveDate, NaiveTime, SecondsFormat,
    TimeZone, Utc,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const MAX_TREATMENTS: usize = 100;
const MAX_MEDICINES: usize = 500;
const MAX_MEDICINES_PER_TREATMENT: usize = 30;
const MAX_OCCURRENCES_PER_MEDICINE: usize = 2_000;
const MAX_OCCURRENCES_PER_TREATMENT: usize = 4_000;
const MAX_OCCURRENCES: usize = 10_000;
const MAX_TREATMENT_DAYS: i64 = 365;
const STALE_DELETE: &str =
    "Medicine data changed since this confirmation was shown. Review the impact and confirm again.";

pub struct MedicineState {
    gate: Mutex<()>,
}
impl MedicineState {
    pub fn new() -> Self {
        Self {
            gate: Mutex::new(()),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Treatment {
    pub id: String,
    pub name: String,
    pub notes: Vec<NoteSegment>,
    #[serde(default)]
    pub notes_revision: u64,
    pub start_on: String,
    pub end_on: String,
    pub completed_at: Option<String>,
    pub archived_at: Option<String>,
    pub sort_index: i32,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Medicine {
    pub id: String,
    pub treatment_id: String,
    pub name: String,
    pub strength: String,
    pub form: String,
    pub dose_amount: String,
    pub food_rule: String,
    pub times: Vec<String>,
    pub day_pattern: DayPattern,
    pub start_on: String,
    pub end_on: String,
    pub schedule_revision: u64,
    pub notes: Vec<NoteSegment>,
    pub sort_index: i32,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum DayPattern {
    EveryDay,
    EveryNDays { interval: u32 },
    Weekdays { days: Vec<u32> },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dose {
    pub medicine_id: String,
    pub slot_day: String,
    pub slot_time: String,
    pub schedule_revision: u64,
    pub taken_at: Option<String>,
    pub skipped_at: Option<String>,
    pub notified_at: Option<String>,
    pub updated_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Store {
    schema_version: u32,
    revision: u64,
    treatments: Vec<Treatment>,
    medicines: Vec<Medicine>,
    doses: Vec<Dose>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicineSnapshot {
    pub schema_version: u32,
    pub revision: u64,
    pub captured_at: String,
    pub storage_path: String,
    pub recovered_from_backup: bool,
    pub treatments: Vec<Treatment>,
    pub medicines: Vec<Medicine>,
    pub doses: Vec<Dose>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicineDeleteImpact {
    pub entity: String,
    pub id: Option<String>,
    pub name: Option<String>,
    pub treatments: usize,
    pub medicines: usize,
    pub doses: usize,
    pub medicine_revision: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreatmentInput {
    pub name: String,
    #[serde(default)]
    pub notes: Vec<NoteSegment>,
    pub start_on: String,
    pub end_on: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicineInput {
    pub treatment_id: String,
    pub name: String,
    pub strength: String,
    pub form: String,
    pub dose_amount: String,
    pub food_rule: String,
    pub times: Vec<String>,
    pub day_pattern: DayPattern,
    pub start_on: String,
    pub end_on: String,
    #[serde(default)]
    pub notes: Vec<NoteSegment>,
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
fn id() -> String {
    Uuid::new_v4().simple().to_string()
}
fn empty() -> Store {
    Store {
        schema_version: SCHEMA_VERSION,
        revision: 0,
        treatments: vec![],
        medicines: vec![],
        doses: vec![],
    }
}
fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("medicine.json"))
        .map_err(|_| "Attention Hub could not resolve its local medicine directory.".into())
}
fn lock(state: &MedicineState) -> Result<MutexGuard<'_, ()>, String> {
    state
        .gate
        .lock()
        .map_err(|_| "Medicine storage is temporarily unavailable.".into())
}
fn date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}
fn time(value: &str) -> bool {
    NaiveTime::parse_from_str(value, "%H:%M").is_ok()
}
fn range_days(start_on: &str, end_on: &str) -> Option<i64> {
    let start = NaiveDate::parse_from_str(start_on, "%Y-%m-%d").ok()?;
    let end = NaiveDate::parse_from_str(end_on, "%Y-%m-%d").ok()?;
    Some((end - start).num_days() + 1)
}
/// Resolve a civil `(slot_day, slot_time)` to an instant in `zone`.
///
/// Storage, generation, identity and ordering stay civil; only elapsed-time
/// questions (`due` vs `missed`, the grace window, the schedule-edit cutoff)
/// need an instant. The three policies, which the TypeScript resolver in
/// `medicine-model.ts` mirrors exactly:
///
/// * ambiguous repeated time (fall back) resolves to the **earlier** offset;
/// * nonexistent skipped time (spring forward) resolves to the **first valid
///   instant after the gap**, so every skipped time collapses to the boundary
///   (02:30 becomes 03:00 when 02:00-02:59 does not exist);
/// * the caller passes the **current** zone, so a future slot keeps its
///   wall-clock time after the user travels.
///
/// Collapsing is what preserves the non-decreasing-order invariant that
/// `dose_is_frozen` and the grace window depend on: 01:59 < skipped hour =
/// 03:00 <= later valid slots. Preserving the minutes and shifting by the gap
/// width instead would order 02:30 after a 03:00 slot scheduled later.
fn resolve_slot_in<Tz: TimeZone>(
    zone: &Tz,
    slot_day: &str,
    slot_time: &str,
) -> Option<DateTime<Utc>> {
    let day = NaiveDate::parse_from_str(slot_day, "%Y-%m-%d").ok()?;
    let time = NaiveTime::parse_from_str(slot_time, "%H:%M").ok()?;
    let local = day.and_time(time);
    for minutes_after_slot in 0..=180 {
        let candidate = local.checked_add_signed(Duration::minutes(minutes_after_slot))?;
        match zone.from_local_datetime(&candidate) {
            LocalResult::Single(value) => return Some(value.with_timezone(&Utc)),
            LocalResult::Ambiguous(earlier, _) => return Some(earlier.with_timezone(&Utc)),
            LocalResult::None => continue,
        }
    }
    None
}
fn resolve_slot(slot_day: &str, slot_time: &str) -> Option<DateTime<Utc>> {
    resolve_slot_in(&Local, slot_day, slot_time)
}
fn dose_is_frozen(dose: &Dose, at: DateTime<Utc>) -> bool {
    dose.taken_at.is_some()
        || dose.skipped_at.is_some()
        || dose.notified_at.is_some()
        || resolve_slot(&dose.slot_day, &dose.slot_time).is_some_and(|slot| slot <= at)
}
fn ensure_revision(store: &Store, expected_revision: u64) -> Result<(), String> {
    (store.revision == expected_revision)
        .then_some(())
        .ok_or_else(|| STALE_DELETE.to_owned())
}
fn valid(store: &Store) -> bool {
    if store.schema_version != SCHEMA_VERSION
        || store.treatments.len() > MAX_TREATMENTS
        || store.medicines.len() > MAX_MEDICINES
        || store.doses.len() > MAX_OCCURRENCES
    {
        return false;
    }
    let unique = |values: Vec<&str>| values.iter().collect::<HashSet<_>>().len() == values.len();
    let dose_keys = store
        .doses
        .iter()
        .map(|v| format!("{}:{}:{}", v.medicine_id, v.slot_day, v.slot_time))
        .collect::<Vec<_>>();
    unique(store.treatments.iter().map(|v| v.id.as_str()).collect())
        && unique(store.medicines.iter().map(|v| v.id.as_str()).collect())
        && unique(dose_keys.iter().map(String::as_str).collect())
        && store.treatments.iter().all(valid_treatment)
        && store.treatments.iter().all(|treatment| {
            store
                .medicines
                .iter()
                .filter(|medicine| medicine.treatment_id == treatment.id)
                .count()
                <= MAX_MEDICINES_PER_TREATMENT
        })
        && store.medicines.iter().all(|m| valid_medicine(store, m))
        && store.medicines.iter().all(|medicine| {
            store
                .doses
                .iter()
                .filter(|dose| dose.medicine_id == medicine.id)
                .count()
                <= MAX_OCCURRENCES_PER_MEDICINE
        })
        && store.treatments.iter().all(|treatment| {
            let medicine_ids = store
                .medicines
                .iter()
                .filter(|medicine| medicine.treatment_id == treatment.id)
                .map(|medicine| medicine.id.as_str())
                .collect::<HashSet<_>>();
            store
                .doses
                .iter()
                .filter(|dose| medicine_ids.contains(dose.medicine_id.as_str()))
                .count()
                <= MAX_OCCURRENCES_PER_TREATMENT
        })
        && store.doses.iter().all(|d| valid_dose(store, d))
}
fn valid_treatment(v: &Treatment) -> bool {
    !v.name.trim().is_empty()
        && v.name.chars().count() <= 80
        && date(&v.start_on)
        && date(&v.end_on)
        && v.start_on <= v.end_on
        && range_days(&v.start_on, &v.end_on).is_some_and(|days| days <= MAX_TREATMENT_DAYS)
}
fn valid_medicine(store: &Store, v: &Medicine) -> bool {
    if !store.treatments.iter().any(|t| t.id == v.treatment_id) {
        return false;
    }
    !v.name.trim().is_empty()
        && v.name.chars().count() <= 80
        && v.strength.chars().count() <= 32
        && v.dose_amount.chars().count() <= 32
        && matches!(
            v.form.as_str(),
            "tablet" | "capsule" | "drops" | "spray" | "syrup" | "injection" | "other"
        )
        && matches!(
            v.food_rule.as_str(),
            "any" | "beforeFood" | "withFood" | "afterFood"
        )
        && date(&v.start_on)
        && date(&v.end_on)
        && v.start_on <= v.end_on
        && range_days(&v.start_on, &v.end_on).is_some_and(|days| days <= MAX_TREATMENT_DAYS)
        && !v.times.is_empty()
        && v.times.len() <= 12
        && v.times.iter().all(|x| time(x))
        && {
            let set: HashSet<_> = v.times.iter().collect();
            set.len() == v.times.len()
        }
        && match &v.day_pattern {
            DayPattern::EveryDay => true,
            DayPattern::EveryNDays { interval } => (2..=30).contains(interval),
            DayPattern::Weekdays { days } => {
                !days.is_empty()
                    && days.iter().all(|d| (1..=7).contains(d))
                    && days.iter().collect::<HashSet<_>>().len() == days.len()
            }
        }
}
fn sync_treatment_range(store: &mut Store, treatment_id: &str) {
    let mut medicines = store
        .medicines
        .iter()
        .filter(|medicine| medicine.treatment_id == treatment_id);
    let Some(first) = medicines.next() else {
        return;
    };
    let (mut start_on, mut end_on) = (first.start_on.clone(), first.end_on.clone());
    for medicine in medicines {
        if medicine.start_on < start_on {
            start_on = medicine.start_on.clone();
        }
        if medicine.end_on > end_on {
            end_on = medicine.end_on.clone();
        }
    }
    if let Some(treatment) = store.treatments.iter_mut().find(|t| t.id == treatment_id) {
        treatment.start_on = start_on;
        treatment.end_on = end_on;
        treatment.updated_at = now();
    }
}
fn valid_dose(store: &Store, v: &Dose) -> bool {
    store.medicines.iter().any(|m| m.id == v.medicine_id)
        && date(&v.slot_day)
        && time(&v.slot_time)
        && !(v.taken_at.is_some() && v.skipped_at.is_some())
}
fn load(app: &AppHandle) -> Result<(PathBuf, Store, bool), String> {
    let p = path(app)?;
    match local_store::read(&p, SCHEMA_VERSION, valid) {
        Ok(Some(v)) => Ok((p, v.store, v.recovered_from_backup)),
        Ok(None) => Ok((p, empty(), false)),
        Err(local_store::ReadError::FutureVersion(v)) => Err(format!(
            "Medicine uses newer schema version {v}; this build will not overwrite it."
        )),
        Err(_) => {
            Err("Medicine data could not be read, and no valid local backup is available.".into())
        }
    }
}
fn snapshot(path: PathBuf, store: Store, recovered: bool) -> MedicineSnapshot {
    MedicineSnapshot {
        schema_version: SCHEMA_VERSION,
        revision: store.revision,
        captured_at: now(),
        storage_path: path.to_string_lossy().into_owned(),
        recovered_from_backup: recovered,
        treatments: store.treatments,
        medicines: store.medicines,
        doses: store.doses,
    }
}
fn mutate<F>(
    app: &AppHandle,
    state: &MedicineState,
    preserve: bool,
    action: F,
) -> Result<MedicineSnapshot, String>
where
    F: FnOnce(&mut Store) -> Result<(), String>,
{
    let _guard = lock(state)?;
    let (p, mut store, recovered) = load(app)?;
    action(&mut store)?;
    if !valid(&store) {
        return Err("Medicine data failed validation before saving.".into());
    }
    store.revision = store
        .revision
        .checked_add(1)
        .ok_or("Medicine revision has reached its supported limit.")?;
    local_store::write(&p, &store, preserve, recovered, "Medicine")?;
    Ok(snapshot(p, store, false))
}
pub fn get_snapshot(app: &AppHandle, state: &MedicineState) -> Result<MedicineSnapshot, String> {
    let _guard = lock(state)?;
    let (p, store, recovered) = load(app)?;
    Ok(snapshot(p, store, recovered))
}
fn treatment_input(
    input: TreatmentInput,
) -> Result<(String, String, String, Vec<NoteSegment>), String> {
    let name = input.name.trim().to_owned();
    if name.is_empty()
        || name.chars().count() > 80
        || !date(&input.start_on)
        || !date(&input.end_on)
        || input.start_on > input.end_on
        || range_days(&input.start_on, &input.end_on).is_none_or(|days| days > MAX_TREATMENT_DAYS)
    {
        return Err("Treatment details are invalid.".into());
    }
    Ok((
        name,
        input.start_on,
        input.end_on,
        workspace::normalize_notes(input.notes)?,
    ))
}

pub fn move_treatment(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    other_treatment_id: &str,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        swap_treatment_order(store, treatment_id, other_treatment_id, now())
    })
}

pub fn reorder_treatments(
    app: &AppHandle,
    state: &MedicineState,
    ordered_ids: Vec<String>,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        reorder_treatment_subset(store, &ordered_ids, now())
    })
}

fn reorder_treatment_subset(
    store: &mut Store,
    ordered_ids: &[String],
    timestamp: String,
) -> Result<(), String> {
    let unique = ordered_ids.iter().collect::<HashSet<_>>();
    if ordered_ids.len() < 2 || unique.len() != ordered_ids.len() {
        return Err("Treatment order is invalid.".into());
    }
    if ordered_ids
        .iter()
        .any(|id| !store.treatments.iter().any(|treatment| treatment.id == *id))
    {
        return Err("The selected treatment no longer exists.".into());
    }
    let requested = ordered_ids.iter().collect::<HashSet<_>>();
    let mut all_ids = store.treatments.iter().collect::<Vec<_>>();
    all_ids.sort_by(|left, right| {
        left.sort_index
            .cmp(&right.sort_index)
            .then_with(|| left.id.cmp(&right.id))
    });
    let subset_positions = all_ids
        .iter()
        .enumerate()
        .filter_map(|(index, treatment)| requested.contains(&treatment.id).then_some(index))
        .collect::<Vec<_>>();
    let mut normalized_ids = all_ids
        .iter()
        .map(|treatment| treatment.id.clone())
        .collect::<Vec<_>>();
    for (position, id) in subset_positions.into_iter().zip(ordered_ids) {
        normalized_ids[position] = id.clone();
    }
    for (sort_index, id) in normalized_ids.into_iter().enumerate() {
        let treatment = store
            .treatments
            .iter_mut()
            .find(|treatment| treatment.id == id)
            .ok_or("The selected treatment no longer exists.")?;
        if treatment.sort_index != sort_index as i32 {
            treatment.sort_index = sort_index as i32;
            treatment.updated_at = timestamp.clone();
        }
    }
    Ok(())
}

fn swap_treatment_order(
    store: &mut Store,
    treatment_id: &str,
    other_treatment_id: &str,
    timestamp: String,
) -> Result<(), String> {
    let current = store
        .treatments
        .iter()
        .position(|treatment| treatment.id == treatment_id)
        .ok_or("The selected treatment no longer exists.")?;
    let other = store
        .treatments
        .iter()
        .position(|treatment| treatment.id == other_treatment_id)
        .ok_or("The treatment to swap with no longer exists.")?;
    if current == other {
        return Ok(());
    }
    let current_sort_index = store.treatments[current].sort_index;
    let other_sort_index = store.treatments[other].sort_index;
    store.treatments[current].sort_index = other_sort_index;
    store.treatments[current].updated_at = timestamp.clone();
    store.treatments[other].sort_index = current_sort_index;
    store.treatments[other].updated_at = timestamp;
    Ok(())
}
pub fn create_treatment(
    app: &AppHandle,
    state: &MedicineState,
    input: TreatmentInput,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |s| {
        if s.treatments.len() >= MAX_TREATMENTS {
            return Err("Medicine supports at most 100 treatments.".into());
        }
        let (name, start_on, end_on, notes) = treatment_input(input)?;
        let timestamp = now();
        s.treatments.push(Treatment {
            id: id(),
            name,
            notes,
            notes_revision: 0,
            start_on,
            end_on,
            completed_at: None,
            archived_at: None,
            sort_index: s
                .treatments
                .iter()
                .map(|treatment| treatment.sort_index)
                .max()
                .unwrap_or(-1)
                + 1,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        });
        Ok(())
    })
}
pub fn update_treatment(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    input: TreatmentInput,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        update_treatment_details(store, treatment_id, input)
    })
}
fn update_treatment_details(
    store: &mut Store,
    treatment_id: &str,
    input: TreatmentInput,
) -> Result<(), String> {
    let (name, start_on, end_on, _) = treatment_input(input)?;
    let treatment = store
        .treatments
        .iter_mut()
        .find(|treatment| treatment.id == treatment_id)
        .ok_or("The selected treatment no longer exists.")?;
    treatment.name = name;
    treatment.start_on = start_on;
    treatment.end_on = end_on;
    // Existing notes can only change through the revision-guarded notes command.
    treatment.updated_at = now();
    sync_treatment_range(store, treatment_id);
    Ok(())
}
fn covers(m: &Medicine, day: NaiveDate) -> bool {
    let start = NaiveDate::parse_from_str(&m.start_on, "%Y-%m-%d").unwrap();
    let end = NaiveDate::parse_from_str(&m.end_on, "%Y-%m-%d").unwrap();
    if day < start || day > end {
        return false;
    };
    match &m.day_pattern {
        DayPattern::EveryDay => true,
        DayPattern::EveryNDays { interval } => {
            ((day - start).num_days() as u32).is_multiple_of(*interval)
        }
        DayPattern::Weekdays { days } => days.contains(&day.weekday().number_from_monday()),
    }
}
fn generate(m: &Medicine) -> Vec<Dose> {
    let start = NaiveDate::parse_from_str(&m.start_on, "%Y-%m-%d").unwrap();
    let end = NaiveDate::parse_from_str(&m.end_on, "%Y-%m-%d").unwrap();
    let mut out = vec![];
    let mut day = start;
    while day <= end {
        if covers(m, day) {
            for slot_time in &m.times {
                out.push(Dose {
                    medicine_id: m.id.clone(),
                    slot_day: day.format("%Y-%m-%d").to_string(),
                    slot_time: slot_time.clone(),
                    schedule_revision: m.schedule_revision,
                    taken_at: None,
                    skipped_at: None,
                    notified_at: None,
                    updated_at: now(),
                });
            }
        }
        day = day.succ_opt().unwrap();
    }
    out
}
fn normalize_medicine_input(mut input: MedicineInput) -> Result<MedicineInput, String> {
    input.times.sort();
    if let DayPattern::Weekdays { days } = &mut input.day_pattern {
        days.sort();
    }
    input.notes = workspace::normalize_notes(input.notes)?;
    Ok(input)
}
fn validate_medicine_input(s: &Store, input: &MedicineInput) -> Result<(), String> {
    let probe = Medicine {
        id: "probe".into(),
        treatment_id: input.treatment_id.clone(),
        name: input.name.trim().into(),
        strength: input.strength.trim().into(),
        form: input.form.clone(),
        dose_amount: input.dose_amount.trim().into(),
        food_rule: input.food_rule.clone(),
        times: input.times.clone(),
        day_pattern: input.day_pattern.clone(),
        start_on: input.start_on.clone(),
        end_on: input.end_on.clone(),
        schedule_revision: 1,
        notes: input.notes.clone(),
        sort_index: 0,
        created_at: now(),
        updated_at: now(),
    };
    if !valid_medicine(s, &probe) {
        return Err("Medicine schedule or treatment range is invalid.".into());
    }
    Ok(())
}
pub fn create_medicine(
    app: &AppHandle,
    state: &MedicineState,
    input: MedicineInput,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |s| {
        let input = normalize_medicine_input(input)?;
        if s.medicines.len() >= MAX_MEDICINES {
            return Err("Medicine supports at most 500 medicine entries.".into());
        }
        if s.medicines
            .iter()
            .filter(|medicine| medicine.treatment_id == input.treatment_id)
            .count()
            >= MAX_MEDICINES_PER_TREATMENT
        {
            return Err("A treatment supports at most 30 medicines.".into());
        }
        validate_medicine_input(s, &input)?;
        let treatment_id = input.treatment_id.clone();
        let sort_index = s
            .medicines
            .iter()
            .filter(|medicine| medicine.treatment_id == treatment_id)
            .map(|medicine| medicine.sort_index)
            .max()
            .unwrap_or(-1)
            + 1;
        let ts = now();
        let medicine = Medicine {
            id: id(),
            treatment_id: input.treatment_id,
            name: input.name.trim().into(),
            strength: input.strength.trim().into(),
            form: input.form,
            dose_amount: input.dose_amount.trim().into(),
            food_rule: input.food_rule,
            times: input.times,
            day_pattern: input.day_pattern,
            start_on: input.start_on,
            end_on: input.end_on,
            schedule_revision: 1,
            notes: input.notes,
            sort_index,
            created_at: ts.clone(),
            updated_at: ts,
        };
        let doses = generate(&medicine);
        if doses.len() > MAX_OCCURRENCES_PER_MEDICINE {
            return Err("A medicine supports at most 2,000 planned doses.".into());
        }
        let treatment_occurrences = s
            .medicines
            .iter()
            .filter(|item| item.treatment_id == treatment_id)
            .map(|item| {
                s.doses
                    .iter()
                    .filter(|dose| dose.medicine_id == item.id)
                    .count()
            })
            .sum::<usize>();
        if treatment_occurrences + doses.len() > MAX_OCCURRENCES_PER_TREATMENT {
            return Err("A treatment supports at most 4,000 planned doses.".into());
        }
        if s.doses.len() + doses.len() > MAX_OCCURRENCES {
            return Err("Medicine has reached its 10,000 occurrence limit.".into());
        }
        s.medicines.push(medicine);
        s.doses.extend(doses);
        sync_treatment_range(s, &treatment_id);
        Ok(())
    })
}
pub fn update_medicine(
    app: &AppHandle,
    state: &MedicineState,
    medicine_id: &str,
    input: MedicineInput,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        apply_medicine_update(store, medicine_id, input, Utc::now(), now())
    })
}

fn apply_medicine_update(
    store: &mut Store,
    medicine_id: &str,
    input: MedicineInput,
    edit_at: DateTime<Utc>,
    timestamp: String,
) -> Result<(), String> {
    let input = normalize_medicine_input(input)?;
    validate_medicine_input(store, &input)?;
    let index = store
        .medicines
        .iter()
        .position(|medicine| medicine.id == medicine_id)
        .ok_or("The selected medicine no longer exists.")?;
    let previous = store.medicines[index].clone();
    let medicines_in_target = store
        .medicines
        .iter()
        .filter(|medicine| {
            medicine.treatment_id == input.treatment_id && medicine.id != previous.id
        })
        .count();
    if medicines_in_target >= MAX_MEDICINES_PER_TREATMENT {
        return Err("A treatment supports at most 30 medicines.".into());
    }
    let next_treatment_id = input.treatment_id.clone();
    let schedule_changed = previous.treatment_id != input.treatment_id
        || previous.times != input.times
        || previous.day_pattern != input.day_pattern
        || previous.start_on != input.start_on
        || previous.end_on != input.end_on;
    let mut next = Medicine {
        id: previous.id.clone(),
        treatment_id: input.treatment_id,
        name: input.name.trim().into(),
        strength: input.strength.trim().into(),
        form: input.form,
        dose_amount: input.dose_amount.trim().into(),
        food_rule: input.food_rule,
        times: input.times,
        day_pattern: input.day_pattern,
        start_on: input.start_on,
        end_on: input.end_on,
        schedule_revision: previous.schedule_revision,
        notes: input.notes,
        sort_index: previous.sort_index,
        created_at: previous.created_at,
        updated_at: timestamp,
    };
    if !schedule_changed {
        store.medicines[index] = next;
        sync_treatment_range(store, &previous.treatment_id);
        return Ok(());
    }
    next.schedule_revision = previous
        .schedule_revision
        .checked_add(1)
        .ok_or("Medicine schedule revision has reached its supported limit.")?;
    let frozen_keys = store
        .doses
        .iter()
        .filter(|dose| dose.medicine_id == previous.id && dose_is_frozen(dose, edit_at))
        .map(|dose| format!("{}:{}", dose.slot_day, dose.slot_time))
        .collect::<HashSet<_>>();
    let generated = generate(&next)
        .into_iter()
        .filter(|dose| {
            resolve_slot(&dose.slot_day, &dose.slot_time).is_some_and(|slot| slot > edit_at)
                && !frozen_keys.contains(&format!("{}:{}", dose.slot_day, dose.slot_time))
        })
        .collect::<Vec<_>>();
    let frozen_count = store
        .doses
        .iter()
        .filter(|dose| dose.medicine_id == previous.id && dose_is_frozen(dose, edit_at))
        .count();
    if frozen_count + generated.len() > MAX_OCCURRENCES_PER_MEDICINE {
        return Err("A medicine supports at most 2,000 planned doses.".into());
    }
    let other_target_occurrences = store
        .medicines
        .iter()
        .filter(|medicine| medicine.treatment_id == next_treatment_id && medicine.id != previous.id)
        .map(|medicine| {
            store
                .doses
                .iter()
                .filter(|dose| dose.medicine_id == medicine.id)
                .count()
        })
        .sum::<usize>();
    if other_target_occurrences + frozen_count + generated.len() > MAX_OCCURRENCES_PER_TREATMENT {
        return Err("A treatment supports at most 4,000 planned doses.".into());
    }
    let retained = store
        .doses
        .iter()
        .filter(|dose| dose.medicine_id != previous.id || dose_is_frozen(dose, edit_at))
        .count();
    if retained + generated.len() > MAX_OCCURRENCES {
        return Err("Medicine has reached its 10,000 occurrence limit.".into());
    }
    store
        .doses
        .retain(|dose| dose.medicine_id != previous.id || dose_is_frozen(dose, edit_at));
    store.doses.extend(generated);
    store.medicines[index] = next;
    sync_treatment_range(store, &previous.treatment_id);
    if previous.treatment_id != next_treatment_id {
        sync_treatment_range(store, &next_treatment_id);
    }
    Ok(())
}

pub fn move_medicine(
    app: &AppHandle,
    state: &MedicineState,
    medicine_id: &str,
    other_medicine_id: &str,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        swap_medicine_order(store, medicine_id, other_medicine_id, now())
    })
}

pub fn reorder_medicines(
    app: &AppHandle,
    state: &MedicineState,
    ordered_ids: Vec<String>,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        reorder_medicine_siblings(store, &ordered_ids, now())
    })
}

fn reorder_medicine_siblings(
    store: &mut Store,
    ordered_ids: &[String],
    timestamp: String,
) -> Result<(), String> {
    let unique = ordered_ids.iter().collect::<HashSet<_>>();
    if ordered_ids.len() < 2 || unique.len() != ordered_ids.len() {
        return Err("Medicine order is invalid.".into());
    }
    let treatment_id = store
        .medicines
        .iter()
        .find(|medicine| medicine.id == ordered_ids[0])
        .map(|medicine| medicine.treatment_id.clone())
        .ok_or("The selected medicine no longer exists.")?;
    let sibling_ids = store
        .medicines
        .iter()
        .filter(|medicine| medicine.treatment_id == treatment_id)
        .map(|medicine| medicine.id.as_str())
        .collect::<HashSet<_>>();
    if sibling_ids.len() != ordered_ids.len()
        || ordered_ids
            .iter()
            .any(|id| !sibling_ids.contains(id.as_str()))
    {
        return Err("Medicines can only be reordered as one complete treatment list.".into());
    }
    let mut medicines = store
        .medicines
        .iter_mut()
        .filter(|medicine| medicine.treatment_id == treatment_id)
        .collect::<Vec<_>>();
    medicines.sort_by(|left, right| {
        left.sort_index
            .cmp(&right.sort_index)
            .then_with(|| left.id.cmp(&right.id))
    });
    for (sort_index, id) in ordered_ids.iter().enumerate() {
        let medicine = medicines
            .iter_mut()
            .find(|medicine| medicine.id == *id)
            .ok_or("The selected medicine no longer exists.")?;
        if medicine.sort_index != sort_index as i32 {
            medicine.sort_index = sort_index as i32;
            medicine.updated_at = timestamp.clone();
        }
    }
    Ok(())
}

fn swap_medicine_order(
    store: &mut Store,
    medicine_id: &str,
    other_medicine_id: &str,
    timestamp: String,
) -> Result<(), String> {
    let current = store
        .medicines
        .iter()
        .position(|medicine| medicine.id == medicine_id)
        .ok_or("The selected medicine no longer exists.")?;
    let other = store
        .medicines
        .iter()
        .position(|medicine| medicine.id == other_medicine_id)
        .ok_or("The medicine to swap with no longer exists.")?;
    if store.medicines[current].treatment_id != store.medicines[other].treatment_id {
        return Err("Medicines can only be reordered within one treatment.".into());
    }
    if current == other {
        return Ok(());
    }
    let current_sort_index = store.medicines[current].sort_index;
    let other_sort_index = store.medicines[other].sort_index;
    store.medicines[current].sort_index = other_sort_index;
    store.medicines[current].updated_at = timestamp.clone();
    store.medicines[other].sort_index = current_sort_index;
    store.medicines[other].updated_at = timestamp;
    Ok(())
}
#[derive(Clone, Copy)]
enum DoseAction {
    Take,
    Skip,
    Undo,
}

fn record_dose_action(dose: &mut Dose, action: DoseAction, timestamp: String) {
    let unchanged = match action {
        DoseAction::Take => dose.taken_at.is_some() && dose.skipped_at.is_none(),
        DoseAction::Skip => dose.skipped_at.is_some() && dose.taken_at.is_none(),
        DoseAction::Undo => dose.taken_at.is_none() && dose.skipped_at.is_none(),
    };
    if unchanged {
        return;
    }
    dose.taken_at = matches!(action, DoseAction::Take).then(|| timestamp.clone());
    dose.skipped_at = matches!(action, DoseAction::Skip).then(|| timestamp.clone());
    dose.updated_at = timestamp;
    // Undo changes the record only; it must not re-arm an already sent reminder.
}

pub fn set_dose_taken(
    app: &AppHandle,
    state: &MedicineState,
    medicine_id: &str,
    slot_day: &str,
    slot_time: &str,
    taken: bool,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |s| {
        let d = s
            .doses
            .iter_mut()
            .find(|d| {
                d.medicine_id == medicine_id && d.slot_day == slot_day && d.slot_time == slot_time
            })
            .ok_or("The scheduled dose no longer exists.")?;
        record_dose_action(
            d,
            if taken {
                DoseAction::Take
            } else {
                DoseAction::Undo
            },
            now(),
        );
        Ok(())
    })
}
pub fn set_dose_skipped(
    app: &AppHandle,
    state: &MedicineState,
    medicine_id: &str,
    slot_day: &str,
    slot_time: &str,
    skipped: bool,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |s| {
        let d = s
            .doses
            .iter_mut()
            .find(|d| {
                d.medicine_id == medicine_id && d.slot_day == slot_day && d.slot_time == slot_time
            })
            .ok_or("The scheduled dose no longer exists.")?;
        record_dose_action(
            d,
            if skipped {
                DoseAction::Skip
            } else {
                DoseAction::Undo
            },
            now(),
        );
        Ok(())
    })
}

pub fn set_treatment_archived(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    archived: bool,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        set_treatment_archived_in_store(store, treatment_id, archived, now())
    })
}

fn set_treatment_archived_in_store(
    store: &mut Store,
    treatment_id: &str,
    archived: bool,
    timestamp: String,
) -> Result<(), String> {
    let treatment = store
        .treatments
        .iter_mut()
        .find(|treatment| treatment.id == treatment_id)
        .ok_or("The selected treatment no longer exists.")?;
    if treatment.archived_at.is_some() == archived {
        return Ok(());
    }
    treatment.archived_at = archived.then(|| timestamp.clone());
    treatment.updated_at = timestamp;
    Ok(())
}

pub fn set_treatment_completed(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    completed: bool,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        set_treatment_completed_in_store(store, treatment_id, completed, now())
    })
}

fn set_treatment_completed_in_store(
    store: &mut Store,
    treatment_id: &str,
    completed: bool,
    timestamp: String,
) -> Result<(), String> {
    let treatment = store
        .treatments
        .iter_mut()
        .find(|treatment| treatment.id == treatment_id)
        .ok_or("The selected treatment no longer exists.")?;
    if treatment.completed_at.is_some() == completed {
        return Ok(());
    }
    treatment.completed_at = completed.then(|| timestamp.clone());
    treatment.updated_at = timestamp;
    Ok(())
}

pub fn save_treatment_notes(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    notes: Vec<NoteSegment>,
    expected_notes_revision: u64,
) -> Result<MedicineSnapshot, String> {
    let notes = workspace::normalize_notes(notes)?;
    mutate(app, state, true, |store| {
        save_treatment_notes_in_store(store, treatment_id, notes, expected_notes_revision, now())
    })
}

fn save_treatment_notes_in_store(
    store: &mut Store,
    treatment_id: &str,
    notes: Vec<NoteSegment>,
    expected_notes_revision: u64,
    timestamp: String,
) -> Result<(), String> {
    let treatment = store
        .treatments
        .iter_mut()
        .find(|treatment| treatment.id == treatment_id)
        .ok_or("The selected treatment no longer exists.")?;
    if treatment.notes_revision != expected_notes_revision {
        return Err(
            "This treatment's notes changed in another window. Choose how to resolve the conflict."
                .into(),
        );
    }
    treatment.notes = notes;
    treatment.notes_revision = treatment
        .notes_revision
        .checked_add(1)
        .ok_or("Treatment notes revision has reached its supported limit.")?;
    treatment.updated_at = timestamp;
    Ok(())
}

pub fn treatment_note_url(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    requested_url: &str,
) -> Result<String, String> {
    let requested_url = external_url::normalize_url(requested_url, "Treatment-note link")?;
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let treatment = store
        .treatments
        .iter()
        .find(|treatment| treatment.id == treatment_id)
        .ok_or("The selected treatment no longer exists.")?;
    treatment
        .notes
        .iter()
        .filter_map(|segment| segment.href.as_deref())
        .any(|href| {
            external_url::normalize_url(href, "Treatment-note link")
                .is_ok_and(|href| href == requested_url)
        })
        .then_some(requested_url)
        .ok_or_else(|| "This link is not present in the saved treatment notes.".to_owned())
}

pub fn medicine_note_url(
    app: &AppHandle,
    state: &MedicineState,
    medicine_id: &str,
    requested_url: &str,
) -> Result<String, String> {
    let requested_url = external_url::normalize_url(requested_url, "Medicine-note link")?;
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let medicine = store
        .medicines
        .iter()
        .find(|medicine| medicine.id == medicine_id)
        .ok_or("The selected medicine no longer exists.")?;
    medicine
        .notes
        .iter()
        .filter_map(|segment| segment.href.as_deref())
        .any(|href| {
            external_url::normalize_url(href, "Medicine-note link")
                .is_ok_and(|href| href == requested_url)
        })
        .then_some(requested_url)
        .ok_or_else(|| "This link is not present in the saved medicine notes.".to_owned())
}

pub fn delete_impact(
    app: &AppHandle,
    state: &MedicineState,
    entity: &str,
    id: Option<&str>,
) -> Result<MedicineDeleteImpact, String> {
    let _guard = lock(state)?;
    let (_, store, _) = load(app)?;
    let (name, treatments, medicines, doses) = match entity {
        "medicine-store" => (
            None,
            store.treatments.len(),
            store.medicines.len(),
            store.doses.len(),
        ),
        "treatment" => {
            let id = id.ok_or("Treatment id is required.")?;
            let treatment = store
                .treatments
                .iter()
                .find(|treatment| treatment.id == id)
                .ok_or("The selected treatment no longer exists.")?;
            let medicine_ids = store
                .medicines
                .iter()
                .filter(|medicine| medicine.treatment_id == id)
                .map(|medicine| medicine.id.clone())
                .collect::<HashSet<_>>();
            (
                Some(treatment.name.clone()),
                1,
                medicine_ids.len(),
                store
                    .doses
                    .iter()
                    .filter(|dose| medicine_ids.contains(&dose.medicine_id))
                    .count(),
            )
        }
        "medicine" => {
            let id = id.ok_or("Medicine id is required.")?;
            let medicine = store
                .medicines
                .iter()
                .find(|medicine| medicine.id == id)
                .ok_or("The selected medicine no longer exists.")?;
            (
                Some(medicine.name.clone()),
                0,
                1,
                store
                    .doses
                    .iter()
                    .filter(|dose| dose.medicine_id == id)
                    .count(),
            )
        }
        _ => return Err("Unknown medicine delete-impact entity.".into()),
    };
    Ok(MedicineDeleteImpact {
        entity: entity.into(),
        id: id.map(str::to_owned),
        name,
        treatments,
        medicines,
        doses,
        medicine_revision: store.revision,
    })
}

pub fn delete_treatment(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    expected_revision: u64,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, false, |store| {
        delete_treatment_in_store(store, treatment_id, expected_revision)
    })
}

fn delete_treatment_in_store(
    store: &mut Store,
    treatment_id: &str,
    expected_revision: u64,
) -> Result<(), String> {
    ensure_revision(store, expected_revision)?;
    let treatment = store
        .treatments
        .iter()
        .find(|treatment| treatment.id == treatment_id)
        .ok_or("The selected treatment no longer exists.")?;
    if treatment.completed_at.is_none() && treatment.archived_at.is_none() {
        return Err("Complete or archive this treatment before deleting it.".into());
    }
    let medicine_ids = store
        .medicines
        .iter()
        .filter(|medicine| medicine.treatment_id == treatment_id)
        .map(|medicine| medicine.id.clone())
        .collect::<HashSet<_>>();
    store
        .treatments
        .retain(|treatment| treatment.id != treatment_id);
    store
        .medicines
        .retain(|medicine| medicine.treatment_id != treatment_id);
    store
        .doses
        .retain(|dose| !medicine_ids.contains(&dose.medicine_id));
    Ok(())
}

pub fn delete_medicine(
    app: &AppHandle,
    state: &MedicineState,
    medicine_id: &str,
    expected_revision: u64,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, false, |store| {
        delete_medicine_in_store(store, medicine_id, expected_revision)
    })
}

fn delete_medicine_in_store(
    store: &mut Store,
    medicine_id: &str,
    expected_revision: u64,
) -> Result<(), String> {
    ensure_revision(store, expected_revision)?;
    let treatment_id = store
        .medicines
        .iter()
        .find(|medicine| medicine.id == medicine_id)
        .map(|medicine| medicine.treatment_id.clone())
        .ok_or("The selected medicine no longer exists.")?;
    store
        .medicines
        .retain(|medicine| medicine.id != medicine_id);
    store.doses.retain(|dose| dose.medicine_id != medicine_id);
    sync_treatment_range(store, &treatment_id);
    Ok(())
}

pub fn delete_all(
    app: &AppHandle,
    state: &MedicineState,
    expected_revision: u64,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, false, |store| {
        ensure_revision(store, expected_revision)?;
        store.treatments.clear();
        store.medicines.clear();
        store.doses.clear();
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Paired with the `resolveMedicineSlot` cases in
    /// `scripts/test-medicine-model.mjs`; the same zone, dates and expectations
    /// are asserted on both sides so the two resolvers cannot drift.
    ///
    /// The zone is injected rather than taken from `Local` because
    /// `chrono::Local` reads the Windows system timezone and ignores `TZ`, so a
    /// host-clock-independent test is only possible with an explicit zone.
    /// Mutating the developer's clock is not an acceptable alternative.
    mod slot_resolution {
        use super::*;
        use chrono_tz::America::New_York;

        fn local_hhmm(slot_day: &str, slot_time: &str) -> String {
            let instant = resolve_slot_in(&New_York, slot_day, slot_time).expect("resolves");
            instant.with_timezone(&New_York).format("%H:%M").to_string()
        }

        #[test]
        fn nonexistent_time_resolves_to_the_first_instant_after_the_gap() {
            // 2026-03-08 02:00-02:59 does not exist in America/New_York.
            assert_eq!(local_hhmm("2026-03-08", "02:30"), "03:00");
            assert_eq!(local_hhmm("2026-03-08", "02:05"), "03:00");
            assert_eq!(local_hhmm("2026-03-08", "02:59"), "03:00");
        }

        #[test]
        fn every_skipped_time_collapses_to_the_same_boundary_instant() {
            let early = resolve_slot_in(&New_York, "2026-03-08", "02:05");
            let late = resolve_slot_in(&New_York, "2026-03-08", "02:59");
            assert_eq!(early, late);
            // Collapsing must not swallow the neighbours on either side.
            assert!(resolve_slot_in(&New_York, "2026-03-08", "01:59") < early);
            assert!(resolve_slot_in(&New_York, "2026-03-08", "03:30") > late);
        }

        #[test]
        fn ambiguous_time_resolves_to_the_earlier_occurrence() {
            // 2026-11-01 01:30 occurs twice; the earlier pass is 05:30Z.
            let instant = resolve_slot_in(&New_York, "2026-11-01", "01:30").expect("resolves");
            assert_eq!(instant.to_rfc3339(), "2026-11-01T05:30:00+00:00");
        }

        #[test]
        fn resolution_is_non_decreasing_across_both_transitions() {
            for day in ["2026-03-08", "2026-11-01"] {
                let mut previous = None;
                for hour in 0..24 {
                    for minute in [0, 30] {
                        let slot = format!("{hour:02}:{minute:02}");
                        let current = resolve_slot_in(&New_York, day, &slot)
                            .unwrap_or_else(|| panic!("{day} {slot} resolves"));
                        if let Some(previous) = previous {
                            assert!(
                                current >= previous,
                                "{day} {slot} went backwards; the gap policy must \
                                 collapse forward, never preserve minutes"
                            );
                        }
                        previous = Some(current);
                    }
                }
            }
        }

        #[test]
        fn the_same_civil_slot_follows_the_zone_it_is_resolved_in() {
            // A future slot keeps its wall-clock time after travel: it is
            // resolved in the current zone, not the one it was written in.
            let new_york = resolve_slot_in(&New_York, "2026-06-01", "08:00").expect("resolves");
            let kyiv =
                resolve_slot_in(&chrono_tz::Europe::Kyiv, "2026-06-01", "08:00").expect("resolves");
            assert_ne!(new_york, kyiv);
            assert_eq!(
                new_york
                    .with_timezone(&New_York)
                    .format("%H:%M")
                    .to_string(),
                kyiv.with_timezone(&chrono_tz::Europe::Kyiv)
                    .format("%H:%M")
                    .to_string(),
            );
        }
    }

    fn treatment(id: &str, sort_index: i32) -> Treatment {
        Treatment {
            id: id.into(),
            name: format!("Treatment {id}"),
            notes: vec![],
            notes_revision: 0,
            start_on: "2026-03-27".into(),
            end_on: "2026-03-31".into(),
            completed_at: None,
            archived_at: None,
            sort_index,
            created_at: "2026-03-01T00:00:00Z".into(),
            updated_at: "2026-03-01T00:00:00Z".into(),
        }
    }

    fn medicine(pattern: DayPattern, times: Vec<&str>) -> Medicine {
        Medicine {
            id: "medicine-1".into(),
            treatment_id: "treatment-1".into(),
            name: "Example".into(),
            strength: "".into(),
            form: "other".into(),
            dose_amount: "1".into(),
            food_rule: "any".into(),
            times: times.into_iter().map(str::to_owned).collect(),
            day_pattern: pattern,
            start_on: "2026-03-27".into(),
            end_on: "2026-03-31".into(),
            schedule_revision: 4,
            notes: vec![],
            sort_index: 0,
            created_at: now(),
            updated_at: now(),
        }
    }

    fn scheduled_dose() -> Dose {
        Dose {
            medicine_id: "medicine-1".into(),
            slot_day: "2026-03-27".into(),
            slot_time: "09:00".into(),
            schedule_revision: 4,
            taken_at: None,
            skipped_at: None,
            notified_at: Some("2026-03-27T09:00:00Z".into()),
            updated_at: "2026-03-27T09:00:00Z".into(),
        }
    }

    fn input_from_medicine(item: &Medicine) -> MedicineInput {
        MedicineInput {
            treatment_id: item.treatment_id.clone(),
            name: item.name.clone(),
            strength: item.strength.clone(),
            form: item.form.clone(),
            dose_amount: item.dose_amount.clone(),
            food_rule: item.food_rule.clone(),
            times: item.times.clone(),
            day_pattern: item.day_pattern.clone(),
            start_on: item.start_on.clone(),
            end_on: item.end_on.clone(),
            notes: item.notes.clone(),
        }
    }

    #[test]
    fn repeated_take_and_skip_preserve_the_original_record() {
        for action in [DoseAction::Take, DoseAction::Skip] {
            let mut dose = scheduled_dose();
            record_dose_action(&mut dose, action, "2026-03-27T09:01:00Z".into());
            let recorded = serde_json::to_value(&dose).unwrap();
            record_dose_action(&mut dose, action, "2026-03-27T09:02:00Z".into());
            assert_eq!(serde_json::to_value(&dose).unwrap(), recorded);
        }
    }

    #[test]
    fn undo_clears_either_record_and_preserves_the_reminder_guard() {
        for action in [DoseAction::Take, DoseAction::Skip] {
            let mut dose = scheduled_dose();
            let notified_at = dose.notified_at.clone();
            record_dose_action(&mut dose, action, "2026-03-27T09:01:00Z".into());
            record_dose_action(&mut dose, DoseAction::Undo, "2026-03-27T09:02:00Z".into());
            assert!(dose.taken_at.is_none());
            assert!(dose.skipped_at.is_none());
            assert_eq!(dose.notified_at, notified_at);
            assert_eq!(dose.updated_at, "2026-03-27T09:02:00Z");
            let undone = serde_json::to_value(&dose).unwrap();
            record_dose_action(&mut dose, DoseAction::Undo, "2026-03-27T09:03:00Z".into());
            assert_eq!(serde_json::to_value(&dose).unwrap(), undone);
        }
    }

    #[test]
    fn switching_take_and_skip_keeps_the_record_mutually_exclusive() {
        let mut dose = scheduled_dose();
        record_dose_action(&mut dose, DoseAction::Take, "2026-03-27T09:01:00Z".into());
        record_dose_action(&mut dose, DoseAction::Skip, "2026-03-27T09:02:00Z".into());
        assert!(dose.taken_at.is_none());
        assert_eq!(dose.skipped_at.as_deref(), Some("2026-03-27T09:02:00Z"));
        record_dose_action(&mut dose, DoseAction::Take, "2026-03-27T09:03:00Z".into());
        assert!(dose.skipped_at.is_none());
        assert_eq!(dose.taken_at.as_deref(), Some("2026-03-27T09:03:00Z"));
    }

    #[test]
    fn treatment_metadata_edits_preserve_notes_and_their_revision() {
        let mut store = empty();
        store.treatments.push(Treatment {
            id: "treatment-1".into(),
            name: "Original".into(),
            notes: vec![NoteSegment {
                text: "Keep this note".into(),
                href: Some("https://example.com/".into()),
            }],
            notes_revision: 7,
            start_on: "2026-03-27".into(),
            end_on: "2026-03-31".into(),
            completed_at: None,
            archived_at: None,
            sort_index: 0,
            created_at: "2026-03-27T08:00:00Z".into(),
            updated_at: "2026-03-27T08:00:00Z".into(),
        });
        let notes = serde_json::to_value(&store.treatments[0].notes).unwrap();
        for incoming_notes in [
            vec![],
            vec![NoteSegment {
                text: "Stale editor note".into(),
                href: None,
            }],
        ] {
            update_treatment_details(
                &mut store,
                "treatment-1",
                TreatmentInput {
                    name: "Renamed".into(),
                    start_on: "2026-03-28".into(),
                    end_on: "2026-04-01".into(),
                    notes: incoming_notes,
                },
            )
            .unwrap();
            let treatment = &store.treatments[0];
            assert_eq!(treatment.name, "Renamed");
            assert_eq!(treatment.start_on, "2026-03-28");
            assert_eq!(treatment.end_on, "2026-04-01");
            assert_eq!(serde_json::to_value(&treatment.notes).unwrap(), notes);
            assert_eq!(treatment.notes_revision, 7);
        }
    }

    #[test]
    fn materializes_one_civil_row_per_slot_on_each_matching_day() {
        let rows = generate(&medicine(DayPattern::EveryDay, vec!["08:00", "20:00"]));
        assert_eq!(rows.len(), 10);
        assert_eq!(rows[0].slot_day, "2026-03-27");
        assert_eq!(rows[0].slot_time, "08:00");
        assert_eq!(rows[9].slot_day, "2026-03-31");
        assert_eq!(rows[9].slot_time, "20:00");
        assert!(rows.iter().all(|row| row.schedule_revision == 4));
    }

    #[test]
    fn every_n_days_and_weekdays_follow_civil_dates() {
        let every_other = medicine(DayPattern::EveryNDays { interval: 2 }, vec!["09:00"]);
        let weekday_only = medicine(DayPattern::Weekdays { days: vec![1, 5] }, vec!["09:00"]);
        let every_other_days = generate(&every_other)
            .into_iter()
            .map(|row| row.slot_day)
            .collect::<Vec<_>>();
        let weekday_days = generate(&weekday_only)
            .into_iter()
            .map(|row| row.slot_day)
            .collect::<Vec<_>>();
        assert_eq!(every_other_days, ["2026-03-27", "2026-03-29", "2026-03-31"]);
        assert_eq!(weekday_days, ["2026-03-27", "2026-03-30"]);
    }

    #[test]
    fn validation_rejects_duplicate_civil_occurrence_identity() {
        let medicine = medicine(DayPattern::EveryDay, vec!["09:00"]);
        let treatment = Treatment {
            id: "treatment-1".into(),
            name: "Example".into(),
            notes: vec![],
            notes_revision: 0,
            start_on: "2026-03-27".into(),
            end_on: "2026-03-31".into(),
            completed_at: None,
            archived_at: None,
            sort_index: 0,
            created_at: now(),
            updated_at: now(),
        };
        let duplicate = Dose {
            medicine_id: "medicine-1".into(),
            slot_day: "2026-03-27".into(),
            slot_time: "09:00".into(),
            schedule_revision: 4,
            taken_at: None,
            skipped_at: None,
            notified_at: None,
            updated_at: now(),
        };
        let store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 1,
            treatments: vec![treatment],
            medicines: vec![medicine],
            doses: vec![duplicate.clone(), duplicate],
        };
        assert!(!valid(&store));
    }

    #[test]
    fn treatment_range_tracks_earliest_and_latest_medicine_windows() {
        let treatment = Treatment {
            id: "treatment-1".into(),
            name: "Example".into(),
            notes: vec![],
            notes_revision: 0,
            start_on: "2026-01-01".into(),
            end_on: "2026-01-01".into(),
            completed_at: None,
            archived_at: None,
            sort_index: 0,
            created_at: now(),
            updated_at: now(),
        };
        let mut first = medicine(DayPattern::EveryDay, vec!["09:00"]);
        first.start_on = "2026-03-29".into();
        first.end_on = "2026-04-02".into();
        let mut last = first.clone();
        last.id = "medicine-2".into();
        last.start_on = "2026-03-27".into();
        last.end_on = "2026-04-05".into();
        let mut store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 1,
            treatments: vec![treatment],
            medicines: vec![first, last],
            doses: vec![],
        };
        sync_treatment_range(&mut store, "treatment-1");
        assert_eq!(store.treatments[0].start_on, "2026-03-27");
        assert_eq!(store.treatments[0].end_on, "2026-04-05");
    }

    #[test]
    fn validates_supported_form_food_rule_and_365_day_span() {
        let treatment = Treatment {
            id: "treatment-1".into(),
            name: "Example".into(),
            notes: vec![],
            notes_revision: 0,
            start_on: "2026-01-01".into(),
            end_on: "2026-12-31".into(),
            completed_at: None,
            archived_at: None,
            sort_index: 0,
            created_at: now(),
            updated_at: now(),
        };
        let mut store = empty();
        store.treatments.push(treatment.clone());
        let mut item = medicine(DayPattern::EveryDay, vec!["09:00"]);
        item.start_on = "2026-01-01".into();
        item.end_on = "2026-12-31".into();
        assert!(valid_medicine(&store, &item));
        item.form = "unknown".into();
        assert!(!valid_medicine(&store, &item));
        item.form = "tablet".into();
        item.food_rule = "sometimes".into();
        assert!(!valid_medicine(&store, &item));
        assert!(valid_treatment(&treatment));
        let mut too_long = treatment;
        too_long.end_on = "2027-01-01".into();
        assert!(!valid_treatment(&too_long));
    }

    #[test]
    fn validation_enforces_per_medicine_and_per_treatment_caps() {
        let treatment = Treatment {
            id: "treatment-1".into(),
            name: "Example".into(),
            notes: vec![],
            notes_revision: 0,
            start_on: "2026-01-01".into(),
            end_on: "2026-12-31".into(),
            completed_at: None,
            archived_at: None,
            sort_index: 0,
            created_at: now(),
            updated_at: now(),
        };
        let times = vec!["01:00", "05:00", "09:00", "13:00", "17:00", "21:00"];
        let mut first = medicine(DayPattern::EveryDay, times.clone());
        first.start_on = "2026-01-01".into();
        first.end_on = "2026-12-31".into();
        let first_doses = generate(&first);
        assert_eq!(first_doses.len(), 2_190);
        let oversized_medicine = Store {
            schema_version: SCHEMA_VERSION,
            revision: 1,
            treatments: vec![treatment.clone()],
            medicines: vec![first.clone()],
            doses: first_doses.clone(),
        };
        assert!(!valid(&oversized_medicine));

        let treatment_times = vec!["01:00", "06:00", "11:00", "16:00", "21:00"];
        let mut medicines = Vec::new();
        let mut treatment_doses = Vec::new();
        for index in 1..=3 {
            let mut item = medicine(DayPattern::EveryDay, treatment_times.clone());
            item.id = format!("medicine-{index}");
            item.start_on = "2026-01-01".into();
            item.end_on = "2026-12-31".into();
            let doses = generate(&item);
            assert_eq!(doses.len(), 1_825);
            medicines.push(item);
            treatment_doses.extend(doses);
        }
        let oversized_treatment = Store {
            schema_version: SCHEMA_VERSION,
            revision: 1,
            treatments: vec![treatment],
            medicines,
            doses: treatment_doses,
        };
        assert!(!valid(&oversized_treatment));
    }

    #[test]
    fn schedule_input_normalization_prevents_order_only_edits() {
        let normalized = normalize_medicine_input(MedicineInput {
            treatment_id: "treatment-1".into(),
            name: "Example".into(),
            strength: "500 mg".into(),
            form: "tablet".into(),
            dose_amount: "1".into(),
            food_rule: "any".into(),
            times: vec!["20:00".into(), "08:00".into(), "14:00".into()],
            day_pattern: DayPattern::Weekdays {
                days: vec![5, 1, 3],
            },
            start_on: "2026-03-27".into(),
            end_on: "2026-03-31".into(),
            notes: vec![],
        })
        .unwrap();
        assert_eq!(normalized.times, ["08:00", "14:00", "20:00"]);
        assert!(
            matches!(normalized.day_pattern, DayPattern::Weekdays { days } if days == [1, 3, 5])
        );
    }

    #[test]
    fn schedule_edit_freezes_past_and_touched_rows_and_replaces_future_rows() {
        let treatment = Treatment {
            id: "treatment-1".into(),
            name: "Example".into(),
            notes: vec![],
            notes_revision: 0,
            start_on: "2026-03-28".into(),
            end_on: "2026-03-31".into(),
            completed_at: None,
            archived_at: None,
            sort_index: 0,
            created_at: now(),
            updated_at: now(),
        };
        let mut item = medicine(DayPattern::EveryDay, vec!["09:00"]);
        item.start_on = "2026-03-28".into();
        let mut doses = generate(&item);
        doses
            .iter_mut()
            .find(|dose| dose.slot_day == "2026-03-30")
            .unwrap()
            .taken_at = Some("2026-03-30T07:05:00Z".into());
        let frozen_before = doses
            .iter()
            .filter(|dose| dose.slot_day.as_str() <= "2026-03-30")
            .map(|dose| serde_json::to_value(dose).unwrap())
            .collect::<Vec<_>>();
        let mut store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 1,
            treatments: vec![treatment],
            medicines: vec![item.clone()],
            doses,
        };
        let mut input = input_from_medicine(&item);
        input.times = vec!["09:00".into(), "20:00".into()];
        let edit_at = DateTime::parse_from_rfc3339("2026-03-29T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        apply_medicine_update(
            &mut store,
            &item.id,
            input,
            edit_at,
            "2026-03-29T12:00:00Z".into(),
        )
        .unwrap();
        let frozen_after = store
            .doses
            .iter()
            .filter(|dose| dose.slot_day.as_str() <= "2026-03-30" && dose.slot_time == "09:00")
            .map(|dose| serde_json::to_value(dose).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(frozen_after, frozen_before);
        assert_eq!(
            store
                .doses
                .iter()
                .filter(|dose| dose.slot_day == "2026-03-30" && dose.slot_time == "09:00")
                .count(),
            1
        );
        assert!(store
            .doses
            .iter()
            .filter(|dose| dose.slot_day.as_str() > "2026-03-29" && dose.taken_at.is_none())
            .all(|dose| dose.schedule_revision == 5));
        assert!(store
            .doses
            .iter()
            .any(|dose| dose.slot_day == "2026-03-31" && dose.slot_time == "20:00"));
    }

    #[test]
    fn metadata_edit_keeps_schedule_revision_and_doses_byte_identical() {
        let treatment = Treatment {
            id: "treatment-1".into(),
            name: "Example".into(),
            notes: vec![],
            notes_revision: 0,
            start_on: "2026-03-27".into(),
            end_on: "2026-03-31".into(),
            completed_at: None,
            archived_at: None,
            sort_index: 0,
            created_at: now(),
            updated_at: now(),
        };
        let item = medicine(DayPattern::EveryDay, vec!["09:00"]);
        let doses = generate(&item);
        let before = serde_json::to_value(&doses).unwrap();
        let mut store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 1,
            treatments: vec![treatment],
            medicines: vec![item.clone()],
            doses,
        };
        let mut input = input_from_medicine(&item);
        input.name = "Renamed".into();
        input.strength = "500 mg".into();
        apply_medicine_update(
            &mut store,
            &item.id,
            input,
            Utc::now(),
            "2026-03-29T12:00:00Z".into(),
        )
        .unwrap();
        assert_eq!(store.medicines[0].schedule_revision, 4);
        assert_eq!(serde_json::to_value(&store.doses).unwrap(), before);
    }

    #[test]
    fn reorder_swaps_both_entities_atomically_and_rejects_cross_treatment_moves() {
        let mut first = medicine(DayPattern::EveryDay, vec!["09:00"]);
        first.id = "medicine-1".into();
        first.sort_index = 0;
        let mut second = first.clone();
        second.id = "medicine-2".into();
        second.sort_index = 1;
        let mut third = first.clone();
        third.id = "medicine-3".into();
        third.treatment_id = "treatment-2".into();
        let mut store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 4,
            treatments: vec![treatment("treatment-1", 0), treatment("treatment-2", 1)],
            medicines: vec![first, second, third],
            doses: vec![],
        };
        swap_treatment_order(
            &mut store,
            "treatment-1",
            "treatment-2",
            "2026-03-02T00:00:00Z".into(),
        )
        .unwrap();
        assert_eq!(store.treatments[0].sort_index, 1);
        assert_eq!(store.treatments[1].sort_index, 0);
        swap_medicine_order(
            &mut store,
            "medicine-1",
            "medicine-2",
            "2026-03-02T00:00:00Z".into(),
        )
        .unwrap();
        assert_eq!(store.medicines[0].sort_index, 1);
        assert_eq!(store.medicines[1].sort_index, 0);
        let before = serde_json::to_value(&store).unwrap();
        assert!(swap_medicine_order(
            &mut store,
            "medicine-1",
            "medicine-3",
            "2026-03-03T00:00:00Z".into(),
        )
        .is_err());
        assert_eq!(serde_json::to_value(&store).unwrap(), before);
    }

    #[test]
    fn drag_reorder_applies_insertion_order_and_rejects_incomplete_medicine_lists() {
        let mut first = medicine(DayPattern::EveryDay, vec!["09:00"]);
        first.id = "medicine-1".into();
        first.sort_index = 10;
        let mut second = first.clone();
        second.id = "medicine-2".into();
        // Represents a delete-then-create legacy collision. Reordering must
        // make the sibling order unique instead of preserving the tie.
        second.sort_index = 10;
        let mut third = first.clone();
        third.id = "medicine-3".into();
        third.sort_index = 30;
        let mut store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 4,
            treatments: vec![
                treatment("treatment-1", 10),
                treatment("treatment-2", 20),
                treatment("treatment-3", 30),
                treatment("outside-group", 40),
            ],
            medicines: vec![first, second, third],
            doses: vec![],
        };
        reorder_treatment_subset(
            &mut store,
            &[
                "treatment-3".into(),
                "treatment-1".into(),
                "treatment-2".into(),
            ],
            "2026-03-02T00:00:00Z".into(),
        )
        .unwrap();
        assert_eq!(store.treatments[0].sort_index, 1);
        assert_eq!(store.treatments[1].sort_index, 2);
        assert_eq!(store.treatments[2].sort_index, 0);
        assert_eq!(store.treatments[3].sort_index, 3);

        reorder_medicine_siblings(
            &mut store,
            &[
                "medicine-2".into(),
                "medicine-3".into(),
                "medicine-1".into(),
            ],
            "2026-03-02T00:00:00Z".into(),
        )
        .unwrap();
        assert_eq!(store.medicines[0].sort_index, 2);
        assert_eq!(store.medicines[1].sort_index, 0);
        assert_eq!(store.medicines[2].sort_index, 1);

        let before = serde_json::to_value(&store).unwrap();
        assert!(reorder_medicine_siblings(
            &mut store,
            &["medicine-1".into(), "medicine-2".into()],
            "2026-03-03T00:00:00Z".into(),
        )
        .is_err());
        assert_eq!(serde_json::to_value(&store).unwrap(), before);
    }

    #[test]
    fn treatment_notes_normalize_and_stale_writes_leave_store_unchanged() {
        let mut store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 3,
            treatments: vec![treatment("treatment-1", 0)],
            medicines: vec![],
            doses: vec![],
        };
        let notes = workspace::normalize_notes(vec![
            NoteSegment {
                text: "Plan ".into(),
                href: None,
            },
            NoteSegment {
                text: "site".into(),
                href: Some("https://example.com".into()),
            },
        ])
        .unwrap();
        save_treatment_notes_in_store(
            &mut store,
            "treatment-1",
            notes,
            0,
            "2026-03-02T00:00:00Z".into(),
        )
        .unwrap();
        assert_eq!(store.treatments[0].notes_revision, 1);
        assert_eq!(
            store.treatments[0].notes[1].href.as_deref(),
            Some("https://example.com/")
        );
        let before = serde_json::to_value(&store).unwrap();
        assert!(save_treatment_notes_in_store(
            &mut store,
            "treatment-1",
            vec![],
            0,
            "2026-03-03T00:00:00Z".into(),
        )
        .is_err());
        assert_eq!(serde_json::to_value(&store).unwrap(), before);
        assert!(workspace::normalize_notes(vec![NoteSegment {
            text: "x".repeat(4_001),
            href: None,
        }])
        .is_err());
    }

    #[test]
    fn lifecycle_actions_preserve_existing_timestamps_and_independent_states() {
        let mut store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 1,
            treatments: vec![treatment("treatment-1", 0)],
            medicines: vec![],
            doses: vec![],
        };
        set_treatment_completed_in_store(
            &mut store,
            "treatment-1",
            true,
            "2026-03-02T00:00:00Z".into(),
        )
        .unwrap();
        set_treatment_archived_in_store(
            &mut store,
            "treatment-1",
            true,
            "2026-03-03T00:00:00Z".into(),
        )
        .unwrap();
        let before = serde_json::to_value(&store.treatments[0]).unwrap();
        set_treatment_completed_in_store(
            &mut store,
            "treatment-1",
            true,
            "2026-03-04T00:00:00Z".into(),
        )
        .unwrap();
        set_treatment_archived_in_store(
            &mut store,
            "treatment-1",
            true,
            "2026-03-04T00:00:00Z".into(),
        )
        .unwrap();
        assert_eq!(serde_json::to_value(&store.treatments[0]).unwrap(), before);
        set_treatment_archived_in_store(
            &mut store,
            "treatment-1",
            false,
            "2026-03-05T00:00:00Z".into(),
        )
        .unwrap();
        assert!(store.treatments[0].archived_at.is_none());
        assert_eq!(
            store.treatments[0].completed_at.as_deref(),
            Some("2026-03-02T00:00:00Z")
        );
    }

    #[test]
    fn guarded_treatment_delete_rejects_stale_and_cascades_only_its_rows() {
        let mut deleted_treatment = treatment("treatment-1", 0);
        deleted_treatment.completed_at = Some("2026-03-31T00:00:00Z".into());
        let retained_treatment = treatment("treatment-2", 1);
        let deleted_medicine = medicine(DayPattern::EveryDay, vec!["09:00"]);
        let mut retained_medicine = deleted_medicine.clone();
        retained_medicine.id = "medicine-2".into();
        retained_medicine.treatment_id = "treatment-2".into();
        let mut deleted_dose = scheduled_dose();
        deleted_dose.notified_at = None;
        let mut retained_dose = deleted_dose.clone();
        retained_dose.medicine_id = "medicine-2".into();
        let mut store = Store {
            schema_version: SCHEMA_VERSION,
            revision: 8,
            treatments: vec![deleted_treatment, retained_treatment],
            medicines: vec![deleted_medicine, retained_medicine],
            doses: vec![deleted_dose, retained_dose],
        };
        let before = serde_json::to_value(&store).unwrap();
        assert!(delete_treatment_in_store(&mut store, "treatment-1", 7).is_err());
        assert_eq!(serde_json::to_value(&store).unwrap(), before);
        delete_treatment_in_store(&mut store, "treatment-1", 8).unwrap();
        assert_eq!(store.treatments.len(), 1);
        assert_eq!(store.medicines[0].id, "medicine-2");
        assert_eq!(store.doses[0].medicine_id, "medicine-2");
    }
}
