export const EXTRACT_PROGRESS_LIMIT = 128;

export type ExtractProgress = {
  sourceVersion: string;
  plan_hash: string;
  progress_count: number;
  progress_hash: string;
};
export type ExtractionYield = ExtractProgress & { status: 'yielded_extract' };

const sha = /^[a-f0-9]{64}$/;
const progressFields = 'plan_hash,progress_count,progress_hash,sourceVersion';
const yieldFields = progressFields + ',status';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function extractProgress(value: unknown): ExtractProgress | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== progressFields) return null;
  const { sourceVersion, plan_hash, progress_count, progress_hash } = value;
  if (typeof sourceVersion !== 'string' || !sha.test(sourceVersion) ||
      typeof plan_hash !== 'string' || !sha.test(plan_hash) ||
      typeof progress_hash !== 'string' || !sha.test(progress_hash) ||
      typeof progress_count !== 'number' || !Number.isSafeInteger(progress_count) ||
      progress_count < 1 || progress_count > EXTRACT_PROGRESS_LIMIT) return null;
  return { sourceVersion, plan_hash, progress_count, progress_hash };
}

export function extractYield(value: unknown): ExtractionYield | null {
  if (!record(value) || value.status !== 'yielded_extract' ||
      Object.keys(value).sort().join(',') !== yieldFields) return null;
  const { status, ...data } = value;
  const progress = extractProgress(data);
  return progress ? { status, ...progress } : null;
}
