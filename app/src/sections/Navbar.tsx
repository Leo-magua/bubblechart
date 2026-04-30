import { Database, RefreshCw, Upload, Compass, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MonthSelector } from '@/sections/MonthSelector';

interface AvailabilityInfo {
  latestAvailableMonth: string;
  currentMonthPublished: boolean;
  nextReleaseMonth: string;
}

interface NavbarProps {
  monthOptions: string[];
  selectedMonthIso: string;
  onMonthChange: (monthIso: string) => void;
  onAdminClick?: () => void;
  onBackClick?: () => void;
  showBack?: boolean;
  onRefresh?: () => void;
  onImport?: () => void;
  isRefreshing: boolean;
  availabilityInfo?: AvailabilityInfo;
}

export function Navbar({
  monthOptions,
  selectedMonthIso,
  onMonthChange,
  onAdminClick,
  onBackClick,
  showBack,
  onRefresh,
  onImport,
  isRefreshing,
  availabilityInfo,
}: NavbarProps) {
  return (
    <nav
      className="h-14 flex items-center justify-between px-6 shrink-0"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        zIndex: 50,
      }}
    >
      {/* 左侧 Logo + 标题 */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <Compass className="w-5 h-5" style={{ color: 'var(--text-inverse)' }} />
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            配置罗盘
          </h1>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            汽车配置级销量决策工具
          </span>
        </div>
        <div className="ml-4 flex items-center gap-1.5">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            数据月份
          </span>
          <MonthSelector
            monthOptions={monthOptions}
            selectedMonthIso={selectedMonthIso}
            onMonthChange={onMonthChange}
            disabled={isRefreshing || monthOptions.length === 0}
            availabilityInfo={availabilityInfo}
          />
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-2">
        {showBack && onBackClick && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackClick}
            className="gap-1.5 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回图表
          </Button>
        )}
        {onAdminClick && !showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAdminClick}
            className="gap-1.5 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Database className="w-3.5 h-3.5" />
            数据后台
          </Button>
        )}
        {onRefresh && !showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-1.5 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新本月数据
          </Button>
        )}
        {onImport && !showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onImport}
            className="gap-1.5 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Upload className="w-3.5 h-3.5" />
            导入数据
          </Button>
        )}
      </div>
    </nav>
  );
}
