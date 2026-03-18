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
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let _rand = Math.random;

  function sampleNormal(mean = 0, std = 1) {
    let u = 0, v = 0;
    while (u === 0) u = _rand();
    while (v === 0) v = _rand();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + std * z;
  }

  function sampleTriangular(min, mode, max) {
    return sampleTriangularFromU(_rand(), min, mode, max);
  }

  function sampleTriangularFromU(u, min, mode, max) {
    if (min >= max) return min;
    if (mode < min) mode = min;
    if (mode > max) mode = max;
    const fc = (mode - min) / (max - min);
    if (u < fc) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    }
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }

  function inverseStandardNormal(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const plow = 0.02425;
    const phigh = 1 - plow;
    if (p < plow) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > phigh) {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function sampleLognormal(min, mode, max) {
    return sampleLognormalFromU(_rand(), min, mode, max);
  }

  function sampleLognormalFromU(u, min, mode, max) {
    if (min <= 0) min = 1;
    if (mode <= 0) mode = min * 2;
    if (max <= mode) max = mode * 2;
    const mu = Math.log(mode);
    const sigma = Math.log(max / mode) / 1.645;
    const s = Math.abs(sigma) < 0.001 ? 0.001 : sigma;
    const z = inverseStandardNormal(Math.min(0.999999, Math.max(0.000001, u)));
    return Math.exp(mu + s * z);
  }

  function sampleDist(distType, min, likely, max) {
    if (distType === 'lognormal') return sampleLognormal(min, likely, max);
    return sampleTriangular(min, likely, max);
  }

  function sampleDistFromU(distType, u, min, likely, max) {
    if (distType === 'lognormal') return sampleLognormalFromU(u, min, likely, max);
    return sampleTriangularFromU(u, min, likely, max);
  }

  function sigmoid(x, k = 6) {
    return 1 / (1 + Math.exp(-k * x));
  }

  function sampleVulnerability(params) {
    if (params.vulnDirect) {
      return Math.min(1, Math.max(0, sampleDist(params.distType, params.vulnMin, params.vulnLikely, params.vulnMax)));
    }
    const tc = sampleDist(params.distType, params.threatCapMin, params.threatCapLikely, params.threatCapMax);
    const cs = sampleDist(params.distType, params.controlStrMin, params.controlStrLikely, params.controlStrMax);
    const raw = sigmoid(tc - cs);
    const noise = (_rand() - 0.5) * 0.05;
    return Math.min(1, Math.max(0, raw + noise));
  }

  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const t = 1 / (1 + 0.3275911 * absX);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
  }

  function normalToUnit(z) {
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
  }

  function sampleCorrelatedPair(rho = 0) {
    const clamped = Math.max(-0.95, Math.min(0.95, Number(rho) || 0));
    const z1 = sampleNormal(0, 1);
    const z2 = sampleNormal(0, 1);
    const y1 = z1;
    const y2 = clamped * z1 + Math.sqrt(1 - (clamped * clamped)) * z2;
    return [
      Math.min(0.999999, Math.max(0.000001, normalToUnit(y1))),
      Math.min(0.999999, Math.max(0.000001, normalToUnit(y2)))
    ];
  }

  function samplePrimaryLoss(params) {
    const dt = params.distType;
    const [irU, biU] = sampleCorrelatedPair(params.corrBiIr || 0.3);
    const [rlU, rcU] = sampleCorrelatedPair(params.corrRlRc || 0.2);
    const ir = sampleDistFromU(dt, irU, params.irMin, params.irLikely, params.irMax);
    const bi = sampleDistFromU(dt, biU, params.biMin, params.biLikely, params.biMax);
    const db = sampleDist(dt, params.dbMin, params.dbLikely, params.dbMax);
    const rl = sampleDistFromU(dt, rlU, params.rlMin, params.rlLikely, params.rlMax);
    const tp = sampleDist(dt, params.tpMin, params.tpLikely, params.tpMax);
    const rc = sampleDistFromU(dt, rcU, params.rcMin, params.rcLikely, params.rcMax);
    return Math.max(0, ir) + Math.max(0, bi) + Math.max(0, db) + Math.max(0, rl) + Math.max(0, tp) + Math.max(0, rc);
  }

  function sampleSecondaryLoss(params) {
    if (!params.secondaryEnabled) return 0;
    const p = sampleDist(params.distType, params.secProbMin, params.secProbLikely, params.secProbMax);
    const prob = Math.min(1, Math.max(0, p));
    if (_rand() > prob) return 0;
    return sampleDist(params.distType, params.secMagMin, params.secMagLikely, params.secMagMax);
  }

  function samplePoisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda > 100) return Math.max(0, Math.round(sampleNormal(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= _rand();
    } while (p > L);
    return k - 1;
  }

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

  function buildLEC(aleSamples, numPoints = 50) {
    const sorted = [...aleSamples].sort((a, b) => a - b);
    const n = sorted.length;
    const min = sorted[0];
    const max = sorted[n - 1];
    if (max === min) return [{ x: min, p: 0.5 }];
    const logMin = Math.log10(Math.max(min, 1));
    const logMax = Math.log10(Math.max(max, 2));
    const points = [];
    for (let i = 0; i <= numPoints; i += 1) {
      const logX = logMin + (i / numPoints) * (logMax - logMin);
      const x = Math.pow(10, logX);
      let firstGreater = sorted.findIndex(v => v > x);
      if (firstGreater === -1) firstGreater = n;
      const exceed = (n - firstGreater) / n;
      points.push({ x, p: exceed });
    }
    return points;
  }

  function buildHistogram(samples, numBins = 40) {
    const sorted = [...samples].sort((a, b) => a - b);
    const n = sorted.length;
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
      if (idx >= 0) bins[idx].count += 1;
    });
    return bins;
  }

  function _computeSamples(params, iterations, { onProgress = null, yieldEvery = 0 } = {}) {
    const lmSamples = [];
    const aleSamples = [];

    const computeOne = () => {
      const tef = Math.max(0, sampleDist(params.distType, params.tefMin, params.tefLikely, params.tefMax));
      const vuln = sampleVulnerability(params);
      const lef = tef * vuln;
      const primaryLoss = samplePrimaryLoss(params);
      const secondaryLoss = sampleSecondaryLoss(params);
      const eventLoss = primaryLoss + secondaryLoss;
      lmSamples.push(eventLoss);

      const numEvents = samplePoisson(lef);
      let annualLoss = 0;
      for (let j = 0; j < numEvents; j += 1) {
        annualLoss += samplePrimaryLoss(params) + sampleSecondaryLoss(params);
      }
      aleSamples.push(annualLoss);
    };

    if (!yieldEvery) {
      for (let i = 0; i < iterations; i += 1) computeOne();
      return { lmSamples, aleSamples };
    }

    return (async () => {
      for (let i = 0; i < iterations; i += 1) {
        computeOne();
        if ((i + 1) % yieldEvery === 0 || i === iterations - 1) {
          if (typeof onProgress === 'function') onProgress((i + 1) / iterations, i + 1, iterations);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      return { lmSamples, aleSamples };
    })();
  }

  function _buildResults(iterations, thresholds, lmSamples, aleSamples) {
    const eventLossStats = stats(lmSamples);
    const annualLossStats = stats(aleSamples);
    const lec = buildLEC(aleSamples);
    const histogram = buildHistogram(aleSamples);
    const eventToleranceThreshold = thresholds.eventToleranceThreshold;
    const annualReviewThreshold = thresholds.annualReviewThreshold;
    const toleranceBreached = eventLossStats.p90 > eventToleranceThreshold;
    const annualReviewTriggered = annualLossStats.p90 > annualReviewThreshold;
    return {
      iterations,
      threshold: eventToleranceThreshold,
      annualReviewThreshold,
      lm: eventLossStats,
      eventLoss: eventLossStats,
      ale: annualLossStats,
      annualLoss: annualLossStats,
      lec,
      histogram,
      toleranceBreached,
      annualReviewTriggered,
      metricSemantics: {
        eventLoss: 'Conditional loss if a materially successful event occurs.',
        annualLoss: 'Annualized loss after applying event frequency and event success logic across the year.'
      },
      toleranceDetail: {
        lmP90: eventLossStats.p90,
        aleP90: annualLossStats.p90,
        lmExceedProb: lmSamples.filter(v => v > eventToleranceThreshold).length / iterations,
        aleExceedProb: aleSamples.filter(v => v > eventToleranceThreshold).length / iterations
      },
      annualReviewDetail: {
        annualP90: annualLossStats.p90,
        annualExceedProb: aleSamples.filter(v => v > annualReviewThreshold).length / iterations
      }
    };
  }

  function _prepareRun(params) {
    const iterations = Number.isFinite(Number(params.iterations)) && Number(params.iterations) > 0 ? Number(params.iterations) : 10000;
    const eventToleranceThreshold = Number.isFinite(Number(params.threshold)) && Number(params.threshold) > 0 ? Number(params.threshold) : 5000000;
    const annualReviewThreshold = Number.isFinite(Number(params.annualReviewThreshold)) && Number(params.annualReviewThreshold) > 0 ? Number(params.annualReviewThreshold) : 12000000;
    if (params.seed != null) {
      _rand = mulberry32(Number(params.seed));
    } else {
      _rand = Math.random;
    }
    return { iterations, thresholds: { eventToleranceThreshold, annualReviewThreshold } };
  }

  function run(params) {
    const { iterations, thresholds } = _prepareRun(params);
    const { lmSamples, aleSamples } = _computeSamples(params, iterations);
    return _buildResults(iterations, thresholds, lmSamples, aleSamples);
  }

  async function runAsync(params, { onProgress = null, yieldEvery = 500 } = {}) {
    const { iterations, thresholds } = _prepareRun(params);
    const { lmSamples, aleSamples } = await _computeSamples(params, iterations, { onProgress, yieldEvery });
    return _buildResults(iterations, thresholds, lmSamples, aleSamples);
  }

  return { run, runAsync, buildLEC, buildHistogram, stats };
})();

if (typeof module !== 'undefined') module.exports = RiskEngine;
