use crate::{
    model::{InputMode, Plan, Program},
    platform::{self, InputSink},
};
use serde::Serialize;
use std::{
    sync::{Arc, Condvar, Mutex},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playback {
    pub status: String,
    pub elapsed_ms: u64,
    pub duration_ms: u64,
    pub active_id: Option<String>,
    pub message: String,
}
#[derive(Default)]
struct Control {
    stop: bool,
    pause: bool,
    snapshot: Playback,
}
type Shared = Arc<(Mutex<Control>, Condvar)>;
type Emitter = Arc<dyn Fn(Playback) + Send + Sync>;

pub struct Engine {
    shared: Shared,
    worker: Mutex<Option<JoinHandle<()>>>,
    program: Mutex<Option<Program>>,
    emit: Emitter,
}

impl Engine {
    pub fn new(emit: impl Fn(Playback) + Send + Sync + 'static) -> Self {
        Self {
            shared: Arc::default(),
            worker: Mutex::default(),
            program: Mutex::default(),
            emit: Arc::new(emit),
        }
    }
    pub fn prepare(&self, program: Program) -> Result<(), String> {
        program.score.compile(program.start_col)?;
        if program.warmup_ms > 10000 {
            return Err("开始预留时间最多 10000ms".into());
        }
        *self.program.lock().unwrap() = Some(program);
        Ok(())
    }
    pub fn snapshot(&self) -> Playback {
        self.shared.0.lock().unwrap().snapshot.clone()
    }
    pub fn start(&self) -> Result<(), String> {
        let program = self
            .program
            .lock()
            .unwrap()
            .clone()
            .ok_or("请先打开曲谱并选择游戏窗口")?;
        let plan = program.score.compile(program.start_col)?;
        if plan.notes.is_empty() {
            return Err("起点之后没有音符".into());
        }
        let target = program.target.ok_or("请先选择目标游戏窗口")?;
        let sink = platform::connect(target, program.mode.clone())?;
        self.launch(plan, sink, program.mode, program.warmup_ms)
    }
    fn launch(
        &self,
        plan: Plan,
        sink: Box<dyn InputSink>,
        mode: InputMode,
        warmup: u64,
    ) -> Result<(), String> {
        let mut worker = self.worker.lock().unwrap();
        if worker.as_ref().is_some_and(|w| !w.is_finished()) {
            return Err("演奏已开始".into());
        }
        if let Some(old) = worker.take() {
            let _ = old.join();
        }
        *self.shared.0.lock().unwrap() = Control {
            stop: false,
            pause: false,
            snapshot: Playback {
                status: "countdown".into(),
                duration_ms: plan.duration_ms,
                ..Default::default()
            },
        };
        let shared = self.shared.clone();
        let emit = self.emit.clone();
        *worker = Some(thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run(shared.clone(), plan, sink, mode, warmup, emit.clone())
            }));
            if result.is_err() {
                let mut control = shared.0.lock().unwrap();
                control.snapshot.status = "error".into();
                control.snapshot.active_id = None;
                control.snapshot.message = "演奏线程异常，已执行松键清理".into();
                emit(control.snapshot.clone());
            }
        }));
        Ok(())
    }
    pub fn pause(&self) {
        self.shared.0.lock().unwrap().pause = true;
        self.shared.1.notify_all();
    }
    pub fn resume(&self) {
        self.shared.0.lock().unwrap().pause = false;
        self.shared.1.notify_all();
    }
    pub fn toggle(&self) -> Result<(), String> {
        match self.snapshot().status.as_str() {
            "playing" | "countdown" => self.pause(),
            "paused" => self.resume(),
            _ => self.start()?,
        }
        Ok(())
    }
    pub fn stop(&self) {
        let mut worker = self.worker.lock().unwrap();
        self.shared.0.lock().unwrap().stop = true;
        self.shared.1.notify_all();
        if let Some(handle) = worker.take() {
            let _ = handle.join();
        }
    }
}
impl Drop for Engine {
    fn drop(&mut self) {
        self.stop();
    }
}

