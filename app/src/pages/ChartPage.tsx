import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast, Toaster } from 'sonner';
import type { ChartAdminConfig, ConfigVersion, QuadrantState } from '@/types';
import {
  fetchChartConfig,
  fetchMonths,
  fetchSales,
  postImportFile,
  formatMonthLabelCn,
  salesSourceToLabel,
  normalizeConfigItems,
} from '@/api/bubblechartClient';
import { mockData, viewPresets, BRAND_COLORS } from '@/data/mockData';
import { Navbar } from '@/sections/Navbar';
import { PresetBar } from '@/sections/PresetBar';
import { BubbleChart } from '@/sections/BubbleChart';
import { DetailPanel } from '@/sections/DetailPanel';

import { FooterBar } from '@/sections/FooterBar';
import { DataImportModal } from '@/sections/DataImportModal';

function getMean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const FALLBACK_MONTH = mockData[0]?.month ?? '2026-03';
const DEFAULT_CHART_CONFIG: ChartAdminConfig = {
  xAxisRange: { min: 15, max: 60 },
  highlightedBrandColors: {},
  unselectedBrandColor: '#9CA3AF',
};

export default function ChartPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ConfigVersion[]>(mockData);
  const [currentMonthIso, setCurrentMonthIso] = useState<string>(FALLBACK_MONTH);
  const [availableMonths, setAvailableMonths] = useState<string[]>([FALLBACK_MONTH]);
  const [dataSourceLabel, setDataSourceLabel] = useState<string>('示例数据（离线降级）');
  const [chartConfig, setChartConfig] = useState<ChartAdminConfig>(DEFAULT_CHART_CONFIG);
  const [activePreset, setActivePreset] = useState('sales-health');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quadrant, setQuadrant] = useState<QuadrantState>({
    enabled: false,
    xThreshold: 'mean',
    yThreshold: 'mean',
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);


  const closeImportModal = useCallback(() => setIsImportOpen(false), []);

  const loadSalesForMonth = useCallback(async (monthIso: string, options?: { silent?: boolean }): Promise<boolean> => {
    const salesRes = await fetchSales(monthIso);
    if (!salesRes.ok) {
      setData(mockData);
      setCurrentMonthIso(FALLBACK_MONTH);
      setDataSourceLabel('示例数据（离线降级）');
      if (!options?.silent) toast.error(`加载失败：${salesRes.error}`);
      return false;
    }

    const { month, source, items } = salesRes;
    if (items.length > 0) {
      setData(normalizeConfigItems(items, BRAND_COLORS));
      setCurrentMonthIso(month);
      setDataSourceLabel(salesSourceToLabel(source, false));
      return true;
    }

    if (source === 'mock') {
      setData(mockData);
      setCurrentMonthIso(FALLBACK_MONTH);
      setDataSourceLabel(salesSourceToLabel(source, true));
      return true;
    }

    setData([]);
    setCurrentMonthIso(month);
    setDataSourceLabel('懂车帝（无记录）');
    return true;
  }, []);

  const bootstrap = useCallback(async () => {
    const monthsRes = await fetchMonths();
    const apiMonths = monthsRes.ok ? monthsRes.months : [];
    const list = apiMonths.length > 0 ? apiMonths : [FALLBACK_MONTH];
    setAvailableMonths(list);
    const initialMonth = list[0] ?? FALLBACK_MONTH;
    await loadSalesForMonth(initialMonth, { silent: false });
  }, [loadSalesForMonth]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const loadChartConfig = useCallback(async () => {
    const configRes = await fetchChartConfig();
    if (configRes.ok) setChartConfig(configRes.config);
  }, []);

  useEffect(() => {
    void loadChartConfig();

    const reloadOnReturn = () => {
      if (document.visibilityState === 'visible') void loadChartConfig();
    };
    window.addEventListener('focus', reloadOnReturn);
    document.addEventListener('visibilitychange', reloadOnReturn);
    return () => {
      window.removeEventListener('focus', reloadOnReturn);
      document.removeEventListener('visibilitychange', reloadOnReturn);
    };
  }, [loadChartConfig]);

  useEffect(() => {
    setSelectedId(prev => {
      if (!prev) return prev;
      return data.some(d => d.id === prev) ? prev : null;
    });
  }, [data]);

  const configuredPresets = useMemo(() => viewPresets.map(preset => {
    if (preset.id !== 'sales-health') return preset;
    return {
      ...preset,
      xAxis: {
        ...preset.xAxis,
        min: chartConfig.xAxisRange.min,
        max: chartConfig.xAxisRange.max,
      },
    };
  }), [chartConfig.xAxisRange.max, chartConfig.xAxisRange.min]);

  const preset = useMemo(
    () => configuredPresets.find(p => p.id === activePreset) || configuredPresets[0],
    [activePreset, configuredPresets],
  );

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
    return getMean(xValues);
  }, [xValues, quadrant.xThreshold, quadrant.xManualValue]);

  const yMean = useMemo(() => {
    if (quadrant.yThreshold !== 'mean' && quadrant.yManualValue !== undefined) return quadrant.yManualValue;
    return getMean(yValues);
  }, [yValues, quadrant.yThreshold, quadrant.yManualValue]);

  const displayData = useMemo(() => {
    return data.map(item => {
      const highlightedColor = chartConfig.highlightedBrandColors[item.brand];
      return {
        ...item,
        brandColor: highlightedColor || chartConfig.unselectedBrandColor,
      };
    });
  }, [data, chartConfig.highlightedBrandColors, chartConfig.unselectedBrandColor]);

  const selectedConfig = useMemo(() => displayData.find(d => d.id === selectedId) || null, [displayData, selectedId]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const monthsRes = await fetchMonths();
      let target = currentMonthIso;
      if (monthsRes.ok) {
        const list = monthsRes.months.length > 0 ? monthsRes.months : [FALLBACK_MONTH];
        setAvailableMonths(list);
        if (list.length > 0 && !list.includes(currentMonthIso)) {
          target = list[0]!;
        }
      }
      const ok = await loadSalesForMonth(target, { silent: true });
      if (ok) toast.success('已刷新');
      else toast.error('刷新失败，已使用示例数据');
    } finally {
      setIsRefreshing(false);
    }
  }, [currentMonthIso, loadSalesForMonth]);

  const monthOptionsForSelect = useMemo(() => {
    if (availableMonths.length === 0) return [currentMonthIso];
    if (availableMonths.includes(currentMonthIso)) return availableMonths;
    return [currentMonthIso, ...availableMonths];
  }, [availableMonths, currentMonthIso]);

  const handleMonthChange = useCallback(
    async (iso: string) => {
      if (iso === currentMonthIso) return;
      setIsRefreshing(true);
      try {
        await loadSalesForMonth(iso, { silent: false });
      } finally {
        setIsRefreshing(false);
      }
    },
    [currentMonthIso, loadSalesForMonth],
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      const result = await postImportFile(file, currentMonthIso);
      if (!result.ok) {
        const low = result.error.toLowerCase();
        if (result.error.includes('404') || low.includes('not found')) {
          throw new Error('服务器尚未开放导入接口');
        }
        throw new Error(result.error);
      }
      toast.success(result.message ?? `已导入 ${result.rowCount} 条`);
      await loadSalesForMonth(result.month, { silent: true });
    },
    [currentMonthIso, loadSalesForMonth],
  );

  const brands = useMemo(() => [...new Set(data.map(d => d.brand))], [data]);

  const monthLabel = formatMonthLabelCn(currentMonthIso);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      <Toaster richColors position="top-center" />
      <Navbar
        monthOptions={monthOptionsForSelect}
        selectedMonthIso={currentMonthIso}
        onMonthChange={m => {
          void handleMonthChange(m);
        }}
        onAdminClick={() => navigate('/admin')}
        onRefresh={handleRefresh}
        onImport={() => setIsImportOpen(true)}
        isRefreshing={isRefreshing}
      />

      <PresetBar
        presets={configuredPresets}
        activePreset={activePreset}
        onPresetChange={setActivePreset}
      />

      {/* 主内容区 */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* 图表区 */}
        <div className="flex-1 relative">
          <BubbleChart
            data={displayData}
            preset={preset}
            quadrant={quadrant}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onQuadrantChange={setQuadrant}
            highlightedBrandColors={chartConfig.highlightedBrandColors}
            unselectedBrandColor={chartConfig.unselectedBrandColor}
          />

          {/* 点击空白处关闭面板 */}
          {selectedId && (
            <div
              className="absolute inset-0"
              style={{ zIndex: 35 }}
              onClick={() => setSelectedId(null)}
            />
          )}
        </div>

        {/* 详情面板 */}
        {selectedConfig && (
          <DetailPanel
            config={selectedConfig}
            allData={displayData}
            xField={preset.xAxis.field}
            yField={preset.yAxis.field}
            xMean={xMean}
            yMean={yMean}
            onClose={() => setSelectedId(null)}
            onSelectConfig={setSelectedId}
          />
        )}
      </div>

      <FooterBar
        totalConfigs={data.length}
        totalBrands={brands.length}
        dataSource={dataSourceLabel}
        currentMonth={monthLabel}
      />

      <DataImportModal
        isOpen={isImportOpen}
        onClose={closeImportModal}
        onImportFile={handleImportFile}
      />
    </div>
  );
}
