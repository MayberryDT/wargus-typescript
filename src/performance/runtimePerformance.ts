export type PerformanceMetricSummary = {
  sampleCount: number;
  meanMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  effectiveFps: number | null;
  over16_7Ms: number;
  over33_3Ms: number;
  over50Ms: number;
};

export type RuntimeSchedulerSample = {
  acceptedDeltaSeconds: number;
  droppedDeltaSeconds: number;
  processedSteps: number;
  remainingBacklogSeconds: number;
  turnMilliseconds: number;
  maxStepMilliseconds: number;
};

export type RuntimePerformanceLifecycle = "idle" | "capturing" | "stopped";
export type LongTaskSupport = "supported" | "unsupported" | "unknown";
export type InputSampleToken = number;

export class BoundedSampleBuffer {
  readonly capacity: number;
  private readonly samples: number[];
  private writeIndex = 0;
  private sampleCount = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`Performance sample capacity must be a positive integer; received ${capacity}.`);
    }
    this.capacity = capacity;
    this.samples = new Array<number>(capacity);
  }

  push(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.samples[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.sampleCount = Math.min(this.sampleCount + 1, this.capacity);
  }

  reset(): void {
    this.writeIndex = 0;
    this.sampleCount = 0;
  }

  values(): number[] {
    const values = new Array<number>(this.sampleCount);
    const start = this.sampleCount === this.capacity ? this.writeIndex : 0;
    for (let index = 0; index < this.sampleCount; index += 1) {
      values[index] = this.samples[(start + index) % this.capacity];
    }
    return values;
  }
}

function nearestRank(sorted: number[], percentile: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[rank - 1];
}

export function summarizePerformanceSamples(samples: readonly number[]): PerformanceMetricSummary {
  const valid = samples.filter((sample) => Number.isFinite(sample) && sample >= 0);
  if (valid.length === 0) {
    return {
      sampleCount: 0, meanMs: null, p50Ms: null, p95Ms: null, p99Ms: null,
      maxMs: null, effectiveFps: null, over16_7Ms: 0, over33_3Ms: 0, over50Ms: 0
    };
  }
  const sorted = [...valid].sort((left, right) => left - right);
  let total = 0;
  let over16_7Ms = 0;
  let over33_3Ms = 0;
  let over50Ms = 0;
  for (const sample of valid) {
    total += sample;
    if (sample > 16.7) over16_7Ms += 1;
    if (sample > 33.3) over33_3Ms += 1;
    if (sample > 50) over50Ms += 1;
  }
  const meanMs = total / valid.length;
  return {
    sampleCount: valid.length,
    meanMs,
    p50Ms: nearestRank(sorted, 0.5),
    p95Ms: nearestRank(sorted, 0.95),
    p99Ms: nearestRank(sorted, 0.99),
    maxMs: sorted[sorted.length - 1],
    effectiveFps: meanMs > 0 ? 1000 / meanMs : null,
    over16_7Ms,
    over33_3Ms,
    over50Ms
  };
}

type PendingInputSample = { token: number; startedAt: number };

export type RuntimePerformanceSnapshot = {
  lifecycle: RuntimePerformanceLifecycle;
  profile: string | null;
  capacity: number;
  longTaskSupport: LongTaskSupport;
  frame: PerformanceMetricSummary;
  update: PerformanceMetricSummary;
  renderPreparation: PerformanceMetricSummary;
  smoke: PerformanceMetricSummary;
  longTasks: PerformanceMetricSummary;
  inputToCommand: PerformanceMetricSummary;
  inputToNextRender: PerformanceMetricSummary;
  scheduler: {
    acceptedDeltaSeconds: number;
    droppedDeltaSeconds: number;
    processedSteps: number;
    maxBacklogSeconds: number;
    turn: PerformanceMetricSummary;
    maxStep: PerformanceMetricSummary;
    latest: RuntimeSchedulerSample | null;
  };
  frameSamples: number[];
  updateSamples: number[];
  renderPreparationSamples: number[];
  smokeSamples: number[];
  longTaskSamples: number[];
  inputToCommandSamples: number[];
  inputToNextRenderSamples: number[];
};

export class RuntimePerformanceCollector {
  private lifecycle: RuntimePerformanceLifecycle = "idle";
  private profile: string | null = null;
  private longTaskSupport: LongTaskSupport = "unknown";
  private nextInputToken = 1;
  private pendingInputs: PendingInputSample[] = [];
  private acceptedDeltaSeconds = 0;
  private droppedDeltaSeconds = 0;
  private processedSteps = 0;
  private maxBacklogSeconds = 0;
  private latestScheduler: RuntimeSchedulerSample | null = null;
  private readonly frameSamples: BoundedSampleBuffer;
  private readonly updateSamples: BoundedSampleBuffer;
  private readonly renderPreparationSamples: BoundedSampleBuffer;
  private readonly smokeSamples: BoundedSampleBuffer;
  private readonly longTaskSamples: BoundedSampleBuffer;
  private readonly inputToCommandSamples: BoundedSampleBuffer;
  private readonly inputToNextRenderSamples: BoundedSampleBuffer;
  private readonly schedulerTurnSamples: BoundedSampleBuffer;
  private readonly schedulerMaxStepSamples: BoundedSampleBuffer;

  constructor(readonly capacity = 900) {
    this.frameSamples = new BoundedSampleBuffer(capacity);
    this.updateSamples = new BoundedSampleBuffer(capacity);
    this.renderPreparationSamples = new BoundedSampleBuffer(capacity);
    this.smokeSamples = new BoundedSampleBuffer(capacity);
    this.longTaskSamples = new BoundedSampleBuffer(capacity);
    this.inputToCommandSamples = new BoundedSampleBuffer(capacity);
    this.inputToNextRenderSamples = new BoundedSampleBuffer(capacity);
    this.schedulerTurnSamples = new BoundedSampleBuffer(capacity);
    this.schedulerMaxStepSamples = new BoundedSampleBuffer(capacity);
  }

