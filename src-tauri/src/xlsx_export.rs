use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum XlsxCellValue {
    Number(f64),
    Text(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XlsxRowDto {
    pub cells: Vec<XlsxCellValue>,
    #[serde(default)]
    pub style: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XlsxSheetDto {
    pub name: String,
    pub rows: Vec<XlsxRowDto>,
    #[serde(default)]
    pub freeze_header_row: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XlsxWorkbookDto {
    pub title: String,
    pub sheets: Vec<XlsxSheetDto>,
}

fn sanitize_sheet_name(raw: &str, fallback_idx: usize) -> String {
    let mut cleaned: String = raw
        .chars()
        .map(|c| match c {
            '[' | ']' | ':' | '*' | '?' | '/' | '\\' => '-',
            _ => c,
        })
        .collect();
    cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        cleaned = format!("Sheet{}", fallback_idx + 1);
    }
    cleaned.chars().take(31).collect()
}

pub fn write_native_xlsx(file_path: &str, wb_dto: &XlsxWorkbookDto) -> Result<String, String> {
    if let Some(parent) = Path::new(file_path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Gagal membuat folder tujuan Excel: {}", e))?;
        }
    }

    let mut workbook = Workbook::new();

    let title_fmt = Format::new()
        .set_bold()
        .set_font_size(13)
        .set_font_color(Color::RGB(0x0284C7));

    let header_fmt = Format::new()
        .set_bold()
        .set_font_size(10)
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x0F294A))
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0x1E3A5F))
        .set_align(FormatAlign::VerticalCenter);

    let total_fmt = Format::new()
        .set_bold()
        .set_font_size(10)
        .set_font_color(Color::RGB(0x0F172A))
        .set_background_color(Color::RGB(0xE0F2FE))
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0x93C5FD));

    let normal_fmt = Format::new()
        .set_font_size(10)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xE2E8F0));

    let mut used_names: Vec<String> = Vec::new();

    for (idx, sheet_dto) in wb_dto.sheets.iter().enumerate() {
        let mut sheet_name = sanitize_sheet_name(&sheet_dto.name, idx);
        let mut suffix = 2usize;
        while used_names.iter().any(|n| n.eq_ignore_ascii_case(&sheet_name)) {
            let base: String = sheet_name.chars().take(28).collect();
            sheet_name = format!("{}_{}", base, suffix);
            suffix += 1;
        }
        used_names.push(sheet_name.clone());

        let worksheet = workbook.add_worksheet();
        worksheet
            .set_name(&sheet_name)
            .map_err(|e| format!("Gagal memberi nama sheet '{}': {}", sheet_name, e))?;

        for (r_idx, row) in sheet_dto.rows.iter().enumerate() {
            let fmt = match row.style.as_deref() {
                Some("title") => &title_fmt,
                Some("header") => &header_fmt,
                Some("total") => &total_fmt,
                _ => &normal_fmt,
            };

            for (c_idx, cell) in row.cells.iter().enumerate() {
                let row_u32 = r_idx as u32;
                let col_u16 = c_idx as u16;
                match cell {
                    XlsxCellValue::Number(v) => {
                        if v.is_finite() {
                            worksheet
                                .write_number_with_format(row_u32, col_u16, *v, fmt)
                                .map_err(|e| format!("Gagal menulis sel angka Excel: {}", e))?;
                        }
                    }
                    XlsxCellValue::Text(s) => {
                        worksheet
                            .write_string_with_format(row_u32, col_u16, s, fmt)
                            .map_err(|e| format!("Gagal menulis sel teks Excel: {}", e))?;
                    }
                }
            }
        }

        if let Some(freeze_row) = sheet_dto.freeze_header_row {
            if freeze_row > 0 && (freeze_row as usize) <= sheet_dto.rows.len() {
                let _ = worksheet.set_freeze_panes(freeze_row, 0);
            }
        }
        worksheet.autofit();
    }

    workbook
        .save(file_path)
        .map_err(|e| format!("Gagal menyimpan workbook Excel .xlsx: {}", e))?;

    Ok(file_path.to_string())
}

