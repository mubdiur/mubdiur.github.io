// ═══════════════════════════════════════════════════════════
// mubdiur.github.io — WebAssembly core
// no_std Rust, compiled with rustc --target wasm32-unknown-unknown
// Engines: MD5, SHA-1, SHA-256, SHA-384, SHA-512, HMAC, CRC32,
//          QR Code encoder (ISO/IEC 18004, full spec), ASN.1 DER parser
// Memory model: bump allocator over linear memory; JS writes input
//               bytes via alloc(), reads results back, then calls reset().
// ═══════════════════════════════════════════════════════════
#![no_std]

use core::arch::wasm32;

const PAGE: usize = 65536;
static mut BUMP: usize = 0;

fn mem_size() -> usize { wasm32::memory_size(0) * PAGE }
fn grow(pages: usize) -> bool { wasm32::memory_grow(0, pages) != usize::MAX }

#[no_mangle]
pub extern "C" fn alloc(n: i32) -> i32 {
    let n = if n < 0 { 0 } else { n as usize };
    unsafe {
        let mut p = (BUMP + 7) & !7;
        while p + n > mem_size() {
            let need = (p + n - mem_size() + PAGE - 1) / PAGE + 1;
            if !grow(need) { return -1; }
        }
        BUMP = p + n;
        p as i32
    }
}

#[no_mangle]
pub extern "C" fn reset() { unsafe { BUMP = 0; } }

unsafe fn sl_mut<'a>(p: i32, len: i32) -> &'a mut [u8] {
    core::slice::from_raw_parts_mut(p as *mut u8, len.max(0) as usize)
}
unsafe fn sl<'a>(p: i32, len: i32) -> &'a [u8] {
    core::slice::from_raw_parts(p as *const u8, len.max(0) as usize)
}
unsafe fn write_u32(p: i32, v: u32) {
    let b = sl_mut(p, 4);
    b[0] = (v & 0xff) as u8; b[1] = ((v >> 8) & 0xff) as u8;
    b[2] = ((v >> 16) & 0xff) as u8; b[3] = ((v >> 24) & 0xff) as u8;
}

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! { loop {} }


/// Allocate a zeroed padded buffer (data || 0x80 || zeros || length-field space).
fn padded_buf<'a>(data: &[u8], block: usize, len_field: usize) -> &'a mut [u8] {
    let n = data.len();
    let padded_len = (n + 1 + len_field + block - 1) & !(block - 1);
    let p = alloc(padded_len as i32);
    let buf = unsafe { sl_mut(p, padded_len as i32) };
    buf.fill(0);
    buf[..n].copy_from_slice(data);
    buf[n] = 0x80;
    buf
}

// ═══════════════════════════════════════════════════════════
// MD5
// ═══════════════════════════════════════════════════════════
const MD5_T: [u32; 64] = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

#[no_mangle]
pub extern "C" fn md5(p: i32, len: i32, out: i32) -> i32 {
    let data = unsafe { sl(p, len) };
    let n = data.len();
    let ml = (n as u64).wrapping_mul(8);
    let padded = padded_buf(data, 64, 8);
    let padded_len = padded.len();
    let mut v = ml;
    for i in 0..8 { padded[padded_len - 8 + i] = (v & 0xff) as u8; v >>= 8; }

    let (mut a0, mut b0, mut c0, mut d0): (u32, u32, u32, u32) =
        (0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476);
    let mut offset = 0;
    while offset < padded_len {
        let mut w = [0u32; 16];
        for i in 0..16 {
            let o = offset + i * 4;
            w[i] = (padded[o] as u32) | ((padded[o + 1] as u32) << 8) | ((padded[o + 2] as u32) << 16) | ((padded[o + 3] as u32) << 24);
        }
        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
        let shifts = [7u32, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
        for i in 0..64usize {
            let (f, g): (u32, usize) = if i < 16 {
                ((b & c) | (!b & d), i)
            } else if i < 32 {
                ((d & b) | (!d & c), (5 * i + 1) % 16)
            } else if i < 48 {
                (b ^ c ^ d, (3 * i + 5) % 16)
            } else {
                (c ^ (b | !d), (7 * i) % 16)
            };
            let k = MD5_T[i];
            let tmp = d;
            d = c;
            c = b;
            let sum = a.wrapping_add(f).wrapping_add(k).wrapping_add(w[g]).rotate_left(shifts[(i >> 4) * 4 + (i & 3)]);
            b = b.wrapping_add(sum);
            a = tmp;
        }
        a0 = a0.wrapping_add(a); b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c); d0 = d0.wrapping_add(d);
        offset += 64;
    }
    let out_b = unsafe { sl_mut(out, 16) };
    for (i, v) in [a0, b0, c0, d0].iter().enumerate() {
        let o = i * 4;
        out_b[o] = (v & 0xff) as u8; out_b[o + 1] = ((v >> 8) & 0xff) as u8;
        out_b[o + 2] = ((v >> 16) & 0xff) as u8; out_b[o + 3] = ((v >> 24) & 0xff) as u8;
    }
    0
}

// ═══════════════════════════════════════════════════════════
// SHA-1
// ═══════════════════════════════════════════════════════════
#[no_mangle]
pub extern "C" fn sha1(p: i32, len: i32, out: i32) -> i32 {
    let data = unsafe { sl(p, len) };
    let n = data.len();
    let ml = (n as u64).wrapping_mul(8);
    let padded = padded_buf(data, 64, 8);
    let padded_len = padded.len();
    let mut v = ml;
    for i in 0..8 { padded[padded_len - 8 + i] = ((v >> (56 - i * 8)) & 0xff) as u8; }

    let mut h = [0x67452301u32, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    let mut offset = 0;
    while offset < padded_len {
        let mut w = [0u32; 80];
        for i in 0..16 {
            let o = offset + i * 4;
            w[i] = ((padded[o] as u32) << 24) | ((padded[o + 1] as u32) << 16) | ((padded[o + 2] as u32) << 8) | (padded[o + 3] as u32);
        }
        for i in 16..80 { w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1); }
        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for i in 0..80 {
            let (f, k) = if i < 20 { ((b & c) | ((!b) & d), 0x5a827999u32) }
                else if i < 40 { (b ^ c ^ d, 0x6ed9eba1) }
                else if i < 60 { ((b & c) | (b & d) | (c & d), 0x8f1bbcdc) }
                else { (b ^ c ^ d, 0xca62c1d6) };
            let tmp = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(w[i]);
            e = d; d = c; c = b.rotate_left(30); b = a; a = tmp;
        }
        h[0] = h[0].wrapping_add(a); h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c); h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        offset += 64;
    }
    let out_b = unsafe { sl_mut(out, 20) };
    for i in 0..5 {
        out_b[i * 4] = (h[i] >> 24) as u8; out_b[i * 4 + 1] = (h[i] >> 16) as u8;
        out_b[i * 4 + 2] = (h[i] >> 8) as u8; out_b[i * 4 + 3] = h[i] as u8;
    }
    0
}

