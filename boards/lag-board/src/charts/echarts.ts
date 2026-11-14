import * as echarts from 'echarts/core';
import { BarChart, CustomChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  AxisPointerComponent, GraphicComponent, GridComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent,
  TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart, HeatmapChart, CustomChart, BarChart, ScatterChart, GridComponent, TooltipComponent, VisualMapComponent,
  MarkLineComponent, MarkAreaComponent, MarkPointComponent, GraphicComponent, AxisPointerComponent, CanvasRenderer,
]);

export { echarts };
export type { EChartsCoreOption as Option, ECharts } from 'echarts/core';
