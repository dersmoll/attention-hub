use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex, MutexGuard, TryLockError,
    },
    thread,
    time::Duration,
};

static UI_AUTOMATION_GATE: Mutex<()> = Mutex::new(());
static PRIORITY_WAITERS: AtomicUsize = AtomicUsize::new(0);

pub struct PriorityGuard {
    guard: Option<MutexGuard<'static, ()>>,
}

impl Drop for PriorityGuard {
    fn drop(&mut self) {
        drop(self.guard.take());
        PRIORITY_WAITERS.fetch_sub(1, Ordering::Release);
    }
}

pub fn lock_priority() -> PriorityGuard {
    PRIORITY_WAITERS.fetch_add(1, Ordering::AcqRel);
    PriorityGuard {
        guard: Some(
            UI_AUTOMATION_GATE
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
        ),
    }
}

pub fn lock_background() -> MutexGuard<'static, ()> {
    loop {
        while PRIORITY_WAITERS.load(Ordering::Acquire) > 0 {
            thread::sleep(Duration::from_millis(10));
        }

        match UI_AUTOMATION_GATE.try_lock() {
            Ok(guard) if PRIORITY_WAITERS.load(Ordering::Acquire) == 0 => return guard,
            Ok(guard) => drop(guard),
            Err(TryLockError::Poisoned(poisoned))
                if PRIORITY_WAITERS.load(Ordering::Acquire) == 0 =>
            {
                return poisoned.into_inner();
            }
            Err(TryLockError::Poisoned(poisoned)) => drop(poisoned.into_inner()),
            Err(TryLockError::WouldBlock) => {}
        }
        thread::sleep(Duration::from_millis(10));
    }
}

pub fn try_lock() -> Option<MutexGuard<'static, ()>> {
    if PRIORITY_WAITERS.load(Ordering::Acquire) > 0 {
        return None;
    }
    match UI_AUTOMATION_GATE.try_lock() {
        Ok(guard) => Some(guard),
        Err(TryLockError::Poisoned(poisoned)) => Some(poisoned.into_inner()),
        Err(TryLockError::WouldBlock) => None,
    }
}
