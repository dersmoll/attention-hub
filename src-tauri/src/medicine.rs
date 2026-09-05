use crate::{local_store, workspace::NoteSegment};
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
const MAX_OCCURRENCES: usize = 10_000;
const MAX_TREATMENT_DAYS: i64 = 366;
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
fn resolve_slot(slot_day: &str, slot_time: &str) -> Option<DateTime<Utc>> {
    let day = NaiveDate::parse_from_str(slot_day, "%Y-%m-%d").ok()?;
    let time = NaiveTime::parse_from_str(slot_time, "%H:%M").ok()?;
    let local = day.and_time(time);
    for minutes_after_slot in 0..=180 {
        let candidate = local.checked_add_signed(Duration::minutes(minutes_after_slot))?;
        match Local.from_local_datetime(&candidate) {
            LocalResult::Single(value) => return Some(value.with_timezone(&Utc)),
            LocalResult::Ambiguous(earlier, _) => return Some(earlier.with_timezone(&Utc)),
            LocalResult::None => continue,
        }
    }
    None
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
        && store.medicines.iter().all(|m| valid_medicine(store, m))
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
        && date(&v.start_on)
        && date(&v.end_on)
        && v.start_on <= v.end_on
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
    Ok((name, input.start_on, input.end_on, input.notes))
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
            sort_index: s.treatments.len() as i32,
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
    mutate(app, state, true, |s| {
        let (name, start_on, end_on, notes) = treatment_input(input)?;
        let t = s
            .treatments
            .iter_mut()
            .find(|t| t.id == treatment_id)
            .ok_or("The selected treatment no longer exists.")?;
        t.name = name;
        t.start_on = start_on;
        t.end_on = end_on;
        t.notes = notes;
        t.updated_at = now();
        sync_treatment_range(s, treatment_id);
        Ok(())
    })
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
        if s.medicines.len() >= MAX_MEDICINES {
            return Err("Medicine supports at most 500 medicine entries.".into());
        }
        validate_medicine_input(s, &input)?;
        let treatment_id = input.treatment_id.clone();
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
            sort_index: s.medicines.len() as i32,
            created_at: ts.clone(),
            updated_at: ts,
        };
        let doses = generate(&medicine);
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
        validate_medicine_input(store, &input)?;
        let index = store
            .medicines
            .iter()
            .position(|medicine| medicine.id == medicine_id)
            .ok_or("The selected medicine no longer exists.")?;
        let previous = store.medicines[index].clone();
        let next_treatment_id = input.treatment_id.clone();
        let schedule_changed = previous.treatment_id != input.treatment_id
            || previous.times != input.times
            || previous.day_pattern != input.day_pattern
            || previous.start_on != input.start_on
            || previous.end_on != input.end_on;
        let timestamp = now();
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
        let edit_at = Utc::now();
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
    })
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
        d.taken_at = if taken { Some(now()) } else { None };
        if taken {
            d.skipped_at = None
        };
        d.updated_at = now();
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
        d.skipped_at = if skipped { Some(now()) } else { None };
        if skipped {
            d.taken_at = None
        };
        d.updated_at = now();
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
        let treatment = store
            .treatments
            .iter_mut()
            .find(|treatment| treatment.id == treatment_id)
            .ok_or("The selected treatment no longer exists.")?;
        treatment.archived_at = archived.then(now);
        treatment.updated_at = now();
        Ok(())
    })
}

pub fn set_treatment_completed(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    completed: bool,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        let treatment = store
            .treatments
            .iter_mut()
            .find(|treatment| treatment.id == treatment_id)
            .ok_or("The selected treatment no longer exists.")?;
        treatment.completed_at = completed.then(now);
        treatment.updated_at = now();
        Ok(())
    })
}

pub fn save_treatment_notes(
    app: &AppHandle,
    state: &MedicineState,
    treatment_id: &str,
    notes: Vec<NoteSegment>,
    expected_notes_revision: u64,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, true, |store| {
        let treatment = store
            .treatments
            .iter_mut()
            .find(|treatment| treatment.id == treatment_id)
            .ok_or("The selected treatment no longer exists.")?;
        if treatment.notes_revision != expected_notes_revision {
            return Err("This treatment's notes changed in another window. Choose how to resolve the conflict.".into());
        }
        treatment.notes = notes;
        treatment.notes_revision += 1;
        treatment.updated_at = now();
        Ok(())
    })
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
    })
}

pub fn delete_medicine(
    app: &AppHandle,
    state: &MedicineState,
    medicine_id: &str,
    expected_revision: u64,
) -> Result<MedicineSnapshot, String> {
    mutate(app, state, false, |store| {
        ensure_revision(store, expected_revision)?;
        if !store
            .medicines
            .iter()
            .any(|medicine| medicine.id == medicine_id)
        {
            return Err("The selected medicine no longer exists.".into());
        }
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
    })
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

    fn medicine(pattern: DayPattern, times: Vec<&str>) -> Medicine {
        Medicine {
            id: "medicine-1".into(),
            treatment_id: "treatment-1".into(),
            name: "Example".into(),
            strength: "".into(),
            form: "".into(),
            dose_amount: "1".into(),
            food_rule: "".into(),
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
}