// The owned sink is dropped on every return and during unwinding; each platform
// retries only its own tracked key-ups in Drop.
fn run(
    shared: Shared,
    plan: Plan,
    mut sink: Box<dyn InputSink>,
    mode: InputMode,
    warmup: u64,
    emit: Emitter,
) {
    let mut position = -(warmup as f64);
    let mut last = Instant::now();
    let mut published = Instant::now() - Duration::from_secs(1);
    let mut next = 0usize;
    let mut active: Option<usize> = None;
    let mut was_paused = false;
    let outcome: Result<bool, String> = (|| loop {
        let now = Instant::now();
        let mut control = shared.0.lock().unwrap();
        if control.stop {
            break Ok(false);
        }
        let paused = control.pause;
        drop(control);
        if paused {
            if !was_paused {
                sink.release_all()?;
                active = None;
            }
        } else if !was_paused {
            position += now.duration_since(last).as_secs_f64() * 1000.0;
        }
        last = now;
        was_paused = paused;
        sink.check(!paused && position >= 0.0 && mode != InputMode::Background)?;
        let elapsed = position.max(0.0) as u64;
        if !paused && position >= 0.0 {
            if active.is_some_and(|i| elapsed >= plan.notes[i].at_ms + plan.notes[i].hold_ms) {
                sink.release_all()?;
                active = None;
            }
            while next < plan.notes.len() && plan.notes[next].at_ms <= elapsed {
                let i = next;
                next += 1;
                // Never burst stale inputs after sleep, a stall, or a pause.
                if elapsed >= plan.notes[i].at_ms + plan.notes[i].hold_ms {
                    continue;
                }
                if active.is_some() {
                    sink.release_all()?;
                }
                sink.press(&plan.notes[i].combo)?;
                active = Some(i);
            }
            if elapsed >= plan.duration_ms {
                break Ok(true);
            }
        }
        control = shared.0.lock().unwrap();
        let status = if paused {
            "paused"
        } else if position < 0.0 {
            "countdown"
        } else {
            "playing"
        };
        let status_changed = control.snapshot.status != status;
        control.snapshot.status = status.into();
        control.snapshot.elapsed_ms = elapsed.min(plan.duration_ms);
        control.snapshot.active_id = active.map(|i| plan.notes[i].id.clone());
        control.snapshot.message = if position < 0.0 && !paused {
            format!("{:.1} 秒后开始，请切换到游戏", -position / 1000.0)
        } else if paused {
            "已暂停并松开按键".into()
        } else {
            "演奏中".into()
        };
        let snapshot = control.snapshot.clone();
        if status_changed || published.elapsed() >= Duration::from_millis(30) {
            drop(control);
            emit(snapshot);
            published = Instant::now();
            control = shared.0.lock().unwrap();
        }
        let _ = shared
            .1
            .wait_timeout(control, Duration::from_millis(2))
            .unwrap();
    })();
    let released = sink.release_all();
    let mut control = shared.0.lock().unwrap();
    control.snapshot.active_id = None;
    match outcome.and_then(|done| released.map(|_| done)) {
        Ok(true) => {
            control.snapshot.status = "finished".into();
            control.snapshot.elapsed_ms = plan.duration_ms;
            control.snapshot.message = "演奏完成".into();
        }
        Ok(false) => {
            control.snapshot.status = "idle".into();
            control.snapshot.elapsed_ms = 0;
            control.snapshot.message = "已停止并松开按键".into();
        }
        Err(error) => {
            control.snapshot.status = "error".into();
            control.snapshot.message = error;
        }
    }
    emit(control.snapshot.clone());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Combo, ScheduledNote};
    use std::sync::atomic::{AtomicBool, Ordering};
    struct Fake {
        log: Arc<Mutex<Vec<String>>>,
        valid: Arc<AtomicBool>,
        held: bool,
        fail: bool,
    }
    impl InputSink for Fake {
        fn check(&mut self, _: bool) -> Result<(), String> {
            if self.valid.load(Ordering::SeqCst) {
                Ok(())
            } else {
                Err("目标窗口已关闭".into())
            }
        }
        fn press(&mut self, key: &Combo) -> Result<(), String> {
            self.held = true;
            self.log.lock().unwrap().push(format!("down:{}", key.base));
            if self.fail {
                Err("发送失败".into())
            } else {
                Ok(())
            }
        }
        fn release_all(&mut self) -> Result<(), String> {
            if self.held {
                self.log.lock().unwrap().push("up".into());
                self.held = false;
            }
            Ok(())
        }
    }
    impl Drop for Fake {
        fn drop(&mut self) {
            let _ = self.release_all();
        }
    }
    fn wait_for(mut predicate: impl FnMut() -> bool) {
        let until = Instant::now() + Duration::from_secs(3);
        while !predicate() {
            assert!(Instant::now() < until, "condition timed out");
            thread::sleep(Duration::from_millis(2));
        }
    }
    type TestSetup = (
        Engine,
        Arc<Mutex<Vec<String>>>,
        Arc<AtomicBool>,
        Box<dyn InputSink>,
    );
    fn setup(fail: bool) -> TestSetup {
        let engine = Engine::new(|_| {});
        let log = Arc::new(Mutex::new(vec![]));
        let valid = Arc::new(AtomicBool::new(true));
        let sink = Box::new(Fake {
            log: log.clone(),
            valid: valid.clone(),
            held: false,
            fail,
        });
        (engine, log, valid, sink)
    }
    fn plan() -> Plan {
        Plan {
            notes: [0, 220]
                .iter()
                .enumerate()
                .map(|(i, &at_ms)| ScheduledNote {
                    id: i.to_string(),
                    midi: Some(60),
                    at_ms,
                    hold_ms: 150,
                    combo: Combo::parse("Shift+A").unwrap(),
                })
                .collect(),
            duration_ms: 370,
        }
    }
    #[test]
    fn stop_releases_and_joins() {
        let (engine, log, _, sink) = setup(false);
        engine
            .launch(plan(), sink, InputMode::Background, 0)
            .unwrap();
        wait_for(|| !log.lock().unwrap().is_empty());
        engine.stop();
        assert_eq!(*log.lock().unwrap(), ["down:A", "up"]);
        assert_eq!(engine.snapshot().status, "idle");
    }
    #[test]
    fn pause_releases_and_resume_does_not_replay_current_note() {
        let (engine, log, _, sink) = setup(false);
        engine
            .launch(plan(), sink, InputMode::Background, 0)
            .unwrap();
        wait_for(|| !log.lock().unwrap().is_empty());
        engine.pause();
        wait_for(|| engine.snapshot().status == "paused");
        assert_eq!(*log.lock().unwrap(), ["down:A", "up"]);
        let frozen = engine.snapshot().elapsed_ms;
        thread::sleep(Duration::from_millis(40));
        assert_eq!(engine.snapshot().elapsed_ms, frozen);
        engine.resume();
        wait_for(|| engine.snapshot().status == "finished");
        engine.stop();
        assert_eq!(*log.lock().unwrap(), ["down:A", "up", "down:A", "up"]);
    }
    #[test]
    fn target_loss_and_partial_send_release() {
        for fail in [false, true] {
            let (engine, log, valid, sink) = setup(fail);
            engine
                .launch(plan(), sink, InputMode::Background, 0)
                .unwrap();
            wait_for(|| !log.lock().unwrap().is_empty());
            valid.store(false, Ordering::SeqCst);
            wait_for(|| engine.snapshot().status == "error");
            engine.stop();
            assert_eq!(log.lock().unwrap().last().unwrap(), "up");
        }
    }
    #[test]
    fn stopping_during_countdown_sends_no_keys() {
        let (engine, log, _, sink) = setup(false);
        engine
            .launch(plan(), sink, InputMode::Background, 500)
            .unwrap();
        engine.stop();
        assert!(log.lock().unwrap().is_empty());
    }
}
