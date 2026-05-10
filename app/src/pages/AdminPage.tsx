import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast, Toaster } from 'sonner';
import { Navbar } from '@/sections/Navbar';
import {
  fetchDbInfo,
  fetchChartConfig,
  updateChartConfig,
  fetchBrands,
  fetchPreview,
  postFetchData,
  postImportFile,
  formatMonthLabelCn,
  fetchSales,
  deleteMonth,
} from '@/api/bubblechartClient';
import type { ChartAdminConfig, ConfigVersion } from '@/types';
import { Trash2, X } from 'lucide-react';

const DEFAULT_CHART_CONFIG: ChartAdminConfig = {
  xAxisRange: { min: 15, max: 60 },
  salesRange: { min: 0, max: 50000 },
  highlightedBrandColors: {},
  unselectedBrandColor: '#9CA3AF',
  showUnselectedBrands: true,
};

const TABS = [
  { id: 'db', label: '数据库状态' },
  { id: 'config', label: '图表配置' },
  { id: 'fetch', label: '抓取数据' },
  { id: 'preview', label: '数据预览' },
  { id: 'import', label: '数据导入' },
] as const;

export default function AdminPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('db');
  const isRefreshing = false;

  const [dbInfo, setDbInfo] = useState<{ data_dir: string; db_path: string; db_exists: boolean; month_table_count: number } | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartAdminConfig>(DEFAULT_CHART_CONFIG);

  // 安全获取范围配置（防御后端返回不完整 config）
  const safeXAxisRange = chartConfig.xAxisRange || DEFAULT_CHART_CONFIG.xAxisRange;
  const safeSalesRange = chartConfig.salesRange || DEFAULT_CHART_CONFIG.salesRange;
  const [knownBrands, setKnownBrands] = useState<string[]>([]);
  const [brandPalette, setBrandPalette] = useState<string[]>([]);
  const [brandSalesMap, setBrandSalesMap] = useState<Record<string, number>>({});
  const [newBrandName, setNewBrandName] = useState('');
  const [configSaving, setConfigSaving] = useState(false);

  const [fetchMonth, setFetchMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [fetchStartMonth, setFetchStartMonth] = useState('');
  const [fetchEndMonth, setFetchEndMonth] = useState('');
  const [fetchLogs, setFetchLogs] = useState<string[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);

  const [previewData, setPreviewData] = useState<{ month: string; count: number; top5: { brand: string; car_name: string; sales_num: string }[] }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUploading, setImportUploading] = useState(false);

  const [detailMonth, setDetailMonth] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<ConfigVersion[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDbInfo = useCallback(async () => {
    const res = await fetchDbInfo();
    if (res.ok) setDbInfo(res);
  }, []);

  const loadConfig = useCallback(async () => {
    const [configRes, brandsRes] = await Promise.all([fetchChartConfig(), fetchBrands()]);
    if (configRes.ok) setChartConfig(configRes.config);
    if (brandsRes.ok) {
      setKnownBrands(brandsRes.brands);
      setBrandPalette(brandsRes.palette);
      setBrandSalesMap(brandsRes.salesMap || {});
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetchPreview();
      if (res.ok) setPreviewData(res.summary);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDbInfo();
    loadConfig();
    loadPreview();
  }, [loadDbInfo, loadConfig, loadPreview]);

  const handleSaveConfig = useCallback(async () => {
    setConfigSaving(true);
    try {
      const res = await updateChartConfig(chartConfig);
      if (res.ok) {
        setChartConfig(res.config);
        toast.success('配置已保存');
      } else {
        toast.error(res.error || '保存失败');
      }
    } finally {
      setConfigSaving(false);
    }
  }, [chartConfig]);

  const handleFetch = useCallback(async () => {
    setFetchLoading(true);
    setFetchLogs(['开始抓取...']);
    try {
      const useRange = fetchStartMonth && fetchEndMonth;
      const res = await postFetchData(
        useRange ? [] : [fetchMonth],
        true,
        useRange ? fetchStartMonth : undefined,
        useRange ? fetchEndMonth : undefined
      );
      if (res.ok) {
        const lines: string[] = [];
        if (res.logs?.length) lines.push(...res.logs);
        lines.push(...res.results.map(r => `[${r.success ? '✅' : '❌'}] ${r.month}: ${r.message}`));
        setFetchLogs(lines);
        await loadDbInfo();
        await loadPreview();
      } else {
        setFetchLogs(prev => [...prev, `错误: ${res.error}`]);
      }
    } catch (e) {
      setFetchLogs(prev => [...prev, `错误: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setFetchLoading(false);
    }
  }, [fetchMonth, fetchStartMonth, fetchEndMonth, loadDbInfo, loadPreview]);

  const handleImport = useCallback(async () => {
    if (!importFile) return;
    setImportUploading(true);
    try {
      const res = await postImportFile(importFile);
      if (!res.ok) throw new Error(res.error);
      toast.success(res.message ?? `已导入 ${res.rowCount} 条`);
      setImportFile(null);
      await loadDbInfo();
      await loadPreview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImportUploading(false);
    }
  }, [importFile, loadDbInfo, loadPreview]);

  const handleDeleteMonth = useCallback(async (month: string) => {
    if (!window.confirm(`确定要删除 ${formatMonthLabelCn(month)} 的数据吗？此操作不可恢复。`)) return;
    const res = await deleteMonth(month);
    if (res.ok) {
      toast.success(res.message);
      await loadDbInfo();
      await loadPreview();
    } else {
      toast.error(res.error || '删除失败');
    }
  }, [loadDbInfo, loadPreview]);

  const handleShowDetail = useCallback(async (month: string) => {
    setDetailMonth(month);
    setDetailLoading(true);
    try {
      const res = await fetchSales(month);
      if (res.ok) {
        setDetailData(res.items);
      } else {
        toast.error(res.error || '加载详情失败');
        setDetailData(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载详情失败');
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailMonth(null);
    setDetailData(null);
  }, []);

  const toggleBrand = useCallback((brand: string) => {
    setChartConfig(prev => {
      const next = { ...prev, highlightedBrandColors: { ...prev.highlightedBrandColors } };
      if (brand in next.highlightedBrandColors) {
        delete next.highlightedBrandColors[brand];
      } else {
        const used = Object.values(next.highlightedBrandColors);
        const color = brandPalette.find(c => !used.includes(c)) || brandPalette[used.length % Math.max(brandPalette.length, 1)] || '#3B82F6';
        next.highlightedBrandColors[brand] = color;
      }
      return next;
    });
  }, [brandPalette]);

  const updateBrandColor = useCallback((brand: string, color: string) => {
    setChartConfig(prev => ({
      ...prev,
      highlightedBrandColors: { ...prev.highlightedBrandColors, [brand]: color },
    }));
  }, []);

  const addBrand = useCallback(() => {
    const name = newBrandName.trim();
    if (!name) return;
    if (!knownBrands.includes(name)) {
      setKnownBrands(prev => [...prev, name].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));
    }
    setChartConfig(prev => {
      if (name in prev.highlightedBrandColors) return prev;
      const used = Object.values(prev.highlightedBrandColors);
      const color = brandPalette.find(c => !used.includes(c)) || brandPalette[used.length % Math.max(brandPalette.length, 1)] || '#3B82F6';
      return { ...prev, highlightedBrandColors: { ...prev.highlightedBrandColors, [name]: color } };
    });
    setNewBrandName('');
  }, [newBrandName, knownBrands, brandPalette]);

  const allBrands = useMemo(() => {
    const result = [...knownBrands];
    const configBrands = Object.keys(chartConfig.highlightedBrandColors).filter(b => !knownBrands.includes(b));
    result.push(...configBrands);
    // 按总销量降序排列，无销量按名称字母序排后面
    result.sort((a, b) => {
      const salesA = brandSalesMap[a] || 0;
      const salesB = brandSalesMap[b] || 0;
      if (salesA !== salesB) return salesB - salesA;
      return a.localeCompare(b, 'zh-Hans-CN');
    });
    return result;
  }, [knownBrands, chartConfig.highlightedBrandColors, brandSalesMap]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      <Toaster richColors position="top-center" />
      <Navbar
        monthOptions={[]}
        selectedMonthIso=""
        onMonthChange={() => {}}
        showBack
        onBackClick={() => navigate('/')}
        isRefreshing={isRefreshing}
      />

      {/* Tab 导航 */}
      <div className="px-6 pt-4 pb-0 flex items-center gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-2 text-xs font-medium rounded-t-md transition-colors relative"
            style={{
              color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)',
              backgroundColor: activeTab === tab.id ? 'var(--bg-elevated)' : 'transparent',
            }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ backgroundColor: 'var(--accent-primary)' }} />
            )}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* 数据库状态 */}
          {activeTab === 'db' && (
            <div className="rounded-xl p-5 space-y-3" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>数据库状态</h3>
              {dbInfo ? (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg p-3 space-y-1" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>数据目录</p>
                    <p className="font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{dbInfo.data_dir}</p>
                  </div>
                  <div className="rounded-lg p-3 space-y-1" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>数据库路径</p>
                    <p className="font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{dbInfo.db_path}</p>
                  </div>
                  <div className="rounded-lg p-3 space-y-1" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>库是否存在</p>
                    <p className="font-medium" style={{ color: dbInfo.db_exists ? 'var(--accent-primary)' : 'var(--destructive, #ef4444)' }}>
                      {dbInfo.db_exists ? '✅ 是' : '❌ 否'}
                    </p>
                  </div>
                  <div className="rounded-lg p-3 space-y-1" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>月份表数量</p>
                    <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{dbInfo.month_table_count}</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>加载中...</p>
              )}
            </div>
          )}

          {/* 图表配置 */}
          {activeTab === 'config' && (
            <div className="space-y-4">
              <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>横轴范围</h3>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.1"
                    value={safeXAxisRange.min}
                    onChange={e => setChartConfig(prev => ({ ...prev, xAxisRange: { ...(prev.xAxisRange || DEFAULT_CHART_CONFIG.xAxisRange), min: Number(e.target.value) } }))}
                    className="w-24 h-8 px-2 text-xs font-mono rounded-md border"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>到</span>
                  <input
                    type="number"
                    step="0.1"
                    value={safeXAxisRange.max}
                    onChange={e => setChartConfig(prev => ({ ...prev, xAxisRange: { ...(prev.xAxisRange || DEFAULT_CHART_CONFIG.xAxisRange), max: Number(e.target.value) } }))}
                    className="w-24 h-8 px-2 text-xs font-mono rounded-md border"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>万（成交均价）</span>
                </div>
              </div>

              <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>主图销量范围</h3>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={safeSalesRange.min}
                    onChange={e => setChartConfig(prev => ({ ...prev, salesRange: { ...(prev.salesRange || DEFAULT_CHART_CONFIG.salesRange), min: Number(e.target.value) } }))}
                    className="w-28 h-8 px-2 text-xs font-mono rounded-md border"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>到</span>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={safeSalesRange.max}
                    onChange={e => setChartConfig(prev => ({ ...prev, salesRange: { ...(prev.salesRange || DEFAULT_CHART_CONFIG.salesRange), max: Number(e.target.value) } }))}
                    className="w-28 h-8 px-2 text-xs font-mono rounded-md border"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>台（月销量）</span>
                </div>
              </div>

              <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>品牌高亮配置</h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="输入品牌名"
                      value={newBrandName}
                      onChange={e => setNewBrandName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addBrand()}
                      className="h-8 px-2 text-xs rounded-md border"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                    <button
                      onClick={addBrand}
                      className="h-8 px-3 text-xs rounded-md font-medium"
                      style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                    >
                      添加
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={chartConfig.showUnselectedBrands}
                      onChange={e => setChartConfig(prev => ({ ...prev, showUnselectedBrands: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded shrink-0"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>显示非高亮车型</span>
                  </label>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {chartConfig.showUnselectedBrands ? '关闭后前端只显示已勾选的高亮品牌' : '开启后前端显示所有品牌，未勾选的显示为灰色'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {allBrands.map(brand => {
                    const selected = brand in chartConfig.highlightedBrandColors;
                    return (
                      <div
                        key={brand}
                        className="flex items-center gap-2 rounded-lg px-3 py-2"
                        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleBrand(brand)}
                          className="h-3.5 w-3.5 rounded shrink-0"
                        />
                        <span className="text-xs truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{brand}</span>
                        <input
                          type="color"
                          value={selected ? chartConfig.highlightedBrandColors[brand] : chartConfig.unselectedBrandColor}
                          disabled={!selected}
                          onChange={e => updateBrandColor(brand, e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0 shrink-0"
                          style={{ opacity: selected ? 1 : 0.3 }}
                        />
                      </div>
                    );
                  })}
                  {allBrands.length === 0 && (
                    <p className="text-xs col-span-full py-4 text-center" style={{ color: 'var(--text-muted)' }}>暂无品牌数据</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveConfig}
                    disabled={configSaving}
                    className="h-8 px-4 text-xs rounded-md font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                  >
                    {configSaving ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 抓取数据 */}
          {activeTab === 'fetch' && (
            <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>抓取懂车帝销量数据</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>范围抓取：</span>
                  <input
                    type="text"
                    placeholder="开始 如 202408"
                    value={fetchStartMonth}
                    onChange={e => {
                      const val = e.target.value;
                      setFetchStartMonth(val);
                      // 自动计算结束月份：开始月份 + 11个月（共12个月）
                      if (/^\d{6}$/.test(val)) {
                        const y = parseInt(val.slice(0, 4), 10);
                        const m = parseInt(val.slice(4, 6), 10);
                        if (m >= 1 && m <= 12) {
                          const endDate = new Date(y, m - 1 + 11, 1);
                          const endStr = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}`;
                          setFetchEndMonth(endStr);
                        }
                      }
                    }}
                    className="h-8 px-2 text-xs font-mono rounded-md border w-32"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>到</span>
                  <input
                    type="text"
                    placeholder="结束 如 202507"
                    value={fetchEndMonth}
                    onChange={e => setFetchEndMonth(e.target.value)}
                    className="h-8 px-2 text-xs font-mono rounded-md border w-32"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={handleFetch}
                    disabled={fetchLoading || !(fetchStartMonth && fetchEndMonth)}
                    className="h-8 px-4 text-xs rounded-md font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                  >
                    {fetchLoading ? '抓取中...' : '自动抓取范围'}
                  </button>
                  {fetchStartMonth && fetchEndMonth && (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      共 {(() => {
                        const sy = parseInt(fetchStartMonth.slice(0, 4), 10);
                        const sm = parseInt(fetchStartMonth.slice(4, 6), 10);
                        const ey = parseInt(fetchEndMonth.slice(0, 4), 10);
                        const em = parseInt(fetchEndMonth.slice(4, 6), 10);
                        const count = (ey - sy) * 12 + (em - sm) + 1;
                        return count > 0 ? `${count} 个月` : '';
                      })()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>单月抓取：</span>
                  <input
                    type="text"
                    placeholder="如 202508"
                    value={fetchMonth}
                    onChange={e => setFetchMonth(e.target.value)}
                    className="h-8 px-2 text-xs font-mono rounded-md border w-32"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={handleFetch}
                    disabled={fetchLoading}
                    className="h-8 px-4 text-xs rounded-md font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                  >
                    {fetchLoading ? '抓取中...' : '开始抓取'}
                  </button>
                  <button
                    onClick={loadPreview}
                    className="h-8 px-4 text-xs rounded-md font-medium"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >
                    刷新预览
                  </button>
                </div>
              </div>
              <div
                className="rounded-lg p-3 font-mono text-xs h-64 overflow-auto whitespace-pre-wrap"
                style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4' }}
              >
                {fetchLogs.length === 0 ? '等待操作...' : fetchLogs.join('\n')}
              </div>
            </div>
          )}

          {/* 数据预览 */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>数据预览</h3>
                <button
                  onClick={loadPreview}
                  disabled={previewLoading}
                  className="h-7 px-3 text-xs rounded-md font-medium disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  {previewLoading ? '刷新中...' : '刷新'}
                </button>
              </div>
              {previewData.length === 0 ? (
                <div className="rounded-xl p-8 text-center" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>暂无数据，请先抓取或导入。</p>
                </div>
              ) : (
                previewData.map(item => (
                  <div
                    key={item.month}
                    className="rounded-xl p-4 space-y-3 cursor-pointer transition-colors"
                    style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
                    onClick={() => handleShowDetail(item.month)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-medium"
                          style={{ backgroundColor: 'rgba(0,208,132,0.15)', color: 'var(--accent-primary)' }}
                        >
                          {formatMonthLabelCn(item.month)}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>共 {item.count} 条记录</span>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          void handleDeleteMonth(item.month);
                        }}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        title="删除该月数据"
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--destructive, #ef4444)';
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>品牌</th>
                            <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>车型</th>
                            <th className="text-right py-2 px-2 font-medium" style={{ color: 'var(--text-muted)' }}>销量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.top5.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{row.brand}</td>
                              <td className="py-2 px-2" style={{ color: 'var(--text-primary)' }}>{row.car_name}</td>
                              <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{row.sales_num}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 数据导入 */}
          {activeTab === 'import' && (
            <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>导入数据</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                支持 CSV、Excel 格式。系统会自动识别车型、配置、销量、价格等字段，并将数据写入对应月份的数据库表。
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                className="text-xs block"
                style={{ color: 'var(--text-secondary)' }}
              />
              {importFile && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>已选择: {importFile.name}</span>
                  <button
                    onClick={handleImport}
                    disabled={importUploading}
                    className="h-7 px-3 text-xs rounded-md font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
                  >
                    {importUploading ? '导入中...' : '开始导入'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 数据详情弹窗 */}
      {detailMonth && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(11, 12, 15, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
          }}
          onClick={handleCloseDetail}
        >
          <div
            className="w-[900px] max-w-[calc(100%-2rem)] max-h-[80vh] flex flex-col rounded-xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              boxShadow: 'var(--shadow-elevated)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {formatMonthLabelCn(detailMonth)} 数据详情
              </h2>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 内容 */}
            <div className="flex-1 overflow-auto px-6 py-4">
              {detailLoading ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>加载中...</p>
              ) : !detailData || detailData.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>暂无数据</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <th className="text-left py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>品牌</th>
                        <th className="text-left py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>车型</th>
                        <th className="text-left py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>级别</th>
                        <th className="text-left py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>价格区间</th>
                        <th className="text-right py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>均价(万)</th>
                        <th className="text-right py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>销量</th>
                        <th className="text-left py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>能源类型</th>
                        <th className="text-right py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>算力</th>
                        <th className="text-right py-2 px-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>续航(km)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td className="py-2 px-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{row.brand}</td>
                          <td className="py-2 px-2 whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{row.model}</td>
                          <td className="py-2 px-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{row.level}</td>
                          <td className="py-2 px-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{row.priceRange || '-'}</td>
                          <td className="py-2 px-2 text-right font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{row.price}</td>
                          <td className="py-2 px-2 text-right font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{row.sales}</td>
                          <td className="py-2 px-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{row.powerType}</td>
                          <td className="py-2 px-2 text-right font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{row.computingPower ?? '-'}</td>
                          <td className="py-2 px-2 text-right font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{row.range ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