// ═══════════════════════════════════════════════════════════
// SHA-256
// ═══════════════════════════════════════════════════════════
const K256: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const H256: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

fn sha256_blocks(padded: &[u8], h: &mut [u32; 8]) {
    let mut offset = 0;
    while offset < padded.len() {
        let mut w = [0u32; 64];
        for i in 0..16 {
            let o = offset + i * 4;
            w[i] = ((padded[o] as u32) << 24) | ((padded[o + 1] as u32) << 16) | ((padded[o + 2] as u32) << 8) | (padded[o + 3] as u32);
        }
        for i in 16..64 {
            let s0 = (w[i - 15]).rotate_right(7) ^ (w[i - 15]).rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = (w[i - 2]).rotate_right(17) ^ (w[i - 2]).rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) = (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K256[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g; g = f; f = e; e = d.wrapping_add(t1);
            d = c; c = b; b = a; a = t1.wrapping_add(t2);
        }
        h[0] = h[0].wrapping_add(a); h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c); h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e); h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g); h[7] = h[7].wrapping_add(hh);
        offset += 64;
    }
}

#[no_mangle]
pub extern "C" fn sha256(p: i32, len: i32, out: i32) -> i32 {
    let data = unsafe { sl(p, len) };
    let n = data.len();
    let padded = padded_buf(data, 64, 8);
    let padded_len = padded.len();
    let ml = (n as u64).wrapping_mul(8);
    let mut v = ml;
    for i in 0..8 { padded[padded_len - 8 + i] = ((v >> (56 - i * 8)) & 0xff) as u8; }
    let mut h = H256;
    sha256_blocks(padded, &mut h);
    let out_b = unsafe { sl_mut(out, 32) };
    for i in 0..8 {
        out_b[i * 4] = (h[i] >> 24) as u8; out_b[i * 4 + 1] = (h[i] >> 16) as u8;
        out_b[i * 4 + 2] = (h[i] >> 8) as u8; out_b[i * 4 + 3] = h[i] as u8;
    }
    0
}

// ═══════════════════════════════════════════════════════════
// SHA-512 / SHA-384
// ═══════════════════════════════════════════════════════════
const K512: [u64; 80] = [
    0x428a2f98d728ae22, 0x7137449123ef65cd, 0xb5c0fbcfec4d3b2f, 0xe9b5dba58189dbbc,
    0x3956c25bf348b538, 0x59f111f1b605d019, 0x923f82a4af194f9b, 0xab1c5ed5da6d8118,
    0xd807aa98a3030242, 0x12835b0145706fbe, 0x243185be4ee4b28c, 0x550c7dc3d5ffb4e2,
    0x72be5d74f27b896f, 0x80deb1fe3b1696b1, 0x9bdc06a725c71235, 0xc19bf174cf692694,
    0xe49b69c19ef14ad2, 0xefbe4786384f25e3, 0x0fc19dc68b8cd5b5, 0x240ca1cc77ac9c65,
    0x2de92c6f592b0275, 0x4a7484aa6ea6e483, 0x5cb0a9dcbd41fbd4, 0x76f988da831153b5,
    0x983e5152ee66dfab, 0xa831c66d2db43210, 0xb00327c898fb213f, 0xbf597fc7beef0ee4,
    0xc6e00bf33da88fc2, 0xd5a79147930aa725, 0x06ca6351e003826f, 0x142929670a0e6e70,
    0x27b70a8546d22ffc, 0x2e1b21385c26c926, 0x4d2c6dfc5ac42aed, 0x53380d139d95b3df,
    0x650a73548baf63de, 0x766a0abb3c77b2a8, 0x81c2c92e47edaee6, 0x92722c851482353b,
    0xa2bfe8a14cf10364, 0xa81a664bbc423001, 0xc24b8b70d0f89791, 0xc76c51a30654be30,
    0xd192e819d6ef5218, 0xd69906245565a910, 0xf40e35855771202a, 0x106aa07032bbd1b8,
    0x19a4c116b8d2d0c8, 0x1e376c085141ab53, 0x2748774cdf8eeb99, 0x34b0bcb5e19b48a8,
    0x391c0cb3c5c95a63, 0x4ed8aa4ae3418acb, 0x5b9cca4f7763e373, 0x682e6ff3d6b2b8a3,
    0x748f82ee5defb2fc, 0x78a5636f43172f60, 0x84c87814a1f0ab72, 0x8cc702081a6439ec,
    0x90befffa23631e28, 0xa4506cebde82bde9, 0xbef9a3f7b2c67915, 0xc67178f2e372532b,
    0xca273eceea26619c, 0xd186b8c721c0c207, 0xeada7dd6cde0eb1e, 0xf57d4f7fee6ed178,
    0x06f067aa72176fba, 0x0a637dc5a2c898a6, 0x113f9804bef90dae, 0x1b710b35131c471b,
    0x28db77f523047d84, 0x32caab7b40c72493, 0x3c9ebe0a15c9bebc, 0x431d67c49c100d4c,
    0x4cc5d4becb3e42b6, 0x597f299cfc657e2a, 0x5fcb6fab3ad6faec, 0x6c44198c4a475817,
];
const H512: [u64; 8] = [
    0x6a09e667f3bcc908, 0xbb67ae8584caa73b, 0x3c6ef372fe94f82b, 0xa54ff53a5f1d36f1,
    0x510e527fade682d1, 0x9b05688c2b3e6c1f, 0x1f83d9abfb41bd6b, 0x5be0cd19137e2179,
];
const H384: [u64; 8] = [
    0xcbbb9d5dc1059ed8, 0x629a292a367cd507, 0x9159015a3070dd17, 0x152fecd8f70e5939,
    0x67332667ffc00b31, 0x8eb44a8768581511, 0xdb0c2e0d64f98fa7, 0x47b5481dbefa4fa4,
];

