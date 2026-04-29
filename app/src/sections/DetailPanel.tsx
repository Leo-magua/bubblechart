import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { X, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import type { ConfigVersion, QuadrantType } from '@/types';
import { quadrantInfos } from '@/data/mockData';
import { fetchSeriesConfig } from '@/api/bubblechartClient';
import type { SeriesConfigData } from '@/api/backendContract';

interface DetailPanelProps {
  config: ConfigVersion | null;
  allData: ConfigVersion[];
  xField: string;
  yField: string;
  xMean: number;
  yMean: number;
  onClose: () => void;
  onSelectConfig: (id: string) => void;
}

interface BrandModelMatrixItem {
  model: string;
  brandColor: string;
  configCount: number;
  sales: number;
  price: number;
  computingPower: number;
  range: number;
  selectedConfigId: string;
}

function getQuadrant(x: number, y: number, xThreshold: number, yThreshold: number): QuadrantType {
  if (x >= xThreshold && y >= yThreshold) return 'star';
  if (x < xThreshold && y >= yThreshold) return 'premium';
  if (x < xThreshold && y < yThreshold) return 'edge';
  return 'volume';
}

function getMetricValue(item: Pick<ConfigVersion, 'price' | 'sales' | 'computingPower' | 'range'>, field: string): number {
  if (field === 'price') return item.price;
  if (field === 'sales') return item.sales;
  if (field === 'computingPower') return item.computingPower || 0;
  if (field === 'range') return item.range || 0;
  return 0;
}

function formatMetricValue(field: string, value: number): string {
  if (field === 'price') return `${value.toFixed(1)}万`;
  if (field === 'sales') return `${value.toLocaleString()}台`;
  if (field === 'computingPower') return `${value.toFixed(0)} TOPS`;
  if (field === 'range') return `${value.toFixed(0)} km`;
  return `${value}`;
}

function getPaddedExtent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.12, 1);
    return [Math.max(0, min - padding), max + padding];
  }

  const padding = (max - min) * 0.12;
  return [Math.max(0, min - padding), max + padding];
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function DetailPanel({
  config,
  allData,
  xField,
  yField,
  xMean,
  yMean,
  onClose,
  onSelectConfig,
}: DetailPanelProps) {
  const brandMatrixRef = useRef<HTMLDivElement>(null);
  const [seriesConfig, setSeriesConfig] = useState<SeriesConfigData | null>(null);
  const [seriesConfigLoading, setSeriesConfigLoading] = useState(false);

  const qType: QuadrantType = config
    ? getQuadrant(
      getMetricValue(config, xField),
      getMetricValue(config, yField),
      xMean,
      yMean,
    )
    : 'edge';
  const qInfo = quadrantInfos[qType];

  const brandModelMatrix = useMemo<BrandModelMatrixItem[]>(() => {
    if (!config) return [];

    const grouped = new Map<string, {
      model: string;
      brandColor: string;
      configCount: number;
      sales: number;
      totalPrice: number;
      computingPower: number;
      range: number;
      topSales: number;
      topConfigId: string;
    }>();

    allData
      .filter(d => d.brand === config.brand)
      .forEach((item) => {
        const existing = grouped.get(item.model);

        if (existing) {
          existing.configCount += 1;
          existing.sales += item.sales;
          existing.totalPrice += item.price;
          existing.computingPower = Math.max(existing.computingPower, item.computingPower || 0);
          existing.range = Math.max(existing.range, item.range || 0);

          if (item.sales > existing.topSales) {
            existing.topSales = item.sales;
            existing.topConfigId = item.id;
          }

          return;
        }

        grouped.set(item.model, {
          model: item.model,
          brandColor: item.brandColor,
          configCount: 1,
          sales: item.sales,
          totalPrice: item.price,
          computingPower: item.computingPower || 0,
          range: item.range || 0,
          topSales: item.sales,
          topConfigId: item.id,
        });
      });

    return Array.from(grouped.values())
      .map(item => ({
        model: item.model,
        brandColor: item.brandColor,
        configCount: item.configCount,
        sales: item.sales,
        price: item.totalPrice / item.configCount,
        computingPower: item.computingPower,
        range: item.range,
        selectedConfigId: item.model === config.model ? config.id : item.topConfigId,
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [allData, config]);

  const currentBrandModel = useMemo(
    () => brandModelMatrix.find(item => item.model === config?.model) || null,
    [brandModelMatrix, config?.model],
  );

  const brandMatrixChartData = useMemo(() => {
    if (!config) return [];

    return brandModelMatrix.map((item, index) => {
      const isCurrent = item.model === config.model;
      const opacity = isCurrent
        ? 1
        : 0.35 + ((brandModelMatrix.length - index) / Math.max(brandModelMatrix.length, 1)) * 0.35;

      return {
        name: item.model,
        value: [
          getMetricValue(item, xField),
          getMetricValue(item, yField),
          item.sales,
          item.price,
          item.configCount,
          item.selectedConfigId,
          item.computingPower,
          item.range,
        ],
        itemStyle: {
          color: item.brandColor,
          opacity,
          borderColor: isCurrent ? '#FFFFFF' : hexToRgba('#FFFFFF', 0.18),
          borderWidth: isCurrent ? 2 : 1,
          shadowBlur: isCurrent ? 14 : 0,
          shadowColor: isCurrent ? hexToRgba(item.brandColor, 0.45) : 'transparent',
        },
        symbolSize: isCurrent ? 16 : 11,
      };
    });
  }, [brandModelMatrix, config?.model, xField, yField]);

  const brandMatrixXExtent = useMemo(
    () => getPaddedExtent(brandMatrixChartData.map(item => item.value[0] as number)),
    [brandMatrixChartData],
  );
  const brandMatrixYExtent = useMemo(
    () => getPaddedExtent(brandMatrixChartData.map(item => item.value[1] as number)),
    [brandMatrixChartData],
  );

  useEffect(() => {
    if (!config || !brandMatrixRef.current || brandMatrixChartData.length <= 1) return undefined;

    const chart = echarts.init(brandMatrixRef.current, undefined, { renderer: 'canvas' });
    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 12, right: 12, top: 10, bottom: 20 },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(28, 31, 38, 0.96)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        padding: 10,
        textStyle: {
          color: '#F0F1F5',
          fontSize: 12,
          fontFamily: '"Inter", "PingFang SC", sans-serif',
        },
        extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.32);',
        formatter: (params: any) => {
          const data = params.data;
          const [xValue, yValue, sales, avgPrice, configCount, , computingPower, range] = data.value;

          return `
            <div style="min-width:180px;">
              <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${params.name}</div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:#8B91A7;">${xField === 'price' ? '车型均价' : xField === 'computingPower' ? '最高算力' : '最长续航'}</span>
                <span>${formatMetricValue(xField, xValue)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:#8B91A7;">${yField === 'price' ? '车型均价' : '车型销量'}</span>
                <span>${formatMetricValue(yField, yValue)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:#8B91A7;">车型总销量</span>
                <span>${Number(sales).toLocaleString()}台</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:#8B91A7;">车型均价</span>
                <span>${Number(avgPrice).toFixed(1)}万</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="color:#8B91A7;">配置数</span>
                <span>${configCount}</span>
              </div>
              <div style="display:flex;justify-content:space-between;">
                <span style="color:#8B91A7;">能力上限</span>
                <span>${Number(computingPower).toFixed(0)} TOPS / ${Number(range).toFixed(0)} km</span>
              </div>
            </div>
          `;
        },
      },
      xAxis: {
        type: 'value',
        show: false,
        min: brandMatrixXExtent[0],
        max: brandMatrixXExtent[1],
      },
      yAxis: {
        type: 'value',
        show: false,
        min: brandMatrixYExtent[0],
        max: brandMatrixYExtent[1],
      },
      series: [
        {
          type: 'scatter',
          data: brandMatrixChartData,
        },
      ],
    };

    chart.setOption(option);

    const handleClick = (params: any) => {
      const targetId = params?.data?.value?.[5];
      if (typeof targetId === 'string' && targetId !== config.id) {
        onSelectConfig(targetId);
      }
    };

    const handleResize = () => chart.resize();

    chart.on('click', handleClick);
    window.addEventListener('resize', handleResize);

    return () => {
      chart.off('click', handleClick);
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [
    brandMatrixChartData,
    brandMatrixXExtent,
    brandMatrixYExtent,
    config,
    onSelectConfig,
    xField,
    yField,
  ]);

  // 拉取车系配置数据
  useEffect(() => {
    if (!config?.carSeriesId) {
      setSeriesConfig(null);
      return;
    }
    setSeriesConfigLoading(true);
    fetchSeriesConfig(config.carSeriesId)
      .then((res) => {
        if (res.ok) {
          setSeriesConfig(res.data);
        } else {
          setSeriesConfig(null);
        }
      })
      .catch(() => setSeriesConfig(null))
      .finally(() => setSeriesConfigLoading(false));
  }, [config?.carSeriesId]);

  if (!config) return null;

  // 同价位竞品（±15%）
  const priceMin = config.price * 0.85;
  const priceMax = config.price * 1.15;
  const competitors = allData
    .filter(d => d.id !== config.id && d.price >= priceMin && d.price <= priceMax)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 6);

  // 该级别总销量（用于市占率）
  const sameLevelConfigs = allData.filter(d => d.level === config.level);
  const levelTotalSales = sameLevelConfigs.reduce((sum, d) => sum + d.sales, 0);
  const marketShare = ((config.sales / levelTotalSales) * 100).toFixed(1);

  return (
    <div
      className="absolute right-0 top-0 h-full flex flex-col overflow-hidden"
      style={{
        width: 420,
        backgroundColor: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-subtle)',
        zIndex: 40,
        animation: 'slideIn 300ms ease-out',
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `}</style>

      {/* 头部 */}
      <div className="flex items-start justify-between p-5 pb-3 shrink-0">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {config.brand} {config.model}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: `${config.brandColor}20`,
                color: config.brandColor,
              }}
            >
              {config.configName}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {config.level} · {config.powerType}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
          }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
        {/* 配置快照 */}
        <div
          className="rounded-lg p-4"
          style={{
            backgroundColor: 'var(--bg-elevated)',
          }}
        >
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>月销量</div>
              <div className="text-xl font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                {config.sales.toLocaleString()}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>台</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>成交均价</div>
              <div className="text-xl font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                {config.price.toFixed(1)}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>万</div>
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>级别市占率</div>
              <div className="text-xl font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                {marketShare}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>%</div>
            </div>
          </div>
          {config.computingPower !== undefined && (
            <div className="flex items-center gap-4 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex-1">
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>智驾算力</div>
                <div className="text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {config.computingPower} TOPS
                </div>
              </div>
              <div className="flex-1">
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>续航里程</div>
                <div className="text-sm font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                  {config.range || '-'} km
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 懂车帝外链 */}
        {config.carSeriesId && (
          <div
            className="rounded-lg p-3 flex items-center gap-3"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                懂车帝车系 ID
              </div>
              <div className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                {config.carSeriesId}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <a
                href={`https://www.dongchedi.com/auto/series/${config.carSeriesId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  color: '#3B82F6',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.12)';
                }}
              >
                <ExternalLink className="w-3 h-3" />
                车系详情
              </a>
              <a
                href={`https://www.dongchedi.com/auto/params-carIds-x-${config.carSeriesId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors"
                style={{
                  backgroundColor: 'rgba(0, 208, 132, 0.12)',
                  color: '#00D084',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0, 208, 132, 0.2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0, 208, 132, 0.12)';
                }}
              >
                <ExternalLink className="w-3 h-3" />
                参数配置
              </a>
            </div>
          </div>
        )}

        {/* 车系参数配置 */}
        {seriesConfig && (
          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                参数配置
              </h3>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {seriesConfigLoading ? '加载中...' : `来源: 懂车帝 · ${seriesConfig.configs_count || 0}款配置`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {seriesConfig.cltc_range !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>CLTC续航</span>
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.cltc_range} km</span>
                </div>
              )}
              {seriesConfig.battery_capacity !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>电池容量</span>
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.battery_capacity} kWh</span>
                </div>
              )}
              {seriesConfig.motor_power_kw !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>电机功率</span>
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.motor_power_kw} kW</span>
                </div>
              )}
              {seriesConfig.motor_torque_nm !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>电机扭矩</span>
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.motor_torque_nm} N·m</span>
                </div>
              )}
              {seriesConfig.max_speed !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>最高车速</span>
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.max_speed} km/h</span>
                </div>
              )}
              {seriesConfig.zero_to_hundred !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>百公里加速</span>
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.zero_to_hundred}s</span>
                </div>
              )}
              {seriesConfig.length !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>长×宽×高</span>
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                    {seriesConfig.length}×{seriesConfig.width}×{seriesConfig.height} mm
                  </span>
                </div>
              )}
              {seriesConfig.wheelbase !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>轴距</span>
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.wheelbase} mm</span>
                </div>
              )}
              {seriesConfig.drive_type && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>驱动方式</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.drive_type}</span>
                </div>
              )}
              {seriesConfig.assistance_level && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>辅助驾驶</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.assistance_level}</span>
                </div>
              )}
              {seriesConfig.chip && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>智驾芯片</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.chip}</span>
                </div>
              )}
              {seriesConfig.energy_type && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>能源类型</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{seriesConfig.energy_type}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 当前象限解读 */}
        <div
          className="rounded-lg p-4"
          style={{
            backgroundColor: `${qInfo.color}10`,
            border: `1px solid ${qInfo.color}30`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: qInfo.color }}
            />
            <span className="text-sm font-medium" style={{ color: qInfo.color }}>
              {qInfo.label}
            </span>
          </div>
          <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            {qInfo.description}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            建议：{qInfo.action}
          </p>
        </div>

        {/* 同品牌车型矩阵 */}
        {brandModelMatrix.length > 1 && (
          <div>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
              同品牌车型矩阵
            </h3>
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                ref={brandMatrixRef}
                className="h-[128px] rounded-md"
                style={{ backgroundColor: 'rgba(255,255,255,0.01)' }}
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {brandModelMatrix.map((item) => {
                  const isCurrent = item.model === config.model;

                  return (
                    <button
                      key={item.model}
                      type="button"
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors"
                      style={{
                        backgroundColor: isCurrent ? `${config.brandColor}16` : 'transparent',
                        border: `1px solid ${isCurrent ? `${config.brandColor}40` : 'var(--border-subtle)'}`,
                      }}
                      onClick={() => {
                        if (item.selectedConfigId !== config.id) {
                          onSelectConfig(item.selectedConfigId);
                        }
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: item.brandColor, opacity: isCurrent ? 1 : 0.55 }}
                      />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {item.model}
                      </span>
                      <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {item.sales.toLocaleString()}台
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  销量按车型聚合，避免对配置销量做伪精细拆分
                </span>
                <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  X/Y: {xField === 'price' ? '车型均价' : xField === 'computingPower' ? '最高算力' : '最长续航'} / {yField === 'price' ? '车型均价' : '车型销量'}
                </span>
              </div>
            </div>
            <div className="space-y-2 mt-3">
              {brandModelMatrix.map((item) => {
                const isCurrent = item.model === config.model;
                const priceDiff = currentBrandModel ? item.price - currentBrandModel.price : 0;
                const salesDiff = currentBrandModel ? item.sales - currentBrandModel.sales : 0;

                return (
                  <div
                    key={item.model}
                    className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors"
                    style={{
                      backgroundColor: isCurrent ? 'var(--bg-elevated)' : 'transparent',
                      border: isCurrent ? `1px solid ${config.brandColor}40` : '1px solid transparent',
                    }}
                    onClick={() => {
                      if (item.selectedConfigId !== config.id) {
                        onSelectConfig(item.selectedConfigId);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <div
                      className="w-1 h-8 rounded-full"
                      style={{ backgroundColor: isCurrent ? config.brandColor : `${config.brandColor}40` }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {item.model}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {item.price.toFixed(1)}万
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {item.sales.toLocaleString()}台/月 · {item.configCount}个配置
                        </span>
                        <div className="flex items-center gap-1">
                          {priceDiff !== 0 && (
                            <span className="text-xs flex items-center gap-0.5" style={{ color: priceDiff > 0 ? 'var(--accent-warning)' : 'var(--accent-primary)' }}>
                              {priceDiff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {Math.abs(priceDiff).toFixed(1)}万
                            </span>
                          )}
                          {salesDiff !== 0 && (
                            <span className="text-xs flex items-center gap-0.5" style={{ color: salesDiff > 0 ? 'var(--accent-primary)' : 'var(--accent-danger)' }}>
                              {Math.abs(salesDiff).toLocaleString()}台
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 竞品对标 */}
        {competitors.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
              同价位竞品对标（±15%）
            </h3>
            <div className="space-y-2">
              {competitors.map((comp) => {
                const priceDiff = comp.price - config.price;
                const salesRatio = comp.sales / Math.max(config.sales, 1);
                const isHigherPrice = priceDiff > 0;
                return (
                  <div
                    key={comp.id}
                    className="p-2.5 rounded-lg cursor-pointer transition-colors"
                    style={{ backgroundColor: 'transparent' }}
                    onClick={() => onSelectConfig(comp.id)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: comp.brandColor }}
                        />
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                          {comp.model} {comp.configName}
                        </span>
                      </div>
                      <span
                        className="text-xs font-mono"
                        style={{ color: isHigherPrice ? 'var(--accent-warning)' : 'var(--accent-primary)' }}
                      >
                        {isHigherPrice ? '+' : ''}{priceDiff.toFixed(1)}万
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-8" style={{ color: 'var(--text-muted)' }}>
                        {comp.sales.toLocaleString()}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(salesRatio * 100, 100)}%`,
                            backgroundColor: comp.brandColor,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className="text-xs w-8 text-right" style={{ color: 'var(--text-muted)' }}>
                        {config.sales.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