#[tauri::command]
pub fn export_native_xlsx(file_path: String, workbook: XlsxWorkbookDto) -> Result<String, String> {
    write_native_xlsx(&file_path, &workbook)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RosterImportRowDto {
    pub num: String,
    pub name: String,
    pub whatsapp: String,
}

/// Generate a colored 3-column Excel template (No. Punggung, Nama Pemain, No. WhatsApp).
pub fn write_roster_template_xlsx(
    file_path: &str,
    club_name: Option<&str>,
) -> Result<String, String> {
    if let Some(parent) = Path::new(file_path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Gagal membuat folder template Excel: {}", e))?;
        }
    }

    let mut workbook = Workbook::new();
    let ws = workbook.add_worksheet();
    ws.set_name("Daftar Pemain")
        .map_err(|e| format!("Gagal menamai sheet: {}", e))?;

    let _ = ws.set_column_width(0, 18.0);
    let _ = ws.set_column_width(1, 34.0);
    let _ = ws.set_column_width(2, 24.0);
    let _ = ws.set_row_height(0, 30.0);
    let _ = ws.set_row_height(1, 22.0);
    let _ = ws.set_row_height(2, 6.0);
    let _ = ws.set_row_height(3, 26.0);

    let title_fmt = Format::new()
        .set_bold()
        .set_font_size(13)
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x0B1E3D))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let subtitle_fmt = Format::new()
        .set_italic()
        .set_font_size(9.5)
        .set_font_color(Color::RGB(0x0369A1))
        .set_background_color(Color::RGB(0xE0F2FE))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let accent_fmt = Format::new().set_background_color(Color::RGB(0x0284C7));

    let hdr_num = Format::new()
        .set_bold()
        .set_font_size(10.5)
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x1D4ED8))
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0x1E3A8A))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let hdr_name = Format::new()
        .set_bold()
        .set_font_size(10.5)
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x0F294A))
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0x1E3A8A))
        .set_align(FormatAlign::Left)
        .set_align(FormatAlign::VerticalCenter);

    let hdr_wa = Format::new()
        .set_bold()
        .set_font_size(10.5)
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x047857))
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0x065F46))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);

    let label = club_name
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("KLUB FUTSAL");
    let _ = ws.merge_range(
        0,
        0,
        0,
        2,
        &format!("ARF FUTSALTAG — TEMPLATE DAFTAR PEMAIN ({})", label.to_uppercase()),
        &title_fmt,
    );
    let _ = ws.merge_range(
        1,
        0,
        1,
        2,
        "Isi No. Punggung, Nama Pemain, & No. WhatsApp (contoh: 0812... / 62812...). Hapus/timpa baris contoh di bawah.",
        &subtitle_fmt,
    );
    let _ = ws.merge_range(2, 0, 2, 2, "", &accent_fmt);

    let _ = ws.write_string_with_format(3, 0, "No. Punggung", &hdr_num);
    let _ = ws.write_string_with_format(3, 1, "Nama Pemain", &hdr_name);
    let _ = ws.write_string_with_format(3, 2, "No. WhatsApp", &hdr_wa);
    let _ = ws.set_freeze_panes(4, 0);

    let make_row_fmts = |bg_hex: u32| -> (Format, Format, Format) {
        let f_num = Format::new()
            .set_bold()
            .set_font_size(10.5)
            .set_font_color(Color::RGB(0x0F172A))
            .set_background_color(Color::RGB(bg_hex))
            .set_border(FormatBorder::Thin)
            .set_border_color(Color::RGB(0xCBD5E1))
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter)
            .set_num_format("@");
        let f_name = Format::new()
            .set_font_size(10.5)
            .set_font_color(Color::RGB(0x0F172A))
            .set_background_color(Color::RGB(bg_hex))
            .set_border(FormatBorder::Thin)
            .set_border_color(Color::RGB(0xCBD5E1))
            .set_align(FormatAlign::Left)
            .set_align(FormatAlign::VerticalCenter);
        let f_wa = Format::new()
            .set_font_size(10.5)
            .set_font_color(Color::RGB(0x065F46))
            .set_background_color(Color::RGB(bg_hex))
            .set_border(FormatBorder::Thin)
            .set_border_color(Color::RGB(0xCBD5E1))
            .set_align(FormatAlign::Center)
            .set_align(FormatAlign::VerticalCenter)
            .set_num_format("@");
        (f_num, f_name, f_wa)
    };

    let (even_num, even_name, even_wa) = make_row_fmts(0xF8FAFC);
    let (odd_num, odd_name, odd_wa) = make_row_fmts(0xEFF6FF);

    let samples = [
        ("#1", "Ahmad Kiper (Contoh)", "081234567890"),
        ("#4", "Budi Anchor (Contoh)", "081234567891"),
        ("#7", "Candra Flank Kiri (Contoh)", "081234567892"),
        ("#9", "Dimas Pivot (Contoh)", "081234567893"),
        ("#11", "Eko Flank Kanan (Contoh)", "081234567894"),
    ];

    for idx in 0..20usize {
        let r = (4 + idx) as u32;
        let _ = ws.set_row_height(r, 22.0);
        let (fn_num, fn_name, fn_wa) = if idx % 2 == 0 {
            (&even_num, &even_name, &even_wa)
        } else {
            (&odd_num, &odd_name, &odd_wa)
        };
        if let Some((num, name, wa)) = samples.get(idx) {
            let _ = ws.write_string_with_format(r, 0, *num, fn_num);
            let _ = ws.write_string_with_format(r, 1, *name, fn_name);
            let _ = ws.write_string_with_format(r, 2, *wa, fn_wa);
        } else {
            let _ = ws.write_string_with_format(r, 0, "", fn_num);
            let _ = ws.write_string_with_format(r, 1, "", fn_name);
            let _ = ws.write_string_with_format(r, 2, "", fn_wa);
        }
    }

    let tip_fmt = Format::new()
        .set_italic()
        .set_font_size(9.5)
        .set_font_color(Color::RGB(0x065F46))
        .set_background_color(Color::RGB(0xECFDF5))
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xA7F3D0))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter);
    let _ = ws.set_row_height(24, 22.0);
    let _ = ws.merge_range(
        24,
        0,
        24,
        2,
        "Tips: Simpan file (.xlsx), lalu klik \"Impor Excel / CSV\" di Database Klub ARF FutsalTag.",
        &tip_fmt,
    );

    workbook
        .save(file_path)
        .map_err(|e| format!("Gagal menyimpan template Excel .xlsx: {}", e))?;
    Ok(file_path.to_string())
}

