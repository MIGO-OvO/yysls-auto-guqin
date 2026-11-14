export const instruments = {
  piano: { name: "钢琴", program: 0 },
  guqin: { name: "古琴", program: 107 },
  konghou: { name: "箜篌", program: 46 },
  xiao: { name: "箫", program: 77 },
  erhu: { name: "二胡", program: 110 },
  xun: { name: "埙", program: 79 },
} as const;

export type Instrument = keyof typeof instruments;

export function isInstrument(value: unknown): value is Instrument {
  return typeof value === "string" && Object.hasOwn(instruments, value);
}

interface Model {
  excitation: "hammer" | "pluck" | "air" | "bow";
  attack: number;
  release: number;
  decay: number;
  stiffness: number;
  position: number;
  cutoff: number;
  noise: number;
  vibrato: number;
  body: [number, number][];
}

const models: Record<Instrument, Model> = {
  piano: {
    excitation: "hammer",
    attack: 0.003,
    release: 0.22,
    decay: 3.2,
    stiffness: 0.00016,
    position: 0.115,
    cutoff: 6400,
    noise: 0.035,
    vibrato: 0,
    body: [
      [250, 2],
      [2100, 3],
    ],
  },
  guqin: {
    excitation: "pluck",
    attack: 0.004,
    release: 0.42,
    decay: 2.4,
    stiffness: 0.000035,
    position: 0.22,
    cutoff: 4200,
    noise: 0.055,
    vibrato: 0,
    body: [
      [210, 4],
      [680, 2],
    ],
  },
  konghou: {
    excitation: "pluck",
    attack: 0.006,
    release: 0.65,
    decay: 4,
    stiffness: 0.000018,
    position: 0.13,
    cutoff: 7200,
    noise: 0.018,
    vibrato: 0,
    body: [
      [420, 2],
      [1800, 2],
    ],
  },
  xiao: {
    excitation: "air",
    attack: 0.09,
    release: 0.16,
    decay: 0,
    stiffness: 0,
    position: 0,
    cutoff: 4300,
    noise: 0.12,
    vibrato: 9,
    body: [
      [650, 2],
      [2400, 1],
    ],
  },
  erhu: {
    excitation: "bow",
    attack: 0.07,
    release: 0.13,
    decay: 0,
    stiffness: 0,
    position: 0,
    cutoff: 6800,
    noise: 0.045,
    vibrato: 19,
    body: [
      [850, 4],
      [2600, 3],
    ],
  },
  xun: {
    excitation: "air",
    attack: 0.065,
    release: 0.18,
    decay: 0,
    stiffness: 0,
    position: 0,
    cutoff: 2300,
    noise: 0.07,
    vibrato: 5,
    body: [
      [520, 3],
      [1150, -2],
    ],
  },
};

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(context: BaseAudioContext) {
  let buffer = noiseBuffers.get(context);
  if (!buffer) {
    buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 918273;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = seed / 2147483648;
    }
    noiseBuffers.set(context, buffer);
  }
  return buffer;
}

export interface SynthVoice {
  release: (at?: number, seconds?: number) => void;
  ended: boolean;
}

