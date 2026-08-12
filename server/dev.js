import { createServer, loadEnv } from 'vite';

const MAX_BODY_SIZE = 1_000_000;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_SIZE) {
        reject(new Error('请求内容过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('请求 JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function healthPlugin(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  const register = (server) => {
    server.middlewares.use('/api/health', (req, res) => {
      sendJson(res, 200, {
        ok: true,
        service: 'SilkGuard 丝路智审',
        time: new Date().toISOString(),
        ai: env.AI_PROVIDER === 'deepseek' && env.DEEPSEEK_API_KEY ? 'deepseek' : 'mock',
        feishu:
          env.FEISHU_APP_ID && env.FEISHU_APP_SECRET && env.FEISHU_BITABLE_APP_TOKEN && env.FEISHU_TABLE_ID
            ? 'configured'
            : 'mock'
      });
    });
  };
  return { name: 'silkguard-health', configureServer: register, configurePreviewServer: register };
}

function buildSilkGuardSystemPrompt() {
  return [
    '你是 SilkGuard 丝路智审的跨境 SKU 准入预审顾问。',
    'SilkGuard 面向江苏跨境卖家、制造企业和代运营团队，负责把本地规则引擎命中的问题解释清楚，并生成可执行整改建议。',
    '规则引擎负责识别风险、触发规则、计算内部风险指数；你不能自行改变最终结论，也不能替代正式法律意见。',
    '你的语气要像专业 B2B 合规顾问：克制、准确、可执行，不写营销口号。',
    '必须输出 JSON，不要输出 Markdown，不要添加解释性前后缀。',
    'JSON 字段必须包含 summary, suggestions, listing, humanReviewNote, nextActions。',
    'suggestions 和 nextActions 必须是字符串数组。',
    'listing 必须是英文平台 Listing 草稿，避免绝对化安全承诺、医疗化表达和无法证明的效果承诺。',
    '遇到高风险、资料缺失或法规解释边界，必须提醒人工复核。'
  ].join('\n');
}

function buildDeepSeekPayload(product, auditResult) {
  return {
    task: '基于本地规则引擎命中结果，生成中文报告摘要、整改建议、人工复核提示和英文平台 Listing 草稿。',
    product: {
      productId: product?.productId,
      brand: product?.brand,
      productName: product?.productName || product?.chineseName,
      englishName: product?.englishName,
      category: product?.category,
      rulePack: product?.rulePack,
      targetMarket: product?.targetMarket,
      platform: product?.platform,
      hsCode: product?.hsCode,
      description: product?.description,
      parameters: product?.parameters,
      claims: product?.claims,
      documents: product?.documents,
      missingFields: product?.missingFields
    },
    ruleEngineResult: {
      activeRulePack: auditResult?.activeRulePack,
      status: auditResult?.status,
      riskLevel: auditResult?.riskLevel,
      internalRiskIndex: auditResult?.overallScore,
      missingFields: auditResult?.missingFields,
      issues: auditResult?.issues?.map((issue) => ({
        type: issue.type,
        keyword: issue.keyword,
        severity: issue.severity,
        ruleId: issue.ruleId,
        suggestion: issue.suggestion,
        needsHumanReview: issue.needsHumanReview
      })),
      suggestions: auditResult?.suggestions
    },
    outputSchema: {
      summary: '中文报告摘要，80-140 字',
      suggestions: ['中文整改建议，按 P0/P1/P2 顺序'],
      listing: '英文 Listing 草稿',
      humanReviewNote: '人工复核提示',
      nextActions: ['下一步动作']
    }
  };
}

function mockAiResponse(reason) {
  return {
    ok: true,
    provider: 'mock-fallback',
    fallbackReason: reason
  };
}

function deepseekApiPlugin(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  const provider = env.AI_PROVIDER || env.VITE_AI_PROVIDER || 'mock';
  const deepseekApiKey = env.DEEPSEEK_API_KEY || '';
  const deepseekBaseUrl = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const deepseekModel = env.DEEPSEEK_MODEL || 'deepseek-chat';

  const register = (server) => {
      server.middlewares.use('/api/ai/generate', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: '仅支持 POST 请求' });
          return;
        }

        if (provider !== 'deepseek') {
          sendJson(res, 200, mockAiResponse('AI_PROVIDER 不是 deepseek，已使用本地 mock'));
          return;
        }

        if (!deepseekApiKey) {
          sendJson(res, 200, mockAiResponse('缺少 DEEPSEEK_API_KEY，已使用本地 mock'));
          return;
        }

        try {
          const body = await readJsonBody(req);
          const { product, auditResult } = body;
          const response = await fetchWithTimeout(`${deepseekBaseUrl.replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${deepseekApiKey}`
            },
            body: JSON.stringify({
              model: deepseekModel,
              temperature: 0.25,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: buildSilkGuardSystemPrompt() },
                { role: 'user', content: JSON.stringify(buildDeepSeekPayload(product, auditResult)) }
              ]
            })
          });

          if (!response.ok) {
            sendJson(res, 200, mockAiResponse(`DeepSeek 请求失败，状态码 ${response.status}`));
            return;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '{}';
          let parsed;
          try {
            parsed = JSON.parse(content);
          } catch {
            parsed = {
              summary: content,
              suggestions: [],
              listing: '',
              humanReviewNote: 'DeepSeek 返回内容不是标准 JSON，系统已保留原文摘要。',
              nextActions: []
            };
          }

          sendJson(res, 200, {
            ok: true,
            provider: 'deepseek',
            model: deepseekModel,
            result: parsed
          });
        } catch (error) {
          sendJson(res, 200, mockAiResponse(error.message || 'DeepSeek 调用异常，已使用本地 mock'));
        }
      });
  };

  return { name: 'silkguard-deepseek-api', configureServer: register, configurePreviewServer: register };
}

