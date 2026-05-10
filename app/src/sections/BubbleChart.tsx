import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import echarts, { type EChartsOption, type ECharts } from '@/lib/echarts';
import type { ConfigVersion, ViewPreset, QuadrantState, QuadrantType } from '@/types';
import { quadrantInfos } from '@/data/mockData';

const GRID = { left: 60, right: 40, top: 40, bottom: 50 } as const;
const LEGEND_BASE_TOP = GRID.top + 8;
const LEGEND_BASE_RIGHT = GRID.right + 14;

/** 简单的 throttle 高阶函数 */
function throttle<T extends (...args: unknown[]) => void>(fn: T, wait: number): T {
  let lastTime = 0;
  return ((...args: unknown[]) => {
    const now = performance.now();
    if (now - lastTime < wait) return;
    lastTime = now;
    fn(...args);
  }) as T;
}

interface ChartSeriesData {
  value: [
    number,
    number,
    number,
    string,
    string,
    string,
    string,
    string,
    string,
    number,
    string,
    string,
  ];
}

interface ChartClickParams {
  componentType?: string;
  data?: ChartSeriesData;
}

interface DragEventLike {
  offsetX: number;
  offsetY: number;
}

function getChartSeriesData(params: unknown): ChartSeriesData | null {
  if (!params || typeof params !== 'object') return null;
  const data = (params as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const value = (data as { value?: unknown }).value;
  return Array.isArray(value) ? data as ChartSeriesData : null;
}

function getChartClickParams(params: unknown): ChartClickParams {
  if (!params || typeof params !== 'object') return {};
  const record = params as { componentType?: unknown; data?: unknown };
  return {
    componentType: typeof record.componentType === 'string' ? record.componentType : undefined,
    data: getChartSeriesData(params) ?? undefined,
  };
}

function getDragEvent(value: unknown): DragEventLike | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { offsetX?: unknown; offsetY?: unknown };
  if (typeof record.offsetX !== 'number' || typeof record.offsetY !== 'number') return null;
  return { offsetX: record.offsetX, offsetY: record.offsetY };
}

interface BubbleChartProps {
  data: ConfigVersion[];
  preset: ViewPreset;
  quadrant: QuadrantState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onQuadrantChange: (q: QuadrantState) => void;
  highlightedBrandColors: Record<string, string>;
  unselectedBrandColor: string;
}

function getQuadrant(x: number, y: number, xThreshold: number, yThreshold: number): QuadrantType {
  if (x >= xThreshold && y >= yThreshold) return 'star';
  if (x < xThreshold && y >= yThreshold) return 'premium';
  if (x < xThreshold && y < yThreshold) return 'edge';
  return 'volume';
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function axisMidpoint(min: number | undefined, max: number | undefined, fallback: number): number {
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return (min! + max!) / 2;
  }
  return fallback;
}

function meanOrFallback(values: number[], fallback: number): number {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return fallback;
  return finiteValues.reduce((a, b) => a + b, 0) / finiteValues.length;
}