fn unescape_xml(raw: &str) -> String {
    raw.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn extract_tag_inner(xml: &str, tag_name: &str) -> Option<String> {
    let open_prefix = format!("<{}", tag_name);
    let start = xml.find(&open_prefix)?;
    let after_prefix = start + open_prefix.len();
    let tag_gt = xml[after_prefix..].find('>')? + after_prefix;
    if xml.as_bytes().get(tag_gt.saturating_sub(1)) == Some(&b'/') {
        return Some(String::new());
    }
    let close_tag = format!("</{}>", tag_name);
    let end = xml[tag_gt + 1..].find(&close_tag)? + tag_gt + 1;
    Some(unescape_xml(&xml[tag_gt + 1..end]))
}

fn extract_all_t_text(xml: &str) -> String {
    let mut out = String::new();
    let mut rest = xml;
    while let Some(pos) = rest.find("<t") {
        let after = &rest[pos + 2..];
        let next_ch = after.as_bytes().first().copied();
        if next_ch != Some(b'>') && next_ch != Some(b' ') {
            rest = after;
            continue;
        }
        let Some(gt) = after.find('>') else { break };
        if gt > 0 && after.as_bytes()[gt - 1] == b'/' {
            rest = &after[gt + 1..];
            continue;
        }
        let content_start = &after[gt + 1..];
        let Some(end_t) = content_start.find("</t>") else { break };
        out.push_str(&unescape_xml(&content_start[..end_t]));
        rest = &content_start[end_t + 4..];
    }
    out
}

fn parse_shared_strings(xml: &str) -> Vec<String> {
    let mut strings = Vec::new();
    let mut rest = xml;
    while let Some(s) = rest.find("<si") {
        let after_si = &rest[s..];
        let Some(end_si) = after_si.find("</si>") else { break };
        strings.push(extract_all_t_text(&after_si[..end_si]));
        rest = &after_si[end_si + 5..];
    }
    strings
}

fn extract_attr<'a>(open_tag: &'a str, attr: &str) -> Option<&'a str> {
    let dq = format!("{}=\"", attr);
    if let Some(pos) = open_tag.find(&dq) {
        let val = &open_tag[pos + dq.len()..];
        if let Some(end) = val.find('"') {
            return Some(&val[..end]);
        }
    }
    let sq = format!("{}='", attr);
    if let Some(pos) = open_tag.find(&sq) {
        let val = &open_tag[pos + sq.len()..];
        if let Some(end) = val.find('\'') {
            return Some(&val[..end]);
        }
    }
    None
}

