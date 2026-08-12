import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  ExternalLink,
  FileCheck2,
  FileSearch,
  FlaskConical,
  FolderKanban,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Plus,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { AgentMissionControl, MarketCoverage, V3Landing } from './components/V3Experience';
import { EmptyState, PageIntro, PanelTitle } from './components/shared/Primitives';

// recharts 只服务“量化实测”这一个视图，单独成 chunk，首屏不为它买单
const EvaluationView = React.lazy(() => import('./views/EvaluationView'));
import './styles/globals.css';

const API = '/api/v2';

const fallbackCase = {
  id: 'case-eu-hairdryer-001',
  sku: 'SG-ELEC-001',
  brand: 'AERIS',
  product_name: '高速负离子吹风机',
  market: '欧盟 · 德国',
  platform: 'Amazon EU',
  category: '智能小家电 / 个护电器',
  status: 'blocked',
  status_label: '存在阻断项',
  readiness: 34,
  current_stage: '整改中',
  updated_at: '2026-07-29T10:20:00+00:00',
  findings: [
    {
      id: 'offline-finding-1',
      rule_id: 'EU-LVD-DOC-001',
      severity: 'P0',
      title: '缺少欧盟符合性声明（EU DoC）',
      category: '准入文件',
      status: 'open',
      trigger_excerpt: '当前资料清单未找到：EU Declaration of Conformity',
      evidence_quote: '制造商应编制技术文件，完成适用的符合性评定，并签署欧盟符合性声明。',
      source_name: 'Directive 2014/35/EU · Article 6 & Annex IV',
      source_url: 'https://eur-lex.europa.eu/eli/dir/2014/35/oj',
      source_authority: 'EUR-Lex / European Union',
      effective_date: '2016-04-20',
      action: '补充与当前型号一致的 EU DoC，列出适用法规、协调标准、制造商、签署人和日期。',
      needs_human_review: true
    },
    {
      id: 'offline-finding-2',
      rule_id: 'EU-EMC-TEST-001',
      severity: 'P0',
      title: '缺少 EMC 电磁兼容证据',
      category: '技术文件',
      status: 'open',
      trigger_excerpt: '当前资料清单未找到：EMC 测试报告',
      evidence_quote: '投放市场的设备应符合电磁兼容基本要求，并保留支持符合性声明的技术文件。',
      source_name: 'Directive 2014/30/EU',
      source_url: 'https://eur-lex.europa.eu/eli/dir/2014/30/oj',
      source_authority: 'EUR-Lex / European Union',
      effective_date: '2016-04-20',
      action: '提供适用于该型号的 EMC 测试报告、采用标准、实验室与报告编号。',
      needs_human_review: true
    },
    {
      id: 'offline-finding-3',
      rule_id: 'AMZ-CLAIM-ABS-001',
      severity: 'P1',
      title: 'Listing 含无法证实的绝对化安全承诺',
      category: '平台文案',
      status: 'open',
      trigger_excerpt: 'Listing 命中表述：“guarantees safe”',
      evidence_quote: '平台字段与商品信息应真实、准确，并能由产品资料支持。',
      source_name: 'Amazon SP-API · Product Type Definitions',
      source_url: 'https://developer-docs.amazon.com/sp-api/lang-en_EN/docs/retrieve-a-product-type-definition',
      source_authority: 'Amazon',
      effective_date: '2026-07-01',
      action: '删除绝对安全承诺，改为可由结构、测试或说明书支持的客观功能描述。',
      needs_human_review: false
    }
  ],
  events: [
    { id: 1, stage: 'ingest', label: '资料接收与字段解析', status: 'complete', detail: '已识别 3 份资料与 5 个标签字段' },
    { id: 2, stage: 'scope', label: '市场与规则包定位', status: 'complete', detail: '欧盟 · 智能小家电 · Amazon EU' },
    { id: 3, stage: 'evidence', label: '官方证据检索', status: 'complete', detail: '已绑定 EUR-Lex 与 Amazon 官方来源' },
    { id: 4, stage: 'audit', label: '确定性规则审查', status: 'complete', detail: '完成 8 项核心控制检查' },
    { id: 5, stage: 'review', label: '高风险人工复核', status: 'attention', detail: '4 个 P0 项待复核' },
    { id: 6, stage: 'remediation', label: '整改任务执行', status: 'active', detail: '等待补件和 Listing 修改' },
    { id: 7, stage: 'recheck', label: '增量复检与放行', status: 'pending', detail: '整改完成后自动进入' }
  ]
};

const fallbackIntegrations = [
  ['deepseek', 'DeepSeek API', '模型推理', 'needs_key', '结构化解释、整改建议与 Listing 草稿。', 'https://platform.deepseek.com/'],
  ['eurlex', 'EUR-Lex / CELLAR', '官方法规', 'public', '欧盟法规原文、版本与生效信息。', 'https://eur-lex.europa.eu/content/tools/webservices/index.html'],
  ['safetygate', 'EU Safety Gate', '产品安全', 'public', '危险产品通报与召回案例开放数据。', 'https://ec.europa.eu/safety-gate-alerts/screen/webReport'],
  ['amazon', 'Amazon Selling Partner API', '平台规则', 'needs_oauth', '商品类型定义、字段要求与 Listing Issues。', 'https://sellercentral.amazon.com/sellingpartner/developerconsole'],
  ['feishu', '飞书开放平台', '整改协同', 'needs_key', '问题、负责人、期限和复检状态闭环。', 'https://open.feishu.cn/app'],
  ['paddleocr', 'PaddleOCR 3.x', '本地文档解析', 'optional_local', '在本地解析铭牌、PDF 和测试报告。', 'https://paddlepaddle.github.io/PaddleOCR/main/en/quick_start.html']
].map(([id, name, category, status, description, register_url]) => ({
  id, name, category, status, description, register_url, required_env: []
}));