/** 构建散点 series 数据与气泡大小参数 */
function buildSeriesItems(
  data: ConfigVersion[],
  preset: ViewPreset,
  xMean: number,
  yMean: number,
  highlightedBrandColors: Record<string, string>,
  unselectedBrandColor: string,
  activeBrand: string | null,
  selectedId: string | null,
) {
  const salesValues = data
    .map(item => item.sales)
    .filter((sales): sales is number => Number.isFinite(sales) && sales >= 0);
  const minSales = salesValues.length ? Math.min(...salesValues) : 0;
  const maxSales = salesValues.length ? Math.max(...salesValues) : 1;

  const sqrtMin = Math.sqrt(Math.max(0, minSales));
  const sqrtMax = Math.sqrt(maxSales);
  const sqrtSpan = Math.max(sqrtMax - sqrtMin, 1);

  // 预计算品牌分组和索引映射，避免 O(n²) 的 findIndex
  const brandMap: Record<string, ConfigVersion[]> = {};
  for (const d of data) {
    if (!brandMap[d.brand]) brandMap[d.brand] = [];
    brandMap[d.brand].push(d);
  }
  const brandIndexMap: Record<string, Map<string, number>> = {};
  for (const [brand, items] of Object.entries(brandMap)) {
    const map = new Map<string, number>();
    items.forEach((it, i) => map.set(it.id, i));
    brandIndexMap[brand] = map;
  }

  const items = data.map((item) => {
    const xVal = preset.xAxis.field === 'price' ? item.price
      : preset.xAxis.field === 'computingPower' ? (item.computingPower || 0)
      : (item.range || 0);
    const yVal = preset.yAxis.field === 'price' ? item.price
      : preset.yAxis.field === 'sales' ? item.sales
      : item.sales;

    const qType = getQuadrant(xVal, yVal, xMean, yMean);
    const qInfo = quadrantInfos[qType];
    const isSelected = selectedId === item.id;
    const highlightedColor = highlightedBrandColors[item.brand];
    const brandDisplayColor = highlightedColor || unselectedBrandColor;
    const isHighlightedBrand = Boolean(highlightedColor);
    const isDimmed = activeBrand !== null && activeBrand !== item.brand;

    const sameBrandConfigs = brandMap[item.brand];
    const configIndex = brandIndexMap[item.brand]?.get(item.id) ?? 0;
    const opacityBase = 0.5 + (configIndex / Math.max(sameBrandConfigs.length - 1, 1)) * 0.5;

    return {
      name: item.model,
      value: [xVal, yVal, item.sales, item.id, item.brand, brandDisplayColor, item.configName, qType, qInfo.color, opacityBase, item.model, item.priceRange || ''],
      itemStyle: {
        color: isSelected
          ? brandDisplayColor
          : hexToRgba(brandDisplayColor, isDimmed ? 0.06 : (selectedId ? 0.25 : (isHighlightedBrand ? opacityBase : 0.45))),
        borderColor: isSelected ? '#ffffff' : hexToRgba('#ffffff', isDimmed ? 0.05 : 0.2),
        borderWidth: isSelected ? 2 : (isDimmed ? 0 : 1),
        shadowBlur: isSelected ? 16 : 0,
        shadowColor: isSelected ? 'rgba(255,255,255,0.4)' : 'transparent',
      },
      emphasis: {
        itemStyle: {
          color: brandDisplayColor,
          borderColor: '#ffffff',
          borderWidth: 2,
          shadowBlur: 20,
          shadowColor: 'rgba(255,255,255,0.5)',
        },
        scale: 1.2,
      },
    };
  });

  return { items, sqrtMin, sqrtSpan };
}