fn col_idx_from_ref(cell_ref: &str) -> Option<usize> {
    let mut idx = 0usize;
    let mut any = false;
    for b in cell_ref.bytes() {
        if b.is_ascii_alphabetic() {
            any = true;
            idx = idx * 26 + ((b.to_ascii_uppercase() - b'A') as usize + 1);
        } else {
            break;
        }
    }
    if any { Some(idx - 1) } else { None }
}

fn normalize_roster_rows(raw_rows: Vec<[String; 3]>) -> Vec<RosterImportRowDto> {
    let mut out = Vec::new();
    for [c0, c1, c2] in raw_rows {
        let raw_num = c0.trim();
        let name = c1.trim();
        let wa = c2.trim();
        let combined_lower = format!("{} {}", raw_num, name).to_lowercase();
        if name.is_empty()
            || raw_num.starts_with("ARF FUTSALTAG")
            || raw_num.starts_with("Isi No.")
            || raw_num.starts_with("Tips:")
            || combined_lower.contains("nama pemain")
            || raw_num.eq_ignore_ascii_case("no")
            || raw_num.eq_ignore_ascii_case("no. punggung")
        {
            continue;
        }
        let num = if raw_num.is_empty() {
            format!("#{}", out.len() + 1)
        } else if raw_num.starts_with('#') {
            raw_num.to_string()
        } else {
            format!("#{}", raw_num)
        };
        out.push(RosterImportRowDto {
            num,
            name: name.to_string(),
            whatsapp: wa.to_string(),
        });
    }
    out
}

