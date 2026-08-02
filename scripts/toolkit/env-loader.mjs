import { existsSync, readFileSync } from 'node:fs';

export function parseEnvFile(path = '.env.local') {
  const result = { exists: existsSync(path), values: {}, warnings: [], path };
  if (!result.exists) return result;
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      result.warnings.push(`Line ${index + 1}: could not parse environment assignment.`);
      return;
    }
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result.values[key] = value;
  });
  return result;
}

export function loadEnvFile(path = '.env.local', { override = false } = {}) {
  const parsed = parseEnvFile(path);
  for (const [key, value] of Object.entries(parsed.values)) {
    if (override || !process.env[key]) process.env[key] = value;
  }
  return parsed;
}

export function maskSecret(value) {
  if (!value) return '(missing)';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}
