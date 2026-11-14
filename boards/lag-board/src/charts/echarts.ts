import * as echarts from 'echarts/core';
import { CustomChart, HeatmapChart, LineChart } from 'echarts/charts';
import {
  AxisPointerComponent, GridComponent, MarkAreaComponent, MarkLineComponent,
  TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart, HeatmapChart, CustomChart, GridComponent, TooltipComponent, VisualMapComponent,
  MarkLineComponent, MarkAreaComponent, AxisPointerComponent, CanvasRenderer,
]);

export { echarts };
export type { EChartsCoreOption as Option, ECharts } from 'echarts/core';
