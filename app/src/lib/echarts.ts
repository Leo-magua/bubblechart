import * as echarts from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  GraphicComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 按需注册图表和组件，避免全量引入 echarts（可节省数百 KB）
echarts.use([
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  GraphicComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export * from 'echarts/core';
export type { EChartsOption } from 'echarts';
export { echarts };
export default echarts;
