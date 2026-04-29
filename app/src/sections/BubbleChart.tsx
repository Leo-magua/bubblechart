import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import * as echarts from 'echarts';
import type { ConfigVersion, ViewPreset, QuadrantState, QuadrantType } from '@/types';
import { quadrantInfos } from '@/data/mockData';

const GRID = { left: 60, right: 40, top: 40, bottom: 50 } as const;

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

    const sameBrandConfigs = data.filter(d => d.brand === item.brand);
    const configIndex = sameBrandConfigs.findIndex(d => d.id === item.id);
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
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const applyQuadrantOverlaysRef = useRef<(() => void) | null>(null);
  const overlayRafId = useRef<number | null>(null);
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
    return xValues.reduce((a, b) => a + b, 0) / xValues.length;
  }, [xValues, quadrant.xThreshold, quadrant.xManualValue]);

  const yMean = useMemo(() => {
    if (quadrant.yThreshold !== 'mean' && quadrant.yManualValue !== undefined) return quadrant.yManualValue;
    return yValues.reduce((a, b) => a + b, 0) / yValues.length;
  }, [yValues, quadrant.yThreshold, quadrant.yManualValue]);

  // 防抖：每帧最多执行一次 overlay 更新
  const scheduleApplyOverlays = useCallback(() => {
    if (overlayRafId.current !== null) return;
    overlayRafId.current = requestAnimationFrame(() => {
      overlayRafId.current = null;
      applyQuadrantOverlaysRef.current?.();
    });
  }, []);

  const buildOption = useCallback((): echarts.EChartsOption => {
    const g = GRID;
    const { items: seriesData, sqrtMin, sqrtSpan } = buildSeriesItems(
      data, preset, xMean, yMean,
      highlightedBrandColors, unselectedBrandColor,
      activeBrandRef.current, selectedIdRef.current,
    );

    const option: echarts.EChartsOption = {
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
        formatter: (params: any) => {
          const d = params.data;
          const [xVal, yVal, sales, _id, _brand, brandColor, _configName, qType, qColor, _opacity, modelName, priceRange] = d.value;
          const qInfo = quadrantInfos[qType as string];
          const priceRangeHtml = priceRange ? `<span style="font-size:11px;color:#8B91A7;font-family:'JetBrains Mono',monospace;">${priceRange}</span>` : '';
          return `
            <div style="min-width: 200px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;">
                <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                  <span style="display:inline-block;width:6px;height:14px;border-radius:2px;background:${brandColor};flex-shrink:0;"></span>
                  <span style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${modelName}</span>
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
                <span style="font-size:11px;color:${qColor};">${qInfo?.label || ''} — ${qInfo?.description || ''}</span>
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
          zoomOnMouseWheel: false,
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
          animationDuration: 600,
          animationEasing: 'cubicOut',
          animationDurationUpdate: 600,
          animationEasingUpdate: 'cubicInOut',
        },
      ],
    };

    return option;
  }, [data, preset, xMean, yMean, highlightedBrandColors, unselectedBrandColor]);

  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current, undefined, { renderer: 'svg' });
    chartInstance.current = chart;

    chart.on('click', (params: any) => {
      if (params.componentType === 'series') {
        const clickedId = params.data.value[3] as string;
        onSelect(selectedIdRef.current === clickedId ? null : clickedId);
      } else {
        onSelect(null);
      }
    });

    const handleResize = () => {
      chart.resize();
      scheduleApplyOverlays();
    };
    window.addEventListener('resize', handleResize);

    chart.on('dataZoom', scheduleApplyOverlays);
    chart.on('finished', scheduleApplyOverlays);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.off('dataZoom', scheduleApplyOverlays);
      chart.off('finished', scheduleApplyOverlays);
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

  // dataZoom 初始范围：避免硬编码在 buildOption 中导致每次重绘重置用户手动调整
  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;

    const salesValues = data
      .map(item => item.sales)
      .filter((sales): sales is number => Number.isFinite(sales) && sales >= 0);
    const priceVals = data
      .map(item => item.price)
      .filter((price): price is number => Number.isFinite(price) && price > 0);

    function getSmartMax(vals: number[], hardMin: number): number {
      if (vals.length === 0) return hardMin;
      const sorted = [...vals].sort((a, b) => a - b);
      const p95 = sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
      const max = sorted[sorted.length - 1];
      if (max <= p95 * 1.5) return Math.ceil(max * 1.08);
      return Math.max(hardMin, Math.ceil(p95 * 1.5));
    }

    const priceSmartMax = getSmartMax(priceVals, 100);
    const salesSmartMax = getSmartMax(salesValues, 20000);

    chart.dispatchAction({
      type: 'dataZoom',
      batch: [
        { dataZoomIndex: 0, startValue: 0, endValue: priceSmartMax },
        { dataZoomIndex: 1, startValue: 0, endValue: salesSmartMax },
      ],
    });
  }, [data]);

  // 四象限：replaceMerge graphic；'mean' 模式实时读取当前可见轴范围
  useEffect(() => {
    const clear = () => {
      if (!chartInstance.current) return;
      chartInstance.current.setOption({ graphic: [] }, { replaceMerge: ['graphic'] });
    };

    const apply = () => {
      if (!chartInstance.current) return;
      const chart = chartInstance.current;
      if (!quadrant.enabled) {
        clear();
        return;
      }
      if (data.length === 0) {
        clear();
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
        return;
      }

      const cross = chart.convertToPixel(finder, [thresholdX, thresholdY]) as number[] | undefined;
      if (!cross || !Number.isFinite(cross[0]!) || !Number.isFinite(cross[1]!)) {
        clear();
        return;
      }
      const cx = cross[0]! - gridX;
      const cy = cross[1]! - gridY;

      const xManual = (e: { offsetX: number; offsetY: number }) => {
        const v = chart.convertFromPixel(finder, [e.offsetX, e.offsetY]);
        if (!v || v[0] === undefined) return;
        const newVal = Math.max(
          preset.xAxis.min ?? -Infinity,
          Math.min(preset.xAxis.max ?? Infinity, v[0] as number),
        );
        onQuadrantChange({ ...quadrant, xThreshold: 'manual', xManualValue: newVal });
      };
      const yManual = (e: { offsetX: number; offsetY: number }) => {
        const v = chart.convertFromPixel(finder, [e.offsetX, e.offsetY]);
        if (!v || v[1] === undefined) return;
        const newVal = Math.max(
          preset.yAxis.min ?? -Infinity,
          Math.min(preset.yAxis.max ?? Infinity, v[1] as number),
        );
        onQuadrantChange({ ...quadrant, yThreshold: 'manual', yManualValue: newVal });
      };
      const bothManual = (e: { offsetX: number; offsetY: number }) => {
        const v = chart.convertFromPixel(finder, [e.offsetX, e.offsetY]);
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
      };

      const axisColor = 'rgba(148, 163, 184, 0.92)';

      chart.setOption(
        {
          graphic: [
            {
              id: 'quadrant-axes',
              type: 'group' as const,
              left: gridX,
              top: gridY,
              children: [
                {
                  type: 'rect' as const,
                  shape: { x: 0, y: 0, width: Math.max(0, cx), height: Math.max(0, cy) },
                  z2: 0,
                  silent: true,
                  style: { fill: hexToRgba(quadrantInfos.premium.color, 0.08) } as any,
                } as any,
                {
                  type: 'rect' as const,
                  shape: { x: cx, y: 0, width: Math.max(0, gridW - cx), height: Math.max(0, cy) },
                  z2: 0,
                  silent: true,
                  style: { fill: hexToRgba(quadrantInfos.star.color, 0.08) } as any,
                } as any,
                {
                  type: 'rect' as const,
                  shape: { x: 0, y: cy, width: Math.max(0, cx), height: Math.max(0, gridH - cy) },
                  z2: 0,
                  silent: true,
                  style: { fill: hexToRgba(quadrantInfos.edge.color, 0.08) } as any,
                } as any,
                {
                  type: 'rect' as const,
                  shape: { x: cx, y: cy, width: Math.max(0, gridW - cx), height: Math.max(0, gridH - cy) },
                  z2: 0,
                  silent: true,
                  style: { fill: hexToRgba(quadrantInfos.volume.color, 0.08) } as any,
                } as any,
                {
                  type: 'line' as const,
                  z2: 1,
                  shape: { x1: cx, y1: 0, x2: cx, y2: gridH },
                  style: {
                    stroke: axisColor,
                    lineWidth: 2,
                  } as any,
                  draggable: 'horizontal' as const,
                  cursor: 'ew-resize' as const,
                  ondrag: (ev: { offsetX: number; offsetY: number }) => {
                    if (!chartInstance.current) return;
                    xManual(ev);
                  },
                } as any,
                {
                  type: 'line' as const,
                  z2: 1,
                  shape: { x1: 0, y1: cy, x2: gridW, y2: cy },
                  style: {
                    stroke: axisColor,
                    lineWidth: 2,
                  } as any,
                  draggable: 'vertical' as const,
                  cursor: 'ns-resize' as const,
                  ondrag: (ev: { offsetX: number; offsetY: number }) => {
                    if (!chartInstance.current) return;
                    yManual(ev);
                  },
                } as any,
                {
                  type: 'circle' as const,
                  z2: 3,
                  shape: { cx, cy, r: 7 },
                  style: {
                    fill: 'rgba(20, 22, 27, 0.85)',
                    stroke: '#00D084',
                    lineWidth: 2,
                    shadowBlur: 6,
                    shadowColor: 'rgba(0,0,0,0.4)',
                  } as any,
                  cursor: 'move' as const,
                  draggable: true,
                  ondrag: (ev: { offsetX: number; offsetY: number }) => {
                    if (!chartInstance.current) return;
                    bothManual(ev);
                  },
                } as any,
                {
                  type: 'text' as const,
                  x: cx / 2,
                  y: cy / 2,
                  z2: 2,
                  silent: true,
                  style: {
                    text: '🔵 溢价配置',
                    fill: quadrantInfos.premium.color,
                    fontSize: 11,
                    fontWeight: 500,
                    textAlign: 'center',
                    textVerticalAlign: 'middle',
                  } as any,
                } as any,
                {
                  type: 'text' as const,
                  x: (cx + gridW) / 2,
                  y: cy / 2,
                  z2: 2,
                  silent: true,
                  style: {
                    text: '🟢 量价齐高',
                    fill: quadrantInfos.star.color,
                    fontSize: 11,
                    fontWeight: 500,
                    textAlign: 'center',
                    textVerticalAlign: 'middle',
                  } as any,
                } as any,
                {
                  type: 'text' as const,
                  x: cx / 2,
                  y: (cy + gridH) / 2,
                  z2: 2,
                  silent: true,
                  style: {
                    text: '⚪ 边缘配置',
                    fill: quadrantInfos.edge.color,
                    fontSize: 11,
                    fontWeight: 500,
                    textAlign: 'center',
                    textVerticalAlign: 'middle',
                  } as any,
                } as any,
                {
                  type: 'text' as const,
                  x: (cx + gridW) / 2,
                  y: (cy + gridH) / 2,
                  z2: 2,
                  silent: true,
                  style: {
                    text: '🔴 以价换量',
                    fill: quadrantInfos.volume.color,
                    fontSize: 11,
                    fontWeight: 500,
                    textAlign: 'center',
                    textVerticalAlign: 'middle',
                  } as any,
                } as any,
              ],
            },
          ],
        },
        { replaceMerge: ['graphic'] },
      );
    };

    applyQuadrantOverlaysRef.current = apply;

    if (!quadrant.enabled) {
      clear();
      return () => {
        applyQuadrantOverlaysRef.current = null;
      };
    }
    if (data.length === 0) {
      clear();
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

  const handleLegendDrag = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = legendOffset.x;
    const initialY = legendOffset.y;
    const onMove = (ev: MouseEvent) => {
      setLegendOffset({
        x: initialX + (ev.clientX - startX),
        y: initialY + (ev.clientY - startY),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
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
            className="absolute flex items-center justify-center w-7 h-7 rounded-full cursor-pointer"
            style={{
              top: GRID.top + 8 + legendOffset.y,
              right: GRID.right + 14 - legendOffset.x,
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
            className="absolute rounded-lg overflow-hidden"
            style={{
              top: GRID.top + 8 + legendOffset.y,
              right: GRID.right + 14 - legendOffset.x,
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