fn sha512_blocks(padded: &[u8], h: &mut [u64; 8]) {
    let mut offset = 0;
    while offset < padded.len() {
        let mut w = [0u64; 80];
        for i in 0..16 {
            let o = offset + i * 8;
            let mut v = 0u64;
            for j in 0..8 { v = (v << 8) | (padded[o + j] as u64); }
            w[i] = v;
        }
        for i in 16..80 {
            let s0 = (w[i - 15]).rotate_right(1) ^ (w[i - 15]).rotate_right(8) ^ (w[i - 15] >> 7);
            let s1 = (w[i - 2]).rotate_right(19) ^ (w[i - 2]).rotate_right(61) ^ (w[i - 2] >> 6);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) = (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for i in 0..80 {
            let s1 = e.rotate_right(14) ^ e.rotate_right(18) ^ e.rotate_right(41);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K512[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(28) ^ a.rotate_right(34) ^ a.rotate_right(39);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g; g = f; f = e; e = d.wrapping_add(t1);
            d = c; c = b; b = a; a = t1.wrapping_add(t2);
        }
        h[0] = h[0].wrapping_add(a); h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c); h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e); h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g); h[7] = h[7].wrapping_add(hh);
        offset += 128;
    }
}

fn sha512_impl(p: i32, len: i32, out: i32, variant: u8) -> i32 {
    let data = unsafe { sl(p, len) };
    let n = data.len();
    let padded = padded_buf(data, 128, 16);
    let padded_len = padded.len();
    let ml = (n as u64).wrapping_mul(8);
    let mut v = ml;
    for i in 0..8 { padded[padded_len - 8 + i] = ((v >> (56 - i * 8)) & 0xff) as u8; }
    let mut h = if variant == 0 { H512 } else { H384 };
    sha512_blocks(padded, &mut h);
    let out_len: usize = if variant == 0 { 64 } else { 48 };
    let out_b = unsafe { sl_mut(out, out_len as i32) };
    for i in 0..(out_len / 8) {
        for j in 0..8 { out_b[i * 8 + j] = (h[i] >> (56 - j * 8)) as u8; }
    }
    0
}

#[no_mangle]
pub extern "C" fn sha512(p: i32, len: i32, out: i32) -> i32 { sha512_impl(p, len, out, 0) }
#[no_mangle]
pub extern "C" fn sha384(p: i32, len: i32, out: i32) -> i32 { sha512_impl(p, len, out, 1) }

// ═══════════════════════════════════════════════════════════
// HMAC (over SHA-1 or SHA-256), CRC32
// ═══════════════════════════════════════════════════════════
#[no_mangle]
pub extern "C" fn hmac(p: i32, len: i32, key_p: i32, key_len: i32, alg: i32, out: i32) -> i32 {
    let data = unsafe { sl(p, len) };
    let key = unsafe { sl(key_p, key_len) };
    let block = 64usize;
    let (hsize, hash_fn): (usize, fn(&[u8], &mut [u8])) = if alg == 0 { (20, hash_sha1_digest) } else { (32, hash_sha256_digest) };
    let mut k = [0u8; 64];
    if key.len() > block {
        let mut tmp = [0u8; 64];
        hash_fn(key, &mut tmp);
        k[..hsize].copy_from_slice(&tmp[..hsize]);
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0u8; 64];
    let mut opad = [0u8; 64];
    for i in 0..64 { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
    // inner: hash(ipad || data)
    let inner_len = 64 + data.len();
    let inner_p = alloc(inner_len as i32);
    if inner_p < 0 { return -1; }
    let inner_buf = unsafe { sl_mut(inner_p, inner_len as i32) };
    inner_buf[..64].copy_from_slice(&ipad);
    inner_buf[64..].copy_from_slice(data);
    let mut inner = [0u8; 64];
    hash_fn(inner_buf, &mut inner);
    // outer: hash(opad || inner)
    let outer_len = 64 + hsize;
    let outer_p = alloc(outer_len as i32);
    if outer_p < 0 { return -1; }
    let outer_buf = unsafe { sl_mut(outer_p, outer_len as i32) };
    outer_buf[..64].copy_from_slice(&opad);
    outer_buf[64..].copy_from_slice(&inner[..hsize]);
    let out_b = unsafe { sl_mut(out, hsize as i32) };
    hash_fn(outer_buf, out_b);
    0
}

fn hash_sha1_digest(data: &[u8], out: &mut [u8]) {
    // Single-shot SHA-1 with its own padding (data < 2^61 bytes)
    let n = data.len();
    let padded = padded_buf(data, 64, 8);
    let padded_len = padded.len();
    let ml = (n as u64).wrapping_mul(8);
    let mut v = ml;
    for i in 0..8 { padded[padded_len - 8 + i] = ((v >> (56 - i * 8)) & 0xff) as u8; }
    let mut h = [0x67452301u32, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    let mut offset = 0;
    while offset < padded_len {
        let mut w = [0u32; 80];
        for i in 0..16 {
            let o = offset + i * 4;
            w[i] = ((padded[o] as u32) << 24) | ((padded[o + 1] as u32) << 16) | ((padded[o + 2] as u32) << 8) | (padded[o + 3] as u32);
        }
        for i in 16..80 { w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1); }
        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for i in 0..80 {
            let (f, k) = if i < 20 { ((b & c) | ((!b) & d), 0x5a827999u32) }
                else if i < 40 { (b ^ c ^ d, 0x6ed9eba1) }
                else if i < 60 { ((b & c) | (b & d) | (c & d), 0x8f1bbcdc) }
                else { (b ^ c ^ d, 0xca62c1d6) };
            let tmp = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(w[i]);
            e = d; d = c; c = b.rotate_left(30); b = a; a = tmp;
        }
        h[0] = h[0].wrapping_add(a); h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c); h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        offset += 64;
    }
    for i in 0..5 {
        out[i * 4] = (h[i] >> 24) as u8; out[i * 4 + 1] = (h[i] >> 16) as u8;
        out[i * 4 + 2] = (h[i] >> 8) as u8; out[i * 4 + 3] = h[i] as u8;
    }
}

fn hash_sha256_digest(data: &[u8], out: &mut [u8]) {
    let n = data.len();
    let padded = padded_buf(data, 64, 8);
    let padded_len = padded.len();
    let ml = (n as u64).wrapping_mul(8);
    let mut v = ml;
    for i in 0..8 { padded[padded_len - 8 + i] = ((v >> (56 - i * 8)) & 0xff) as u8; }
    let mut h = H256;
    sha256_blocks(padded, &mut h);
    for i in 0..8 {
        out[i * 4] = (h[i] >> 24) as u8; out[i * 4 + 1] = (h[i] >> 16) as u8;
        out[i * 4 + 2] = (h[i] >> 8) as u8; out[i * 4 + 3] = h[i] as u8;
    }
}

