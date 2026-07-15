/**
 * Circuit Breaker pattern for external API resilience.
 * Trips to OPEN state when failure rate > 5% over 60s window.
 * Half-opens after cooldown to test recovery.
 *
 * Usage:
 *   const fxBreaker = new CircuitBreaker("frankfurter-api");
 *   const rates = await fxBreaker.call(() => fetchFxRates());
 */

const OPEN = "OPEN";
const HALF_OPEN = "HALF_OPEN";
const CLOSED = "CLOSED";

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.windowMs = options.windowMs || 60_000;       // 60s rolling window
    this.failureThreshold = options.failureThreshold || 0.05; // 5%
    this.cooldownMs = options.cooldownMs || 30_000;    // 30s cooldown
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;
    this.halfOpenCalls = 0;
    this.minRequestCount = options.minRequestCount || 10; // minimum samples to trip

    // Rolling window arrays
    this.failures = [];
    this.successes = [];
  }

  getState() { return this.state; }

  _recordResult(success) {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    if (success) {
      this.successes.push(now);
      this.successCount++;
    } else {
      this.failures.push(now);
      this.failureCount++;
      this.lastFailureTime = now;
    }

    // Prune old entries
    this.failures = this.failures.filter((t) => t > cutoff);
    this.successes = this.successes.filter((t) => t > cutoff);

    const recentFailures = this.failures.length;
    const recentTotal = recentFailures + this.successes.length;

    if (recentTotal >= this.minRequestCount) {
      const rate = recentFailures / recentTotal;
      if (rate > this.failureThreshold) {
        this.state = OPEN;
        this.halfOpenCalls = 0;
      }
    }
  }

  async call(fn) {
    if (this.state === OPEN) {
      const elapsed = Date.now() - (this.lastFailureTime || 0);
      if (elapsed > this.cooldownMs) {
        this.state = HALF_OPEN;
        this.halfOpenCalls = 0;
      } else {
        throw new CircuitBreakerOpenError(`Circuit breaker OPEN for "${this.name}" — retry in ${Math.ceil((this.cooldownMs - elapsed) / 1000)}s`);
      }
    }

    if (this.state === HALF_OPEN) {
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        throw new CircuitBreakerOpenError(`Circuit breaker HALF_OPEN for "${this.name}" — canary limit reached`);
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this._recordResult(true);

      // If half-open and success, close the circuit
      if (this.state === HALF_OPEN) {
        this.state = CLOSED;
        this.failures = [];
        this.successes = [];
      }

      return result;
    } catch (err) {
      this._recordResult(false);
      throw err;
    }
  }

  reset() {
    this.state = CLOSED;
    this.failures = [];
    this.successes = [];
    this.halfOpenCalls = 0;
    this.lastFailureTime = null;
  }

  getMetrics() {
    const total = this.failures.length + this.successes.length;
    return {
      name: this.name,
      state: this.state,
      failuresRecent: this.failures.length,
      successesRecent: this.successes.length,
      failureRate: total > 0 ? (this.failures.length / total) : 0,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

// Named breakers for external services
const breakers = new Map();

export function getBreaker(name, options) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, options));
  }
  return breakers.get(name);
}

// Health check endpoint for all breakers
export function getAllBreakerMetrics() {
  const metrics = {};
  for (const [name, breaker] of breakers) {
    metrics[name] = breaker.getMetrics();
  }
  return metrics;
}