fn parse_xlsx_rows(bytes: &[u8]) -> Result<Vec<[String; 3]>, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| format!("File .xlsx tidak valid: {}", e))?;

    let shared = if let Ok(mut f) = archive.by_name("xl/sharedStrings.xml") {
        let mut s = String::new();
        let _ = f.read_to_string(&mut s);
        parse_shared_strings(&s)
    } else {
        Vec::new()
    };

    let sheet_xml = {
        let mut s = String::new();
        let mut f = archive
            .by_name("xl/worksheets/sheet1.xml")
            .map_err(|_| "Sheet utama xl/worksheets/sheet1.xml tidak ditemukan di .xlsx.".to_string())?;
        f.read_to_string(&mut s)
            .map_err(|e| format!("Gagal membaca isi sheet Excel: {}", e))?;
        s
    };

    let mut rows = Vec::new();
    let mut rest = sheet_xml.as_str();
    while let Some(r_start) = rest.find("<row") {
        let after_row = &rest[r_start..];
        let Some(r_end) = after_row.find("</row>") else { break };
        let row_xml = &after_row[..r_end];
        let mut cols = [String::new(), String::new(), String::new()];
        let mut seq_col = 0usize;

        let mut c_rest = row_xml;
        while let Some(c_pos) = c_rest.find("<c") {
            let after_c = &c_rest[c_pos + 2..];
            if !matches!(after_c.as_bytes().first().copied(), Some(b' ' | b'>')) {
                c_rest = after_c;
                continue;
            }
            let Some(gt) = after_c.find('>') else { break };
            let open_tag = &after_c[..gt];
            let self_closing = open_tag.ends_with('/');
            let col_idx = extract_attr(open_tag, "r")
                .and_then(col_idx_from_ref)
                .unwrap_or(seq_col);
            seq_col = col_idx + 1;

            let cell_body = if self_closing {
                c_rest = &after_c[gt + 1..];
                ""
            } else {
                let body_start = &after_c[gt + 1..];
                let Some(end_c) = body_start.find("</c>") else { break };
                c_rest = &body_start[end_c + 4..];
                &body_start[..end_c]
            };

            if col_idx >= 3 || cell_body.is_empty() {
                continue;
            }
            let c_type = extract_attr(open_tag, "t").unwrap_or("");
            let val = match c_type {
                "s" => extract_tag_inner(cell_body, "v")
                    .and_then(|v| v.trim().parse::<usize>().ok())
                    .and_then(|i| shared.get(i))
                    .cloned()
                    .unwrap_or_default(),
                "inlineStr" => extract_all_t_text(cell_body),
                _ => {
                    let raw_v = extract_tag_inner(cell_body, "v").unwrap_or_default();
                    if c_type.is_empty() {
                        raw_v.strip_suffix(".0").unwrap_or(&raw_v).to_string()
                    } else {
                        raw_v
                    }
                }
            };
            cols[col_idx] = val;
        }
        rows.push(cols);
        rest = &after_row[r_end + 6..];
    }
    Ok(rows)
}

fn split_delimited_line(line: &str, delim: char) -> Vec<String> {
    let mut fields = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '"' {
            if in_quotes && chars.peek() == Some(&'"') {
                cur.push('"');
                let _ = chars.next();
            } else {
                in_quotes = !in_quotes;
            }
        } else if ch == delim && !in_quotes {
            fields.push(cur.trim().to_string());
            cur.clear();
        } else {
            cur.push(ch);
        }
    }
    fields.push(cur.trim().to_string());
    fields
}

/// Import player roster (No. Punggung, Nama Pemain, No. WhatsApp) from .xlsx or .csv/.txt.
pub fn parse_roster_file(file_path: &str) -> Result<Vec<RosterImportRowDto>, String> {
    let bytes =
        fs::read(file_path).map_err(|e| format!("Gagal membaca file daftar pemain: {}", e))?;
    let raw_rows = if bytes.starts_with(b"PK\x03\x04") {
        parse_xlsx_rows(&bytes)?
    } else {
        let text = String::from_utf8_lossy(&bytes);
        let first_non_empty = text.lines().find(|l| !l.trim().is_empty()).unwrap_or("");
        let delim = if first_non_empty.contains('\t') {
            '\t'
        } else if first_non_empty.contains(';') {
            ';'
        } else {
            ','
        };
        text.lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| {
                let parts = split_delimited_line(l.trim_start_matches('\u{feff}'), delim);
                [
                    parts.first().cloned().unwrap_or_default(),
                    parts.get(1).cloned().unwrap_or_default(),
                    parts.get(2).cloned().unwrap_or_default(),
                ]
            })
            .collect()
    };
    let rows = normalize_roster_rows(raw_rows);
    if rows.is_empty() {
        return Err("Tidak ditemukan baris pemain valid (kolom No. Punggung, Nama Pemain, No. WhatsApp).".to_string());
    }
    Ok(rows)
}

#[tauri::command]
pub fn export_roster_template_xlsx(
    file_path: String,
    club_name: Option<String>,
) -> Result<String, String> {
    write_roster_template_xlsx(&file_path, club_name.as_deref())
}

