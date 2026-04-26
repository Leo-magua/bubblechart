interface FooterBarProps {
  totalConfigs: number;
  totalBrands: number;
  dataSource: string;
  currentMonth: string;
}

export function FooterBar({ totalConfigs, totalBrands, dataSource, currentMonth }: FooterBarProps) {
  return (
    <div
      className="h-7 flex items-center justify-between px-6 shrink-0 text-xs"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
      }}
    >
      <div className="flex items-center gap-1">
        <span>已加载</span>
        <span className="font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>{totalConfigs}</span>
        <span>个配置版本 ·</span>
        <span className="font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>{totalBrands}</span>
        <span>个品牌</span>
      </div>
      <div className="flex items-center gap-1">
        <span>数据来源：</span>
        <span style={{ color: 'var(--text-secondary)' }}>{dataSource}</span>
        <span>·</span>
        <span style={{ color: 'var(--text-secondary)' }}>{currentMonth}</span>
      </div>
    </div>
  );
}