  isCapturing(): boolean { return this.lifecycle === "capturing"; }

  start(profile: string): void {
    this.reset();
    this.profile = profile;
    this.lifecycle = "capturing";
  }

  stop(): RuntimePerformanceSnapshot {
    if (this.lifecycle === "capturing") this.lifecycle = "stopped";
    return this.snapshot();
  }

  reset(): void {
    this.lifecycle = "idle";
    this.profile = null;
    this.pendingInputs = [];
    this.acceptedDeltaSeconds = 0;
    this.droppedDeltaSeconds = 0;
    this.processedSteps = 0;
    this.maxBacklogSeconds = 0;
    this.latestScheduler = null;
    this.frameSamples.reset(); this.updateSamples.reset(); this.renderPreparationSamples.reset();
    this.smokeSamples.reset(); this.longTaskSamples.reset(); this.inputToCommandSamples.reset();
    this.inputToNextRenderSamples.reset(); this.schedulerTurnSamples.reset(); this.schedulerMaxStepSamples.reset();
  }

  setLongTaskSupport(support: Exclude<LongTaskSupport, "unknown">): void { this.longTaskSupport = support; }
  recordFrame(milliseconds: number): void { if (this.isCapturing()) this.frameSamples.push(milliseconds); }
  recordUpdate(milliseconds: number): void { if (this.isCapturing()) this.updateSamples.push(milliseconds); }
  recordRenderPreparation(milliseconds: number): void { if (this.isCapturing()) this.renderPreparationSamples.push(milliseconds); }
  recordSmoke(milliseconds: number): void { if (this.isCapturing()) this.smokeSamples.push(milliseconds); }
  recordLongTask(milliseconds: number): void { if (this.isCapturing()) this.longTaskSamples.push(milliseconds); }

  beginInput(startedAt: number): InputSampleToken | null {
    if (!this.isCapturing() || !Number.isFinite(startedAt)) return null;
    const token = this.nextInputToken;
    this.nextInputToken += 1;
    if (this.pendingInputs.length >= this.capacity) this.pendingInputs.shift();
    this.pendingInputs.push({ token, startedAt });
    return token;
  }

  finishInput(token: InputSampleToken | null, finishedAt: number): void {
    if (!this.isCapturing() || token === null || !Number.isFinite(finishedAt)) return;
    const pending = this.pendingInputs.find((candidate) => candidate.token === token);
    if (pending) this.inputToCommandSamples.push(finishedAt - pending.startedAt);
  }

  completeRenderPreparation(completedAt: number): void {
    if (!this.isCapturing() || !Number.isFinite(completedAt) || this.pendingInputs.length === 0) return;
    const pending = this.pendingInputs;
    this.pendingInputs = [];
    for (const sample of pending) this.inputToNextRenderSamples.push(completedAt - sample.startedAt);
  }

  recordScheduler(sample: RuntimeSchedulerSample): void {
    if (!this.isCapturing()) return;
    this.acceptedDeltaSeconds += Math.max(0, sample.acceptedDeltaSeconds);
    this.droppedDeltaSeconds += Math.max(0, sample.droppedDeltaSeconds);
    this.processedSteps += Math.max(0, sample.processedSteps);
    this.maxBacklogSeconds = Math.max(this.maxBacklogSeconds, sample.remainingBacklogSeconds);
    this.schedulerTurnSamples.push(sample.turnMilliseconds);
    this.schedulerMaxStepSamples.push(sample.maxStepMilliseconds);
    this.latestScheduler = { ...sample };
  }

  snapshot(): RuntimePerformanceSnapshot {
    const frameSamples = this.frameSamples.values();
    const updateSamples = this.updateSamples.values();
    const renderPreparationSamples = this.renderPreparationSamples.values();
    const smokeSamples = this.smokeSamples.values();
    const longTaskSamples = this.longTaskSamples.values();
    const inputToCommandSamples = this.inputToCommandSamples.values();
    const inputToNextRenderSamples = this.inputToNextRenderSamples.values();
    return {
      lifecycle: this.lifecycle, profile: this.profile, capacity: this.capacity, longTaskSupport: this.longTaskSupport,
      frame: summarizePerformanceSamples(frameSamples), update: summarizePerformanceSamples(updateSamples),
      renderPreparation: summarizePerformanceSamples(renderPreparationSamples), smoke: summarizePerformanceSamples(smokeSamples),
      longTasks: summarizePerformanceSamples(longTaskSamples), inputToCommand: summarizePerformanceSamples(inputToCommandSamples),
      inputToNextRender: summarizePerformanceSamples(inputToNextRenderSamples),
      scheduler: {
        acceptedDeltaSeconds: this.acceptedDeltaSeconds, droppedDeltaSeconds: this.droppedDeltaSeconds,
        processedSteps: this.processedSteps, maxBacklogSeconds: this.maxBacklogSeconds,
        turn: summarizePerformanceSamples(this.schedulerTurnSamples.values()),
        maxStep: summarizePerformanceSamples(this.schedulerMaxStepSamples.values()),
        latest: this.latestScheduler ? { ...this.latestScheduler } : null
      },
      frameSamples, updateSamples, renderPreparationSamples, smokeSamples, longTaskSamples,
      inputToCommandSamples, inputToNextRenderSamples
    };
  }
}
