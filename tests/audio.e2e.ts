import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { parseMidi } from "midi-file";

test("selects and persists instruments, shares the selection with recording and exports a real MIDI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const instrument = page.getByRole("combobox", {
    name: "试听音色",
    exact: true,
  });
  await expect(instrument.locator("option")).toHaveText([
    "钢琴",
    "古琴",
    "箜篌",
    "箫",
    "二胡",
    "埙",
  ]);
  await instrument.selectOption("guqin");
  await page.getByRole("button", { name: "试听 1", exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("qin-workspace")!).settings.instrument ===
      "guqin",
  );
  await page.reload();
  await expect(instrument).toHaveValue("guqin");
  await page.getByRole("button", { name: "MIDI 录制", exact: true }).click();
  await expect(page.getByLabel("录制试听音色")).toHaveValue("guqin");
  await page.getByLabel("录制试听音色").selectOption("erhu");
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await expect(instrument).toHaveValue("erhu");
  await page.getByLabel("导出「山间清音」").click();
  await page.getByRole("button", { name: "MIDI 乐谱", exact: true }).click();
  await expect(page.getByRole("img", { name: "MIDI 导出音符" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "复制", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: ".impeccable/review/midi-export.png" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存文件", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("山间清音.mid");
  const data = parseMidi(new Uint8Array(await readFile((await file.path())!)));
  expect(data.tracks[0].filter((e) => e.type === "noteOn")).toHaveLength(30);
  expect(data.tracks[0]).toContainEqual({
    deltaTime: 0,
    type: "programChange",
    channel: 0,
    programNumber: 110,
  });
  expect(data.tracks[0]).toContainEqual({
    deltaTime: 0,
    meta: true,
    type: "setTempo",
    microsecondsPerBeat: 625000,
  });
  await page.screenshot({ path: ".impeccable/review/instruments-desktop.png" });
  await page.setViewportSize({ width: 900, height: 640 });
  await expect(instrument).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/instruments-compact.png" });
  expect(errors).toEqual([]);
});

test("renders six distinct timbres with decaying strings and sustained wind/bow envelopes", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const url = "/src/instruments.ts";
    const { instruments, synthesize } = await import(/* @vite-ignore */ url);
    const results = [];
    for (const instrument of Object.keys(instruments)) {
      const ctx = new OfflineAudioContext(2, 48000 * 2, 48000);
      synthesize(ctx, ctx.destination, instrument, 69, 0.8, 0.05, 0.8);
      const output = await ctx.startRendering();
      const data = output.getChannelData(0);
      const rms = (a: number, b: number) => {
        const samples = data.slice(a * 48000, b * 48000);
        return Math.sqrt(
          samples.reduce((s, n) => s + n * n, 0) / samples.length,
        );
      };
      const spectrum: number[] = [];
      // Measure harmonic bands including vibrato sidebands.
      for (let harmonic = 1; harmonic <= 12; harmonic++) {
        let power = 0;
        for (const detune of [-8, -4, 0, 4, 8]) {
          let re = 0,
            im = 0;
          for (let i = 7200; i < 16800; i++) {
            const phase = (2 * Math.PI * (440 * harmonic + detune) * i) / 48000;
            re += data[i] * Math.cos(phase);
            im += data[i] * Math.sin(phase);
          }
          power += re * re + im * im;
        }
        spectrum.push(power);
      }
      const sum = spectrum.reduce((a, b) => a + b, 0);
      results.push({
        instrument,
        finite: data.every(Number.isFinite),
        peak: data.reduce((p, n) => Math.max(p, Math.abs(n)), 0),
        before: rms(0, 0.04),
        early: rms(0.15, 0.3),
        late: rms(0.6, 0.75),
        after: rms(1.6, 1.9),
        centroid: spectrum.reduce((s, p, i) => s + p * (i + 1), 0) / sum,
      });
    }
    return results;
  });
  console.log("Rendered timbres:", JSON.stringify(results));
  for (const result of results) {
    expect(result.finite).toBe(true);
    expect(result.peak).toBeGreaterThan(0.01);
    expect(result.peak).toBeLessThan(1);
    expect(result.before).toBe(0);
    expect(result.after).toBeLessThan(0.00001);
    if (["piano", "guqin", "konghou"].includes(result.instrument))
      expect(result.late).toBeLessThan(result.early * 0.95);
    else expect(result.late).toBeGreaterThan(result.early * 0.8);
  }
  const byName = Object.fromEntries(results.map((r) => [r.instrument, r]));
  expect(byName.erhu.centroid).toBeGreaterThan(byName.xiao.centroid * 1.5);
  expect(byName.xiao.centroid).toBeGreaterThan(byName.xun.centroid);
  expect(new Set(results.map((r) => r.centroid.toFixed(3))).size).toBe(6);
});

