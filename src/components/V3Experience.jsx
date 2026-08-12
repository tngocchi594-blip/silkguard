import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Check, CircleAlert, FileText, Search,
  ShieldCheck, Sparkles, UploadCloud, X
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

const DEFAULT_MARKETS = [
  { id: 'eu', name_zh: '欧盟', name_en: 'European Union', flag: '🇪🇺', risk_level: 'medium_high', advisory_score: 78, coverage_tier: 'official_deterministic', certifications: ['CE', 'RoHS', 'REACH'] },
  { id: 'united-states', name_zh: '美国', name_en: 'United States', flag: '🇺🇸', risk_level: 'medium_high', advisory_score: 72, coverage_tier: 'advisory_only', certifications: ['FCC', 'UL', 'CPSC'] },
  { id: 'japan', name_zh: '日本', name_en: 'Japan', flag: '🇯🇵', risk_level: 'medium', advisory_score: 70, coverage_tier: 'advisory_only', certifications: ['PSE', 'TELEC'] },
  { id: 'united-kingdom', name_zh: '英国', name_en: 'United Kingdom', flag: '🇬🇧', risk_level: 'medium', advisory_score: 69, coverage_tier: 'advisory_only', certifications: ['UKCA', 'UK REACH'] },
];

const coverageCopy = (tier) => tier === 'official_deterministic' ? '官方规则判定' : '市场情报预研';

function Reveal({ as = 'section', className = '', children, ...props }) {
  const reduce = useReducedMotion();
  const Component = motion[as] || motion.section;
  return (
    <Component
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </Component>
  );
}

