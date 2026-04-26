import { quadrantInfos } from '@/data/mockData';

interface QuadrantLegendProps {
  onHighlight: (type: string | null) => void;
  highlightedQuadrant: string | null;
}

export function QuadrantLegend({ onHighlight, highlightedQuadrant }: QuadrantLegendProps) {
  const items = [
    { key: 'star', info: quadrantInfos.star, icon: '🟢' },
    { key: 'premium', info: quadrantInfos.premium, icon: '🔵' },
    { key: 'edge', info: quadrantInfos.edge, icon: '⚪' },
    { key: 'volume', info: quadrantInfos.volume, icon: '🔴' },
  ];

  return (
    <div
      className="absolute bottom-5 left-5 rounded-lg p-3 space-y-2"
      style={{
        backgroundColor: 'rgba(20, 22, 27, 0.9)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-subtle)',
        zIndex: 30,
      }}
    >
      <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
        四象限解读
      </div>
      {items.map((item) => {
        const isHighlighted = highlightedQuadrant === item.key;
        return (
          <div
            key={item.key}
            className="flex items-center gap-2 cursor-pointer rounded px-1.5 py-1 transition-colors"
            style={{
              backgroundColor: isHighlighted ? `${item.info.color}15` : 'transparent',
            }}
            onMouseEnter={() => onHighlight(item.key)}
            onMouseLeave={() => onHighlight(null)}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.info.color }}
            />
            <div className="min-w-0">
              <div className="text-xs font-medium" style={{ color: item.info.color }}>
                {item.info.label}
              </div>
              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                {item.info.description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