#[no_mangle]
pub extern "C" fn crc32(p: i32, len: i32, out: i32) -> i32 {
    let data = unsafe { sl(p, len) };
    let mut table = [0u32; 256];
    for i in 0..256 {
        let mut c = i as u32;
        for _ in 0..8 { c = if c & 1 != 0 { 0xedb88320 ^ (c >> 1) } else { c >> 1 }; }
        table[i] = c;
    }
    let mut crc = 0xffffffffu32;
    for &b in data { crc = table[((crc ^ b as u32) & 0xff) as usize] ^ (crc >> 8); }
    let v = !crc;
    let out_b = unsafe { sl_mut(out, 4) };
    out_b[0] = (v >> 24) as u8; out_b[1] = (v >> 16) as u8;
    out_b[2] = (v >> 8) as u8; out_b[3] = v as u8;
    0
}

// ═══════════════════════════════════════════════════════════
// QR Code encoder — ISO/IEC 18004 (byte mode, versions 1-40)
// ═══════════════════════════════════════════════════════════
const ECC_CODEWORDS_PER_BLOCK: [[i8; 41]; 4] = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_ERROR_CORRECTION_BLOCKS: [[i8; 41]; 4] = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

fn qr_num_raw_data_modules(ver: usize) -> usize {
    let mut result = (16 * ver + 128) * ver + 64;
    if ver >= 2 {
        let num_align = ver / 7 + 2;
        result -= (25 * num_align - 10) * num_align - 55;
        if ver >= 7 { result -= 36; }
    }
    result
}
fn qr_num_data_codewords(ver: usize, ecl: usize) -> usize {
    qr_num_raw_data_modules(ver) / 8
        - (ECC_CODEWORDS_PER_BLOCK[ecl][ver] as usize) * (NUM_ERROR_CORRECTION_BLOCKS[ecl][ver] as usize)
}
fn qr_alignment_positions(ver: usize, out: &mut [usize; 7]) -> usize {
    if ver == 1 { return 0; }
    let num_align = ver / 7 + 2;
    let step = (ver * 8 + num_align * 3 + 5) / (num_align * 4 - 4) * 2;
    let mut pos = ver * 4 + 10;
    for i in (1..num_align).rev() {
        out[i] = pos;
        pos = pos.wrapping_sub(step);
    }
    out[0] = 6;
    num_align
}

fn rs_multiply(x: u8, y: u8) -> u8 {
    let mut z = 0u8;
    for i in 0..8 {
        z = z.wrapping_shl(1) ^ ((z >> 7) * 0x1D);
        z ^= ((y >> (7 - i)) & 1).wrapping_mul(x);
    }
    z
}

fn rs_compute_divisor(degree: usize, result: &mut [u8]) {
    for r in result.iter_mut() { *r = 0; }
    result[degree - 1] = 1;
    let mut root: u8 = 1;
    for _ in 0..degree {
        for j in 0..degree {
            result[j] = rs_multiply(result[j], root);
            if j + 1 < degree { result[j] ^= result[j + 1]; }
        }
        root = rs_multiply(root, 2);
    }
}

fn rs_compute_remainder(data: &[u8], generator: &[u8], degree: usize, result: &mut [u8]) {
    for r in result.iter_mut() { *r = 0; }
    for i in 0..data.len() {
        let factor = data[i] ^ result[0];
        for j in 0..degree - 1 { result[j] = result[j + 1]; }
        result[degree - 1] = 0;
        for j in 0..degree { result[j] ^= rs_multiply(generator[j], factor); }
    }
}

fn qr_make_codewords(data: &[u8], ver: usize, ecl: usize, result: &mut [u8]) {
    let num_blocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver] as usize;
    let block_ecc_len = ECC_CODEWORDS_PER_BLOCK[ecl][ver] as usize;
    let raw_codewords = qr_num_raw_data_modules(ver) / 8;
    let data_len = qr_num_data_codewords(ver, ecl);
    let num_short_blocks = num_blocks - raw_codewords % num_blocks;
    let short_block_data_len = raw_codewords / num_blocks - block_ecc_len;

    let mut rsdiv = [0u8; 30];
    rs_compute_divisor(block_ecc_len, &mut rsdiv);
    let mut dat = 0usize;
    let mut ecc_work = [0u8; 30];
    for i in 0..num_blocks {
        let dat_len = short_block_data_len + if i < num_short_blocks { 0 } else { 1 };
        rs_compute_remainder(&data[dat..dat + dat_len], &rsdiv, block_ecc_len, &mut ecc_work);
        let mut j = 0;
        let mut k = i;
        while j < dat_len {
            if j == short_block_data_len { k = k.wrapping_sub(num_short_blocks); }
            result[k] = data[dat + j];
            k += num_blocks;
            j += 1;
        }
        for j in 0..block_ecc_len {
            result[data_len + i + j * num_blocks] = ecc_work[j];
        }
        dat += dat_len;
    }
}

// matrix as Vec<u8> via bump allocator: size*size bytes, 1 = dark
fn qr_draw_function_modules(matrix: &mut [u8], ver: usize, size: usize) {
    let at = |m: &mut [u8], x: usize, y: usize| { m[y * size + x] = 1; };
    // timing columns/rows
    for i in 0..size { at(matrix, 6, i); at(matrix, i, 6); }
    // 3 finder pattern areas (9x9 / 8x9 / 9x8)
    for dy in 0..9 { for dx in 0..9 { at(matrix, dx, dy); } }
    for dy in 0..9 { for dx in 0..8 { at(matrix, size - 8 + dx, dy); } }
    for dy in 0..8 { for dx in 0..9 { at(matrix, dx, size - 8 + dy); } }
    // alignment patterns
    let mut align = [0usize; 7];
    let num_align = qr_alignment_positions(ver, &mut align);
    for i in 0..num_align {
        for j in 0..num_align {
            if (i == 0 && j == 0) || (i == 0 && j == num_align - 1) || (i == num_align - 1 && j == 0) { continue; }
            let cx = align[i];
            let cy = align[j];
            for dy in 0..5 { for dx in 0..5 {
                let x = cx + dx - 2;
                let y = cy + dy - 2;
                if x < size && y < size { at(matrix, x, y); }
            } }
        }
    }
    // version blocks
    if ver >= 7 {
        for dy in 0..6 { for dx in 0..3 { at(matrix, size - 11 + dx, dy); at(matrix, dy, size - 11 + dx); } }
    }
}

