use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::Emitter;

const MAX_NOTES: usize = 100_000;
const MAX_MS: u64 = 86_400_000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordedNote {
    midi: u8,
    channel: u8,
    velocity: u8,
    start_ms: u64,
    end_ms: u64,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Take {
    notes: Vec<RecordedNote>,
    duration_ms: u64,
}

struct HeldNote {
    note: RecordedNote,
    released: bool,
}

#[derive(Default)]
struct Capture {
    started: Option<Instant>,
    notes: Vec<RecordedNote>,
    held: Vec<HeldNote>,
    pedal: [bool; 16],
    limited: bool,
}

impl Capture {
    fn elapsed(&self) -> u64 {
        self.started
            .map(|t| t.elapsed().as_millis() as u64)
            .unwrap_or(0)
    }

    fn start(&mut self) -> Result<(), String> {
        if self.started.is_some() {
            return Err("MIDI 录制正在进行".into());
        }
        self.notes.clear();
        self.held.clear();
        self.limited = false;
        self.started = Some(Instant::now());
        Ok(())
    }

    fn close_notes(&mut self, at: u64, channel: u8, only_released: bool) {
        let notes = &mut self.notes;
        self.held.retain(|held| {
            if held.note.channel == channel && (!only_released || held.released) {
                let mut note = held.note.clone();
                note.end_ms = at.max(note.start_ms + 1);
                notes.push(note);
                false
            } else {
                true
            }
        });
    }

    fn message(&mut self, at: u64, bytes: &[u8]) -> Option<String> {
        if bytes.len() != 3 || bytes[1] > 127 || bytes[2] > 127 {
            return None;
        }
        let channel = bytes[0] & 15;
        let status = bytes[0] & 0xf0;
        if status == 0xb0 && bytes[1] == 64 {
            self.pedal[channel as usize] = bytes[2] >= 64;
        }
        if self.started.is_none() || self.limited {
            return None;
        }
        if at >= MAX_MS
            || (status == 0x90 && bytes[2] > 0 && self.notes.len() + self.held.len() >= MAX_NOTES)
        {
            self.limited = true;
            return Some("录制已达到 100000 个音符或 24 小时上限，已保留录制内容。".into());
        }
        match status {
            0x90 if bytes[2] > 0 => self.held.push(HeldNote {
                note: RecordedNote {
                    midi: bytes[1],
                    channel,
                    velocity: bytes[2],
                    start_ms: at,
                    end_ms: at,
                },
                released: false,
            }),
            0x80 | 0x90 => {
                if let Some(i) = self.held.iter().position(|n| {
                    n.note.channel == channel && n.note.midi == bytes[1] && !n.released
                }) {
                    self.held[i].released = true;
                    if !self.pedal[channel as usize] {
                        let mut note = self.held.remove(i).note;
                        note.end_ms = at.max(note.start_ms + 1);
                        self.notes.push(note);
                    }
                }
            }
            0xb0 if bytes[1] == 64 && bytes[2] < 64 => self.close_notes(at, channel, true),
            0xb0 if bytes[1] == 120 || bytes[1] == 123 => {
                self.close_notes(at, channel, false);
                self.pedal[channel as usize] = false;
            }
            _ => {}
        }
        None
    }

    fn finish(&mut self) -> Take {
        if self.started.is_none() {
            return Take::default();
        }
        let at = self.elapsed().min(MAX_MS);
        for channel in 0..16 {
            self.close_notes(at, channel, false);
        }
        self.started = None;
        self.notes.sort_by_key(|n| (n.start_ms, n.midi));
        let duration_ms = self.notes.iter().fold(at, |end, n| end.max(n.end_ms));
        Take {
            notes: std::mem::take(&mut self.notes),
            duration_ms,
        }
    }
}

#[derive(Default)]
pub struct MidiDevices {
    connection: Mutex<Option<MidiInputConnection<()>>>,
    capture: Arc<Mutex<Capture>>,
}

#[derive(Serialize)]
pub struct MidiPort {
    id: String,
    name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MidiMessage {
    port_id: String,
    data: Vec<u8>,
    error: Option<String>,
}

#[tauri::command]
pub fn midi_inputs() -> Result<Vec<MidiPort>, String> {
    let input = MidiInput::new("燕云琴笺").map_err(|e| format!("无法读取 MIDI 设备：{e}"))?;
    input
        .ports()
        .iter()
        .map(|p| {
            Ok(MidiPort {
                id: p.id(),
                name: input.port_name(p).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub fn connect_midi(
    app: tauri::AppHandle,
    state: tauri::State<'_, MidiDevices>,
    port_id: String,
) -> Result<(), String> {
    let mut connection = state.connection.lock().unwrap();
    if state.capture.lock().unwrap().started.is_some() {
        return Err("请先停止 MIDI 录制再切换设备".into());
    }
    let mut input = MidiInput::new("燕云琴笺").map_err(|e| e.to_string())?;
    input.ignore(Ignore::All);
    let port = input
        .find_port_by_id(&port_id)
        .ok_or("MIDI 设备已断开，请刷新设备列表")?;
    // Close the previous port before reopening (WinMM devices can be exclusive).
    drop(connection.take());
    state.capture.lock().unwrap().pedal = [false; 16];
    let capture = Arc::clone(&state.capture);
    *connection = Some(
        input
            .connect(
                &port,
                "燕云琴笺录制",
                move |_, bytes, _| {
                    if bytes.len() != 3
                        || bytes[1] > 127
                        || bytes[2] > 127
                        || ![0x80, 0x90, 0xb0].contains(&(bytes[0] & 0xf0))
                    {
                        return;
                    }
                    let error = {
                        let mut capture = capture.lock().unwrap();
                        let at = capture.elapsed();
                        capture.message(at, bytes)
                    };
                    if error.is_some()
                        || bytes[0] & 0xf0 != 0xb0
                        || [64, 120, 123].contains(&bytes[1])
                    {
                        let _ = app.emit(
                            "midi-input",
                            MidiMessage {
                                port_id: port_id.clone(),
                                data: bytes.to_vec(),
                                error,
                            },
                        );
                    }
                },
                (),
            )
            .map_err(|e| format!("无法连接 MIDI 设备：{e}"))?,
    );
    Ok(())
}

#[tauri::command]
pub fn disconnect_midi(state: tauri::State<'_, MidiDevices>) -> Take {
    // Never hold the capture mutex while dropping a connection: its callback uses it.
    drop(state.connection.lock().unwrap().take());
    state.capture.lock().unwrap().finish()
}

#[tauri::command]
pub fn start_midi_recording(state: tauri::State<'_, MidiDevices>) -> Result<(), String> {
    let connection = state.connection.lock().unwrap();
    if connection.is_none() {
        return Err("请先连接 MIDI 输入设备".into());
    }
    state.capture.lock().unwrap().start()
}

#[tauri::command]
pub fn stop_midi_recording(state: tauri::State<'_, MidiDevices>) -> Take {
    state.capture.lock().unwrap().finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enumerates_native_midi_inputs() {
        let ports = midi_inputs().expect("MIDI input enumeration failed");
        println!("MIDI input ports available on this host: {}", ports.len());
    }

    #[test]
    fn captures_velocity_channels_retriggers_and_sustain() {
        let mut c = Capture::default();
        c.start().unwrap();
        for (at, message) in [
            (0, [0x90, 21, 90]),
            (5, [0x91, 21, 50]),
            (10, [0xb0, 64, 127]),
            (20, [0x90, 21, 0]),
            (30, [0x90, 21, 80]),
            (40, [0x81, 21, 0]),
            (50, [0x80, 21, 0]),
            (60, [0xb0, 64, 0]),
        ] {
            c.message(at, &message);
        }
        let take = c.finish();
        assert_eq!(take.notes.len(), 3);
        assert_eq!((take.notes[0].velocity, take.notes[0].end_ms), (90, 60));
        assert_eq!((take.notes[1].channel, take.notes[1].end_ms), (1, 40));
        assert_eq!((take.notes[2].start_ms, take.notes[2].end_ms), (30, 60));
        assert!(c.finish().notes.is_empty());
    }

    #[test]
    fn finalizes_held_keys_and_rejects_malformed_messages() {
        let mut c = Capture::default();
        c.start().unwrap();
        c.message(0, &[0x90, 108, 100]);
        c.message(0, &[0x90, 200, 80]);
        c.message(0, &[0x90, 60]);
        c.message(0, &[0xf0, 60, 90]);
        let take = c.finish();
        assert_eq!(take.notes.len(), 1);
        assert!(take.notes[0].end_ms > take.notes[0].start_ms);
        c.start().unwrap();
        c.message(0, &[0x90, 60, 100]);
        c.message(50, &[0xb0, 123, 0]);
        assert_eq!(c.finish().notes[0].end_ms, 50);
        assert!(c.start().is_ok());
        assert!(c.message(MAX_MS, &[0x90, 60, 80]).is_some());
        assert!(c.message(MAX_MS + 1, &[0x90, 60, 80]).is_none());
    }
}
