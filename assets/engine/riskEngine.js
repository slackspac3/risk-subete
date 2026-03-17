/**
 * riskEngine.js — FAIR-based Monte Carlo simulation engine
 * 
 * Architecture:
 *  - Triangular and lognormal distributions
 *  - Compound Poisson ALE model
 *  - Vulnerability derived from ThreatCapability vs ControlStrength (sigmoid)
 *  - Loss Exceedance Curve (LEC) computation
 *  - Deterministic mode via seeded PRNG (Mulberry32)
 */

const RiskEngine = (() => {
  // ─── Seeded PRNG (Mulberry32) ─────────────────────────────
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let _rand = Math.random; // default; replaced in run()

  // ─── Box-Muller for normal samples ───────────────────────
  function sampleNormal(mean = 0, std = 1) {
    let u = 0, v = 0;
    while (u === 0) u = _rand();
    while (v === 0) v = _rand();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + std * z;
  }

  // ─── Triangular distribution ──────────────────────────────
  function sampleTriangular(min, mode, max) {
    if (min >= max) return min;
    if (mode < min) mode = min;
    if (mode > max) mode = max;
    const u = _rand();
    const fc = (mode - min) / (max - min);
    if (u < fc) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }

  // ─── Lognormal distribution (parameterised via P10/P90) ───
  // We accept min (≈P5), mode (≈P50), max (≈P95) and fit lognormal.
  function sampleLognormal(min, mode, max) {
    if (min <= 0) min = 1;
    if (mode <= 0) mode = min * 2;
    if (max <= mode) max = mode * 2;
    // Estimate mu from P50 (mode treated as median for lognormal)
    const mu = Math.log(mode);
    // Estimate sigma from range: P95 / P50 ≈ exp(1.645 * sigma)
    const sigma = Math.log(max / mode) / 1.645;
    const s = Math.abs(sigma) < 0.001 ? 0.001 : sigma;
    const z = sampleNormal(0, 1);
    return Math.exp(mu + s * z);
  }

  function sampleDist(distType, min, likely, max) {
    if (distType === 'lognormal') return sampleLognormal(min, likely, max);
    return sampleTriangular(min, likely, max);
  }

  // ─── Sigmoid vulnerability model ─────────────────────────
  // vulnerability = sigmoid(k * (threatCap - controlStr))
  // k=6 gives a reasonably steep curve
  function sigmoid(x, k = 6) {
    return 1 / (1 + Math.exp(-k * x));
  }

  function sampleVulnerability(params) {
    if (params.vulnDirect) {
      return Math.min(1, Math.max(0,
        sampleDist(params.distType, params.vulnMin, params.vulnLikely, params.vulnMax)));
    }
    const tc = sampleDist(params.distType,
      params.threatCapMin, params.threatCapLikely, params.threatCapMax);
    const cs = sampleDist(params.distType,
      params.controlStrMin, params.controlStrLikely, params.controlStrMax);
    const raw = sigmoid(tc - cs);
    // Add small noise to avoid deterministic boundary behaviour
    const noise = (_rand() - 0.5) * 0.05;
    return Math.min(1, Math.max(0, raw + noise));
  }

  // ─── Primary loss per event ───────────────────────────────
  function samplePrimaryLoss(params) {
    const dt = params.distType;
    const ir = sampleDist(dt, params.irMin, params.irLikely, params.irMax);
    const bi = sampleDist(dt, params.biMin, params.biLikely, params.biMax);
    const db = sampleDist(dt, params.dbMin, params.dbLikely, params.dbMax);
    const rl = sampleDist(dt, params.rlMin, params.rlLikely, params.rlMax);
    const tp = sampleDist(dt, params.tpMin, params.tpLikely, params.tpMax);
    const rc = sampleDist(dt, params.rcMin, params.rcLikely, params.rcMax);

    // Apply optional correlation (Iman-Conover simplified: add weighted draw)
    const corr_bi_ir = params.corrBiIr || 0.3;
    const corr_rl_rc = params.corrRlRc || 0.2;

    // Simple correlation injection: blend a shared random component
    const shared1 = sampleNormal(0, 1);
    const shared2 = sampleNormal(0, 1);
    const biAdj = bi * (1 + corr_bi_ir * 0.1 * shared1);
    const irAdj = ir * (1 + corr_bi_ir * 0.1 * shared1);
    const rlAdj = rl * (1 + corr_rl_rc * 0.1 * shared2);
    const rcAdj = rc * (1 + corr_rl_rc * 0.1 * shared2);

    return Math.max(0, irAdj) + Math.max(0, biAdj) + Math.max(0, db)
         + Math.max(0, rlAdj) + Math.max(0, tp) + Math.max(0, rcAdj);
  }

  // ─── Secondary loss ───────────────────────────────────────
  function sampleSecondaryLoss(params) {
    if (!params.secondaryEnabled) return 0;
    const p = sampleDist(params.distType,
      params.secProbMin, params.secProbLikely, params.secProbMax);
    const prob = Math.min(1, Math.max(0, p));
    if (_rand() > prob) return 0;
    return sampleDist(params.distType,
      params.secMagMin, params.secMagLikely, params.secMagMax);
  }

  // ─── Poisson sample (Knuth) ───────────────────────────────
  function samplePoisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda > 100) {
      // Normal approximation for large lambda
      return Math.max(0, Math.round(sampleNormal(lambda, Math.sqrt(lambda))));
    }
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= _rand(); } while (p > L);
    return k - 1;
  }

  // ─── Compute percentiles ──────────────────────────────────
  function percentile(sorted, p) {
    const idx = Math.floor(p * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  function stats(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = arr.reduce((s, v) => s + v, 0) / n;
    return {
      mean,
      p50: percentile(sorted, 0.50),
      p90: percentile(sorted, 0.90),
      p95: percentile(sorted, 0.95),
      min: sorted[0],
      max: sorted[n - 1]
    };
  }

  // ─── Loss Exceedance Curve ────────────────────────────────
  function buildLEC(aleSamples, numPoints = 50) {
    const sorted = [...aleSamples].sort((a, b) => a - b);
    const n = sorted.length;
    const min = sorted[0];
    const max = sorted[n - 1];
    if (max === min) return [{ x: min, p: 0.5 }];
    const logMin = Math.log10(Math.max(min, 1));
    const logMax = Math.log10(Math.max(max, 2));
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const logX = logMin + (i / numPoints) * (logMax - logMin);
      const x = Math.pow(10, logX);
      const exceed = sorted.filter(v => v > x).length / n;
      points.push({ x, p: exceed });
    }
    return points;
  }

  // ─── Histogram bins ───────────────────────────────────────
  function buildHistogram(samples, numBins = 40) {
    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;
    // Use P1 and P99 to avoid extreme outlier distortion
    const lo = sorted[Math.floor(0.01 * n)];
    const hi = sorted[Math.floor(0.99 * n)];
    if (hi === lo) return [{ x: lo, count: n }];
    const binWidth = (hi - lo) / numBins;
    const bins = Array.from({ length: numBins }, (_, i) => ({
      x: lo + i * binWidth + binWidth / 2,
      count: 0
    }));
    sorted.forEach(v => {
      const idx = Math.min(Math.floor((v - lo) / binWidth), numBins - 1);
      if (idx >= 0) bins[idx].count++;
    });
    return bins;
  }

  // ─── MAIN RUN ─────────────────────────────────────────────
  /**
   * params shape (all values in base currency USD):
   * {
   *   iterations: number (default 10000)
   *   seed: number|null
   *   distType: 'triangular'|'lognormal'
   *   // TEF
   *   tefMin, tefLikely, tefMax
   *   // Vulnerability (derived or direct)
   *   vulnDirect: bool
   *   vulnMin, vulnLikely, vulnMax (if direct)
   *   threatCapMin, threatCapLikely, threatCapMax
   *   controlStrMin, controlStrLikely, controlStrMax
   *   // Loss components
   *   irMin, irLikely, irMax
   *   biMin, biLikely, biMax
   *   dbMin, dbLikely, dbMax
   *   rlMin, rlLikely, rlMax
   *   tpMin, tpLikely, tpMax
   *   rcMin, rcLikely, rcMax
   *   // Correlations
   *   corrBiIr, corrRlRc
   *   // Secondary loss
   *   secondaryEnabled: bool
   *   secProbMin, secProbLikely, secProbMax
   *   secMagMin, secMagLikely, secMagMax
   *   // Threshold
   *   threshold: number (default 5000000)
   * }
   */
  function _computeSamples(params, iterations, { onProgress = null, yieldEvery = 0 } = {}) {
    const lmSamples  = [];
    const aleSamples = [];

    const computeOne = () => {
      const tef = Math.max(0, sampleDist(params.distType,
        params.tefMin, params.tefLikely, params.tefMax));
      const vuln = sampleVulnerability(params);
      const lef = tef * vuln;
      const primaryLoss = samplePrimaryLoss(params);
      const secondaryLoss = sampleSecondaryLoss(params);
      const lm = primaryLoss + secondaryLoss;
      lmSamples.push(lm);

      const numEvents = samplePoisson(lef);
      let ale = 0;
      for (let j = 0; j < numEvents; j++) {
        const evPrimary = samplePrimaryLoss(params);
        const evSecondary = sampleSecondaryLoss(params);
        ale += evPrimary + evSecondary;
      }
      aleSamples.push(ale);
    };

    if (!yieldEvery) {
      for (let i = 0; i < iterations; i++) computeOne();
      return { lmSamples, aleSamples };
    }

    return (async () => {
      for (let i = 0; i < iterations; i++) {
        computeOne();
        if ((i + 1) % yieldEvery === 0 || i === iterations - 1) {
          if (typeof onProgress === 'function') onProgress((i + 1) / iterations, i + 1, iterations);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      return { lmSamples, aleSamples };
    })();
  }

  function _buildResults(iterations, threshold, lmSamples, aleSamples) {
    const lmStats  = stats(lmSamples);
    const aleStats = stats(aleSamples);
    const lec = buildLEC(aleSamples);
    const histogram = buildHistogram(aleSamples);
    const toleranceBreached = lmStats.p90 > threshold;

    return {
      iterations,
      threshold,
      lm: lmStats,
      ale: aleStats,
      lec,
      histogram,
      toleranceBreached,
      toleranceDetail: {
        lmP90: lmStats.p90,
        aleP90: aleStats.p90,
        lmExceedProb: lmSamples.filter(v => v > threshold).length / iterations,
        aleExceedProb: aleSamples.filter(v => v > threshold).length / iterations
      }
    };
  }

  function _prepareRun(params) {
    const iterations = params.iterations || 10000;
    const threshold = params.threshold || 5_000_000;
    if (params.seed != null) {
      _rand = mulberry32(Number(params.seed));
    } else {
      _rand = Math.random;
    }
    return { iterations, threshold };
  }

  function run(params) {
    const { iterations, threshold } = _prepareRun(params);
    const { lmSamples, aleSamples } = _computeSamples(params, iterations);
    return _buildResults(iterations, threshold, lmSamples, aleSamples);
  }

  async function runAsync(params, { onProgress = null, yieldEvery = 500 } = {}) {
    const { iterations, threshold } = _prepareRun(params);
    const { lmSamples, aleSamples } = await _computeSamples(params, iterations, { onProgress, yieldEvery });
    return _buildResults(iterations, threshold, lmSamples, aleSamples);
  }

  return { run, runAsync, buildLEC, buildHistogram, stats };
})();

if (typeof module !== 'undefined') module.exports = RiskEngine;
