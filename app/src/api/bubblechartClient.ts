import type { ConfigVersion } from '@/types';
import type {
  ChartConfigResponse,
  HealthResponse,
  HttpErr,
  ImportResponse,
  MonthsResponse,
  SalesResponse,
  DbInfoResponse,
  BrandsResponse,
  PreviewResponse,
  FetchResponse,
  UpdateChartConfigResponse,
  SeriesConfigResponse,
  AvailabilityResponse,
} from '@/api/backendContract';

function apiBaseUrl(): string {
  const raw = import.meta.env['VITE_API_BASE_URL'] as string | undefined;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).replace(/\/$/, '');
  }
  // 与 main.tsx 中 BrowserRouter basename 一致，避免子路径下 pathname 为 /foo（无尾斜杠）时拼错成 /api 而取到整页 HTML
  const fromVite = import.meta.env.BASE_URL;
  if (fromVite !== '' && fromVite !== '/') {
    return fromVite.replace(/\/$/, '');
  }
  return '';
}

export function adminUrl(): string {
  return `${apiBaseUrl()}/admin`;
}

async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { ok: false as const, error: text.slice(0, 200) || `HTTP ${res.status}` };
  }
}

async function requestJson<T extends { ok: boolean }>(
  path: string,
  init?: RequestInit,
): Promise<T | HttpErr> {
  const base = apiBaseUrl();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '网络请求失败';
    return { ok: false, error: msg };
  }

  const body = (await readJsonBody(res)) as Record<string, unknown>;
  const okFlag = body['ok'] === true;
  const errFromBody = typeof body['error'] === 'string' ? body['error'] : undefined;
  if (!res.ok || !okFlag) {
    return {
      ok: false,
      error: errFromBody ?? `HTTP ${res.status}`,
      code: typeof body['code'] === 'string' ? body['code'] : undefined,
    };
  }
  return body as T;
}

export async function fetchHealth(): Promise<HealthResponse | HttpErr> {
  return requestJson<HealthResponse>('/api/health', { method: 'GET' });
}

export async function fetchMonths(): Promise<MonthsResponse | HttpErr> {
  return requestJson<MonthsResponse>('/api/months', { method: 'GET' });
}

export async function fetchSales(month: string): Promise<SalesResponse | HttpErr> {
  const q = encodeURIComponent(month.trim());
  return requestJson<SalesResponse>(`/api/sales?month=${q}`, { method: 'GET' });
}

export async function fetchChartConfig(): Promise<ChartConfigResponse | HttpErr> {
  return requestJson<ChartConfigResponse>('/api/config', { method: 'GET' });
}

/** POST /api/import（后端未实现时返回 404，由调用方处理） */
export async function postImportFile(file: File, monthHint?: string): Promise<ImportResponse | HttpErr> {
  const fd = new FormData();
  fd.append('file', file);
  if (monthHint?.trim()) fd.append('monthHint', monthHint.trim());
  return requestJson<ImportResponse>('/api/import', { method: 'POST', body: fd });
}

export function formatMonthLabelCn(monthIso: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthIso.trim());
  if (!m) return monthIso;
  return `${m[1]}年${parseInt(m[2], 10)}月`;
}

export function salesSourceToLabel(source: 'sqlite' | 'import' | 'mock', usedMockFallback: boolean): string {
  if (usedMockFallback) return '示例数据（离线降级）';
  switch (source) {
    case 'sqlite':
      return '懂车帝';
    case 'import':
      return '导入数据';
    case 'mock':
      return '后端占位（无库）';
    default:
      return '未知来源';
  }
}

export function normalizeConfigItems(items: ConfigVersion[], brandColors: Record<string, string>): ConfigVersion[] {
  return items.map(row => ({
    ...row,
    brandColor: row.brandColor || brandColors[row.brand] || '#64748B',
  }));
}

/** GET /api/db */
export async function fetchDbInfo(): Promise<DbInfoResponse | HttpErr> {
  return requestJson<DbInfoResponse>('/api/db', { method: 'GET' });
}

/** GET /api/brands */
export async function fetchBrands(): Promise<BrandsResponse | HttpErr> {
  return requestJson<BrandsResponse>('/api/brands', { method: 'GET' });
}

/** GET /api/preview */
export async function fetchPreview(): Promise<PreviewResponse | HttpErr> {
  return requestJson<PreviewResponse>('/api/preview', { method: 'GET' });
}

/** GET /api/series_config?series_id=xxx */
export async function fetchSeriesConfig(seriesId: string, refresh?: boolean): Promise<SeriesConfigResponse | HttpErr> {
  const q = new URLSearchParams();
  q.set('series_id', seriesId);
  if (refresh) q.set('refresh', '1');
  return requestJson<SeriesConfigResponse>(`/api/series_config?${q.toString()}`, { method: 'GET' });
}

/** GET /api/availability */
export async function fetchAvailability(): Promise<AvailabilityResponse | HttpErr> {
  return requestJson<AvailabilityResponse>('/api/availability', { method: 'GET' });
}

/** POST /api/fetch */
export async function postFetchData(months: string[], headless = true, startMonth?: string, endMonth?: string): Promise<FetchResponse | HttpErr> {
  const body: Record<string, unknown> = { months, headless };
  if (startMonth) body.startMonth = startMonth;
  if (endMonth) body.endMonth = endMonth;
  return requestJson<FetchResponse>('/api/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** PUT /api/config */
export async function updateChartConfig(config: { xAxisRange: { min: number; max: number }; salesRange: { min: number; max: number }; highlightedBrandColors: Record<string, string>; unselectedBrandColor: string; showUnselectedBrands: boolean }): Promise<UpdateChartConfigResponse | HttpErr> {
  return requestJson<UpdateChartConfigResponse>('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}

/** POST /api/delete_month */
export async function deleteMonth(month: string): Promise<{ ok: true; month: string; message: string } | HttpErr> {
  return requestJson<{ ok: true; month: string; message: string }>('/api/delete_month', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month }),
  });
}
