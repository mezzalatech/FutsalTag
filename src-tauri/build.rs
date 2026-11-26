fn main() {
    #[cfg(target_os = "macos")]
    if let Ok(out) = std::process::Command::new("clang")
        .arg("--print-file-name=libclang_rt.osx.a")
        .output()
    {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let p = std::path::Path::new(&path);
            if p.exists() {
                if let Some(dir) = p.parent() {
                    println!("cargo:rustc-link-search=native={}", dir.display());
                    println!("cargo:rustc-link-lib=static=clang_rt.osx");
                }
            }
        }
    }
    tauri_build::build()
}