export function V3Landing({ markets = [], offline, caseData, onEnter, onDemo }) {
  useEffect(() => {
    if (!window.location.hash) return undefined;
    const timer = window.setTimeout(() => {
      document.querySelector(window.location.hash)?.scrollIntoView({ block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);

  const marketRows = (markets.length ? markets : DEFAULT_MARKETS).slice(0, 4);
  const requirements = {
    eu: 'CE 标志、符合性声明、REACH、RoHS、GPSR',
    'united-states': 'FCC、UL / ETL、CPSC、州级要求',
    japan: 'PSE、JIS、化学物质管控、产品安全法',
    'united-kingdom': 'UKCA、UK REACH、产品安全与标准合规'
  };

  return (
    <div className="taste-site">
      <header className="taste-header">
        <button className="taste-wordmark" aria-label="返回首页" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <b>SilkGuard</b><span>/</span><small>丝路智审</small>
        </button>
        <nav aria-label="网站导航">
          <a href="#product">产品</a>
          <a href="#workflow">审查路径</a>
          <a href="#markets">市场</a>
          <a href="#case">案例</a>
        </nav>
        <button className="taste-header-cta" onClick={() => onEnter('agent')}>开始审查</button>
      </header>

      <main id="main">
        <section className="taste-hero" aria-labelledby="taste-hero-title">
          <div className="taste-hero-copy">
            <h1 id="taste-hero-title">让商品合规，<br />成为可交付的证据。</h1>
            <p>提交商品资料，完成市场匹配、规则审查、整改与复检。</p>
            <button className="taste-primary" onClick={() => onEnter('agent')}>开始审查 <ArrowRight size={16} /></button>
          </div>
          <picture className="taste-hero-media">
            <source media="(max-width: 720px)" srcSet="/assets/brand/evidence-dossier-900.webp" />
            <img src="/assets/brand/evidence-dossier-1600.webp" width="1600" height="900" fetchPriority="high" alt="由纸质技术文件、金属索引条和蓝色证据标签组成的合规资料包" />
          </picture>
        </section>

        <Reveal className="taste-product" id="product">
          <div className="taste-section-copy">
            <h2>一宗审查，持续到放行。</h2>
            <p>从市场匹配到复检放行，任务、证据和结论在同一工作台闭环管理。</p>
          </div>
          <div className="taste-product-frame">
            <span className="taste-side-note">证据可回溯</span>
            <MissionPreview caseData={caseData} />
          </div>
        </Reveal>

        <Reveal className="taste-workflow" id="workflow">
          <div className="taste-section-copy">
            <h2>不是回答问题。<br />是完成审查。</h2>
            <p>市场匹配、证据判定、整改协同和增量复检连续执行。</p>
          </div>
          <div className="taste-rail">
            <picture>
              <source media="(max-width: 720px)" srcSet="/assets/brand/evidence-rail-1000.webp" />
              <img src="/assets/brand/evidence-rail-1800.webp" width="1800" height="771" loading="lazy" decoding="async" alt="用于传递技术文件的四段金属证据导轨" />
            </picture>
            <div className="taste-rail-labels" aria-label="审查工作方式">
              <span><b>选择市场</b><small>匹配适用要求</small></span>
              <span><b>审查证据</b><small>判定充分有效</small></span>
              <span><b>执行整改</b><small>生成任务并跟踪</small></span>
              <span><b>复检放行</b><small>验证闭环完成</small></span>
            </div>
          </div>
          <button className="taste-text-link" onClick={() => onEnter('agent')}>查看工作方式 <ArrowRight size={15} /></button>
        </Reveal>

        <Reveal className="taste-markets" id="markets">
          <div className="taste-section-copy">
            <h2>先确认市场，再给出结论。</h2>
            <p>示例市场按证据等级管理，正式判定只使用可追溯规则包。</p>
          </div>
          <div className="taste-market-index" role="table" aria-label="市场证据覆盖示例">
            <div className="taste-market-head" role="row"><span>市场</span><span>关键要求</span><span>证据等级</span></div>
            {marketRows.map((market) => (
              <button className={market.coverage_tier === 'official_deterministic' ? 'official' : ''} role="row" key={market.id} onClick={() => onEnter('markets')}>
                <span role="cell"><b>{market.name_zh}</b><small>{market.name_en}</small></span>
                <span role="cell">{requirements[market.id] || market.certifications?.join('、') || '市场准入要求'}</span>
                <span role="cell">{market.coverage_tier === 'official_deterministic' ? '官方规则判定' : '权威来源预研'}</span>
              </button>
            ))}
          </div>
          <button className="taste-text-link" onClick={() => onEnter('markets')}>查看市场目录 <ArrowRight size={15} /></button>
        </Reveal>

        <Reveal className="taste-case" id="case">
          <figure>
            <picture>
              <source media="(max-width: 720px)" srcSet="/assets/brand/aeris-inspection-720.webp" />
              <img src="/assets/brand/aeris-inspection-1200.webp" width="1200" height="900" loading="lazy" decoding="async" alt="置于技术检验台上的 AERIS H1 高速吹风机演示样机" />
            </picture>
            <figcaption>AERIS H1 高速吹风机，欧盟上市前预审</figcaption>
          </figure>
          <div className="taste-case-copy">
            <h2>发现问题后，直接进入整改。</h2>
            <p>基于欧盟预市场合规清单定位问题，并生成可跟踪的整改任务。</p>
            <dl>
              <div><dt>EU DoC</dt><dd>缺失</dd></div>
              <div><dt>EMC 报告</dt><dd>待补充</dd></div>
              <div><dt>绝对化安全宣称</dt><dd>待修改</dd></div>
            </dl>
            <button className="taste-text-link" onClick={onDemo}>查看整改案例 <ArrowRight size={15} /></button>
          </div>
        </Reveal>

        <Reveal className="taste-closing">
          <h2>把第一宗审查，<br />交给证据。</h2>
          <button className="taste-primary" onClick={() => onEnter('agent')}>开始审查 <ArrowRight size={16} /></button>
          <button className="taste-text-link" onClick={onDemo}>查看演示案例</button>
          <div className="taste-closing-art" aria-hidden="true"><i /></div>
        </Reveal>
      </main>

      <footer className="taste-footer">
        <div className="taste-footer-brand"><b>SilkGuard</b><small>丝路智审</small></div>
        <nav aria-label="页脚导航"><a href="#product">产品</a><button onClick={() => onEnter('markets')}>市场与规则</button><button onClick={() => onEnter('sources')}>法规来源</button></nav>
        <p>内部上市准备度工具，不替代法律意见</p>
      </footer>
    </div>
  );
}

function MissionPreview({ caseData }) {
  const findings = caseData?.findings || [];
  const reduce = useReducedMotion();
  return (
    <motion.div className="v3-mission-preview" initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: reduce ? 0 : .65, ease: [0.16, 1, 0.3, 1] }}>
      <div className="v3-window-bar"><span>AERIS H1 / 欧盟上市前预审</span><b>审查中</b></div>
      <div className="v3-window-body">
        <aside>
          <strong>商品审查</strong>
          {['任务概览', '处理进度', '法规依据', '整改动作'].map((item, i) => <span className={i === 1 ? 'active' : ''} key={item}>{item}</span>)}
        </aside>
        <section>
          <div className="v3-mission-head">
            <div><small>目标市场 / 欧盟</small><h3>AERIS H1 上市前合规预审</h3></div>
            <span><ShieldCheck size={14} />官方规则判定</span>
          </div>
          <div className="v3-tool-stack">
            {[
              ['适用市场已确认', '欧盟'],
              ['认证要求已匹配', 'CE、RoHS、REACH'],
              ['规则审查已完成', `${findings.length || 8} 个问题`],
              ['整改任务已生成', '等待处理'],
            ].map(([title, note], i) => (
              <div key={title}><span>{i < 3 ? <Check size={12} /> : <Sparkles size={12} />}</span><b>{title}</b><small>{note}</small></div>
            ))}
          </div>
          <div className="v3-preview-result">
            <span><CircleAlert size={14} />等待人工放行</span>
            <b>下一步：补齐 EU DoC 与 EMC 报告</b>
          </div>
        </section>
      </div>
    </motion.div>
  );
}

export function AgentMissionControl({ markets = [], onRun, onOpenCase, busy }) {
  const options = markets.length ? markets : DEFAULT_MARKETS;
  const [form, setForm] = useState({
    product_name: 'AERIS H1 高速负离子吹风机',
    market_id: options.find((item) => item.id === 'eu')?.id || options[0]?.id || 'eu',
    platform: 'Amazon EU',
    category: '个护电器',
    objective: '上市前合规审查'
  });
  const [run, setRun] = useState(null);
  const [files, setFiles] = useState([]);
  const selected = options.find((item) => item.id === form.market_id) || options[0];

  const execute = async () => {
    const result = await onRun(form, files);
    if (result) setRun(result);
  };

  return (
    <div className="client-terminal">
      <header className="terminal-heading">
        <div>
          <span>商品合规审查</span>
          <h1>{run ? '审查结果' : '创建一宗审查'}</h1>
          <p>{run ? `${form.product_name} · ${selected?.name_zh}` : '填写商品信息并添加现有资料，系统将自动完成规则检查和整改规划。'}</p>
        </div>
        <div className="terminal-service-state"><i /><span>服务正常</span></div>
      </header>

      {!run ? (
        <div className="terminal-entry">
          <section className="terminal-form-card">
            <div className="terminal-card-title"><b>商品与市场</b><span>带 * 为必填项</span></div>
            <label>商品名称 *<input value={form.product_name} onChange={(event) => setForm({ ...form, product_name: event.target.value })} /></label>
            <div className="terminal-field-row">
              <label>目标市场 *<select value={form.market_id} onChange={(event) => setForm({ ...form, market_id: event.target.value })}>
                {options.map((item) => <option key={item.id} value={item.id}>{item.flag} {item.name_zh} · {item.name_en}</option>)}
              </select></label>
              <label>销售平台 *<input value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })} /></label>
            </div>
            <div className="terminal-field-row">
              <label>商品类别<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
              <label>审查目的<input value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} /></label>
            </div>

            <div className="terminal-upload">
              <input
                id="terminal-files"
                type="file"
                multiple
                aria-describedby="terminal-files-help"
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
              <label htmlFor="terminal-files">
                <UploadCloud size={22} />
                <span><b>添加商品资料</b><small id="terminal-files-help">测试报告、说明书、标签、产品图片或 Listing 文案</small></span>
                <em>选择文件</em>
              </label>
              {files.length > 0 && (
                <div className="terminal-file-list">
                  {files.map((file) => (
                    <div key={`${file.name}-${file.size}`}><FileText size={14} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small><button aria-label={`移除 ${file.name}`} onClick={() => setFiles((items) => items.filter((item) => item !== file))}><X size={13} /></button></div>
                  ))}
                </div>
              )}
            </div>

            <div className={`terminal-coverage ${selected?.coverage_tier === 'official_deterministic' ? 'official' : 'advisory'}`}>
              <ShieldCheck size={17} />
              <div><b>{selected?.coverage_tier === 'official_deterministic' ? '可执行规则审查' : '可执行市场预审'}</b><span>{selected?.coverage_tier === 'official_deterministic' ? '当前市场已配置可追溯规则来源' : '正式放行前需要补充该市场的官方规则来源'}</span></div>
            </div>
            <button className="terminal-submit" disabled={!!busy || !form.product_name.trim()} onClick={execute}>
              {busy ? '正在创建任务并解析资料…' : '开始审查'} <ArrowRight size={16} />
            </button>
          </section>

          <aside className="terminal-route-card terminal-scope-card">
            <picture className="terminal-scope-media">
              <source media="(max-width: 760px)" srcSet="/assets/brand/evidence-dossier-900.webp" />
              <img src="/assets/brand/evidence-dossier-1600.webp" width="1600" height="900" loading="lazy" decoding="async" alt="由技术文件、金属索引条和蓝色证据标签组成的合规资料包" />
            </picture>
            <div className="terminal-route-copy">
              <span>目标市场</span><b>{selected?.name_zh || '目标市场'}</b>
              <p>{selected?.certifications?.slice(0, 4).join(' / ') || '认证要求将在审查中确认'}</p>
            </div>
            <div className="terminal-scope-intro"><b>本次审查会完成</b><p>识别适用要求，检查证据完整性，并生成可跟踪的整改任务。</p></div>
            <div className="terminal-scope-list">
              {['识别商品与适用范围', '检查准入、标签和宣称', '绑定法规来源与版本', '生成整改动作与复检任务'].map((item, index) => (
                <div key={item}><span>{index + 1}</span><b>{item}</b></div>
              ))}
            </div>
            <div className="terminal-scope-foot"><span>证据等级</span><b>{selected?.coverage_tier === 'official_deterministic' ? '官方规则判定' : '权威来源预研'}</b></div>
          </aside>
        </div>
      ) : (
        <TerminalResult run={run} onOpenCase={onOpenCase} onReset={() => { setRun(null); setFiles([]); }} />
      )}
    </div>
  );
}