const fallbackSources = fallbackCase.findings.map((finding, index) => ({
  id: `source-${index}`,
  source_name: finding.source_name,
  authority: finding.source_authority,
  jurisdiction: finding.source_authority.includes('EUR') ? 'EU' : 'Platform',
  source_url: finding.source_url,
  effective_date: finding.effective_date,
  retrieved_at: '2026-07-29T08:00:00+00:00',
  status: 'bundled_snapshot'
}));

const fallbackDashboard = {
  cases: [fallbackCase],
  summary: {
    active_cases: 1,
    open_findings: 8,
    p0_findings: 4,
    average_readiness: 34,
    evidence_coverage: 100
  },
  evaluation: {
    dataset_size: 120,
    p0_recall_target: 95,
    false_clear_target: 2,
    citation_validity_target: 98,
    p95_latency_target: 120,
    status: 'benchmark_ready',
    note: '目标值与当前实测值严格分栏，避免把目标包装成结果。'
  }
};

const NAV_ITEMS = [
  { id: 'agent', label: '新建审查', hint: '提交商品与资料', icon: Bot },
  { id: 'cases', label: '审查任务', hint: '查看进度与整改', icon: FolderKanban },
  { id: 'markets', label: '市场与规则', hint: '查询准入要求', icon: Globe2 },
  { id: 'sources', label: '法规来源', hint: '查看依据与版本', icon: BookOpenCheck },
  { id: 'command', label: '运营概览', hint: '任务与风险汇总', icon: LayoutDashboard }
];

