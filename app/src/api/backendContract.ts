import type { ChartAdminConfig, ConfigVersion } from '@/types';

/**
 * F002: BubbleChart 后端存储与 HTTP API 契约（与 research/dongchedi_field_coverage.json 对齐）
 *
 * --- 存储层（SQLite 推荐形态）---
 *
 * 1) 若沿用懂车帝按月分表，则表名 month_{YYYYMM}，与参考脚本 create_car_sales_db 一致。API 层在读取时归一成同一记录形状。
 * 2) 归一化主表（可选，便于查询与导入），字段与源表映射见下表：
 *
 *   column              | 来源 / 说明
 *   --------------------|------------------------------------------
 *   id                  | TEXT PRIMARY KEY，建库为 "{seriesid}"
 *   seriesid            | TEXT，懂车帝车系 id
 *   month               | TEXT，统一为 "YYYY-MM"（由 date YYYYMM 转）
 *   brand               | TEXT
 *   model               | car_name
 *   configName          | 无源数据时按策略默认
 *   fullName            | 拼接或默认
 *   price               | REAL，自 price_avg / price_range 解析
 *   sales               | INTEGER，自 sales_num 清洗
 *   level               | TEXT
 *   powerType           | TEXT
 *   computingPower      | REAL，可选
 *   range               | REAL，可选
 *   brandColor          | TEXT，由服务端或前端色板补全时可不落库
 *
 * --- 缺失字段默认（与调研 fill_strategies 一致）---
 * - configName: 车系级聚合时 "全系合计" 或 ""
 * - fullName: "{brand} {model}"，可附加价格段
 * - month: 源为 YYYYMM 时转 "YYYY-MM"
 * - powerType: 无参配时 "未知"
 * - brandColor: 可省略或哈希生成，前端仍可用 BRAND_COLORS
 * - computingPower / range: 可省略；前端以 0 或隐藏处理
 *
 * 数值非法时：按 dongchedi clean_number 思路清洗；仍无效则该字段省略或 0（与前端 optional 一致）。
 */

export type HttpOk<T> = T & { ok: true };
export type HttpErr = { ok: false; error: string; code?: string };

/** GET /api/health */
export type HealthResponse = HttpOk<{
  service: 'bubblechart-backend';
  version: string;
}>;

/** GET /api/months */
export type MonthsResponse = HttpOk<{
  /** 降序：最新月份在前 */
  months: string[];
}>;

/** GET /api/sales?month=YYYY-MM */
export type SalesResponse = HttpOk<{
  month: string;
  source: 'sqlite' | 'import' | 'mock';
  items: ConfigVersion[];
}>;

/** POST /api/import — Content-Type: multipart/form-data, field "file" 为 CSV/SQLite 等由实现约定；或 application/json 见 ImportBody */
export type ImportRequestJson = {
  /** 绝对或项目内相对路径，由后端 F003+ 白名单校验 */
  filePath?: string;
  monthHint?: string;
};

export type ImportResponse = HttpOk<{
  imported: boolean;
  month: string;
  rowCount: number;
  message?: string;
}>;

/** GET /api/config */
export type ChartConfigResponse = HttpOk<{
  config: ChartAdminConfig;
}>;

/** GET /api/db */
export type DbInfoResponse = HttpOk<{
  data_dir: string;
  db_path: string;
  db_exists: boolean;
  month_table_count: number;
}>;

/** GET /api/brands */
export type BrandsResponse = HttpOk<{
  brands: string[];
  palette: string[];
  salesMap?: Record<string, number>;
}>;

/** GET /api/preview */
export type PreviewResponse = HttpOk<{
  summary: {
    month: string;
    count: number;
    top5: { brand: string; car_name: string; sales_num: string }[];
  }[];
}>;

/** POST /api/fetch */
export type FetchResponse = HttpOk<{
  results: { month: string; success: boolean; message: string }[];
  logs: string[];
}>;

/** PUT /api/config */
export type UpdateChartConfigResponse = HttpOk<{
  config: ChartAdminConfig;
}>;

/** GET /api/availability */
export type AvailabilityResponse = HttpOk<{
  latest_available_month: string;   // YYYY-MM
  current_month: string;            // YYYY-MM
  current_month_published: boolean;
  next_release_month: string;       // YYYY-MM
  next_release_date: string;        // YYYY-MM-DD
  db_months: string[];
  note: string;
}>;

/** GET /api/series_config?series_id=xxx */
export type SeriesConfigData = {
  series_id?: string;
  series_name?: string;
  configs_count?: number;
  cltc_range?: number;
  battery_capacity?: number;
  motor_power_kw?: number;
  motor_torque_nm?: number;
  max_speed?: number;
  length?: number;
  width?: number;
  height?: number;
  wheelbase?: number;
  curb_weight?: number;
  drive_type?: string;
  assistance_level?: string;
  chip?: string;
  radar_lidar?: string;
  fast_charge_time?: string;
  slow_charge_time?: string;
  energy_type?: string;
  zero_to_hundred?: number;
  front_suspension?: string;
  rear_suspension?: string;
  crawled_at?: string;
  [key: string]: unknown;
};

export type SeriesConfigResponse = HttpOk<{
  source: 'cache' | 'live';
  data: SeriesConfigData;
}>;

export type AnyApiResponse =
  | HealthResponse
  | MonthsResponse
  | SalesResponse
  | ChartConfigResponse
  | ImportResponse
  | DbInfoResponse
  | BrandsResponse
  | PreviewResponse
  | FetchResponse
  | UpdateChartConfigResponse
  | SeriesConfigResponse
  | HttpErr;
