use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook};
use serde::{Deserialize, Serialize};
use std::fs;
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
}