test("sustains long notes, varies piano dynamics and renders both ends of the 88-key range", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const url = "/src/instruments.ts";
    const { instruments, synthesize } = await import(/* @vite-ignore */ url);
    const ctx = new OfflineAudioContext(1, 44100 * 8, 44100);
    synthesize(ctx, ctx.destination, "xiao", 60, 0.8, 0, 7);
    const long = (await ctx.startRendering()).getChannelData(0);
    const rms = (data: Float32Array) =>
      Math.sqrt(data.reduce((s, n) => s + n * n, 0) / data.length);
    const dynamics: number[] = [];
    for (const velocity of [0.2, 0.9]) {
      const c = new OfflineAudioContext(1, 24000, 48000);
      synthesize(c, c.destination, "piano", 60, velocity, 0, 0.3);
      dynamics.push(rms((await c.startRendering()).getChannelData(0)));
    }
    const extremes: number[] = [];
    for (const sampleRate of [44100, 48000]) {
      for (const instrument of Object.keys(instruments)) {
        for (const midi of [21, 108]) {
          const c = new OfflineAudioContext(1, sampleRate / 2, sampleRate);
          synthesize(c, c.destination, instrument, midi, 1, 0, 0.2);
          const data = (await c.startRendering()).getChannelData(0);
          extremes.push(data.every(Number.isFinite) ? rms(data) : NaN);
        }
      }
    }
    return {
      sustained: rms(long.slice(44100 * 6.6, 44100 * 6.9)),
      silence: rms(long.slice(44100 * 7.5)),
      dynamics,
      extremes,
    };
  });
  expect(result.sustained).toBeGreaterThan(0.01);
  expect(result.silence).toBeLessThan(0.00001);
  expect(result.dynamics[1]).toBeGreaterThan(result.dynamics[0] * 2);
  for (const level of result.extremes) {
    expect(Number.isFinite(level)).toBe(true);
    expect(level).toBeGreaterThan(0.0001);
    expect(level).toBeLessThan(0.8);
  }
});

test("limits look-ahead work and releases live notes by channel and sustain pedal", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const url = "/src/audio.ts";
    const { PreviewAudio } = await import(/* @vite-ignore */ url);
    const audio = new PreviewAudio();
    await audio.unlock();
    audio.instrument = "erhu";
    audio.noteOn(60, 100, 0);
    audio.noteOn(60, 100, 1);
    audio.sustain(0, true);
    audio.noteOff(60, 0);
    audio.noteOff(60, 1);
    const before = audio.held.size;
    audio.sustain(0, false);
    const after = audio.held.size;
    await audio.playMidi({
      durationMs: 80000000,
      notes: Array.from({ length: 100000 }, (_, i) => ({
        midi: 60,
        channel: 0,
        velocity: 100,
        startMs: i * 800,
        endMs: i * 800 + 500,
      })),
    });
    const queued = audio.cursor;
    audio.stop();
    const stopped =
      audio.voices.size === 0 &&
      audio.pending.length === 0 &&
      audio.timer === null;
    const starting = audio.playMidi({
      durationMs: 500,
      notes: [{ midi: 60, channel: 0, velocity: 100, startMs: 0, endMs: 500 }],
    });
    audio.stop();
    await starting;
    const cancelled = audio.pending.length === 0 && audio.timer === null;
    for (let i = 0; i < 70; i++) audio.tone(60, 0.2);
    const bounded = audio.voices.size <= 64;
    audio.dispose();
    return { before, after, queued, stopped, cancelled, bounded };
  });
  expect(result).toEqual({
    before: 1,
    after: 0,
    queued: 1,
    stopped: true,
    cancelled: true,
    bounded: true,
  });
});
