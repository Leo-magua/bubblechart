import { BarChart3, Brain, Zap, SlidersHorizontal } from 'lucide-react';
import type { ViewPreset } from '@/types';

interface PresetBarProps {
  presets: ViewPreset[];
  activePreset: string;
  onPresetChange: (id: string) => void;
}

const iconMap: Record<string, React.ReactNode> = {
  BarChart3: <BarChart3 className="w-3.5 h-3.5" />,
  Brain: <Brain className="w-3.5 h-3.5" />,
  Zap: <Zap className="w-3.5 h-3.5" />,
  Sliders: <SlidersHorizontal className="w-3.5 h-3.5" />,
};

export function PresetBar({ presets, activePreset, onPresetChange }: PresetBarProps) {
  return (
    <div
      className="h-12 flex items-center gap-2 px-6 shrink-0"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span className="text-xs mr-2" style={{ color: 'var(--text-muted)' }}>
        决策视角
      </span>
      {presets.map((preset) => {
        const isActive = activePreset === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => onPresetChange(preset.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-150"
            style={{
              backgroundColor: isActive ? 'rgba(0, 208, 132, 0.15)' : 'transparent',
              border: isActive ? '1px solid rgba(0, 208, 132, 0.5)' : '1px solid var(--border-medium)',
              color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
              boxShadow: isActive ? 'var(--glow-primary)' : 'none',
              transform: isActive ? 'scale(1.02)' : 'scale(1)',
            }}
          >
            {iconMap[preset.icon] || iconMap.Sliders}
            {preset.name}
          </button>
        );
      })}
      <div className="flex-1" />
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        共 44 个配置版本 · 8 个品牌
      </span>
    </div>
  );
}