// Independent modal approximation: stiff-string modes, frequency-dependent
// losses and detuned unisons. Wind/bow voices use sustained harmonic excitation.
export function synthesize(
  context: BaseAudioContext,
  destination: AudioNode,
  instrument: Instrument,
  midi: number,
  velocity: number,
  when: number,
  seconds = Infinity,
): SynthVoice {
  const model = models[instrument];
  const strength = Math.max(0.01, Math.min(1, velocity));
  const fundamental = 440 * 2 ** ((midi - 69) / 12);
  const transient = model.decay > 0;
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  const input = context.createGain();
  const gate = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.6;
  filter.frequency.setValueAtTime(
    Math.min(context.sampleRate * 0.45, model.cutoff * (0.55 + strength * 0.7)),
    when,
  );
  input.connect(filter);
  let output: AudioNode = filter;
  for (const [frequency, gain] of model.body) {
    const body = context.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = frequency;
    body.Q.value = 1.2;
    body.gain.value = gain;
    output.connect(body);
    output = body;
    nodes.push(body);
  }
  output.connect(gate);
  const pan = context.createStereoPanner();
  pan.pan.value = Math.max(-0.45, Math.min(0.45, (midi - 66) / 100));
  gate.connect(pan);
  pan.connect(destination);
  nodes.push(input, filter, gate, pan);
  gate.gain.setValueAtTime(0, when);
  gate.gain.linearRampToValueAtTime(
    1,
    when + Math.min(model.attack, seconds / 3),
  );

  let endAt = Infinity;
  const voice: SynthVoice = {
    ended: false,
    release(at = context.currentTime, release = model.release) {
      if (voice.ended || at + release >= endAt) return;
      endAt = at + release;
      gate.gain.cancelAndHoldAtTime(at);
      gate.gain.setTargetAtTime(0, at, Math.max(0.001, release / 6));
      for (const source of sources) source.stop(endAt);
    },
  };
  let ended = 0;
  const start = (source: AudioScheduledSourceNode) => {
    sources.push(source);
    nodes.push(source);
    source.onended = () => {
      if (++ended === sources.length) {
        voice.ended = true;
        for (const node of nodes) node.disconnect();
      }
    };
    source.start(when);
  };

  const vibrato = model.vibrato ? context.createOscillator() : null;
  const depth = vibrato ? context.createGain() : null;
  if (vibrato && depth) {
    vibrato.frequency.value = instrument === "erhu" ? 5.6 : 4.8;
    depth.gain.setValueAtTime(0, when);
    depth.gain.linearRampToValueAtTime(model.vibrato, when + 0.45);
    vibrato.connect(depth);
    nodes.push(depth);
    start(vibrato);
  }

  const stiffness = model.stiffness * 2 ** ((midi - 60) / 18);
  const partials: { frequency: number; amplitude: number; harmonic: number }[] =
    [];
  for (let harmonic = 1; harmonic <= 32; harmonic++) {
    const frequency =
      fundamental *
      harmonic *
      Math.sqrt((1 + stiffness * harmonic ** 2) / (1 + stiffness));
    if (frequency >= Math.min(16000, context.sampleRate * 0.45)) break;
    let amplitude: number;
    if (transient) {
      const contact =
        model.excitation === "hammer" ? 0.65 + (1 - strength) * 1.4 : 0.45;
      amplitude =
        (Math.abs(Math.sin(Math.PI * harmonic * model.position)) /
          harmonic ** (model.excitation === "hammer" ? 0.8 : 1.25)) *
        Math.exp(-contact * (frequency / model.cutoff) ** 2);
    } else if (instrument === "erhu") {
      const formant = (center: number, width: number) =>
        Math.exp(-0.5 * ((frequency - center) / width) ** 2);
      amplitude =
        (0.4 + formant(900, 500) + 1.1 * formant(2600, 900)) /
        harmonic ** (1.05 + (1 - strength) * 0.35);
    } else {
      const harmonics =
        instrument === "xiao"
          ? [1, 0.22, 0.32, 0.08, 0.07, 0.025, 0.015]
          : [1, 0.18, 0.045, 0.012, 0.005];
      amplitude = harmonics[harmonic - 1] ?? 0;
    }
    if (amplitude > 0.0001) partials.push({ frequency, amplitude, harmonic });
  }
  const total = partials.reduce((sum, p) => sum + p.amplitude, 0);
  const level =
    ((instrument === "erhu" ? 0.65 : 0.48) * strength ** 0.85) / total;
  for (const { frequency, amplitude, harmonic } of partials) {
    const unisons =
      instrument === "piano" && harmonic <= 10 && midi >= 40
        ? midi < 60
          ? [-1.4, 1.4]
          : [-2.2, 0, 1.8]
        : [0];
    unisons.forEach((cents, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.detune.setValueAtTime(
        cents + (transient ? strength * 5 : -8),
        when,
      );
      oscillator.detune.linearRampToValueAtTime(cents, when + 0.06);
      if (depth) depth.connect(oscillator.detune);
      gain.gain.setValueAtTime((level * amplitude) / unisons.length, when);
      if (transient) {
        const decay =
          ((model.decay * (440 / fundamental) ** 0.3) /
            (1 + harmonic ** 1.35 * 0.075)) *
          (1 + i * 0.3);
        gain.gain.setTargetAtTime(0, when, Math.max(0.04, decay));
      }
      oscillator.connect(gain);
      gain.connect(input);
      nodes.push(gain);
      start(oscillator);
    });
  }

  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer(context);
  noise.loop = true;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = Math.min(
    10000,
    fundamental * (transient ? 5 : 3),
  );
  noiseFilter.Q.value = transient ? 0.7 : 1.4;
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(model.noise * strength * 0.35, when);
  if (transient) noiseGain.gain.setTargetAtTime(0, when, 0.009);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(input);
  nodes.push(noiseFilter, noiseGain);
  start(noise);
  if (Number.isFinite(seconds)) voice.release(when + Math.max(0.015, seconds));
  return voice;
}
