export interface SafeApiErrorSummary {
  status?: number;
  code?: string;
  method?: string;
  path?: string;
}

export function summarizeApiError(error: unknown): SafeApiErrorSummary {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as {
    code?: unknown;
    config?: { method?: unknown; url?: unknown };
    response?: { status?: unknown };
  };
  const summary: SafeApiErrorSummary = {};
  if (typeof candidate.response?.status === 'number') summary.status = candidate.response.status;
  if (typeof candidate.code === 'string') summary.code = candidate.code;
  if (typeof candidate.config?.method === 'string') {
    summary.method = candidate.config.method.toUpperCase();
  }
  if (typeof candidate.config?.url === 'string') {
    summary.path = candidate.config.url.split(/[?#]/, 1)[0];
  }
  return summary;
}
