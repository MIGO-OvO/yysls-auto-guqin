use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub midi: Option<u8>,
    pub col: f64,
    pub len: f64,
    pub keys: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_commands: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timing {
    pub bpm: f64,
    pub grid_factor: u32,
    pub default_len: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    pub id: String,
    pub title: String,
    pub cols: f64,
    pub timing: Timing,
    pub notes: Vec<Note>,
    pub source: Option<String>,
    pub end_col: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Combo {
    pub base: String,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
}

impl Combo {
    pub fn parse(text: &str) -> Result<Self, String> {
        let normalized = text
            .replace(['↑', '⇧'], "Shift+")
            .replace(['↓', '⌃'], "Ctrl+");
        let mut result = Self {
            base: String::new(),
            ctrl: false,
            alt: false,
            shift: false,
        };
        for part in normalized.split('+') {
            let word = part.trim().to_uppercase();
            let flag = match word.as_str() {
                "CTRL" | "CONTROL" | "LCTRL" | "LCONTROL" | "L-CTRL" | "左CTRL" => {
                    Some(&mut result.ctrl)
                }
                "SHIFT" | "LSHIFT" | "L-SHIFT" | "左SHIFT" => Some(&mut result.shift),
                "ALT" | "LALT" | "左ALT" => Some(&mut result.alt),
                _ => None,
            };
            if let Some(flag) = flag {
                if *flag {
                    return Err(format!("重复的修饰键：{word}"));
                }
                *flag = true;
            } else {
                let single = word.len() == 1 && word.as_bytes()[0].is_ascii_alphanumeric();
                let function = word
                    .strip_prefix('F')
                    .and_then(|s| s.parse::<u8>().ok())
                    .is_some_and(|v| (1..=12).contains(&v));
                if !result.base.is_empty() || !(single || function) {
                    return Err(format!("不支持按键：{text}"));
                }
                result.base = word;
            }
        }
        if result.base.is_empty() {
            return Err("按键缺少主键".into());
        }
        Ok(result)
    }
}

pub fn mapping(midi: u8) -> Result<Combo, String> {
    if !(48..=83).contains(&midi) {
        return Err("音高需在 C3–B5 之间".into());
    }
    let offset = (midi - 48) as usize;
    let letters = [b"ZXCVBNM", b"ASDFGHJ", b"QWERTYU"][offset / 12];
    let semi = offset % 12;
    let index = [0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6][semi];
    Ok(Combo {
        base: (letters[index] as char).to_string(),
        ctrl: [3, 10].contains(&semi),
        alt: false,
        shift: [1, 6, 8].contains(&semi),
    })
}

#[derive(Clone, Debug)]
pub struct ScheduledNote {
    pub id: String,
    pub midi: Option<u8>,
    pub at_ms: u64,
    pub hold_ms: u64,
    pub combo: Combo,
}
#[derive(Clone, Debug)]
pub struct Plan {
    pub notes: Vec<ScheduledNote>,
    pub duration_ms: u64,
}

impl Score {
    pub fn compile(&self, start_col: f64) -> Result<Plan, String> {
        let finite_range = |n: f64, min: f64, max: f64| n.is_finite() && n >= min && n <= max;
        if !finite_range(self.timing.bpm, 30.0, 300.0)
            || ![4, 8, 16, 32].contains(&self.timing.grid_factor)
            || !finite_range(self.timing.default_len, 1.0, 16.0)
        {
            return Err("BPM 或网格设置无效".into());
        }
        if !finite_range(self.cols, 1.0, 1_000_000.0)
            || !finite_range(start_col, 0.0, 1_000_000.0)
            || self.notes.len() > 100_000
        {
            return Err("乐谱长度或音符数量超出范围".into());
        }
        if self.source.as_deref().is_some_and(|s| s != "commands") {
            return Err("未知乐谱来源".into());
        }
        let legacy_commands = self.source.as_deref() == Some("commands");
        let step = 60000.0 / self.timing.bpm * 4.0 / self.timing.grid_factor as f64;
        let mut ordered = self.notes.iter().collect::<Vec<_>>();
        let mut ids = std::collections::HashSet::new();
        for n in &ordered {
            if !finite_range(n.col, 0.0, 1_000_000.0)
                || !finite_range(n.len, 0.001, 32000.0)
                || n.id.is_empty()
                || !ids.insert(&n.id)
            {
                return Err("音符位置、音长或 ID 无效".into());
            }
            if let Some(midi) = n.midi {
                mapping(midi)?;
            } else if !n.from_commands.unwrap_or(legacy_commands) {
                return Err("命令轨只接受 TXT 命令乐谱".into());
            }
            if let Some(keys) = &n.keys {
                let combo = Combo::parse(keys)?;
                if let Some(midi) = n.midi {
                    if combo != mapping(midi)? {
                        return Err("按键与 36 键音高映射不一致".into());
                    }
                }
            } else if n.midi.is_none() {
                return Err("命令轨缺少按键".into());
            }
        }
        ordered.sort_by(|a, b| a.col.total_cmp(&b.col).then(b.midi.cmp(&a.midi)));
        ordered.dedup_by(|a, b| a.col == b.col);
        let mut notes = Vec::with_capacity(ordered.len());
        for (index, n) in ordered.iter().enumerate() {
            if n.col < start_col {
                continue;
            }
            let at_ms = ((n.col - start_col) * step).round() as u64;
            let commands = n.from_commands.unwrap_or(legacy_commands);
            let min_hold = if commands { 1.0 } else { 20.0 };
            let max_hold = if commands { 60000.0 } else { 6000.0 };
            let mut hold = (n.len * step).round().clamp(min_hold, max_hold);
            if let Some(next) = ordered.get(index + 1) {
                hold = hold.min(((next.col - n.col) * step).round().max(1.0));
            }
            let combo = match n.midi {
                Some(midi) => mapping(midi)?,
                None => Combo::parse(n.keys.as_deref().ok_or("命令轨缺少按键")?)?,
            };
            notes.push(ScheduledNote {
                id: n.id.clone(),
                midi: n.midi,
                at_ms,
                hold_ms: hold as u64,
                combo,
            });
        }
        let end_col = self.end_col.unwrap_or(0.0);
        if !finite_range(end_col, 0.0, 1_000_000.0) {
            return Err("曲尾位置无效".into());
        }
        let duration_ms = notes
            .last()
            .map(|n| n.at_ms + n.hold_ms)
            .unwrap_or(0)
            .max(((end_col - start_col).max(0.0) * step).round() as u64);
        if duration_ms > 86_400_000 {
            return Err("乐谱超过 24 小时".into());
        }
        Ok(Plan { notes, duration_ms })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InputMode {
    ForegroundScan,
    ForegroundVirtual,
    Background,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub id: String,
    pub pid: u32,
    pub title: String,
    pub process_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Program {
    pub score: Score,
    pub target: Option<Target>,
    pub mode: InputMode,
    pub warmup_ms: u64,
    pub start_col: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn score() -> Score {
        serde_json::from_str(include_str!("../../tests/fixtures/score.json")).unwrap()
    }
    #[test]
    fn all_36_mappings_match_legacy() {
        let expected = [
            "Z", "Shift+Z", "X", "Ctrl+C", "C", "V", "Shift+V", "B", "Shift+B", "N", "Ctrl+M", "M",
            "A", "Shift+A", "S", "Ctrl+D", "D", "F", "Shift+F", "G", "Shift+G", "H", "Ctrl+J", "J",
            "Q", "Shift+Q", "W", "Ctrl+E", "E", "R", "Shift+R", "T", "Shift+T", "Y", "Ctrl+U", "U",
        ];
        for (i, text) in expected.iter().enumerate() {
            assert_eq!(mapping(48 + i as u8).unwrap(), Combo::parse(text).unwrap());
        }
        assert!(mapping(47).is_err());
        assert!(mapping(84).is_err());
    }
    #[test]
    fn schedule_matches_shared_fixture_and_truncates() {
        let plan = score().compile(0.0).unwrap();
        assert_eq!(
            plan.notes
                .iter()
                .map(|n| (n.at_ms, n.hold_ms))
                .collect::<Vec<_>>(),
            [(0, 250), (250, 500), (1000, 250)]
        );
        assert_eq!(plan.duration_ms, 1250);
        assert_eq!(score().compile(1.0).unwrap().notes[0].at_ms, 0);
    }
    #[test]
    fn malformed_or_injected_scores_are_rejected() {
        let mut s = score();
        s.notes[0].keys = Some("Alt+F4".into());
        assert!(s.compile(0.0).is_err());
        s.notes[0].keys = None;
        s.timing.bpm = f64::NAN;
        assert!(s.compile(0.0).is_err());
        assert!(Combo::parse("Shift+Shift+Q").is_err());
        assert!(Combo::parse("Ctrl+Q+W").is_err());
        assert_eq!(
            Combo::parse("LControl+⇧Q").unwrap(),
            Combo::parse("Ctrl+Shift+Q").unwrap()
        );
    }
    #[test]
    fn chord_melody_and_hold_limits() {
        let mut s = score();
        let mut n = s.notes[0].clone();
        n.id = "high".into();
        n.midi = Some(83);
        s.notes.push(n);
        let p = s.compile(0.0).unwrap();
        assert_eq!(p.notes[0].midi, Some(83));
        assert_eq!(p.notes.len(), 3);
        s.notes.truncate(1);
        s.notes[0].len = 1000.0;
        assert_eq!(s.compile(0.0).unwrap().notes[0].hold_ms, 6000);
        s.source = Some("commands".into());
        assert_eq!(s.compile(0.0).unwrap().notes[0].hold_ms, 60000);
    }
    #[test]
    fn mixed_notes_keep_individual_hold_policy() {
        let mut s = score();
        s.notes.truncate(1);
        s.notes[0].len = 1000.0;
        let mut command = s.notes[0].clone();
        command.id = "command".into();
        command.col = 1000.0;
        command.midi = None;
        command.keys = Some("F12".into());
        command.from_commands = Some(true);
        s.notes[0].from_commands = Some(false);
        s.notes.push(command);
        for source in [None, Some("commands".into())] {
            s.source = source;
            let plan = s.compile(0.0).unwrap();
            assert_eq!(plan.notes[0].hold_ms, 6000);
            assert_eq!(plan.notes[1].hold_ms, 60000);
        }
    }
}
