import React from 'react';
import { CircleAlert } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { PageIntro, PanelTitle, Target } from '../components/shared/Primitives';

/**
 * 量化实测视图。
 *
 * 这是全站唯一用到 recharts 的地方，而 recharts 是首屏包里最大的一块。
 * 单独拆成 chunk 并在 main.jsx 里懒加载，首屏就不用为一张只有点进
 * “量化实测”才看得到的柱状图买单。
 */

const baselineData = [
  { name: '纯 LLM', p0: 68, citation: 61 },
  { name: '纯规则', p0: 91, citation: 100 },
  { name: '规则 + 模型', p0: 95, citation: 100 }
];

export default function EvaluationView({ evaluation }) {
  return (
    <>
      <PageIntro kicker="系统验证" title="量化目标与消融对比" body="目标值、当前值和未完成项严格分栏，用于追踪系统能力边界与后续盲测结果。" />
      <section className="evaluation-grid">
        <div className="panel chart-panel">
          <PanelTitle kicker="BASELINE STUDY" title="三条基线的目标对比" action={<span className="status-chip neutral">待 120 例盲测</span>} />
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={baselineData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8e2e8" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#627786', fontSize: 12 }} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#7f919d', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#edf3f6' }} />
                <Bar dataKey="p0" name="P0 召回目标" fill="#087f9c" radius={[5, 5, 0, 0]} />
                <Bar dataKey="citation" name="证据覆盖目标" fill="#f07f6a" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel target-panel">
          <PanelTitle kicker="TARGET GATES" title="决赛版验收门槛" />
          <Target label="P0 阻断召回率" value={`≥ ${evaluation?.p0_recall_target || 95}%`} note="不能漏掉真正阻断项" />
          <Target label="错误放行率" value={`≤ ${evaluation?.false_clear_target || 2}%`} note="高风险误判为通过" />
          <Target label="引用有效率" value={`≥ ${evaluation?.citation_validity_target || 98}%`} note="条款、版本、链接可核验" />
          <Target label="端到端 P95" value={`≤ ${evaluation?.p95_latency_target || 120}s`} note="含解析、审查与输出" />
        </div>
      </section>
      <section className="panel dataset-panel">
        <PanelTitle kicker="GOLD DATASET" title={`${evaluation?.dataset_size || 120} 例评测集设计`} />
        <div className="dataset-groups">
          <div><b>30</b><span>完全合规正样本</span><small>控制错误阻断</small></div>
          <div><b>30</b><span>单一缺陷样本</span><small>定位基础召回</small></div>
          <div><b>30</b><span>多缺陷样本</span><small>测试组合规则</small></div>
          <div><b>15</b><span>资料缺失样本</span><small>测试不确定性处理</small></div>
          <div><b>15</b><span>噪声与矛盾样本</span><small>测试 OCR 与抗干扰</small></div>
        </div>
        <p className="panel-note"><CircleAlert size={15} /> 当前图表是验收目标，不是假装已经跑出的成绩；完成盲测后才写入“实测”列。</p>
      </section>
    </>
  );
}