#[tauri::command]
pub fn import_roster_file(file_path: String) -> Result<Vec<RosterImportRowDto>, String> {
    parse_roster_file(&file_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn test_write_native_xlsx_creates_valid_openxml() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let out_path = std::env::temp_dir().join(format!("futsaltag_test_{}.xlsx", nonce));
        let out_str = out_path.to_string_lossy().to_string();

        let sheet_titles = [
            "Ringkasan Pertandingan",
            "Daftar Klip & Transkrip",
            "Tag x Pemain",
            "Menit & Quartet 4v4",
            "Jaringan Operan",
        ];
        let sheets = sheet_titles
            .iter()
            .map(|name| XlsxSheetDto {
                name: (*name).to_string(),
                freeze_header_row: Some(1),
                rows: vec![
                    XlsxRowDto {
                        style: Some("header".to_string()),
                        cells: vec![
                            XlsxCellValue::Text("Kategori".to_string()),
                            XlsxCellValue::Text("Jumlah".to_string()),
                        ],
                    },
                    XlsxRowDto {
                        style: None,
                        cells: vec![
                            XlsxCellValue::Text("Build-up 4-0".to_string()),
                            XlsxCellValue::Number(12.0),
                        ],
                    },
                    XlsxRowDto {
                        style: Some("total".to_string()),
                        cells: vec![
                            XlsxCellValue::Text("TOTAL".to_string()),
                            XlsxCellValue::Number(12.0),
                        ],
                    },
                ],
            })
            .collect();

        let wb = XlsxWorkbookDto {
            title: "Tes Laporan FutsalTag Pro".to_string(),
            sheets,
        };

        write_native_xlsx(&out_str, &wb).expect("penulisan native .xlsx gagal");
        let bytes = fs::read(&out_path).expect("gagal membaca output .xlsx");
        let _ = fs::remove_file(&out_path);

        assert!(bytes.len() > 4000, "ukuran .xlsx terlalu kecil: {}", bytes.len());
        assert_eq!(&bytes[0..4], b"PK\x03\x04", "harus berupa arsip ZIP OpenXML");

        let hay = String::from_utf8_lossy(&bytes);
        assert!(hay.contains("xl/workbook.xml"), "harus berisi xl/workbook.xml");
        assert!(
            hay.contains("xl/worksheets/sheet5.xml"),
            "harus berisi tepat 5 worksheet XML"
        );
    }

    #[test]
    fn test_roster_xlsx_template_and_import_roundtrip() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let xlsx_path = std::env::temp_dir().join(format!("futsaltag_roster_{}.xlsx", nonce));
        let csv_path = std::env::temp_dir().join(format!("futsaltag_roster_{}.csv", nonce));

        write_roster_template_xlsx(&xlsx_path.to_string_lossy(), Some("Futsal Paser"))
            .expect("gagal menulis template xlsx");
        let imported_xlsx = parse_roster_file(&xlsx_path.to_string_lossy())
            .expect("gagal membaca ulang template xlsx");
        let _ = fs::remove_file(&xlsx_path);

        assert_eq!(imported_xlsx.len(), 5);
        assert_eq!(imported_xlsx[0].num, "#1");
        assert_eq!(imported_xlsx[0].name, "Ahmad Kiper (Contoh)");
        assert_eq!(imported_xlsx[0].whatsapp, "081234567890");
        assert_eq!(imported_xlsx[4].num, "#11");

        fs::write(
            &csv_path,
            "No. Punggung;Nama Pemain;No. WhatsApp\n27;Wirawan;081355501234\n;Rizky Putra;62811998877\n",
        )
        .unwrap();
        let imported_csv = parse_roster_file(&csv_path.to_string_lossy())
            .expect("gagal membaca csv");
        let _ = fs::remove_file(&csv_path);

        assert_eq!(imported_csv.len(), 2);
        assert_eq!(imported_csv[0].num, "#27");
        assert_eq!(imported_csv[0].name, "Wirawan");
        assert_eq!(imported_csv[0].whatsapp, "081355501234");
        assert_eq!(imported_csv[1].num, "#2");
        assert_eq!(imported_csv[1].whatsapp, "62811998877");
    }
}