function TerminalResult({ run, onOpenCase, onReset }) {
  const openFindings = run.findings || [];
  return (
    <div className="terminal-result" role="status" aria-live="polite">
      <section className="terminal-result-summary">
        <div className="terminal-result-score">
          <span>{run.coverage.can_issue_compliance_decision ? '内部审查完成' : '市场预审完成'}</span>
          <strong>{openFindings.length}</strong>
          <small>项需要处理</small>
        </div>
        <div className="terminal-result-copy">
          <h2>{run.synthesis.summary}</h2>
          <p>{run.coverage.warning}</p>
          <div>
            <button onClick={onReset}>审查另一个商品</button>
            <button className="primary" onClick={() => onOpenCase?.(run.mission.case_id)}>进入整改任务 <ArrowRight size={14} /></button>
          </div>
        </div>
        <div className="terminal-result-route">
          <img src="/assets/brand/evidence-dossier-900.webp" width="900" height="506" loading="lazy" decoding="async" alt="已完成审查的合规证据资料包" />
        </div>
      </section>

      <div className="terminal-result-grid">
        <section className="terminal-progress-panel">
          <div className="terminal-section-title"><b>处理进度</b><span>任务记录已生成</span></div>
          <div className="terminal-progress-list">
            {run.tool_calls.map((tool, index) => (
              <article key={tool.id}>
                <span className={tool.status}>{tool.status === 'complete' ? <Check size={13} /> : index + 1}</span>
                <div><b>{tool.label}</b><p>{tool.output}</p></div>
              </article>
            ))}
          </div>
        </section>
        <section className="terminal-actions-panel">
          <div className="terminal-section-title"><b>建议先处理</b><span>{run.synthesis.next_actions?.length || 0} 项</span></div>
          <div className="terminal-action-list">
            {(run.synthesis.next_actions || []).map((item, index) => <article key={item}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></article>)}
          </div>
        </section>
      </div>
    </div>
  );
}

