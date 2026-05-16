export type AlertMetric = "temperature" | "humidity" | "signal";

export type AlertRuleMetric = {
  threshold?: number | null;
};

export type AlertRuleConfig = {
  temperature?: AlertRuleMetric;
  humidity?: AlertRuleMetric;
  signal?: AlertRuleMetric;
};

export type AlertRuleRecord = {
  temperatureMin?: number | null;
  temperatureMax?: number | null;
  humidityMin?: number | null;
  humidityMax?: number | null;
  signalMin?: number | null;
  signalMax?: number | null;
};

export type TelemetrySnapshot = {
  temperatureC?: number | null;
  humidityPct?: number | null;
  signalDbm?: number | null;
};

export type TelemetryAlert = {
  metric: AlertMetric;
  value: number;
  threshold: number;
  operator: ">=" | "<=";
};

function canonicalType(type: string | null | undefined) {
  const raw = (type ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("multi")) return "multi";
  if (raw.includes("temp")) return "temperature";
  if (raw.includes("humid")) return "humidity";
  if (raw.includes("signal")) return "signal";
  if (raw.includes("camera") || raw.includes("cam")) return "camera";
  if (raw.includes("light") || raw.includes("lamp")) return "light";
  if (raw.includes("air") || raw === "ac" || raw.includes("condition")) return "air-conditioner";
  return raw;
}

export function capabilitiesForType(type: string | null | undefined): AlertMetric[] {
  const t = canonicalType(type);
  if (t === "multi") return ["temperature", "humidity", "signal"];
  if (t === "temperature") return ["temperature", "signal"];
  if (t === "humidity") return ["humidity", "signal"];
  if (t === "signal") return ["signal"];
  return [];
}

export function defaultAlertRulesForType(
  type: string | null | undefined,
): AlertRuleConfig {
  const caps = capabilitiesForType(type);
  const rules: AlertRuleConfig = {};
  if (caps.includes("temperature")) rules.temperature = { threshold: 35 };
  if (caps.includes("humidity")) rules.humidity = { threshold: 80 };
  if (caps.includes("signal")) rules.signal = { threshold: -80 };
  return rules;
}

export function normalizeAlertRuleMetric(raw: unknown): AlertRuleMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const threshold =
    typeof obj.threshold === "number" && Number.isFinite(obj.threshold)
      ? obj.threshold
      : typeof obj.max === "number" && Number.isFinite(obj.max)
        ? obj.max
        : typeof obj.min === "number" && Number.isFinite(obj.min)
          ? obj.min
          : undefined;
  if (threshold === undefined) return null;
  return { threshold };
}

export function normalizeAlertRules(raw: unknown): AlertRuleConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const temperature = normalizeAlertRuleMetric(obj.temperature);
  const humidity = normalizeAlertRuleMetric(obj.humidity);
  const signal = normalizeAlertRuleMetric(obj.signal);
  const out: AlertRuleConfig = {};
  if (temperature) out.temperature = temperature;
  if (humidity) out.humidity = humidity;
  if (signal) out.signal = signal;
  return out;
}

export function filterAlertRulesByCapabilities(
  rules: AlertRuleConfig,
  capabilities: AlertMetric[],
): AlertRuleConfig {
  const out: AlertRuleConfig = {};
  for (const metric of capabilities) {
    const rule = rules[metric];
    if (!rule) continue;
    const threshold =
      typeof rule.threshold === "number" && Number.isFinite(rule.threshold)
        ? rule.threshold
        : undefined;
    if (threshold !== undefined) out[metric] = { threshold };
  }
  return out;
}

export function filterAlertRulesForType(
  type: string | null | undefined,
  rules: AlertRuleConfig,
): AlertRuleConfig {
  return filterAlertRulesByCapabilities(rules, capabilitiesForType(type));
}

export function rulesFromRecord(record: AlertRuleRecord | null | undefined): AlertRuleConfig {
  if (!record) return {};
  const out: AlertRuleConfig = {};
  if (record.temperatureMax !== null && record.temperatureMax !== undefined) {
    out.temperature = { threshold: record.temperatureMax };
  }
  if (record.humidityMax !== null && record.humidityMax !== undefined) {
    out.humidity = { threshold: record.humidityMax };
  }
  if (record.signalMin !== null && record.signalMin !== undefined) {
    out.signal = { threshold: record.signalMin };
  }
  return out;
}

export function recordFromRules(rules: AlertRuleConfig): AlertRuleRecord {
  return {
    temperatureMin: null,
    temperatureMax: rules.temperature?.threshold ?? null,
    humidityMin: null,
    humidityMax: rules.humidity?.threshold ?? null,
    signalMin: rules.signal?.threshold ?? null,
    signalMax: null,
  };
}

export function resolveAlertRules(
  type: string | null | undefined,
  override: AlertRuleConfig | null | undefined,
): AlertRuleConfig {
  const defaults = defaultAlertRulesForType(type);
  const supportedOverride = filterAlertRulesForType(type, override ?? {});
  const out: AlertRuleConfig = {};
  for (const metric of Object.keys(defaults) as AlertMetric[]) {
    const base = defaults[metric] ?? {};
    const next = supportedOverride[metric] ?? {};
    const threshold = next.threshold ?? base.threshold;
    if (threshold !== undefined) out[metric] = { threshold };
  }
  return out;
}

function alertForMetric(
  metric: AlertMetric,
  value: number | null | undefined,
  rule?: AlertRuleMetric,
): TelemetryAlert | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (!rule) return null;
  if (typeof rule.threshold !== "number") return null;
  if (metric === "signal") {
    return value <= rule.threshold
      ? { metric, value, threshold: rule.threshold, operator: "<=" }
      : null;
  }
  return value >= rule.threshold
    ? { metric, value, threshold: rule.threshold, operator: ">=" }
    : null;
}

export function getTelemetryAlert(
  rules: AlertRuleConfig,
  telemetry: TelemetrySnapshot,
): TelemetryAlert | null {
  return (
    alertForMetric("temperature", telemetry.temperatureC, rules.temperature) ||
    alertForMetric("humidity", telemetry.humidityPct, rules.humidity) ||
    alertForMetric("signal", telemetry.signalDbm, rules.signal)
  );
}

export function isTelemetryWarning(
  rules: AlertRuleConfig,
  telemetry: TelemetrySnapshot,
): boolean {
  return getTelemetryAlert(rules, telemetry) !== null;
}