async function api(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${API}${path}`, {
    headers: isFormData
      ? { ...(options.headers || {}) }
      : { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

function cnTime(value) {
  if (!value) return '刚刚';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function severityLabel(severity) {
  return severity === 'P0' ? '阻断' : severity === 'P1' ? '整改' : '观察';
}

function statusCopy(status) {
  return {
    connected: '已连接',
    public: '公开可用',
    optional_local: '本地可选',
    needs_key: '等待密钥',
    needs_oauth: '等待授权',
    public_later: '下一阶段'
  }[status] || status;
}

function App() {
  const initialRoute = window.location.pathname.match(/^\/app\/([^/]+)/);
  const initialView = initialRoute?.[1] && [...NAV_ITEMS.map((item) => item.id), 'evaluation', 'integrations'].includes(initialRoute[1]) ? initialRoute[1] : 'agent';
  const [entered, setEntered] = useState(window.location.pathname.startsWith('/app'));
  const [view, setView] = useState(initialView);
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [cases, setCases] = useState([fallbackCase]);
  const [activeCase, setActiveCase] = useState(fallbackCase);
  const [integrations, setIntegrations] = useState(fallbackIntegrations);
  const [sources, setSources] = useState(fallbackSources);
  const [markets, setMarkets] = useState([]);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [narrowNav, setNarrowNav] = useState(false);
  const menuButtonRef = useRef(null);
  const navCloseButtonRef = useRef(null);

  const navigate = (nextView, { replace = false } = {}) => {
    const nextPath = `/app/${nextView}`;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
    setEntered(true);
    setView(nextView);
  };

  const goPublic = ({ replace = false } = {}) => {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', '/');
    setEntered(false);
    setNavOpen(false);
  };

  useEffect(() => {
    const syncRoute = () => {
      const match = window.location.pathname.match(/^\/app\/([^/]+)/);
      if (!match) {
        setEntered(false);
        setNavOpen(false);
        return;
      }
      const next = [...NAV_ITEMS.map((item) => item.id), 'evaluation', 'integrations'].includes(match[1]) ? match[1] : 'agent';
      setEntered(true);
      setView(next);
      setNavOpen(false);
    };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const sync = () => setNarrowNav(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!narrowNav || !navOpen) return undefined;
    navCloseButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setNavOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [narrowNav, navOpen]);

  const loadAll = async () => {
    try {
      const [dashboardData, integrationsData, sourcesData, marketsData] = await Promise.all([
        api('/dashboard'),
        api('/integrations'),
        api('/sources'),
        api('/markets')
      ]);
      const caseList = dashboardData.cases || [];
      const detail = caseList[0] ? await api(`/cases/${caseList[0].id}`) : null;
      setDashboard(dashboardData);
      setCases(caseList);
      if (detail) setActiveCase(detail);
      setIntegrations(integrationsData);
      setSources(sourcesData);
      setMarkets(marketsData.markets || []);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  };

  useEffect(() => {
    if (entered) loadAll();
  }, [entered]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [entered, view]);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const execute = async (name, task, success) => {
    setBusy(name);
    try {
      const result = await task();
      if (result?.findings) {
        setActiveCase(result);
        setCases((items) => items.map((item) => item.id === result.id ? result : item));
      }
      notify(success);
      setOffline(false);
      return result;
    } catch (error) {
      notify(error.message || '操作失败');
      return null;
    } finally {
      setBusy('');
    }
  };

  const testDeepSeek = async () => {
    setBusy('deepseek-test');
    try {
      const result = await api('/integrations/deepseek/test', { method: 'POST' });
      notify(
        result.ok
          ? `DeepSeek ${result.model} 实际推理连接成功`
          : `DeepSeek 连接失败：${result.error || 'unknown_error'}${result.status_code ? ` · HTTP ${result.status_code}` : ''}`
      );
      await loadAll();
      return result;
    } catch (error) {
      notify(error.message || 'DeepSeek 连接测试失败');
      return null;
    } finally {
      setBusy('');
    }
  };

  const selectCase = async (item) => {
    navigate('cases');
    setNavOpen(false);
    if (offline) {
      setActiveCase(item.findings ? item : fallbackCase);
      return;
    }
    setBusy('case');
    try {
      setActiveCase(await api(`/cases/${item.id}`));
      setOffline(false);
    } catch {
      setActiveCase(item.findings ? item : fallbackCase);
      setOffline(true);
      notify('后端暂不可用，已打开可交互演示案件');
    } finally {
      setBusy('');
    }
  };

  const page = {
    agent: (
      <AgentMissionControl
        markets={markets}
        busy={busy}
        onOpenCase={(caseId) => selectCase({ id: caseId })}
        onRun={async (payload, files = []) => {
          setBusy('agent-run');
          try {
            const market = markets.find((item) => item.id === payload.market_id);
            const created = await api('/cases', {
              method: 'POST',
              body: JSON.stringify({
                sku: `SG-${Date.now().toString().slice(-8)}`,
                brand: '待识别品牌',
                product_name: payload.product_name,
                market: market?.name_zh || payload.market_id,
                platform: payload.platform,
                category: payload.category,
                claims: '',
                documents: []
              })
            });
            for (const file of files) {
              const form = new FormData();
              form.append('file', file);
              await api(`/cases/${created.id}/documents`, { method: 'POST', body: form });
            }
            const audited = await api(`/cases/${created.id}/run`, { method: 'POST' });
            const result = await api('/agent/runs', {
              method: 'POST',
              body: JSON.stringify({ ...payload, case_id: created.id })
            });
            setActiveCase(audited);
            setCases((items) => [audited, ...items.filter((item) => item.id !== audited.id)]);
            notify('审查完成，结果已写入任务记录');
            return result;
          } catch (error) {
            notify(error.message || '审查任务执行失败');
            return null;
          } finally {
            setBusy('');
          }
        }}
      />
    ),
    markets: <MarketCoverage markets={markets} />,
    command: (
      <CommandCenter
        dashboard={dashboard}
        activeCase={activeCase}
        cases={cases}
        integrations={integrations}
        onCase={selectCase}
        onView={navigate}
        onNew={() => setModal(true)}
      />
    ),
    cases: (
      <CaseWorkspace
        caseData={activeCase}
        busy={busy}
        onRun={() => execute('run', () => api(`/cases/${activeCase.id}/run`, { method: 'POST' }), '规则与证据审查已完成')}
        onRecheck={() => execute('recheck', () => api(`/cases/${activeCase.id}/recheck`, { method: 'POST' }), '增量复检已完成')}
        onResolve={(finding) => execute(
          finding.id,
          () => api(`/cases/${activeCase.id}/findings/${finding.id}/resolve`, {
            method: 'POST',
            body: JSON.stringify({ note: '已核验整改材料并关闭该问题' })
          }),
          '问题已关闭并写入审计轨迹'
        )}
        onAi={() => execute('ai', () => api(`/cases/${activeCase.id}/ai-summary`, { method: 'POST' }), 'AI 整改摘要已生成').then((result) => result && notify(result.summary))}
        onFeishu={() => execute('feishu', () => api(`/cases/${activeCase.id}/feishu-sync`, { method: 'POST' }), '飞书任务同步流程已执行')}
        onUpload={(file) => execute('upload', async () => {
          const form = new FormData();
          form.append('file', file);
          await api(`/cases/${activeCase.id}/documents`, { method: 'POST', body: form });
          return api(`/cases/${activeCase.id}`);
        }, `${file.name} 已解析并写入案件资料包`)}
      />
    ),
    sources: <SourcesView sources={sources} onVerify={() => execute('verify', () => api('/sources/verify', { method: 'POST' }), '官方来源连通性检查完成')} busy={busy} />,
    evaluation: (
      <React.Suspense fallback={<div className="panel" role="status" aria-live="polite">正在载入实测图表…</div>}>
        <EvaluationView evaluation={dashboard.evaluation} />
      </React.Suspense>
    ),
    integrations: <IntegrationsView integrations={integrations} onTestDeepSeek={testDeepSeek} busy={busy} />
  }[view];

  if (!entered) {
    return (
      <V3Landing
        markets={[]}
        offline={offline}
        caseData={fallbackCase}
        onEnter={(nextView = 'agent') => {
          navigate(nextView);
        }}
        onDemo={() => {
          selectCase(activeCase);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside id="workspace-navigation" className={`sidebar ${navOpen ? 'sidebar-open' : ''}`} aria-hidden={narrowNav && !navOpen} inert={narrowNav && !navOpen ? true : undefined}>
        <div className="sidebar-brand-row">
          <button className="brand-lockup brand-button" onClick={() => goPublic()} aria-label="返回 SilkGuard 首页">
            <span className="workspace-wordmark"><strong>SilkGuard</strong><i>/</i><b>丝路智审</b></span>
          </button>
          <button ref={navCloseButtonRef} className="mobile-close" onClick={() => { setNavOpen(false); window.requestAnimationFrame(() => menuButtonRef.current?.focus()); }} aria-label="关闭导航"><X size={20} /></button>
        </div>
        <div className="nav-caption">工作区</div>
        <nav>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                onClick={() => { navigate(item.id); setNavOpen(false); }}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span><b>{item.label}</b><small>{item.hint}</small></span>
                {view === item.id && <motion.i layoutId="nav-indicator" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="trust-card">
          <div className="trust-icon"><Database size={17} /></div>
          <div>
            <b>人工放行保护</b>
            <span>高风险结论必须复核</span>
          </div>
          <CheckCircle2 size={17} className="trust-check" />
        </div>
        <div className="admin-links" aria-label="管理员工具">
          <button onClick={() => { navigate('evaluation'); setNavOpen(false); }}><FlaskConical size={15} />系统评测</button>
          <button onClick={() => { navigate('integrations'); setNavOpen(false); }}><PlugZap size={15} />连接管理</button>
        </div>
        <div className="sidebar-foot">
          <span className={offline ? 'dot-warn' : 'dot-live'} />
          {offline ? '服务暂不可用' : '服务运行正常'}
        </div>
      </aside>

      <main id="main" className="main-canvas">
        <header className="topbar">
          <button ref={menuButtonRef} className="menu-button" onClick={() => setNavOpen(true)} aria-label="打开导航" aria-controls="workspace-navigation" aria-expanded={navOpen}><Menu size={21} /></button>
          <div className="context-title">
            <span>商品合规终端</span>
            <b>{NAV_ITEMS.find((item) => item.id === view)?.label}</b>
          </div>
          <div className="topbar-actions">
            <button className="quiet-button" onClick={loadAll} aria-label="刷新当前数据"><RefreshCw size={17} /></button>
            <button className="primary-button compact" onClick={() => navigate('agent')}><Plus size={17} />新建审查</button>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            className="page-wrap"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
          >
            {page}
          </motion.div>
        </AnimatePresence>
      </main>

      {narrowNav && navOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => { setNavOpen(false); window.requestAnimationFrame(() => menuButtonRef.current?.focus()); }} />}

      <AnimatePresence>
        {modal && (
          <CreateCaseModal
            onClose={() => setModal(false)}
            onSubmit={async (payload) => {
              const created = await execute(
                'create',
                () => api('/cases', { method: 'POST', body: JSON.stringify(payload) }),
                '新案件已创建'
              );
              if (created) {
                setModal(false);
                setActiveCase(created);
                setCases((items) => [created, ...items]);
                navigate('cases');
              }
            }}
            busy={busy}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && <motion.div className="toast" role="status" aria-live="polite" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={17} />{toast}</motion.div>}
      </AnimatePresence>
      {busy && <div className="global-busy" role="status" aria-live="polite"><LoaderCircle className="spin" size={18} />执行中</div>}
    </div>
  );
}

function CommandCenter({ dashboard, activeCase, cases, integrations, onCase, onView, onNew }) {
  const connected = integrations.filter((item) => ['connected', 'public', 'optional_local'].includes(item.status)).length;
  const summary = dashboard.summary;
  return (
    <>
      <section className="hero-grid">
        <div className="hero-panel">
          <div className="command-hero-copy">
            <div className="command-hero-label"><span aria-hidden="true" /> 运营概览</div>
            <h1>让每一个出海结论，<br /><em>都有证据和下一步。</em></h1>
            <p>从资料接收、法规匹配、确定性审查，到人工复核、飞书整改与增量复检。SilkGuard 管理的是一个完整案件，不是一次聊天。</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => onCase(activeCase)}>进入当前案件 <ArrowRight size={17} /></button>
              <button className="text-button" onClick={() => onView('sources')}>查看证据源 <ArrowUpRight size={16} /></button>
            </div>
            <div className="hero-proof">
              <span><CheckCircle2 size={15} /> 规则负责判定</span>
              <span><CheckCircle2 size={15} /> AI 负责解释</span>
              <span><CheckCircle2 size={15} /> 人工负责放行</span>
            </div>
          </div>
          <picture className="command-hero-media">
            <source media="(max-width: 760px)" srcSet="/assets/brand/command-evidence-v1-720.webp" />
            <img src="/assets/brand/command-evidence-v1-1200.webp" alt="法规资料、检测报告与证据索引组成的合规工作台" width="1200" height="800" loading="eager" fetchPriority="high" />
          </picture>
        </div>
        <div className="live-case-card">
          <div className="card-head">
            <div><span>当前案件</span><b>{activeCase?.sku}</b></div>
            <span className="status-chip danger"><CircleAlert size={14} />{activeCase?.status_label}</span>
          </div>
          <div className="case-product">
            <div className="product-orb"><FileSearch size={27} /></div>
            <div><small>{activeCase?.brand}</small><h3>{activeCase?.product_name}</h3><p>{activeCase?.market} · {activeCase?.platform}</p></div>
          </div>
          <div className="readiness-row">
            <ReadinessRing value={activeCase?.readiness || 0} />
            <div className="readiness-copy">
              <span>内部准入准备度</span>
              <strong>{activeCase?.readiness}<small>/100</small></strong>
              <p>该指数不等同于法律结论</p>
            </div>
          </div>
          <div className="mini-stats">
            <div><span>P0 阻断</span><b>{activeCase?.findings?.filter((item) => item.severity === 'P0' && item.status !== 'resolved').length || summary.p0_findings}</b></div>
            <div><span>证据覆盖</span><b>{summary.evidence_coverage}%</b></div>
            <div><span>当前阶段</span><b>{activeCase?.current_stage}</b></div>
          </div>
          <button className="case-link" onClick={() => onCase(activeCase)}>查看证据与整改链路 <ChevronRight size={17} /></button>
        </div>
      </section>

      <section className="metric-strip">
        <Metric icon={FolderKanban} label="活跃案件" value={summary.active_cases} detail="有状态、可追溯" />
        <Metric icon={CircleAlert} label="待处理问题" value={summary.open_findings} detail={`${summary.p0_findings} 个阻断项`} tone="warn" />
        <Metric icon={BookOpenCheck} label="证据覆盖率" value={`${summary.evidence_coverage}%`} detail="问题均绑定官方来源" tone="green" />
        <Metric icon={PlugZap} label="已就绪连接" value={`${connected}/${integrations.length}`} detail="无凭证仍可离线演示" />
      </section>

      <section className="content-grid">
        <div className="panel cases-panel">
          <PanelTitle kicker="案件队列" title="合规案件队列" action={<button className="text-button" onClick={onNew}>新建案件 <Plus size={15} /></button>} />
          <div className="case-table">
            <div className="table-header"><span>SKU / 商品</span><span>市场与平台</span><span>准备度</span><span>状态</span><span /></div>
            {cases.map((item) => (
              <button className="table-row" key={item.id} onClick={() => onCase(item)}>
                <span><b>{item.sku}</b><small>{item.product_name}</small></span>
                <span><b>{item.market}</b><small>{item.platform}</small></span>
                <span><b>{item.readiness}</b><i><u style={{ width: `${item.readiness}%` }} /></i></span>
                <span><em className={`case-status ${item.status}`}>{item.status_label}</em><small>{cnTime(item.updated_at)} 更新</small></span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </div>
        <div className="panel workflow-preview">
          <PanelTitle kicker="执行轨迹" title="本次执行轨迹" />
          <div className="trace-list">
            {(activeCase?.events || []).slice(-5).map((event, index) => (
              <div className={`trace-item ${event.status}`} key={`${event.id}-${index}`}>
                <span className="trace-node">{event.status === 'complete' ? <Check size={13} /> : index + 1}</span>
                <div><b>{event.label}</b><small>{event.detail}</small></div>
                <span>{event.status === 'active' ? '进行中' : event.status === 'pending' ? '等待' : '完成'}</span>
              </div>
            ))}
          </div>
          <button className="soft-button full" onClick={() => onCase(activeCase)}>打开完整案件轨迹 <ArrowRight size={16} /></button>
        </div>
      </section>
    </>
  );
}

function CaseWorkspace({ caseData, busy, onRun, onRecheck, onResolve, onAi, onFeishu, onUpload }) {
  const [tab, setTab] = useState('findings');
  const openFindings = (caseData?.findings || []).filter((item) => item.status !== 'resolved');
  const tabs = [
    ['findings', `问题与证据 ${openFindings.length}`],
    ['workflow', '智能体轨迹'],
    ['materials', '资料包'],
    ['report', '审查输出']
  ];
  const onTabKeyDown = (event, currentId) => {
    const index = tabs.findIndex(([id]) => id === currentId);
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextId = tabs[nextIndex][0];
    setTab(nextId);
    window.requestAnimationFrame(() => document.getElementById(`case-tab-${nextId}`)?.focus());
  };
  return (
    <>
      <section className="case-header">
        <div className="case-header-copy">
          <div className="breadcrumb">合规案件 <ChevronRight size={14} /> {caseData?.sku}</div>
          <h1>{caseData?.product_name}</h1>
          <p>{caseData?.brand} · {caseData?.category} · {caseData?.market} · {caseData?.platform}</p>
        </div>
        <picture className="case-header-product">
          <source media="(max-width: 760px)" srcSet="/assets/brand/aeris-case-header-v1-720.webp" />
          <img src="/assets/brand/aeris-case-header-v1-1200.webp" alt="AERIS H1 高速负离子吹风机检测台商品图" width="1200" height="800" loading="eager" />
        </picture>
        <div className="case-header-actions">
          <button className="soft-button" onClick={onAi}><Bot size={17} />生成整改摘要</button>
          <button className="soft-button" onClick={onFeishu}><PlugZap size={17} />同步飞书</button>
          <button className="primary-button" onClick={onRecheck}><RefreshCw size={17} />增量复检</button>
        </div>
      </section>

      <section className="case-overview-grid">
        <div className="panel score-panel">
          <div className="score-top">
            <ReadinessRing value={caseData?.readiness || 0} large />
            <div><span>内部准入准备度</span><strong>{caseData?.readiness}<small>/100</small></strong><em className={`case-status ${caseData?.status}`}>{caseData?.status_label}</em></div>
          </div>
          <p className="panel-note"><CircleAlert size={15} /> 该指数用于排序整改优先级，不代表认证结论或法律意见。</p>
        </div>
        <div className="panel count-panel">
          <div><span>P0 阻断</span><strong>{openFindings.filter((item) => item.severity === 'P0').length}</strong><small>必须人工复核</small></div>
          <div><span>P1 整改</span><strong>{openFindings.filter((item) => item.severity === 'P1').length}</strong><small>完成后复检</small></div>
          <div><span>证据覆盖</span><strong>100%</strong><small>每项均有来源</small></div>
        </div>
        <div className="panel next-panel">
          <div className="eyebrow"><Activity size={14} /> 优先处理</div>
          <h3>先补齐技术文件，再修改平台文案</h3>
          <p>阻断项集中在 EU DoC、EMC、LVD 与责任主体信息；关闭后系统仅重跑受影响控制。</p>
          <button className="text-button" onClick={onRun}>重新执行全部控制 <ArrowUpRight size={15} /></button>
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label="案件详情">
        {tabs.map(([id, label]) => (
          <button
            id={`case-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`case-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? 'active' : ''}
            key={id}
            onClick={() => setTab(id)}
            onKeyDown={(event) => onTabKeyDown(event, id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div id={`case-panel-${tab}`} role="tabpanel" aria-labelledby={`case-tab-${tab}`} tabIndex={0}>
      {tab === 'findings' && (
        <section className="finding-layout">
          <div className="findings-list">
            {openFindings.map((finding, index) => (
              <motion.article className={`finding-card severity-${finding.severity}`} key={finding.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                <div className="finding-top">
                  <span className="severity-badge">{finding.severity} · {severityLabel(finding.severity)}</span>
                  <span className="rule-id">{finding.rule_id}</span>
                  {finding.needs_human_review && <span className="human-chip">人工复核</span>}
                </div>
                <h3>{finding.title}</h3>
                <p className="trigger-line"><FileSearch size={16} />{finding.trigger_excerpt}</p>
                <div className="evidence-box">
                  <span>适用证据</span>
                  <blockquote>{finding.evidence_quote}</blockquote>
                  <a href={finding.source_url} target="_blank" rel="noreferrer">
                    {finding.source_name} <ExternalLink size={14} />
                  </a>
                  <small>{finding.source_authority} · 生效/版本 {finding.effective_date}</small>
                </div>
                <div className="action-box"><span>整改动作</span><p>{finding.action}</p></div>
                <div className="finding-actions">
                  <button className="primary-button compact" disabled={busy === finding.id} onClick={() => onResolve(finding)}>
                    {busy === finding.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}核验并关闭
                  </button>
                </div>
              </motion.article>
            ))}
            {!openFindings.length && <EmptyState icon={CheckCircle2} title="阻断与整改项均已关闭" body="现在可以进行最终复检并生成内部准入报告。" />}
          </div>
          <aside className="case-aside">
            <div className="panel sticky-panel">
              <PanelTitle kicker="案件关系" title="当前案件图谱" />
              <div className="relation-list">
                <span>商品<b>{caseData?.product_name}</b></span>
                <i />
                <span>市场<b>{caseData?.market}</b></span>
                <i />
                <span>审查依据<b>{caseData?.market?.includes('欧盟') ? '欧盟智能小家电规则包' : '市场情报预研档案'}</b></span>
                <i />
                <span>平台<b>{caseData?.platform}</b></span>
              </div>
              <div className="aside-divider" />
              <span className="aside-label">本次审查边界</span>
              <p>上市前资料、标签、平台文案预审；不替代实验室检测、认证机构或律师意见。</p>
            </div>
          </aside>
        </section>
      )}

      {tab === 'workflow' && <WorkflowView events={caseData?.events || []} />}
      {tab === 'materials' && <MaterialsView caseData={caseData} onUpload={onUpload} busy={busy} />}
      {tab === 'report' && <ReportView caseData={caseData} onAi={onAi} />}
      </div>
    </>
  );
}

function WorkflowView({ events }) {
  return (
    <section className="panel workflow-full">
      <PanelTitle kicker="审查执行图" title="有边界的智能体执行图" action={<span className="status-chip neutral">可重放 · 可审计</span>} />
      <div className="workflow-rail">
        {events.map((event, index) => (
          <div className={`workflow-step ${event.status}`} key={`${event.id}-${index}`}>
            <span className="step-index">{event.status === 'complete' ? <Check size={15} /> : index + 1}</span>
            <div><small>{event.stage.toUpperCase()}</small><h3>{event.label}</h3><p>{event.detail}</p></div>
            <span className="workflow-time">{event.status === 'active' ? '进行中' : event.status === 'pending' ? '等待上游' : '已写入轨迹'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MaterialsView({ caseData, onUpload, busy }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const previewUrl = useMemo(
    () => selectedFile?.type?.startsWith('image/') ? URL.createObjectURL(selectedFile) : '',
    [selectedFile]
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowed = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'image/jpeg',
      'image/png',
      'image/webp'
    ];
    if (!allowed.includes(file.type) && !/\.(md|txt|csv|json|pdf)$/i.test(file.name)) {
      setFileError('支持 PDF、TXT、Markdown、CSV、JSON、JPG、PNG 与 WebP。');
      setSelectedFile(null);
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setFileError('单个文件不能超过 12 MB。');
      setSelectedFile(null);
      return;
    }
    setFileError('');
    setSelectedFile(file);
  };

  const submitFile = async () => {
    if (!selectedFile || !onUpload) return;
    const result = await onUpload(selectedFile);
    if (result) setSelectedFile(null);
  };
  const uploadedByName = new Map(
    (caseData?.uploaded_files || []).map((document) => [document.file_name, document])
  );
  const materialRecords = (caseData?.documents || []).map((document) => (
    typeof document === 'string' ? uploadedByName.get(document) || document : document
  ));

  return (
    <section className="materials-grid">
      <div className="panel">
        <PanelTitle
          kicker="资料输入"
          title="案件资料包"
          action={(
            <label className="soft-button file-picker">
              <UploadCloud size={16} />选择资料
              <input
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,image/jpeg,image/png,image/webp"
                onChange={chooseFile}
              />
            </label>
          )}
        />
        {fileError && <div className="upload-error"><CircleAlert size={15} />{fileError}</div>}
        {selectedFile && (
          <motion.div className="upload-preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {previewUrl
              ? <img src={previewUrl} alt="待上传资料预览" />
              : <div className="upload-file-icon"><FileSearch size={28} /></div>}
            <div>
              <small>UPLOAD PREVIEW</small>
              <b>{selectedFile.name}</b>
              <span>{selectedFile.type || 'document'} · {(selectedFile.size / 1024).toFixed(1)} KB</span>
            </div>
            <div className="upload-preview-actions">
              <button className="text-button" onClick={() => setSelectedFile(null)}>移除</button>
              <button className="primary-button compact" disabled={busy === 'upload'} onClick={submitFile}>
                {busy === 'upload' ? <LoaderCircle className="spin" size={15} /> : <UploadCloud size={15} />}
                上传并解析
              </button>
            </div>
          </motion.div>
        )}
        <div className="document-list">
          {materialRecords.map((document) => {
            const name = typeof document === 'string' ? document : document.file_name;
            const parser = typeof document === 'string' ? '案件资料' : document.parser;
            return <div key={typeof document === 'string' ? document : document.id}><FileCheck2 size={18} /><span><b>{name}</b><small>{parser} · 已纳入审查上下文</small></span><CheckCircle2 size={16} /></div>;
          })}
        </div>
      </div>
      <div className="panel">
        <PanelTitle kicker="产品事实" title="已识别产品事实" />
        <div className="fact-list">
          <span><small>SKU</small><b>{caseData?.sku}</b></span>
          <span><small>市场</small><b>{caseData?.market}</b></span>
          <span><small>平台</small><b>{caseData?.platform}</b></span>
          <span><small>品类</small><b>{caseData?.category}</b></span>
        </div>
      </div>
    </section>
  );
}

function ReportView({ caseData, onAi }) {
  return (
    <section className="report-sheet">
      <div className="report-brand"><ShieldCheck size={24} /><span><b>SilkGuard</b><small>Internal Readiness Review</small></span></div>
      <div className="report-title"><span>案件 {caseData?.sku}</span><h2>{caseData?.product_name} · 欧盟上市前预审</h2><p>报告仅反映当前资料快照与规则版本，不构成法律意见或产品认证。</p></div>
      <div className="report-summary">
        <div><small>准备度</small><b>{caseData?.readiness}/100</b></div>
        <div><small>当前状态</small><b>{caseData?.status_label}</b></div>
        <div><small>证据覆盖</small><b>100%</b></div>
      </div>
      <h3>执行摘要</h3>
      <p>当前阻断项主要集中在技术文件、责任主体和追溯字段。建议优先补齐 EU DoC、EMC/LVD 资料，再完成 Listing 宣称改写与增量复检。</p>
      <button className="primary-button" onClick={onAi}><Bot size={17} />使用已连接模型生成结构化整改摘要</button>
    </section>
  );
}

function SourcesView({ sources, onVerify, busy }) {
  const authorities = [...new Set(sources.map((item) => item.authority))];
  return (
    <>
      <PageIntro kicker="证据来源" title="官方证据源与版本快照" body="RAG 只负责找依据；可执行规则由人工审核后发布。每条问题保存来源、版本、生效时间与抓取时间。" action={<button className="primary-button" onClick={onVerify}>{busy === 'verify' ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}验证来源连通性</button>} />
      <section className="source-summary">
        <Metric icon={BookOpenCheck} label="来源快照" value={sources.length} detail="可重放的证据版本" />
        <Metric icon={Database} label="权威机构" value={authorities.length} detail="官方与平台分层" />
        <Metric icon={CheckCircle2} label="引用覆盖" value="100%" detail="无来源不出结论" tone="green" />
      </section>
      <section className="panel source-table-panel">
        <div className="source-table">
          <div className="source-head"><span>来源</span><span>辖区</span><span>生效/版本</span><span>快照状态</span><span /></div>
          {sources.map((source) => (
            <div className="source-row" key={source.id}>
              <span><b>{source.source_name}</b><small>{source.authority}</small></span>
              <span>{source.jurisdiction}</span>
              <span>{source.effective_date}</span>
              <span><em className="source-status"><CheckCircle2 size={14} />{source.status === 'bundled_snapshot' ? '已固化' : source.status}</em><small>{cnTime(source.retrieved_at)} 抓取</small></span>
              <a href={source.source_url} target="_blank" rel="noreferrer"><ExternalLink size={17} /></a>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function IntegrationsView({ integrations, onTestDeepSeek, busy }) {
  const deepseek = integrations.find((item) => item.id === 'deepseek');
  return (
    <>
      <PageIntro kicker="连接状态" title="系统连接" body="查看法规来源、协同服务和模型服务的当前状态。所有凭证均由后端读取，前端只接收连接结果。" />
      <section className="integration-grid">
        {integrations.map((item) => (
          <article className="integration-card" key={item.id}>
            <div className="integration-icon">{item.id === 'deepseek' ? <Bot /> : item.id === 'paddleocr' ? <FileSearch /> : item.id === 'feishu' ? <FolderKanban /> : <PlugZap />}</div>
            <div className="integration-meta"><span>{item.category}</span><em className={`integration-status ${item.status}`}>{statusCopy(item.status)}</em></div>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            {item.id === 'deepseek' && item.status === 'connected' && (
              <div className="integration-configured"><CheckCircle2 size={15} />后端已配置 · {item.model}</div>
            )}
            <div className="integration-actions">
              {item.id === 'deepseek' && item.status === 'connected' && (
                <button className="integration-test" onClick={onTestDeepSeek} disabled={busy === 'deepseek-test'}>
                  {busy === 'deepseek-test' ? <LoaderCircle className="spin" size={15} /> : <Activity size={15} />}
                  实际推理测试
                </button>
              )}
              <a className="integration-link" href={item.register_url} target="_blank" rel="noreferrer">
                {item.status.includes('needs') ? '打开注册 / 授权页' : '查看官方入口'} <ExternalLink size={15} />
              </a>
            </div>
          </article>
        ))}
      </section>
      <div className="security-banner">
        <ShieldCheck size={21} />
        <div>
          <b>凭证由后端托管</b>
          <p>{deepseek?.status === 'connected' ? '模型服务已连接。前端不会显示、保存或传输密钥。' : '模型服务尚未连接。完成后端配置后可在这里执行连通性测试。'}</p>
        </div>
      </div>
    </>
  );
}

function CreateCaseModal({ onClose, onSubmit, busy }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const [form, setForm] = useState({
    sku: '',
    brand: '',
    product_name: '',
    market: '欧盟 · 德国',
    platform: 'Amazon EU',
    category: '智能小家电 / 个护电器',
    claims: ''
  });
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const valid = form.sku.trim() && form.brand.trim() && form.product_name.trim();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || []);
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <motion.div className="modal-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="case-modal" initial={{ scale: 0.97, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0 }} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (valid) onSubmit(form); }}>
        <div className="modal-head"><div><span>新建合规案件</span><h2 id={titleId}>创建商品准入案件</h2></div><button type="button" onClick={onClose} aria-label="关闭创建案件窗口"><X size={20} /></button></div>
        <div className="form-grid">
          <label><span>SKU 编号</span><input value={form.sku} onChange={update('sku')} placeholder="例如 SG-ELEC-002" autoFocus /></label>
          <label><span>品牌</span><input value={form.brand} onChange={update('brand')} placeholder="品牌英文或中文名称" /></label>
          <label className="wide"><span>商品名称</span><input value={form.product_name} onChange={update('product_name')} placeholder="例如 高速负离子吹风机" /></label>
          <label><span>目标市场</span><select value={form.market} onChange={update('market')}><option>欧盟 · 德国</option><option>欧盟 · 法国</option><option>欧盟 · 西班牙</option></select></label>
          <label><span>目标平台</span><select value={form.platform} onChange={update('platform')}><option>Amazon EU</option><option>TikTok Shop EU</option><option>独立站</option></select></label>
          <label className="wide"><span>Listing 宣称</span><textarea value={form.claims} onChange={update('claims')} placeholder="粘贴商品标题、五点描述或主要功效宣称" /></label>
        </div>
        <div className="modal-note"><FileCheck2 size={17} />案件创建后可继续上传铭牌、说明书、DoC 与测试报告。</div>
        <div className="modal-actions"><button type="button" className="soft-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!valid || busy === 'create'}>{busy === 'create' ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}创建案件</button></div>
      </motion.form>
    </motion.div>
  );
}

function ReadinessRing({ value, large = false }) {
  const style = { '--value': value };
  return <div className={`readiness-ring ${large ? 'large' : ''}`} style={style}><span>{value}</span><small>%</small></div>;
}

function Metric({ icon: Icon, label, value, detail, tone = '' }) {
  return <div className={`metric-item ${tone}`}><div className="metric-icon"><Icon size={19} /></div><div><span>{label}</span><b>{value}</b><small>{detail}</small></div></div>;
}



const rootElement = document.getElementById('root');
const appRoot = globalThis.__silkGuardRoot || createRoot(rootElement);
globalThis.__silkGuardRoot = appRoot;

appRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