export function MarketCoverage({ markets = [] }) {
  const items = markets.length ? markets : DEFAULT_MARKETS;
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('all');
  const filtered = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.name_zh} ${item.name_en} ${(item.certifications || []).join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchesTier = tier === 'all' || item.coverage_tier === tier;
    return matchesQuery && matchesTier;
  }), [items, query, tier]);
  const official = items.filter((item) => item.coverage_tier === 'official_deterministic').length;
  return (
    <div className="market-page">
      <section className="market-head">
        <div><h1>{items.length} 个示例市场，两种证据等级。</h1></div>
        <div className="market-stats"><p><b>{items.length}</b>市场画像</p><p><b>{official}</b>官方规则覆盖</p><p><b>{items.length - official}</b>待建设规则包</p></div>
      </section>
      <section className="market-controls">
        <label><Search size={16} /><input placeholder="搜索国家、认证或风险" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <div>{[['all', '全部'], ['official_deterministic', '官方判定'], ['advisory_only', '情报预研']].map(([id, label]) => <button className={tier === id ? 'active' : ''} onClick={() => setTier(id)} key={id}>{label}</button>)}</div>
      </section>
      <section className="market-table">
        <header><span>市场</span><span>风险评分</span><span>认证线索</span><span>证据等级</span></header>
        {filtered.map((item) => (
          <article key={item.id}>
            <div className="market-name"><i>{item.flag}</i><span><b>{item.name_zh}</b><small>{item.name_en}</small></span></div>
            <div className="market-score"><b>{item.advisory_score}</b><span>{item.risk_level === 'high' ? '高风险' : item.risk_level === 'medium_high' ? '中高风险' : item.risk_level === 'medium' ? '中风险' : '常规关注'}</span></div>
            <div className="market-certs">{(item.certifications || []).slice(0, 4).map((cert) => <span key={cert}>{cert}</span>)}</div>
            <div><span className={`market-tier ${item.coverage_tier}`}>{coverageCopy(item.coverage_tier)}</span></div>
          </article>
        ))}
      </section>
      <p className="market-disclosure">来源说明：市场档案用于咨询级预研；“官方规则判定”仅表示当前已绑定可追溯规则包，不代表政府认证或法律意见。</p>
    </div>
  );
}
