//! 199xVM — a minimal JVM interpreter targeting WebAssembly.
//!
//! C-ABI entry points (plain `#[no_mangle] extern "C"`), loaded directly by
//! the site's own JS glue (no wasm-bindgen). The browser passes in
//! pre-compiled `.class` files (as bytes) and invokes a static method,
//! receiving the string representation of the return value.

mod class_file;
pub mod heap;
pub mod interpreter;

use class_file::parse;
use heap::JValue;
use interpreter::Vm;

/// Slice helpers — safe wrappers around raw pointer pairs.
unsafe fn slice<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        &[]
    } else {
        std::slice::from_raw_parts(ptr, len)
    }
}

unsafe fn str_of<'a>(ptr: *const u8, len: usize) -> &'a str {
    std::str::from_utf8(slice(ptr, len)).unwrap_or("")
}

/// Last result buffer, exposed to JS via `result_ptr` / `result_len`.
static mut RESULT: Vec<u8> = Vec::new();

fn run_static_native(
    class_bundle: &[u8],
    main_class: &str,
    method_name: &str,
    descriptor: &str,
) -> String {
    let mut vm = Vm::new();
    match vm.run_static(class_bundle, main_class, method_name, descriptor) {
        Ok(result) => result,
        Err(e) => format!("ERROR: {e}"),
    }
}

fn run_with_jars_native(
    shim_bundle: &[u8],
    jar_data: &[u8],
    main_class: &str,
    method_name: &str,
    descriptor: &str,
) -> String {
    let mut vm = Vm::new();
    match vm.run_with_jars(shim_bundle, jar_data, main_class, method_name, descriptor) {
        Ok(result) => result,
        Err(e) => format!("ERROR: {e}"),
    }
}

/// Allocate `len` bytes of wasm memory (JS writes input buffers into it).
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v = Vec::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// Load one or more `.class` files (length-prefixed bundle) and invoke a
/// static method. Returns a pointer to the result string (UTF-8), whose
/// length is available via `result_len`. May be called repeatedly; the
/// previous result buffer is replaced.
#[no_mangle]
pub extern "C" fn run_static_c(
    bundle_ptr: *const u8,
    bundle_len: usize,
    cls_ptr: *const u8,
    cls_len: usize,
    meth_ptr: *const u8,
    meth_len: usize,
    desc_ptr: *const u8,
    desc_len: usize,
) -> *const u8 {
    let bundle = unsafe { slice(bundle_ptr, bundle_len) };
    let cls = unsafe { str_of(cls_ptr, cls_len) };
    let meth = unsafe { str_of(meth_ptr, meth_len) };
    let desc = unsafe { str_of(desc_ptr, desc_len) };
    let result = run_static_native(bundle, cls, meth, desc);
    unsafe {
        RESULT = result.into_bytes();
        RESULT.as_ptr()
    }
}

/// Length of the last result string.
#[no_mangle]
pub extern "C" fn result_len() -> usize {
    unsafe { RESULT.len() }
}