fn qr_draw_light_function_modules(matrix: &mut [u8], ver: usize, size: usize) {
    let get = |m: &[u8], x: usize, y: usize| m[y * size + x] != 0;
    let set = |m: &mut [u8], x: usize, y: usize, v: bool| m[y * size + x] = if v { 1 } else { 0 };
    // timing patterns
    let mut i = 7;
    while i < size - 7 { set(matrix, 6, i, false); set(matrix, i, 6, false); i += 2; }
    // finder patterns
    for dy in -4i32..=4 {
        for dx in -4i32..=4 {
            let dist = dx.abs().max(dy.abs());
            if dist == 2 || dist == 4 {
                let fx = 3i32 + dx;
                let fy = 3i32 + dy;
                let fx2 = size as i32 - 4 + dx;
                let fy2 = size as i32 - 4 + dy;
                if fx >= 0 && fy >= 0 { set(matrix, fx as usize, fy as usize, false); }
                if fx2 >= 0 && fx2 < size as i32 && fy >= 0 { set(matrix, fx2 as usize, fy as usize, false); }
                if fx >= 0 && fy2 >= 0 && fy2 < size as i32 { set(matrix, fx as usize, fy2 as usize, false); }
            }
        }
    }
    // alignment patterns
    let mut align = [0usize; 7];
    let num_align = qr_alignment_positions(ver, &mut align);
    for i in 0..num_align {
        for j in 0..num_align {
            if (i == 0 && j == 0) || (i == 0 && j == num_align - 1) || (i == num_align - 1 && j == 0) { continue; }
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    let x = align[i] as i32 + dx;
                    let y = align[j] as i32 + dy;
                    if x >= 0 && y >= 0 && (x as usize) < size && (y as usize) < size {
                        set(matrix, x as usize, y as usize, dx == 0 && dy == 0);
                    }
                }
            }
        }
    }
    // version blocks
    if ver >= 7 {
        let mut rem = ver;
        for _ in 0..12 { rem = (rem << 1) ^ ((rem >> 11) * 0x1F25); }
        let mut bits = ((ver as u64) << 12) | (rem as u64);
        for i in 0..6 {
            for j in 0..3 {
                let k = size - 11 + j;
                let dark = (bits & 1) != 0;
                set(matrix, k, i, dark);
                set(matrix, i, k, dark);
                bits >>= 1;
            }
        }
    }
}

fn qr_draw_format_bits(matrix: &mut [u8], ecl: usize, mask: usize, size: usize) {
    let table = [1usize, 0, 3, 2];
    let data = (table[ecl] << 3) | mask;
    let mut rem = data;
    for _ in 0..10 { rem = (rem << 1) ^ ((rem >> 9) * 0x537); }
    let bits = ((data << 10) | rem) ^ 0x5412;
    let set = |m: &mut [u8], x: usize, y: usize, v: bool| m[y * size + x] = if v { 1 } else { 0 };
    let mut i = 0;
    while i <= 5 { set(matrix, 8, i, bits & (1 << i) != 0); i += 1; }
    set(matrix, 8, 7, bits & (1 << 6) != 0);
    set(matrix, 8, 8, bits & (1 << 7) != 0);
    set(matrix, 7, 8, bits & (1 << 8) != 0);
    let mut i = 9;
    while i < 15 { set(matrix, 14 - i, 8, bits & (1 << i) != 0); i += 1; }
    let mut i = 0;
    while i < 8 { set(matrix, size - 1 - i, 8, bits & (1 << i) != 0); i += 1; }
    let mut i = 8;
    while i < 15 { set(matrix, 8, size - 15 + i, bits & (1 << i) != 0); i += 1; }
    set(matrix, 8, size - 8, true);
}

fn qr_draw_codewords(matrix: &mut [u8], data: &[u8], size: usize) {
    let get = |m: &[u8], x: usize, y: usize| m[y * size + x] != 0;
    let set = |m: &mut [u8], x: usize, y: usize, v: bool| m[y * size + x] = if v { 1 } else { 0 };
    let mut bit_idx = 0usize;
    let mut right = size - 1;
    loop {
        if right == 6 { right = 5; }
        let mut vert = 0usize;
        while vert < size {
            for j in 0..2 {
                let x = right - j;
                let upward = (right + 1) & 2 == 0;
                let y = if upward { size - 1 - vert } else { vert };
                if !get(matrix, x, y) && bit_idx < data.len() * 8 {
                    let dark = (data[bit_idx >> 3] >> (7 - (bit_idx & 7))) & 1 != 0;
                    set(matrix, x, y, dark);
                    bit_idx += 1;
                }
            }
            vert += 1;
        }
        if right < 2 { break; }
        right -= 2;
    }
}

fn qr_apply_mask(matrix: &mut [u8], function_mask: &[u8], mask: usize, size: usize) {
    for y in 0..size {
        for x in 0..size {
            if function_mask[y * size + x] != 0 { continue; }
            let invert = match mask {
                0 => (x + y) % 2 == 0,
                1 => y % 2 == 0,
                2 => x % 3 == 0,
                3 => (x + y) % 3 == 0,
                4 => (x / 3 + y / 2) % 2 == 0,
                5 => x * y % 2 + x * y % 3 == 0,
                6 => (x * y % 2 + x * y % 3) % 2 == 0,
                _ => ((x + y) % 2 + x * y % 3) % 2 == 0,
            };
            if invert { matrix[y * size + x] ^= 1; }
        }
    }
}

