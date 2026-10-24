/**
 * performance-timing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure, structured performance instrumentation for document operations.
 *
 * Rules:
 * - Records operation durations and status.
 * - NEVER logs file contents, credentials, tokens, or PII.
 * - Formats Server-Timing header safely for API diagnostics.
 */

export interface TimingMetric {
  name: string;
  durationMs: number;
  description?: string;
}

export class PerformanceTracker {
  private startTime: number;
  private markers: Map<string, number> = new Map();
  private metrics: TimingMetric[] = [];
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = performance.now();
  }

  /**
   * Marks the start of a timed sub-operation.
   */
  startMarker(name: string): void {
    this.markers.set(name, performance.now());
  }

  /**
   * Ends a timed sub-operation and records the elapsed milliseconds.
   */
  endMarker(name: string, description?: string): number {
    const start = this.markers.get(name);
    const duration = start !== undefined ? performance.now() - start : 0;
    this.metrics.push({
      name,
      durationMs: Math.round(duration * 100) / 100,
      description,
    });
    this.markers.delete(name);
    return duration;
  }

  /**
   * Records a completed metric with known duration.
   */
  record(name: string, durationMs: number, description?: string): void {
    this.metrics.push({
      name,
      durationMs: Math.round(durationMs * 100) / 100,
      description,
    });
  }

  /**
   * Completes tracking and outputs structured log (no sensitive data).
   */
  finish(success: boolean, extraSafeMeta?: Record<string, string | number | boolean>): {
    totalDurationMs: number;
    metrics: TimingMetric[];
  } {
    const totalDurationMs = Math.round((performance.now() - this.startTime) * 100) / 100;

    // Structured, safe log entry
    const safeMetaStr = extraSafeMeta
      ? Object.entries(extraSafeMeta)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')
      : '';

    const breakdownStr = this.metrics
      .map((m) => `${m.name}=${m.durationMs}ms`)
      .join(' ');

    console.info(
      `[DOC_PERF] op=${this.operation} success=${success} totalMs=${totalDurationMs} ${safeMetaStr} ${breakdownStr}`.trim()
    );

    return { totalDurationMs, metrics: this.metrics };
  }

  /**
   * Generates a standard W3C Server-Timing header string.
   */
  getServerTimingHeader(): string {
    return this.metrics
      .map((m) => {
        const desc = m.description ? `;desc="${m.description}"` : '';
        return `${m.name};dur=${m.durationMs}${desc}`;
      })
      .join(', ');
  }
}
