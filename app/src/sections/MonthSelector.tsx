import { useMemo, useState, useCallback } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CalendarDays, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { formatMonthLabelCn } from '@/api/bubblechartClient';

interface AvailabilityInfo {
  latestAvailableMonth: string;
  currentMonthPublished: boolean;
  nextReleaseMonth: string;
}

interface MonthSelectorProps {
  monthOptions: string[];
  selectedMonthIso: string;
  onMonthChange: (monthIso: string) => void;
  disabled?: boolean;
  availabilityInfo?: AvailabilityInfo;
}

function groupMonthsByYear(months: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const iso of months) {
    const year = iso.slice(0, 4);
    if (!groups[year]) groups[year] = [];
    groups[year].push(iso);
  }
  Object.keys(groups).forEach(year => {
    groups[year].sort((a, b) => b.localeCompare(a));
  });
  return groups;
}

export function MonthSelector({
  monthOptions,
  selectedMonthIso,
  onMonthChange,
  disabled = false,
  availabilityInfo,
}: MonthSelectorProps) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => groupMonthsByYear(monthOptions), [monthOptions]);
  const years = useMemo(() => Object.keys(groups).sort((a, b) => b.localeCompare(a)), [groups]);
  const latestMonth = monthOptions[0] ?? '';

  const handleSelect = useCallback((iso: string) => {
    onMonthChange(iso);
    setOpen(false);
  }, [onMonthChange]);

  const currentIndex = monthOptions.indexOf(selectedMonthIso);
  const canGoPrev = currentIndex >= 0 && currentIndex < monthOptions.length - 1;
  const canGoNext = currentIndex > 0;

  const goPrev = useCallback(() => {
    if (canGoPrev) onMonthChange(monthOptions[currentIndex + 1]);
  }, [canGoPrev, currentIndex, monthOptions, onMonthChange]);

  const goNext = useCallback(() => {
    if (canGoNext) onMonthChange(monthOptions[currentIndex - 1]);
  }, [canGoNext, currentIndex, monthOptions, onMonthChange]);

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        disabled={disabled || !canGoPrev}
        onClick={goPrev}
        title="上一个月份"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || monthOptions.length === 0}
            className="h-7 min-w-[9.5rem] justify-between px-2.5 text-xs font-mono shadow-none"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 opacity-60" />
              {selectedMonthIso ? formatMonthLabelCn(selectedMonthIso) : '选择月份'}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[240px] p-0"
          align="start"
          sideOffset={4}
        >
          <Command>
            <CommandInput placeholder="搜索月份..." className="text-xs h-9" />
            <CommandList className="max-h-[320px]">
              <CommandEmpty className="text-xs py-4">未找到月份</CommandEmpty>
              {years.map(year => (
                <CommandGroup key={year} heading={`${year}年`}>
                  {groups[year].map(iso => {
                    const isSelected = iso === selectedMonthIso;
                    const isLatest = iso === latestMonth;
                    return (
                      <CommandItem
                        key={iso}
                        value={iso}
                        onSelect={() => handleSelect(iso)}
                        className="text-xs font-mono justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <span className={cn(
                            "flex h-3.5 w-3.5 items-center justify-center",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}>
                            <Check className="h-3 w-3" />
                          </span>
                          {formatMonthLabelCn(iso)}
                        </span>
                        {isLatest && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                            最新
                          </Badge>
                        )}
                        {/* 数据可用状态 */}
                        {availabilityInfo && (() => {
                          const hasData = monthOptions.includes(iso);
                          const isFuture = iso > availabilityInfo.latestAvailableMonth;
                          if (hasData) return null;
                          if (isFuture) {
                            return (
                              <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                <Clock className="h-2.5 w-2.5" />
                                预计{availabilityInfo.nextReleaseMonth.slice(5, 7)}月10日
                              </span>
                            );
                          }
                          return (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4" style={{ borderColor: 'var(--accent-warning)', color: 'var(--accent-warning)' }}>
                              无数据
                            </Badge>
                          );
                        })()}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        disabled={disabled || !canGoNext}
        onClick={goNext}
        title="下一个月份"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