export function BubbleChart({
  data,
  preset,
  quadrant,
  selectedId,
  onSelect,
  onQuadrantChange,
  highlightedBrandColors,
  unselectedBrandColor,
}: BubbleChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const applyQuadrantOverlaysRef = useRef<(() => void) | null>(null);
  const overlayRafId = useRef<number | null>(null);
  const lastOverlayCx = useRef<number | null>(null);
  const lastOverlayCy = useRef<number | null>(null);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);

  // Refs for values that change often but shouldn't trigger full option rebuild
  const activeBrandRef = useRef(activeBrand);
  const selectedIdRef = useRef(selectedId);
  activeBrandRef.current = activeBrand;
  selectedIdRef.current = selectedId;

  const xValues = useMemo(() => data.map(d => {
    if (preset.xAxis.field === 'price') return d.price;
    if (preset.xAxis.field === 'computingPower') return d.computingPower || 0;
    if (preset.xAxis.field === 'range') return d.range || 0;
    return d.price;
  }), [data, preset]);

  const yValues = useMemo(() => data.map(d => {
    if (preset.yAxis.field === 'price') return d.price;
    if (preset.yAxis.field === 'sales') return d.sales;
    return d.sales;
  }), [data, preset]);

  const xMean = useMemo(() => {
    if (quadrant.xThreshold !== 'mean' && quadrant.xManualValue !== undefined) return quadrant.xManualValue;
    return meanOrFallback(
      xValues,
      axisMidpoint(preset.xAxis.min, preset.xAxis.max, 0),
    );
  }, [xValues, preset.xAxis.min, preset.xAxis.max, quadrant.xThreshold, quadrant.xManualValue]);

  const yMean = useMemo(() => {
    if (quadrant.yThreshold !== 'mean' && quadrant.yManualValue !== undefined) return quadrant.yManualValue;
    return meanOrFallback(
      yValues,
      axisMidpoint(preset.yAxis.min, preset.yAxis.max, 0),
    );
  }, [yValues, preset.yAxis.min, preset.yAxis.max, quadrant.yThreshold, quadrant.yManualValue]);

  // dataZoom 拖动时事件非常密集，用 throttle 限制 overlay 更新频率到每 80ms 一次
  const scheduleApplyOverlays = useCallback(
    throttle(() => {
      if (overlayRafId.current !== null) return;
      overlayRafId.current = requestAnimationFrame(() => {
        overlayRafId.current = null;
        applyQuadrantOverlaysRef.current?.();
      });
    }, 80),
    [],
  );

  const buildOption = useCallback((): EChartsOption => {
    const g = GRID;
    const { items: seriesData, sqrtMin, sqrtSpan } = buildSeriesItems(
      data, preset, xMean, yMean,
      highlightedBrandColors, unselectedBrandColor,
      activeBrandRef.current, selectedIdRef.current,
    );

    const option: EChartsOption = {
      backgroundColor: 'transparent',
      grid: { left: g.left, right: g.right, top: g.top, bottom: g.bottom },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(28, 31, 38, 0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 12,
        textStyle: {
          color: '#F0F1F5',
          fontSize: 12,
          fontFamily: '"Inter", "PingFang SC", sans-serif',
        },
        extraCssText: 'backdrop-filter: blur(8px); border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);',
        formatter: (params: unknown) => {
          const d = getChartSeriesData(params);
          if (!d) return '';
          const xVal = d.value[0];
          const yVal = d.value[1];
          const sales = d.value[2];
          const brandColor = d.value[5];
          const qType = d.value[7];
          const qColor = d.value[8];
          const modelName = d.value[10];
          const priceRange = d.value[11];
          const qInfo = quadrantInfos[qType as string];
          const safeModelName = escapeHtml(modelName);
          const safePriceRange = escapeHtml(priceRange);
          const safeQuadrantLabel = escapeHtml(qInfo?.label || '');
          const safeQuadrantDescription = escapeHtml(qInfo?.description || '');
          const priceRangeHtml = safePriceRange ? `<span style="font-size:11px;color:#8B91A7;font-family:'JetBrains Mono',monospace;">${safePriceRange}</span>` : '';
          return `
            <div style="min-width: 200px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;">
                <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                  <span style="display:inline-block;width:6px;height:14px;border-radius:2px;background:${brandColor};flex-shrink:0;"></span>
                  <span style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeModelName}</span>
                </div>
                ${priceRangeHtml}
              </div>
              <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:8px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="color:#8B91A7;font-size:11px;">销量</span>
                  <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#F0F1F5;">${sales.toLocaleString()} 台</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="color:#8B91A7;font-size:11px;">均价</span>
                  <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#F0F1F5;">${xVal.toFixed(1)} 万</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:#8B91A7;font-size:11px;">${preset.yAxis.label}</span>
                  <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#F0F1F5;">${yVal.toLocaleString()} ${preset.yAxis.unit}</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${qColor};"></span>
                <span style="font-size:11px;color:${qColor};">${safeQuadrantLabel} — ${safeQuadrantDescription}</span>
              </div>
            </div>
          `;
        },
      },
      xAxis: {
        type: 'value',
        name: `${preset.xAxis.label} (${preset.xAxis.unit})`,
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          color: '#5A6073',
          fontSize: 11,
        },
        min: preset.xAxis.min,
        max: preset.xAxis.max,
        axisLine: {
          lineStyle: { color: 'rgba(255,255,255,0.1)' },
        },
        axisTick: {
          lineStyle: { color: 'rgba(255,255,255,0.1)' },
        },
        axisLabel: {
          color: '#5A6073',
          fontSize: 11,
          fontFamily: '"JetBrains Mono", monospace',
        },
        splitLine: {
          lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' },
        },
      },
      yAxis: {
        type: 'value',
        name: `${preset.yAxis.label} (${preset.yAxis.unit})`,
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: {
          color: '#5A6073',
          fontSize: 11,
        },
        min: preset.yAxis.min,
        max: preset.yAxis.max,
        axisLine: {
          lineStyle: { color: 'rgba(255,255,255,0.1)' },
        },
        axisTick: {
          lineStyle: { color: 'rgba(255,255,255,0.1)' },
        },
        axisLabel: {
          color: '#5A6073',
          fontSize: 11,
          fontFamily: '"JetBrains Mono", monospace',
        },
        splitLine: {
          lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' },
        },
      },
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 14,
          bottom: 2,
          borderColor: 'transparent',
          backgroundColor: 'rgba(255,255,255,0.04)',
          fillerColor: 'rgba(255,255,255,0.1)',
          handleStyle: { color: 'rgba(255,255,255,0.3)' },
          textStyle: { color: '#5A6073', fontSize: 10 },
          showDetail: false,
        },
        {
          type: 'slider',
          yAxisIndex: 0,
          width: 10,
          right: 2,
          top: g.top,
          bottom: g.bottom + 18,
          borderColor: 'transparent',
          backgroundColor: 'rgba(255,255,255,0.03)',
          fillerColor: 'rgba(255,255,255,0.08)',
          handleStyle: { color: 'rgba(255,255,255,0.2)' },
          textStyle: { color: '#5A6073', fontSize: 10 },
          showDetail: false,
        },
        {
          type: 'inside',
          xAxisIndex: 0,
        },
        {
          type: 'inside',
          yAxisIndex: 0,
        },
      ],
      series: [
        {
          type: 'scatter',
          data: seriesData,
          symbolSize: (val: number[]) => {
            const sales = val[2];
            const normalized = (Math.sqrt(Math.max(0, sales)) - sqrtMin) / sqrtSpan;
            return Math.max(10, Math.min(70, 10 + normalized * 60));
          },
          animationDuration: 300,
          animationEasing: 'cubicOut',
          animationDurationUpdate: 0,
          progressive: 100,
        },
      ],
    };

    return option;
  }, [data, preset, xMean, yMean, highlightedBrandColors, unselectedBrandColor]);

  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return;

    // Canvas 渲染器比 SVG 更适合高频交互场景（dataZoom、graphic 拖拽）
    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    chartInstance.current = chart;

    chart.on('click', (params: unknown) => {
      const clickParams = getChartClickParams(params);
      if (clickParams.componentType === 'series' && clickParams.data) {
        const clickedId = clickParams.data.value[3];
        onSelect(selectedIdRef.current === clickedId ? null : clickedId);
      } else {
        onSelect(null);
      }
    });

    // resize 防抖：窗口拖拽时只在一段时间后执行 resize
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimeout !== null) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resizeTimeout = null;
        chart.resize();
        scheduleApplyOverlays();
      }, 80);
    };
    window.addEventListener('resize', handleResize);

    chart.on('dataZoom', scheduleApplyOverlays);
    // 注意：不要监听 finished，否则 setOption(graphic) -> 渲染 -> finished ->
    // scheduleApplyOverlays -> setOption(graphic) 会形成无限循环

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout !== null) clearTimeout(resizeTimeout);
      chart.off('dataZoom', scheduleApplyOverlays);
      if (overlayRafId.current !== null) {
        cancelAnimationFrame(overlayRafId.current);
        overlayRafId.current = null;
      }
      chart.dispose();
      chartInstance.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 全量更新（基础配置变化时）
  useEffect(() => {
    if (!chartInstance.current) return;
    chartInstance.current.setOption(buildOption(), { notMerge: false });
    // setOption 后主动触发一次象限 overlay 更新（替代原来 finished 事件的作用）
    scheduleApplyOverlays();
  }, [buildOption]);

  // 局部样式更新：activeBrand / selectedId 变化时只更新 series.data，不重绘整个图表
  const lastAppliedBrand = useRef<string | null>(activeBrand);
  const lastAppliedSelected = useRef<string | null>(selectedId);
  useEffect(() => {
    if (!chartInstance.current) return;
    // 若仅是 data/preset 等变化导致本 effect 重跑，但 brand/selectedId 没变，则跳过
    if (lastAppliedBrand.current === activeBrand && lastAppliedSelected.current === selectedId) return;
    lastAppliedBrand.current = activeBrand;
    lastAppliedSelected.current = selectedId;

    const { items: seriesData } = buildSeriesItems(
      data, preset, xMean, yMean,
      highlightedBrandColors, unselectedBrandColor,
      activeBrand, selectedId,
    );
    chartInstance.current.setOption(
      { series: [{ data: seriesData }] },
      { notMerge: false, lazyUpdate: true },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand, selectedId]);

  // dataZoom 初始范围：覆盖全部数据（×1.08 留边），避免高销量/高价车型被裁出可视区
  // 仅在数据指纹 or preset.id 真实变化时重置 zoom，避免用户拖动后被 useEffect 拉回
  const lastZoomResetKey = useRef<string>('');
  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;

    const resetKey = `${preset.id}|${data.length}|${data[0]?.id ?? ''}|${data[data.length - 1]?.id ?? ''}`;
    if (lastZoomResetKey.current === resetKey) return;
    lastZoomResetKey.current = resetKey;

    const salesValues = data
      .map(item => item.sales)
      .filter((sales): sales is number => Number.isFinite(sales) && sales >= 0);
    const priceVals = data
      .map(item => item.price)
      .filter((price): price is number => Number.isFinite(price) && price > 0);

    const priceMax = priceVals.length ? Math.ceil(Math.max(...priceVals) * 1.08) : (preset.xAxis.max ?? 100);
    const salesMax = salesValues.length ? Math.ceil(Math.max(...salesValues) * 1.08) : (preset.yAxis.max ?? 50000);

    chart.dispatchAction({
      type: 'dataZoom',
      batch: [
        { dataZoomIndex: 0, startValue: preset.xAxis.min ?? 0, endValue: priceMax },
        { dataZoomIndex: 1, startValue: preset.yAxis.min ?? 0, endValue: salesMax },
      ],
    });
  }, [data, preset]);

  // 四象限：首次 replaceMerge 创建，后续只增量更新位置/shape，避免完全重建
  useEffect(() => {
    const clear = () => {
      if (!chartInstance.current) return;
      chartInstance.current.setOption({ graphic: [] }, { replaceMerge: ['graphic'] });
    };

    let isFirstApply = true;

    const apply = () => {
      if (!chartInstance.current) return;
      const chart = chartInstance.current;
      if (!quadrant.enabled) {
        clear();
        isFirstApply = true;
        return;
      }
      if (data.length === 0) {
        clear();
        isFirstApply = true;
        return;
      }

      const finder = { xAxisIndex: 0, yAxisIndex: 0 } as const;
      const g = GRID;
      const width = chart.getWidth();
      const height = chart.getHeight();
      const gridX = g.left;
      const gridY = g.top;
      const gridW = width - g.left - g.right;
      const gridH = height - g.top - g.bottom;

      // 实时读取当前可见轴范围（支持 dataZoom 后的动态中点）
      const visibleXMin = chart.convertFromPixel({ xAxisIndex: 0 }, [gridX])?.[0] ?? (preset.xAxis.min ?? 0);
      const visibleXMax = chart.convertFromPixel({ xAxisIndex: 0 }, [gridX + gridW])?.[0] ?? (preset.xAxis.max ?? 100);
      const visibleYMin = chart.convertFromPixel({ yAxisIndex: 0 }, [gridY + gridH])?.[1] ?? (preset.yAxis.min ?? 0);
      const visibleYMax = chart.convertFromPixel({ yAxisIndex: 0 }, [gridY])?.[1] ?? (preset.yAxis.max ?? 100);

      let thresholdX: number;
      if (quadrant.xThreshold === 'mean') {
        thresholdX = (visibleXMin + visibleXMax) / 2;
      } else if (quadrant.xThreshold === 'manual') {
        thresholdX = quadrant.xManualValue ?? (visibleXMin + visibleXMax) / 2;
      } else {
        thresholdX = quadrant.xThreshold;
      }

      let thresholdY: number;
      if (quadrant.yThreshold === 'mean') {
        thresholdY = (visibleYMin + visibleYMax) / 2;
      } else if (quadrant.yThreshold === 'manual') {
        thresholdY = quadrant.yManualValue ?? (visibleYMin + visibleYMax) / 2;
      } else {
        thresholdY = quadrant.yThreshold;
      }

      if (!Number.isFinite(thresholdX) || !Number.isFinite(thresholdY)) {
        clear();
        isFirstApply = true;
        return;
      }

      const cross = chart.convertToPixel(finder, [thresholdX, thresholdY]) as number[] | undefined;
      if (!cross || !Number.isFinite(cross[0]!) || !Number.isFinite(cross[1]!)) {
        clear();
        isFirstApply = true;
        lastOverlayCx.current = null;
        lastOverlayCy.current = null;
        return;
      }
      const cx = Math.round(cross[0]! - gridX);
      const cy = Math.round(cross[1]! - gridY);

      // 如果象限中心位置没有变化，跳过 setOption，避免不必要的渲染
      if (!isFirstApply && lastOverlayCx.current === cx && lastOverlayCy.current === cy) {
        return;
      }
      lastOverlayCx.current = cx;
      lastOverlayCy.current = cy;

      const xManual = throttle((e: unknown) => {
        const event = getDragEvent(e);
        if (!event) return;
        const v = chart.convertFromPixel(finder, [event.offsetX, event.offsetY]);
        if (!v || v[0] === undefined) return;
        const newVal = Math.max(
          preset.xAxis.min ?? -Infinity,
          Math.min(preset.xAxis.max ?? Infinity, v[0] as number),
        );
        onQuadrantChange({ ...quadrant, xThreshold: 'manual', xManualValue: newVal });
      }, 50);
      const yManual = throttle((e: unknown) => {
        const event = getDragEvent(e);
        if (!event) return;
        const v = chart.convertFromPixel(finder, [event.offsetX, event.offsetY]);
        if (!v || v[1] === undefined) return;
        const newVal = Math.max(
          preset.yAxis.min ?? -Infinity,
          Math.min(preset.yAxis.max ?? Infinity, v[1] as number),
        );
        onQuadrantChange({ ...quadrant, yThreshold: 'manual', yManualValue: newVal });
      }, 50);
      const bothManual = throttle((e: unknown) => {
        const event = getDragEvent(e);
        if (!event) return;
        const v = chart.convertFromPixel(finder, [event.offsetX, event.offsetY]);
        if (!v || v[0] === undefined || v[1] === undefined) return;
        const nx = Math.max(
          preset.xAxis.min ?? -Infinity,
          Math.min(preset.xAxis.max ?? Infinity, v[0] as number),
        );
        const ny = Math.max(
          preset.yAxis.min ?? -Infinity,
          Math.min(preset.yAxis.max ?? Infinity, v[1] as number),
        );
        onQuadrantChange({
          ...quadrant,
          xThreshold: 'manual',
          yThreshold: 'manual',
          xManualValue: nx,
          yManualValue: ny,
        });
      }, 50);

      const axisColor = 'rgba(148, 163, 184, 0.92)';

      if (isFirstApply) {
        isFirstApply = false;
        chart.setOption(
          {
            graphic: [
              {
                id: 'quadrant-axes',
                type: 'group' as const,
                left: gridX,
                top: gridY,
                children: [
                  { id: 'q-rect-premium', type: 'rect' as const, shape: { x: 0, y: 0, width: Math.max(0, cx), height: Math.max(0, cy) }, z2: 0, silent: true, style: { fill: hexToRgba(quadrantInfos.premium.color, 0.08) } },
                  { id: 'q-rect-star', type: 'rect' as const, shape: { x: cx, y: 0, width: Math.max(0, gridW - cx), height: Math.max(0, cy) }, z2: 0, silent: true, style: { fill: hexToRgba(quadrantInfos.star.color, 0.08) } },
                  { id: 'q-rect-edge', type: 'rect' as const, shape: { x: 0, y: cy, width: Math.max(0, cx), height: Math.max(0, gridH - cy) }, z2: 0, silent: true, style: { fill: hexToRgba(quadrantInfos.edge.color, 0.08) } },
                  { id: 'q-rect-volume', type: 'rect' as const, shape: { x: cx, y: cy, width: Math.max(0, gridW - cx), height: Math.max(0, gridH - cy) }, z2: 0, silent: true, style: { fill: hexToRgba(quadrantInfos.volume.color, 0.08) } },
                  { id: 'q-line-v', type: 'line' as const, z2: 1, shape: { x1: cx, y1: 0, x2: cx, y2: gridH }, style: { stroke: axisColor, lineWidth: 2 }, draggable: 'horizontal' as const, cursor: 'ew-resize' as const, ondrag: xManual },
                  { id: 'q-line-h', type: 'line' as const, z2: 1, shape: { x1: 0, y1: cy, x2: gridW, y2: cy }, style: { stroke: axisColor, lineWidth: 2 }, draggable: 'vertical' as const, cursor: 'ns-resize' as const, ondrag: yManual },
                  { id: 'q-center', type: 'circle' as const, z2: 3, shape: { cx, cy, r: 7 }, style: { fill: 'rgba(20, 22, 27, 0.85)', stroke: '#00D084', lineWidth: 2, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.4)' }, cursor: 'move' as const, draggable: true, ondrag: bothManual },
                  { id: 'q-text-premium', type: 'text' as const, x: cx / 2, y: cy / 2, z2: 2, silent: true, style: { text: '🔵 溢价配置', fill: quadrantInfos.premium.color, fontSize: 11, fontWeight: 500, textAlign: 'center', textVerticalAlign: 'middle' } },
                  { id: 'q-text-star', type: 'text' as const, x: (cx + gridW) / 2, y: cy / 2, z2: 2, silent: true, style: { text: '🟢 量价齐高', fill: quadrantInfos.star.color, fontSize: 11, fontWeight: 500, textAlign: 'center', textVerticalAlign: 'middle' } },
                  { id: 'q-text-edge', type: 'text' as const, x: cx / 2, y: (cy + gridH) / 2, z2: 2, silent: true, style: { text: '⚪ 边缘配置', fill: quadrantInfos.edge.color, fontSize: 11, fontWeight: 500, textAlign: 'center', textVerticalAlign: 'middle' } },
                  { id: 'q-text-volume', type: 'text' as const, x: (cx + gridW) / 2, y: (cy + gridH) / 2, z2: 2, silent: true, style: { text: '🔴 以价换量', fill: quadrantInfos.volume.color, fontSize: 11, fontWeight: 500, textAlign: 'center', textVerticalAlign: 'middle' } },
                ],
              },
            ],
          },
          { replaceMerge: ['graphic'] },
        );
      } else {
        // 增量更新：只改位置和 shape，不重建元素，避免 Canvas/SVG 频繁创建销毁
        chart.setOption({
          graphic: [
            {
              id: 'quadrant-axes',
              children: [
                { id: 'q-rect-premium', shape: { width: Math.max(0, cx), height: Math.max(0, cy) } },
                { id: 'q-rect-star', shape: { x: cx, width: Math.max(0, gridW - cx), height: Math.max(0, cy) } },
                { id: 'q-rect-edge', shape: { y: cy, width: Math.max(0, cx), height: Math.max(0, gridH - cy) } },
                { id: 'q-rect-volume', shape: { x: cx, y: cy, width: Math.max(0, gridW - cx), height: Math.max(0, gridH - cy) } },
                { id: 'q-line-v', shape: { x1: cx, x2: cx } },
                { id: 'q-line-h', shape: { y1: cy, y2: cy } },
                { id: 'q-center', shape: { cx, cy } },
                { id: 'q-text-premium', x: cx / 2, y: cy / 2 },
                { id: 'q-text-star', x: (cx + gridW) / 2, y: cy / 2 },
                { id: 'q-text-edge', x: cx / 2, y: (cy + gridH) / 2 },
                { id: 'q-text-volume', x: (cx + gridW) / 2, y: (cy + gridH) / 2 },
              ],
            },
          ],
        });
      }
    };

    applyQuadrantOverlaysRef.current = apply;

    if (!quadrant.enabled) {
      clear();
      lastOverlayCx.current = null;
      lastOverlayCy.current = null;
      return () => {
        applyQuadrantOverlaysRef.current = null;
      };
    }
    if (data.length === 0) {
      clear();
      lastOverlayCx.current = null;
      lastOverlayCy.current = null;
      return () => {
        applyQuadrantOverlaysRef.current = null;
      };
    }

    const raf = requestAnimationFrame(apply);
    return () => {
      cancelAnimationFrame(raf);
      applyQuadrantOverlaysRef.current = null;
    };
  }, [quadrant, preset, onQuadrantChange, data.length]);

  const highlightedBrands = useMemo(
    () => Object.keys(highlightedBrandColors).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [highlightedBrandColors],
  );

  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [legendOffset, setLegendOffset] = useState({ x: 0, y: 0 });

  // 图例面板拖拽：拖拽过程中直接操作 DOM，不触发 React 重渲染；mouseup 后再同步 state
  const legendPanelRef = useRef<HTMLDivElement | null>(null);
  const legendCollapsedBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleLegendDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = legendOffset.x;
    const initialY = legendOffset.y;
    let lastX = initialX;
    let lastY = initialY;

    const onMove = (ev: MouseEvent) => {
      lastX = initialX + (ev.clientX - startX);
      lastY = initialY + (ev.clientY - startY);
      // 直接修改 DOM，绕过 React 渲染管线
      const panel = legendPanelRef.current;
      if (panel) {
        panel.style.top = `${LEGEND_BASE_TOP + lastY}px`;
        panel.style.right = `${LEGEND_BASE_RIGHT - lastX}px`;
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setLegendOffset({ x: lastX, y: lastY });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [legendOffset]);

  return (
    <div className="relative w-full h-full">
      <div ref={chartRef} className="w-full h-full" />
      {/* 四象限开关 */}
      <div
        className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer select-none"
        style={{
          backgroundColor: 'rgba(20, 22, 27, 0.9)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-subtle)',
        }}
        onClick={() => onQuadrantChange({ ...quadrant, enabled: !quadrant.enabled })}
      >
        <div
          className="w-8 h-4 rounded-full relative transition-colors duration-200"
          style={{ backgroundColor: quadrant.enabled ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)' }}
        >
          <div
            className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200"
            style={{ transform: quadrant.enabled ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </div>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          四象限视图
        </span>
      </div>

      {/* 品牌图例 */}
      {highlightedBrands.length > 0 && (
        legendCollapsed ? (
          <button
            ref={legendCollapsedBtnRef}
            className="absolute flex items-center justify-center w-7 h-7 rounded-full cursor-pointer"
            style={{
              top: LEGEND_BASE_TOP + legendOffset.y,
              right: LEGEND_BASE_RIGHT - legendOffset.x,
              backgroundColor: 'rgba(20, 22, 27, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-subtle)',
              zIndex: 10,
            }}
            onClick={() => setLegendCollapsed(false)}
            title="展开图例"
          >
            <span className="text-xs">📋</span>
          </button>
        ) : (
          <div
            ref={legendPanelRef}
            className="absolute rounded-lg overflow-hidden"
            style={{
              top: LEGEND_BASE_TOP + legendOffset.y,
              right: LEGEND_BASE_RIGHT - legendOffset.x,
              backgroundColor: 'rgba(20, 22, 27, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-subtle)',
              minWidth: '120px',
              maxWidth: '380px',
              resize: 'horizontal',
              zIndex: 10,
            }}
          >
            {/* 拖拽头部 + 折叠按钮 */}
            <div
              className="flex items-center justify-between px-2.5 py-1 cursor-move select-none"
              onMouseDown={handleLegendDrag}
            >
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>品牌图例</span>
              <button
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                onClick={(e) => { e.stopPropagation(); setLegendCollapsed(true); }}
                title="收起"
              >
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>−</span>
              </button>
            </div>
            {/* 品牌列表 */}
            <div className="flex flex-wrap gap-1 px-2.5 pb-2">
              {highlightedBrands.map(brand => {
                const color = highlightedBrandColors[brand];
                const isActive = activeBrand === brand;
                return (
                  <button
                    key={brand}
                    onClick={() => setActiveBrand(prev => prev === brand ? null : brand)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all shrink-0"
                    style={{
                      backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                      border: `1px solid ${isActive ? color : 'transparent'}`,
                      color: isActive ? '#F0F1F5' : 'var(--text-secondary)',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {brand}
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
