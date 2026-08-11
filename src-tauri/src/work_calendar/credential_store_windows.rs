use std::{ffi::c_void, ptr::null_mut, slice};
use windows::{
    core::{HRESULT, PCWSTR, PWSTR},
    Win32::{
        Foundation::ERROR_NOT_FOUND,
        Security::Credentials::{
            CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
            CRED_TYPE_GENERIC,
        },
    },
};

const TARGET_NAME: &str = "AttentionHub/PublishedWorkCalendar";
const MAX_CREDENTIAL_BLOB_BYTES: usize = 5 * 512;

struct CredentialGuard(*mut CREDENTIALW);

impl Drop for CredentialGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CredFree(self.0.cast::<c_void>()) };
        }
    }
}

pub fn read() -> Result<Option<String>, ()> {
    let target = wide(TARGET_NAME);
    let mut pointer = null_mut::<CREDENTIALW>();
    let result = unsafe {
        CredReadW(
            PCWSTR(target.as_ptr()),
            CRED_TYPE_GENERIC,
            None,
            &mut pointer,
        )
    };
    if let Err(error) = result {
        if error.code() == HRESULT::from_win32(ERROR_NOT_FOUND.0) {
            return Ok(None);
        }
        return Err(());
    }

    let guard = CredentialGuard(pointer);
    if pointer.is_null() {
        return Err(());
    }
    let credential = unsafe { &*pointer };
    let length = credential.CredentialBlobSize as usize;
    if length == 0 || length > MAX_CREDENTIAL_BLOB_BYTES || credential.CredentialBlob.is_null() {
        return Err(());
    }
    let bytes = unsafe { slice::from_raw_parts(credential.CredentialBlob, length) }.to_vec();
    unsafe { slice::from_raw_parts_mut(credential.CredentialBlob, length) }.fill(0);
    let value = match String::from_utf8(bytes) {
        Ok(value) => value,
        Err(error) => {
            let mut invalid = error.into_bytes();
            invalid.fill(0);
            return Err(());
        }
    };
    drop(guard);
    Ok(Some(value))
}

pub fn write(published_url: &str) -> Result<(), ()> {
    if published_url.is_empty() || published_url.len() > MAX_CREDENTIAL_BLOB_BYTES {
        return Err(());
    }

    let mut target = wide(TARGET_NAME);
    let mut blob = published_url.as_bytes().to_vec();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        ..Default::default()
    };
    let result = unsafe { CredWriteW(&credential, 0) }.map_err(|_| ());
    blob.fill(0);
    result
}

pub fn delete() -> Result<(), ()> {
    let target = wide(TARGET_NAME);
    match unsafe { CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None) } {
        Ok(()) => Ok(()),
        Err(error) if error.code() == HRESULT::from_win32(ERROR_NOT_FOUND.0) => Ok(()),
        Err(_) => Err(()),
    }
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