function mapFeishuStatus(issue) {
  if (issue?.severity === 'High' || issue?.needsHumanReview) return '需复核';
  if (issue?.severity === 'Medium') return '待处理';
  return '整改中';
}

function buildFeishuRecords(product, auditResult) {
  const issues = Array.isArray(auditResult?.issues) ? auditResult.issues.slice(0, 20) : [];
  const rows = issues.length
    ? issues
    : [
        {
          keyword: product?.productName || '待补充 SKU',
          severity: 'Medium',
          type: '准入资料',
          ruleId: 'LOCAL-CHECK',
          suggestion: '补充商品资料后重新预审。',
          needsHumanReview: true
        }
      ];

  return rows.map((issue, index) => ({
    fields: {
      商品: product?.productName || product?.chineseName || '未命名 SKU',
      品牌: product?.brand || product?.chineseBrand || '',
      规则包: auditResult?.activeRulePack || product?.rulePack || '',
      风险状态: issue.severity === 'High' ? '需重点整改' : '需补充',
      问题类型: issue.type || '准入资料',
      触发项: issue.keyword || '',
      触发规则: issue.ruleId || '',
      整改建议: issue.suggestion || '',
      负责人: index < 3 ? '合规负责人' : '运营负责人',
      截止时间: new Date(Date.now() + (index + 2) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      整改状态: mapFeishuStatus(issue),
      是否需人工复核: issue.needsHumanReview ? '是' : '否',
      报告链接: 'SilkGuard 出海准入预审报告'
    }
  }));
}

function mockFeishuResult(message, records, extra = {}) {
  return {
    ok: true,
    provider: 'mock-feishu',
    message,
    syncedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    tableName: 'SilkGuard 出海整改任务池',
    recordCount: records.length,
    records,
    ...extra
  };
}

function feishuApiPlugin(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  const appId = env.FEISHU_APP_ID || '';
  const appSecret = env.FEISHU_APP_SECRET || '';
  const appToken = env.FEISHU_BITABLE_APP_TOKEN || '';
  const tableId = env.FEISHU_TABLE_ID || '';

  const register = (server) => {
      server.middlewares.use('/api/feishu/sync', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: '仅支持 POST 请求' });
          return;
        }

        const body = await readJsonBody(req).catch(() => ({}));
        const { product, auditResult } = body;
        const records = buildFeishuRecords(product, auditResult);

        if (!appId || !appSecret || !appToken || !tableId) {
          sendJson(
            res,
            200,
            mockFeishuResult('当前为 Mock 同步：缺少飞书应用凭证或多维表格配置', records, {
              requiredEnv: ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_BITABLE_APP_TOKEN', 'FEISHU_TABLE_ID']
            })
          );
          return;
        }

        try {
          const tokenResponse = await fetchWithTimeout('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              app_id: appId,
              app_secret: appSecret
            })
          });
          const tokenData = await tokenResponse.json();
          const tenantAccessToken = tokenData.tenant_access_token;

          if (!tenantAccessToken) {
            sendJson(
              res,
              200,
              mockFeishuResult('飞书 tenant_access_token 获取失败，已回退 Mock', records, {
                feishuError: tokenData
              })
            );
            return;
          }

          const writeResponse = await fetchWithTimeout(
            `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Authorization: `Bearer ${tenantAccessToken}`
              },
              body: JSON.stringify({ records })
            }
          );
          const writeData = await writeResponse.json();

          if (!writeResponse.ok || writeData.code !== 0) {
            sendJson(
              res,
              200,
              mockFeishuResult('飞书写入失败，已回退 Mock。请检查字段名、App Token、Table ID 和应用权限。', records, {
                feishuError: writeData
              })
            );
            return;
          }

          sendJson(res, 200, {
            ok: true,
            provider: 'feishu',
            message: '已写入飞书多维表格任务池',
            syncedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
            tableName: 'SilkGuard 出海整改任务池',
            tableId,
            recordCount: records.length,
            feishuResponse: writeData
          });
        } catch (error) {
          sendJson(
            res,
            200,
            mockFeishuResult('飞书接口调用异常，已回退 Mock', records, {
              error: error.message
            })
          );
        }
      });
  };

  return { name: 'silkguard-feishu-api', configureServer: register, configurePreviewServer: register };
}

const mode = process.env.NODE_ENV || 'development';
const server = await createServer({
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 5173)
  },
  plugins: [healthPlugin(mode), deepseekApiPlugin(mode), feishuApiPlugin(mode)]
});

await server.listen();
server.printUrls();
