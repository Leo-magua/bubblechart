import type { ConfigVersion, ViewPreset, QuadrantInfo } from '@/types';

export const BRAND_COLORS: Record<string, string> = {
  '理想': '#00D084',
  '问界': '#3B82F6',
  '特斯拉': '#EF4444',
  '小鹏': '#06B6D4',
  '蔚来': '#8B5CF6',
  '比亚迪': '#F59E0B',
  '极氪': '#EC4899',
  '小米': '#FF6B35',
};

export const mockData: ConfigVersion[] = [
  // 理想
  { id: '1', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L9', configName: 'Ultra', fullName: '理想 L9 Ultra', price: 45.2, sales: 3200, computingPower: 508, range: 215, level: '大型SUV', powerType: '增程', month: '2026-03' },
  { id: '2', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L9', configName: 'Pro', fullName: '理想 L9 Pro', price: 38.5, sales: 4800, computingPower: 128, range: 215, level: '大型SUV', powerType: '增程', month: '2026-03' },
  { id: '3', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L9', configName: 'Max', fullName: '理想 L9 Max', price: 42.8, sales: 1600, computingPower: 508, range: 215, level: '大型SUV', powerType: '增程', month: '2026-03' },
  { id: '4', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L8', configName: 'Ultra', fullName: '理想 L8 Ultra', price: 38.9, sales: 2100, computingPower: 508, range: 210, level: '中大型SUV', powerType: '增程', month: '2026-03' },
  { id: '5', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L8', configName: 'Pro', fullName: '理想 L8 Pro', price: 32.5, sales: 3600, computingPower: 128, range: 210, level: '中大型SUV', powerType: '增程', month: '2026-03' },
  { id: '6', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L7', configName: 'Ultra', fullName: '理想 L7 Ultra', price: 35.8, sales: 2800, computingPower: 508, range: 225, level: '中大型SUV', powerType: '增程', month: '2026-03' },
  { id: '7', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L7', configName: 'Pro', fullName: '理想 L7 Pro', price: 29.8, sales: 5200, computingPower: 128, range: 225, level: '中大型SUV', powerType: '增程', month: '2026-03' },
  { id: '8', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L6', configName: 'Max', fullName: '理想 L6 Max', price: 26.8, sales: 6800, computingPower: 508, range: 212, level: '中型SUV', powerType: '增程', month: '2026-03' },
  { id: '9', brand: '理想', brandColor: BRAND_COLORS['理想'], model: 'L6', configName: 'Pro', fullName: '理想 L6 Pro', price: 23.8, sales: 8500, computingPower: 128, range: 212, level: '中型SUV', powerType: '增程', month: '2026-03' },

  // 问界
  { id: '10', brand: '问界', brandColor: BRAND_COLORS['问界'], model: 'M9', configName: '纯电 Ultra', fullName: '问界 M9 纯电 Ultra', price: 48.6, sales: 2100, computingPower: 400, range: 630, level: '大型SUV', powerType: '纯电', month: '2026-03' },
  { id: '11', brand: '问界', brandColor: BRAND_COLORS['问界'], model: 'M9', configName: '增程 Pro', fullName: '问界 M9 增程 Pro', price: 42.8, sales: 3500, computingPower: 200, range: 225, level: '大型SUV', powerType: '增程', month: '2026-03' },
  { id: '12', brand: '问界', brandColor: BRAND_COLORS['问界'], model: 'M9', configName: '增程 Ultra', fullName: '问界 M9 增程 Ultra', price: 46.8, sales: 1800, computingPower: 400, range: 225, level: '大型SUV', powerType: '增程', month: '2026-03' },
  { id: '13', brand: '问界', brandColor: BRAND_COLORS['问界'], model: 'M7', configName: 'Ultra', fullName: '问界 M7 Ultra', price: 32.8, sales: 4200, computingPower: 200, range: 210, level: '中大型SUV', powerType: '增程', month: '2026-03' },
  { id: '14', brand: '问界', brandColor: BRAND_COLORS['问界'], model: 'M7', configName: 'Pro', fullName: '问界 M7 Pro', price: 26.8, sales: 5800, computingPower: 128, range: 210, level: '中大型SUV', powerType: '增程', month: '2026-03' },
  { id: '15', brand: '问界', brandColor: BRAND_COLORS['问界'], model: 'M5', configName: 'Max', fullName: '问界 M5 Max', price: 28.8, sales: 1500, computingPower: 200, range: 255, level: '中型SUV', powerType: '增程', month: '2026-03' },

  // 特斯拉
  { id: '16', brand: '特斯拉', brandColor: BRAND_COLORS['特斯拉'], model: 'Model Y', configName: '长续航', fullName: '特斯拉 Model Y 长续航', price: 29.9, sales: 12500, computingPower: 144, range: 688, level: '中型SUV', powerType: '纯电', month: '2026-03' },
  { id: '17', brand: '特斯拉', brandColor: BRAND_COLORS['特斯拉'], model: 'Model Y', configName: '后驱', fullName: '特斯拉 Model Y 后驱', price: 24.9, sales: 15800, computingPower: 144, range: 554, level: '中型SUV', powerType: '纯电', month: '2026-03' },
  { id: '18', brand: '特斯拉', brandColor: BRAND_COLORS['特斯拉'], model: 'Model Y', configName: '高性能', fullName: '特斯拉 Model Y 高性能', price: 35.9, sales: 3200, computingPower: 500, range: 615, level: '中型SUV', powerType: '纯电', month: '2026-03' },
  { id: '19', brand: '特斯拉', brandColor: BRAND_COLORS['特斯拉'], model: 'Model 3', configName: '长续航', fullName: '特斯拉 Model 3 长续航', price: 27.6, sales: 8900, computingPower: 144, range: 713, level: '中型轿车', powerType: '纯电', month: '2026-03' },
  { id: '20', brand: '特斯拉', brandColor: BRAND_COLORS['特斯拉'], model: 'Model 3', configName: '后驱', fullName: '特斯拉 Model 3 后驱', price: 23.2, sales: 10200, computingPower: 144, range: 606, level: '中型轿车', powerType: '纯电', month: '2026-03' },

  // 小鹏
  { id: '21', brand: '小鹏', brandColor: BRAND_COLORS['小鹏'], model: 'G9', configName: '702 Max', fullName: '小鹏 G9 702 Max', price: 32.6, sales: 1800, computingPower: 508, range: 702, level: '中大型SUV', powerType: '纯电', month: '2026-03' },
  { id: '22', brand: '小鹏', brandColor: BRAND_COLORS['小鹏'], model: 'G9', configName: '570 Pro', fullName: '小鹏 G9 570 Pro', price: 28.6, sales: 1200, computingPower: 254, range: 570, level: '中大型SUV', powerType: '纯电', month: '2026-03' },
  { id: '23', brand: '小鹏', brandColor: BRAND_COLORS['小鹏'], model: 'P7+', configName: 'Max', fullName: '小鹏 P7+ Max', price: 22.8, sales: 3100, computingPower: 508, range: 725, level: '中型轿车', powerType: '纯电', month: '2026-03' },
  { id: '24', brand: '小鹏', brandColor: BRAND_COLORS['小鹏'], model: 'P7+', configName: 'Pro', fullName: '小鹏 P7+ Pro', price: 19.8, sales: 2400, computingPower: 254, range: 615, level: '中型轿车', powerType: '纯电', month: '2026-03' },
  { id: '25', brand: '小鹏', brandColor: BRAND_COLORS['小鹏'], model: 'X9', configName: 'Max', fullName: '小鹏 X9 Max', price: 39.8, sales: 900, computingPower: 508, range: 702, level: '中大型MPV', powerType: '纯电', month: '2026-03' },

  // 蔚来
  { id: '26', brand: '蔚来', brandColor: BRAND_COLORS['蔚来'], model: 'ES8', configName: '签名版', fullName: '蔚来 ES8 签名版', price: 52.8, sales: 980, computingPower: 1016, range: 565, level: '大型SUV', powerType: '纯电', month: '2026-03' },
  { id: '27', brand: '蔚来', brandColor: BRAND_COLORS['蔚来'], model: 'ES8', configName: '行政版', fullName: '蔚来 ES8 行政版', price: 48.8, sales: 720, computingPower: 1016, range: 565, level: '大型SUV', powerType: '纯电', month: '2026-03' },
  { id: '28', brand: '蔚来', brandColor: BRAND_COLORS['蔚来'], model: 'ES6', configName: '签名版', fullName: '蔚来 ES6 签名版', price: 39.6, sales: 1500, computingPower: 1016, range: 625, level: '中型SUV', powerType: '纯电', month: '2026-03' },
  { id: '29', brand: '蔚来', brandColor: BRAND_COLORS['蔚来'], model: 'ET5', configName: '旅行版', fullName: '蔚来 ET5 旅行版', price: 32.8, sales: 1100, computingPower: 1016, range: 680, level: '中型轿车', powerType: '纯电', month: '2026-03' },
  { id: '30', brand: '蔚来', brandColor: BRAND_COLORS['蔚来'], model: 'ET7', configName: '行政版', fullName: '蔚来 ET7 行政版', price: 45.8, sales: 650, computingPower: 1016, range: 705, level: '中大型轿车', powerType: '纯电', month: '2026-03' },

  // 比亚迪
  { id: '31', brand: '比亚迪', brandColor: BRAND_COLORS['比亚迪'], model: '汉 EV', configName: '冠军版', fullName: '比亚迪 汉 EV 冠军版', price: 22.8, sales: 6200, computingPower: 128, range: 715, level: '中大型轿车', powerType: '纯电', month: '2026-03' },
  { id: '32', brand: '比亚迪', brandColor: BRAND_COLORS['比亚迪'], model: '汉 EV', configName: '荣耀版', fullName: '比亚迪 汉 EV 荣耀版', price: 19.8, sales: 7800, computingPower: 128, range: 506, level: '中大型轿车', powerType: '纯电', month: '2026-03' },
  { id: '33', brand: '比亚迪', brandColor: BRAND_COLORS['比亚迪'], model: '唐 DM-i', configName: '冠军版', fullName: '比亚迪 唐 DM-i 冠军版', price: 21.8, sales: 4500, computingPower: 128, range: 200, level: '中大型SUV', powerType: '插混', month: '2026-03' },
  { id: '34', brand: '比亚迪', brandColor: BRAND_COLORS['比亚迪'], model: '海豹', configName: '荣耀版', fullName: '比亚迪 海豹 荣耀版', price: 18.5, sales: 3400, computingPower: 128, range: 700, level: '中型轿车', powerType: '纯电', month: '2026-03' },
  { id: '35', brand: '比亚迪', brandColor: BRAND_COLORS['比亚迪'], model: '宋L', configName: '旗舰版', fullName: '比亚迪 宋L 旗舰版', price: 24.8, sales: 2100, computingPower: 128, range: 662, level: '中型SUV', powerType: '纯电', month: '2026-03' },

  // 极氪
  { id: '36', brand: '极氪', brandColor: BRAND_COLORS['极氪'], model: '001', configName: 'YOU版', fullName: '极氪 001 YOU版', price: 34.9, sales: 1600, computingPower: 508, range: 750, level: '中大型轿车', powerType: '纯电', month: '2026-03' },
  { id: '37', brand: '极氪', brandColor: BRAND_COLORS['极氪'], model: '001', configName: 'ME版', fullName: '极氪 001 ME版', price: 30.9, sales: 1100, computingPower: 508, range: 675, level: '中大型轿车', powerType: '纯电', month: '2026-03' },
  { id: '38', brand: '极氪', brandColor: BRAND_COLORS['极氪'], model: '007', configName: '四驱版', fullName: '极氪 007 四驱版', price: 25.9, sales: 950, computingPower: 508, range: 616, level: '中型轿车', powerType: '纯电', month: '2026-03' },
  { id: '39', brand: '极氪', brandColor: BRAND_COLORS['极氪'], model: '009', configName: '光辉版', fullName: '极氪 009 光辉版', price: 56.8, sales: 380, computingPower: 508, range: 702, level: '中大型MPV', powerType: '纯电', month: '2026-03' },

  // 小米
  { id: '40', brand: '小米', brandColor: BRAND_COLORS['小米'], model: 'SU7', configName: 'Max', fullName: '小米 SU7 Max', price: 29.9, sales: 5200, computingPower: 508, range: 800, level: '中大型轿车', powerType: '纯电', month: '2026-03' },
  { id: '41', brand: '小米', brandColor: BRAND_COLORS['小米'], model: 'SU7', configName: 'Pro', fullName: '小米 SU7 Pro', price: 25.9, sales: 6800, computingPower: 254, range: 830, level: '中大型轿车', powerType: '纯电', month: '2026-03' },
  { id: '42', brand: '小米', brandColor: BRAND_COLORS['小米'], model: 'SU7', configName: '标准版', fullName: '小米 SU7 标准版', price: 21.6, sales: 8200, computingPower: 128, range: 700, level: '中大型轿车', powerType: '纯电', month: '2026-03' },
  { id: '43', brand: '小米', brandColor: BRAND_COLORS['小米'], model: 'YU7', configName: 'Max', fullName: '小米 YU7 Max', price: 32.9, sales: 2100, computingPower: 508, range: 760, level: '中大型SUV', powerType: '纯电', month: '2026-03' },
  { id: '44', brand: '小米', brandColor: BRAND_COLORS['小米'], model: 'YU7', configName: 'Pro', fullName: '小米 YU7 Pro', price: 27.9, sales: 2900, computingPower: 254, range: 820, level: '中大型SUV', powerType: '纯电', month: '2026-03' },
];

export const viewPresets: ViewPreset[] = [
  {
    id: 'sales-health',
    name: '销量健康度',
    icon: 'BarChart3',
    xAxis: { field: 'price', label: '成交均价', unit: '万', min: 15, max: 60 },
    yAxis: { field: 'sales', label: '月销量', unit: '台', min: 0, max: 18000 },
    bubbleSize: { field: 'sales', label: '月销量' },
  },
  {
    id: 'ads-competitiveness',
    name: '智驾竞争力',
    icon: 'Brain',
    xAxis: { field: 'computingPower', label: '智驾算力', unit: 'TOPS', min: 0, max: 1200 },
    yAxis: { field: 'price', label: '成交均价', unit: '万', min: 15, max: 60 },
    bubbleSize: { field: 'sales', label: '月销量' },
  },
  {
    id: 'range-value',
    name: '续航价值力',
    icon: 'Zap',
    xAxis: { field: 'range', label: '续航里程', unit: 'km', min: 150, max: 900 },
    yAxis: { field: 'price', label: '成交均价', unit: '万', min: 15, max: 60 },
    bubbleSize: { field: 'sales', label: '月销量' },
  },
];

export const quadrantInfos: Record<string, QuadrantInfo> = {
  star: {
    type: 'star',
    label: '量价齐高',
    color: '#00D084',
    description: '核心利润区，要守住',
    action: '持续投入资源，扩大优势',
  },
  premium: {
    type: 'premium',
    label: '溢价配置',
    color: '#3B82F6',
    description: '利润补充还是未跑通？',
    action: '评估是否值得继续投入',
  },
  edge: {
    type: 'edge',
    label: '边缘配置',
    color: '#94A3B8',
    description: '考虑精简SKU',
    action: '评估是否停产或合并',
  },
  volume: {
    type: 'volume',
    label: '以价换量',
    color: '#EF4444',
    description: '走量但拉低品牌均价',
    action: '考虑提价或精简配置',
  },
};