fn qr_penalty_score(matrix: &[u8], size: usize) -> i64 {
    let get = |x: usize, y: usize| matrix[y * size + x] != 0;
    let mut result: i64 = 0;
    // rows
    for y in 0..size {
        let mut run_color = false;
        let mut run_x = 0i64;
        let mut history = [0i64; 7];
        for x in 0..size {
            let c = get(x, y);
            if c == run_color {
                run_x += 1;
                if run_x == 5 { result += 3; } else if run_x > 5 { result += 1; }
            } else {
                finder_add_history(run_x, &mut history, size);
                if !run_color { result += finder_count_patterns(&history, size) * 40; }
                run_color = c;
                run_x = 1;
            }
        }
        result += finder_terminate(run_color, run_x, &mut history, size) * 40;
    }
    // columns
    for x in 0..size {
        let mut run_color = false;
        let mut run_y = 0i64;
        let mut history = [0i64; 7];
        for y in 0..size {
            let c = get(x, y);
            if c == run_color {
                run_y += 1;
                if run_y == 5 { result += 3; } else if run_y > 5 { result += 1; }
            } else {
                finder_add_history(run_y, &mut history, size);
                if !run_color { result += finder_count_patterns(&history, size) * 40; }
                run_color = c;
                run_y = 1;
            }
        }
        result += finder_terminate(run_color, run_y, &mut history, size) * 40;
    }
    // 2x2 blocks
    for y in 0..size - 1 {
        for x in 0..size - 1 {
            let c = get(x, y);
            if c == get(x + 1, y) && c == get(x, y + 1) && c == get(x + 1, y + 1) { result += 3; }
        }
    }
    // dark balance
    let mut dark = 0i64;
    for y in 0..size { for x in 0..size { if get(x, y) { dark += 1; } } }
    let total = (size * size) as i64;
    let k = ((dark * 20 - total * 10).abs() + total - 1) / total - 1;
    result += k * 10;
    result
}

fn finder_add_history(run: i64, history: &mut [i64; 7], qrsize: usize) {
    let mut r = run;
    if history[0] == 0 { r += qrsize as i64; }
    history.copy_within(0..6, 1);
    history[0] = r;
}
fn finder_count_patterns(history: &[i64; 7], _qrsize: usize) -> i64 {
    let n = history[1];
    let core = n > 0 && history[2] == n && history[3] == n * 3 && history[4] == n && history[5] == n;
    let a = if core && history[0] >= n * 4 && history[6] >= n { 1 } else { 0 };
    let b = if core && history[6] >= n * 4 && history[0] >= n { 1 } else { 0 };
    a + b
}
fn finder_terminate(run_color: bool, run_len: i64, history: &mut [i64; 7], qrsize: usize) -> i64 {
    let mut r = run_len;
    if run_color {
        finder_add_history(r, history, qrsize);
        r = 0;
    }
    r += qrsize as i64;
    finder_add_history(r, history, qrsize);
    finder_count_patterns(history, qrsize)
}

/// qr_encode(data, len, ecl(0=L,1=M,2=Q,3=H), out_matrix_ptr(4), out_size_ptr(4)) -> 0 ok, -1 too long
#[no_mangle]
pub extern "C" fn qr_encode(p: i32, len: i32, ecl: i32, out_matrix_ptr: i32, out_size_ptr: i32) -> i32 {
    let data = unsafe { sl(p, len) };
    let ecl = if ecl < 0 { 0 } else if ecl > 3 { 3 } else { ecl as usize };
    if data.is_empty() || data.len() > 2953 { return -1; }

    // choose version (byte mode)
    let mut ver = 0usize;
    for v in 1..=40usize {
        let capacity_bits = qr_num_data_codewords(v, ecl) * 8;
        let count_bits = if v <= 9 { 8 } else { 16 };
        let used = 4 + count_bits + data.len() * 8;
        if used <= capacity_bits { ver = v; break; }
    }
    if ver == 0 { return -1; }

    // build data bitstream
    let data_capacity_bits = qr_num_data_codewords(ver, ecl) * 8;
    let count_bits = if ver <= 9 { 8 } else { 16 };
    let mut bitstream = alloc(((data_capacity_bits + 7) / 8) as i32);
    let bs = unsafe { sl_mut(bitstream, ((data_capacity_bits + 7) / 8) as i32) };
    for b in bs.iter_mut() { *b = 0; }
    let mut bit_len = 0usize;
    let mut append = |val: u32, num_bits: usize, bl: &mut usize| {
        for i in (0..num_bits).rev() {
            if *bl >= data_capacity_bits { return; }
            let bit = ((val >> i) & 1) != 0;
            if bit { bs[*bl >> 3] |= 1 << (7 - (*bl & 7)); }
            *bl += 1;
        }
    };
    append(4, 4, &mut bit_len);
    append(data.len() as u32, count_bits, &mut bit_len);
    for &b in data { append(b as u32, 8, &mut bit_len); }
    // terminator
    let term = if data_capacity_bits - bit_len > 4 { 4 } else { data_capacity_bits - bit_len };
    append(0, term, &mut bit_len);
    append(0, (8 - bit_len % 8) % 8, &mut bit_len);
    // pad
    let mut pad = 0xECu8;
    while bit_len < data_capacity_bits {
        append(pad as u32, 8, &mut bit_len);
        pad ^= 0xEC ^ 0x11;
    }

    // ECC + interleave
    let raw_codewords = qr_num_raw_data_modules(ver) / 8;
    let ecc_buf = alloc(raw_codewords as i32);
    let codewords = unsafe { sl_mut(ecc_buf, raw_codewords as i32) };
    qr_make_codewords(bs, ver, ecl, codewords);

    // matrix
    let size = ver * 4 + 17;
    let mtx = alloc((size * size) as i32);
    let matrix = unsafe { sl_mut(mtx, (size * size) as i32) };
    for m in matrix.iter_mut() { *m = 0; }
    qr_draw_function_modules(matrix, ver, size);
    // copy function modules snapshot
    let func_buf = alloc((size * size) as i32);
    let function_mask = unsafe { sl_mut(func_buf, (size * size) as i32) };
    function_mask.copy_from_slice(matrix);
    qr_draw_codewords(matrix, codewords, size);
    qr_draw_light_function_modules(matrix, ver, size);

    // try 8 masks, pick best
    let trial_buf = alloc((size * size) as i32);
    let trial = unsafe { sl_mut(trial_buf, (size * size) as i32) };
    let mut best_mask = 0usize;
    let mut best_penalty = i64::MAX;
    for mask in 0..8 {
        trial.copy_from_slice(matrix);
        qr_apply_mask(trial, function_mask, mask, size);
        qr_draw_format_bits(trial, ecl, mask, size);
        let penalty = qr_penalty_score(trial, size);
        if penalty < best_penalty { best_penalty = penalty; best_mask = mask; }
    }
    qr_apply_mask(matrix, function_mask, best_mask, size);
    qr_draw_format_bits(matrix, ecl, best_mask, size);

    unsafe {
        write_u32(out_matrix_ptr, mtx as u32);
        write_u32(out_size_ptr, size as u32);
    }
    0
}

