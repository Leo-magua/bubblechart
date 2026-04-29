export interface ConfigVersion {
  id: string;
  carSeriesId?: string;
  brand: string;
  brandColor: string;
  model: string;
  configName: string;
  fullName: string;
  price: number;
  priceRange?: string;
  sales: number;
  computingPower?: number;
  range?: number;
  level: string;
  powerType: string;
  month: string;
}

export interface ViewPreset {
  id: string;
  name: string;
  icon: string;
  xAxis: {
    field: string;
    label: string;
    unit: string;
    min?: number;
    max?: number;
    log?: boolean;
  };
  yAxis: {
    field: string;
    label: string;
    unit: string;
    min?: number;
    max?: number;
    log?: boolean;
  };
  bubbleSize: {
    field: string;
    label: string;
  };
}

export interface QuadrantState {
  enabled: boolean;
  xThreshold: number | 'mean' | 'manual';
  yThreshold: number | 'mean' | 'manual';
  xManualValue?: number;
  yManualValue?: number;
}

export interface ChartAdminConfig {
  xAxisRange: {
    min: number;
    max: number;
  };
  salesRange: {
    min: number;
    max: number;
  };
  highlightedBrandColors: Record<string, string>;
  unselectedBrandColor: string;
  showUnselectedBrands: boolean;
}

export type QuadrantType = 'star' | 'premium' | 'edge' | 'volume';

export interface QuadrantInfo {
  type: QuadrantType;
  label: string;
  color: string;
  description: string;
  action: string;
}
