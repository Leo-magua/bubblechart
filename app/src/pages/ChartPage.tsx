import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast, Toaster } from 'sonner';
import type { ChartAdminConfig, ConfigVersion, QuadrantState } from '@/types';
import {
  fetchChartConfig,
  fetchMonths,
  fetchSales,
  fetchAvailability,
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

const FALLBACK_MONTH = mockData[0]?.month ?? '2026-03';
const DEFAULT_CHART_CONFIG: ChartAdminConfig = {
  xAxisRange: { min: 15, max: 60 },
  salesRange: { min: 0, max: 50000 },
  highlightedBrandColors: {},
  unselectedBrandColor: '#9CA3AF',
  showUnselectedBrands: true,
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
  const [availabilityInfo, setAvailabilityInfo] = useState<{
    latestAvailableMonth: string;
    currentMonthPublished: boolean;
    nextReleaseMonth: string;
  } | null>(null);


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

    // 数据为空：检查是否是因为该月份数据尚未发布
    setData([]);
    setCurrentMonthIso(month);

    if (availabilityInfo && month > availabilityInfo.latestAvailableMonth) {
      const nextMonth = availabilityInfo.nextReleaseMonth.slice(5, 7);
      setDataSourceLabel(`懂车帝（${month}数据预计${nextMonth}月10日后更新）`);
      if (!options?.silent) {
        toast.info(`${month} 销量数据预计 ${nextMonth}月10日 后在懂车帝更新，当前展示为空。可切换到 ${availabilityInfo.latestAvailableMonth} 查看最新数据。`);
      }
    } else {
      setDataSourceLabel('懂车帝（无记录）');
    }
    return true;
  }, [availabilityInfo]);

  const bootstrap = useCallback(async () => {
    // 并行获取月份列表和可用性信息
    const [monthsRes, availRes] = await Promise.all([
      fetchMonths(),
      fetchAvailability(),
    ]);

    const apiMonths = monthsRes.ok ? monthsRes.months : [];

    // 获取最新可用月份（考虑懂车帝滞后规律）
    let latestAvailable = FALLBACK_MONTH;
    if (availRes.ok) {
      setAvailabilityInfo({
        latestAvailableMonth: availRes.latest_available_month,
        currentMonthPublished: availRes.current_month_published,
        nextReleaseMonth: availRes.next_release_month,
      });
      latestAvailable = availRes.latest_available_month;
    }

    // 构建月份选项：数据库已有月份 + 当前月（即使还没数据，也展示给用户）
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const listSet = new Set([...apiMonths]);
    if (!listSet.has(currentMonth)) {
      listSet.add(currentMonth);
    }
    // 按降序排列（最新月份在前）
    const list = Array.from(listSet).sort((a, b) => b.localeCompare(a));
    setAvailableMonths(list);

    // 默认加载最新可用月份的数据
    const targetMonth = apiMonths.includes(latestAvailable) ? latestAvailable : (apiMonths[0] ?? FALLBACK_MONTH);
    await loadSalesForMonth(targetMonth, { silent: false });
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

  const configuredPresets = useMemo(() => {
    // 安全获取 chartConfig 中的范围配置（防御后端返回不完整 config）
    const safeXAxisRange = chartConfig.xAxisRange || { min: 15, max: 60 };
    const safeSalesRange = chartConfig.salesRange || { min: 0, max: 50000 };

    // 计算实际数据的各字段范围，用于动态调整轴上限/下限
    const priceValues = data.map(d => d.price).filter(v => Number.isFinite(v));
    const salesValues = data.map(d => d.sales).filter(v => Number.isFinite(v));
    const computingValues = data.map(d => d.computingPower || 0).filter(v => Number.isFinite(v) && v > 0);
    const rangeValues = data.map(d => d.range || 0).filter(v => Number.isFinite(v) && v > 0);

    const priceMax = priceValues.length > 0 ? Math.max(...priceValues) : 60;
    const priceMin = priceValues.length > 0 ? Math.min(...priceValues) : 0;
    const salesMax = salesValues.length > 0 ? Math.max(...salesValues) : 50000;
    const salesMin = salesValues.length > 0 ? Math.min(...salesValues) : 0;
    const computingMax = computingValues.length > 0 ? Math.max(...computingValues) : 1200;
    const rangeMax = rangeValues.length > 0 ? Math.max(...rangeValues) : 900;

    // 给一点 padding，让气泡不贴边；最小值向下取整，最大值向上取整
    const padMax = (v: number) => Math.ceil(v * 1.08);
    const padMin = (v: number) => Math.max(0, Math.floor(v * 0.92));

    return viewPresets.map(preset => {
      if (preset.id !== 'sales-health') {
        let xMax = preset.xAxis.max ?? 0;
        let yMax = preset.yAxis.max ?? 0;
        let xMin = preset.xAxis.min ?? 0;

        if (preset.xAxis.field === 'price') {
          xMax = Math.max(xMax, padMax(priceMax));
          xMin = Math.min(xMin, padMin(priceMin));
        } else if (preset.xAxis.field === 'computingPower') {
          xMax = Math.max(xMax, padMax(computingMax));
        } else if (preset.xAxis.field === 'range') {
          xMax = Math.max(xMax, padMax(rangeMax));
        }

        if (preset.yAxis.field === 'price') {
          yMax = Math.max(yMax, padMax(priceMax));
        } else if (preset.yAxis.field === 'sales') {
          yMax = Math.max(yMax, padMax(salesMax));
        }

        return {
          ...preset,
          xAxis: { ...preset.xAxis, min: xMin, max: xMax },
          yAxis: { ...preset.yAxis, max: yMax },
        };
      }

      // sales-health: 结合 chartConfig 手动设置和实际数据动态扩展
      const xMax = Math.max(safeXAxisRange.max, padMax(priceMax));
      const xMin = Math.min(safeXAxisRange.min, padMin(priceMin));
      const yMax = Math.max(safeSalesRange.max, padMax(salesMax));
      const yMin = Math.max(0, Math.min(safeSalesRange.min, padMin(salesMin)));

      return {
        ...preset,
        xAxis: { ...preset.xAxis, min: xMin, max: xMax },
        yAxis: { ...preset.yAxis, min: yMin, max: yMax },
      };
    });
  }, [chartConfig.salesRange?.max, chartConfig.salesRange?.min, chartConfig.xAxisRange?.max, chartConfig.xAxisRange?.min, data]);

  const preset = useMemo(
    () => configuredPresets.find(p => p.id === activePreset) || configuredPresets[0],
    [activePreset, configuredPresets],
  );

  const xMean = useMemo(() => {
    if (typeof quadrant.xThreshold === 'number') return quadrant.xThreshold;
    if (quadrant.xThreshold === 'manual' && quadrant.xManualValue !== undefined) return quadrant.xManualValue;
    // 默认：轴范围的中间值（相对横纵轴固定，不随数据变化）
    const min = preset.xAxis.min ?? 0;
    const max = preset.xAxis.max ?? 100;
    return (min + max) / 2;
  }, [preset.xAxis.min, preset.xAxis.max, quadrant.xThreshold, quadrant.xManualValue]);

  const yMean = useMemo(() => {
    if (typeof quadrant.yThreshold === 'number') return quadrant.yThreshold;
    if (quadrant.yThreshold === 'manual' && quadrant.yManualValue !== undefined) return quadrant.yManualValue;
    // 默认：轴范围的中间值（相对横纵轴固定，不随数据变化）
    const min = preset.yAxis.min ?? 0;
    const max = preset.yAxis.max ?? 100;
    return (min + max) / 2;
  }, [preset.yAxis.min, preset.yAxis.max, quadrant.yThreshold, quadrant.yManualValue]);

  const displayData = useMemo(() => {
    const filtered = chartConfig.showUnselectedBrands
      ? data
      : data.filter(item => item.brand in chartConfig.highlightedBrandColors);
    return filtered.map(item => {
      const highlightedColor = chartConfig.highlightedBrandColors[item.brand];
      return {
        ...item,
        brandColor: highlightedColor || chartConfig.unselectedBrandColor,
      };
    });
  }, [data, chartConfig.highlightedBrandColors, chartConfig.unselectedBrandColor, chartConfig.showUnselectedBrands]);

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
        availabilityInfo={availabilityInfo ?? undefined}
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