// ═══════════════════════════════════════════════════════════
// ASN.1 DER parser → JSON string
// ═══════════════════════════════════════════════════════════
const TAG_NAMES: [&str; 32] = [
    "EOC", "BOOLEAN", "INTEGER", "BIT STRING", "OCTET STRING", "NULL", "OID", "OBJDESCRIPTOR",
    "EXTERNAL", "REAL", "ENUMERATED", "EMBEDDED PDV", "UTF8String", "RELATIVE-OID", "TIME", "RESERVED",
    "SEQUENCE", "SET", "NUMERICSTRING", "PRINTABLESTRING", "T61STRING", "VIDEOTEXSTRING", "IA5STRING", "UTCTIME",
    "GENERALIZEDTIME", "GRAPHICSTRING", "VISIBLESTRING", "GENERALSTRING", "UNIVERSALSTRING", "CHARACTERSTRING", "BMPSTRING", "DATE",
];

struct JsonOut {
    buf: VecU8,
}
struct VecU8 { data: *mut u8, len: usize, cap: usize }
impl VecU8 {
    fn new() -> VecU8 {
        let cap = 4096usize;
        let data = unsafe { sl_mut(alloc(cap as i32), cap as i32).as_mut_ptr() };
        VecU8 { data, len: 0, cap }
    }
    fn push(&mut self, b: u8) {
        if self.len >= self.cap {
            let new_cap = self.cap * 2;
            let new_data = unsafe { sl_mut(alloc((new_cap - self.cap) as i32), (new_cap - self.cap) as i32).as_mut_ptr() };
            unsafe { core::ptr::copy_nonoverlapping(self.data, new_data, self.len); }
            self.data = new_data;
            self.cap = new_cap;
        }
        unsafe { *self.data.add(self.len) = b; }
        self.len += 1;
    }
    fn push_str(&mut self, s: &str) { for &b in s.as_bytes() { self.push(b); } }
    fn as_slice(&self) -> &[u8] { unsafe { core::slice::from_raw_parts(self.data, self.len) } }
}

impl JsonOut {
    fn new() -> JsonOut { JsonOut { buf: VecU8::new() } }
    fn push(&mut self, b: u8) { self.buf.push(b); }
    fn push_str(&mut self, s: &str) { self.buf.push_str(s); }
}

fn hex_str(v: u8) -> [u8; 2] {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    [HEX[(v >> 4) as usize], HEX[(v & 0xf) as usize]]
}

fn json_escape(out: &mut JsonOut, s: &[u8]) {
    out.push(b'"');
    for &b in s {
        match b {
            b'"' => out.push_str("\\\""),
            b'\\' => out.push_str("\\\\"),
            b'\n' => out.push_str("\\n"),
            b'\r' => out.push_str("\\r"),
            b'\t' => out.push_str("\\t"),
            0x20..=0x7e => out.push(b),
            _ => { out.push_str("\\u00"); let h = hex_str(b); out.push(h[0]); out.push(h[1]); }
        }
    }
    out.push(b'"');
}

fn oid_name(oid: &[u8]) -> Option<&'static str> {
    // (encoded oid bytes, name)
    const MAP: &[(&[u8], &str)] = &[
        (&[0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01], "rsaEncryption"),
        (&[0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x04], "md5WithRSAEncryption"),
        (&[0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x05], "sha1WithRSAEncryption"),
        (&[0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x0B], "sha256WithRSAEncryption"),
        (&[0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x0C], "sha384WithRSAEncryption"),
        (&[0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x0D], "sha512WithRSAEncryption"),
        (&[0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01], "ecPublicKey"),
        (&[0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07], "prime256v1"),
        (&[0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x01], "secp384r1"),
        (&[0x55, 0x04, 0x03], "commonName"),
        (&[0x55, 0x04, 0x06], "countryName"),
        (&[0x55, 0x04, 0x07], "localityName"),
        (&[0x55, 0x04, 0x08], "stateOrProvinceName"),
        (&[0x55, 0x04, 0x0A], "organizationName"),
        (&[0x55, 0x04, 0x0B], "organizationalUnitName"),
        (&[0x55, 0x04, 0x05], "serialNumber"),
        (&[0x55, 0x04, 0x09], "streetAddress"),
        (&[0x55, 0x04, 0x11], "postalCode"),
        (&[0x55, 0x04, 0x07, 0x00], "dnQualifier"),
        (&[0x55, 0x04, 0x07, 0x02], "surname"),
        (&[0x55, 0x04, 0x07, 0x04], "givenName"),
        (&[0x55, 0x04, 0x07, 0x05], "initials"),
        (&[0x55, 0x04, 0x07, 0x06], "generationQualifier"),
        (&[0x55, 0x04, 0x07, 0x08], "pseudonym"),
        (&[0x55, 0x04, 0x07, 0x09], "title"),
        (&[0x55, 0x1D, 0x0E], "subjectKeyIdentifier"),
        (&[0x55, 0x1D, 0x0F], "keyUsage"),
        (&[0x55, 0x1D, 0x10], "privateKeyUsagePeriod"),
        (&[0x55, 0x1D, 0x11], "subjectAltName"),
        (&[0x55, 0x1D, 0x12], "issuerAltName"),
        (&[0x55, 0x1D, 0x13], "basicConstraints"),
        (&[0x55, 0x1D, 0x14], "crlNumber"),
        (&[0x55, 0x1D, 0x1E], "tlsFeature"),
        (&[0x55, 0x1D, 0x1F], "subjectInformationAccess"),
        (&[0x55, 0x1D, 0x20], "authorityInfoAccess"),
        (&[0x55, 0x1D, 0x23], "authorityKeyIdentifier"),
        (&[0x55, 0x1D, 0x25], "extKeyUsage"),
        (&[0x55, 0x1D, 0x1C], "ocspNoCheck"),
        (&[0x55, 0x1D, 0x1B], "cRLDistributionPoints"),
        (&[0x55, 0x1D, 0x1D], "certificatePolicies"),
        (&[0x2B, 0x06, 0x01, 0x04, 0x01, 0xD6, 0x79, 0x02, 0x04, 0x02], "signedCertificateTimestampList"),
        (&[0x2B, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30, 0x01], "ocsp"),
        (&[0x2B, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30, 0x02], "caIssuers"),
        (&[0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x09, 0x01], "emailAddress"),
        (&[0x55, 0x04, 0x04], "surname"),
        (&[0x55, 0x04, 0x2A], "domainComponent"),
        (&[0x09, 0x92, 0x26, 0x89, 0x93, 0xF2, 0x2C, 0x64, 0x01, 0x19], "x509v3Extensions"),
    ];
    for (b, n) in MAP { if *b == oid { return Some(n); } }
    None
}

