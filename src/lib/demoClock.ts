/** A clock the demo can move forward so the simulated hospital response arrives on cue. Offset lives wherever the caller persists it. */
export type ClockMeta = { get(key: string): string | undefined; set(key: string, value: string): void };

export class DemoClock {
  constructor(private meta: ClockMeta, private realNow: () => number = () => Date.now()) {}
  private offsetMs(): number { return Number(this.meta.get("demo_clock_offset_ms") ?? 0); }
  now(): string { return new Date(this.realNow() + this.offsetMs()).toISOString(); }
  advanceDays(n: number): void {
    if (!Number.isFinite(n) || n < 0) throw new Error("Advance by a non-negative number of days");
    this.meta.set("demo_clock_offset_ms", String(this.offsetMs() + n * 86_400_000));
  }
  reset(): void { this.meta.set("demo_clock_offset_ms", "0"); }
}