fn oid_to_string(oid: &[u8]) -> VecU8 {
    let mut out = JsonOut::new();
    push_oid(&mut out, oid);
    out.buf
}

fn push_u64(out: &mut JsonOut, mut v: u64) {
    if v == 0 { out.push(b'0'); return; }
    let mut buf = [0u8; 20];
    let mut i = 20;
    while v > 0 { i -= 1; buf[i] = b'0' + (v % 10) as u8; v /= 10; }
    for j in i..20 { out.push(buf[j]); }
}

fn push_oid(out: &mut JsonOut, oid: &[u8]) {
    // first byte encodes 40*arc1 + arc2
    let first = oid[0];
    if first < 40 { out.push_str("0."); push_u64(out, first as u64); }
    else if first < 80 { out.push_str("1."); push_u64(out, (first - 40) as u64); }
    else { out.push_str("2."); push_u64(out, (first - 80) as u64); }
    let mut i = 1;
    while i < oid.len() {
        let mut val: u64 = 0;
        loop {
            let b = oid[i];
            val = (val << 7) | ((b & 0x7F) as u64);
            i += 1;
            if b & 0x80 == 0 || i >= oid.len() { break; }
        }
        out.push(b'.');
        push_u64(out, val);
    }
}

fn asn1_parse_node(der: &[u8], pos: &mut usize, out: &mut JsonOut) -> bool {
    if *pos >= der.len() { return false; }
    let tag_byte = der[*pos]; *pos += 1;
    let cls = (tag_byte >> 6) & 0x3;
    let constructed = (tag_byte >> 5) & 0x1 != 0;
    let mut tag_num = (tag_byte & 0x1F) as usize;
    if tag_num == 0x1F {
        tag_num = 0;
        loop {
            if *pos >= der.len() { return false; }
            let b = der[*pos]; *pos += 1;
            tag_num = (tag_num << 7) | ((b & 0x7F) as usize);
            if b & 0x80 == 0 { break; }
        }
    }
    // length
    if *pos >= der.len() { return false; }
    let len_byte = der[*pos]; *pos += 1;
    let content_len: usize;
    if len_byte & 0x80 == 0 {
        content_len = len_byte as usize;
    } else {
        let num = (len_byte & 0x7F) as usize;
        if num == 0 || num > 4 || *pos + num > der.len() { return false; }
        let mut cl = 0usize;
        for _ in 0..num {
            cl = (cl << 8) | der[*pos] as usize;
            *pos += 1;
        }
        content_len = cl;
    }
    if *pos + content_len > der.len() { return false; }
    let content = &der[*pos..*pos + content_len];

    // ── emit ──
    out.push_str("{\"t\":");
    if cls == 0 && tag_num < 32 {
        json_escape(out, TAG_NAMES[tag_num].as_bytes());
    } else {
        out.push(b'"'); out.push(b'[');
        push_u64(out, tag_num as u64);
        out.push(b']'); out.push(b'"');
    }
    out.push_str(",\"cls\":"); push_u64(out, cls as u64);
    out.push_str(",\"c\":"); out.push(if constructed { b'1' } else { b'0' });

    if tag_num == 6 {
        if let Some(n) = oid_name(content) {
            out.push_str(",\"n\":");
            json_escape(out, n.as_bytes());
        }
    }

    if cls != 0 || tag_num >= 32 {
        // context/application/private tags: children if constructed, else hex
        if constructed && !content.is_empty() {
            out.push_str(",\"v\":[");
            let mut p = 0usize;
            let mut first = true;
            while p < content.len() {
                if !first { out.push(b','); }
                first = false;
                if !asn1_parse_node(content, &mut p, out) { return false; }
            }
            out.push(b']');
        } else {
            out.push_str(",\"v\":\"");
            for &b in content { let h = hex_str(b); out.push(h[0]); out.push(h[1]); }
            out.push(b'"');
        }
    } else {
        match tag_num {
            1 => { // BOOLEAN
                out.push_str(",\"v\":");
                out.push(if content.first() == Some(&0) { b'0' } else { b'1' });
            }
            2 | 10 => { // INTEGER / ENUMERATED
                out.push_str(",\"v\":\"");
                for &b in content { let h = hex_str(b); out.push(h[0]); out.push(h[1]); }
                out.push(b'"');
            }
            3 => { // BIT STRING
                if let Some((&unused, bits)) = content.split_first() {
                    out.push_str(",\"u\":");
                    push_u64(out, unused as u64);
                    out.push_str(",\"v\":\"");
                    for &b in bits { let h = hex_str(b); out.push(h[0]); out.push(h[1]); }
                    out.push(b'"');
                }
            }
            4 => { // OCTET STRING (binary → hex)
                out.push_str(",\"v\":\"");
                for &b in content { let h = hex_str(b); out.push(h[0]); out.push(h[1]); }
                out.push(b'"');
            }
            12 | 18 | 19 | 20 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 30 => { // strings & times
                out.push_str(",\"v\":");
                json_escape(out, content);
            }
            5 => { out.push_str(",\"v\":null"); }
            6 => {
                out.push_str(",\"v\":\"");
                push_oid(out, content);
                out.push(b'"');
            }
            16 | 17 => { // SEQUENCE / SET
                if constructed && !content.is_empty() {
                    out.push_str(",\"v\":[");
                    let mut p = 0usize;
                    let mut first = true;
                    while p < content.len() {
                        if !first { out.push(b','); }
                        first = false;
                        if !asn1_parse_node(content, &mut p, out) { return false; }
                    }
                    out.push(b']');
                } else {
                    out.push_str(",\"v\":[]");
                }
            }
            _ => {
                out.push_str(",\"v\":\"");
                for &b in content { let h = hex_str(b); out.push(h[0]); out.push(h[1]); }
                out.push(b'"');
            }
        }
    }
    out.push(b'}');
    *pos += content_len;
    true
}

#[no_mangle]
pub extern "C" fn asn1_parse(p: i32, len: i32, out_ptr: i32, out_len_ptr: i32) -> i32 {
    let der = unsafe { sl(p, len) };
    let mut out = JsonOut::new();
    if der.is_empty() { return -1; }
    let mut pos = 0usize;
    if !asn1_parse_node(der, &mut pos, &mut out) { return -1; }
    // write result pointer + length into the caller-provided u32 slots
    unsafe {
        write_u32(out_ptr, out.buf.data as u32);
        write_u32(out_len_ptr, out.buf.len as u32);
    }
    0
}
