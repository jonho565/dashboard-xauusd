// Biblioteca compartilhada: lista de séries, validação de candles e chaves de armazenamento.
// Usada pela função agendada (atualizar-dados) e pela função de leitura (dados).

export const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";
export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
export const MIN_BARS = 31; // o cliente exige mais de 30 candles válidos

// Séries permitidas. Só estas podem ser lidas pelo site (evita uso como proxy aberto).
const JOBS_LEGACY = [
  { sym: "GC=F", iv: "1h", rg: "2y", uso: "XAU · proxy de futuro (motor 1H/4H)" },
  { sym: "GC=F", iv: "1d", rg: "2y", uso: "XAU · proxy de futuro (diário)" },
  { sym: "DX-Y.NYB", iv: "1d", rg: "6mo", uso: "DXY" },
  { sym: "^TNX", iv: "1d", rg: "6mo", uso: "Juros 10Y" },
  { sym: "^FVX", iv: "1d", rg: "6mo", uso: "Juros 5Y" },
  { sym: "^VIX", iv: "1d", rg: "6mo", uso: "VIX" },
  { sym: "SI=F", iv: "1d", rg: "6mo", uso: "Prata" },
  { sym: "CL=F", iv: "1d", rg: "6mo", uso: "WTI" },
  { sym: "BZ=F", iv: "1d", rg: "6mo", uso: "Brent" },
  { sym: "HG=F", iv: "1d", rg: "6mo", uso: "Cobre" },
  { sym: "NG=F", iv: "1d", rg: "6mo", uso: "Gás natural" },
  { sym: "^GSPC", iv: "1d", rg: "6mo", uso: "S&P 500" },
  { sym: "^IXIC", iv: "1d", rg: "6mo", uso: "Nasdaq Composite" },
  { sym: "^NDX", iv: "1d", rg: "6mo", uso: "Nasdaq-100" },
  { sym: "^NYA", iv: "1d", rg: "6mo", uso: "NYSE Composite" },
];

export const chartKey = (sym, iv, rg) =>
  "chart/" + sym.replace(/[^A-Za-z0-9]/g, "_") + "_" + iv + "_" + rg;

export const allowed = (sym, iv, rg) =>
  JOBS.some(j => j.sym === sym && j.iv === iv && j.rg === rg);

// Valida a resposta do Yahoo e devolve só candles completos (close/high/low não nulos).
export function extractChart(payload) {
  const res = payload && payload.chart && payload.chart.result;
  if (!res || !res[0]) throw new Error("resposta sem chart.result");
  const r = res[0];
  const ts = r.timestamp || [];
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const C = q.close || [], H = q.high || [], L = q.low || [];
  const valid = [];
  for (let i = 0; i < ts.length; i++) {
    if (C[i] != null && H[i] != null && L[i] != null) valid.push(i);
  }
  if (valid.length < MIN_BARS) throw new Error("apenas " + valid.length + " candles válidos");
  const last = valid[valid.length - 1];
  return {
    result: r,
    info: {
      bars: valid.length,
      last_utc: new Date(ts[last] * 1000).toISOString(),
      last_close: C[last],
      symbol: (r.meta && r.meta.symbol) || null,
    },
  };
}

export async function fetchChart(sym, iv, rg, fetchFn = fetch) {
  const url = YAHOO + encodeURIComponent(sym) + "?" + new URLSearchParams({ interval: iv, range: rg });
  const r = await fetchFn(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// ---- Preço ao vivo (atualizado a cada 5 min) ----
// Função separada da análise: só guarda o último preço de cada símbolo.
// GC=F é o único preço de ouro disponível em fonte gratuita (proxy do futuro, não o spot).
export const PRECO_SYMS = ["GC=F"];
export const precoKey = sym => "preco/" + sym.replace(/[^A-Za-z0-9]/g, "_");
export const precoAllowed = sym => PRECO_SYMS.includes(sym);

// Usa o fechamento do último candle de 5 min válido (mesma fonte dos candles).
export function extractPreco(payload) {
  const res = payload && payload.chart && payload.chart.result;
  if (!res || !res[0]) throw new Error("resposta sem chart.result");
  const r = res[0];
  const ts = r.timestamp || [];
  const C = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  let last = -1;
  for (let i = ts.length - 1; i >= 0; i--) { if (C[i] != null) { last = i; break; } }
  if (last < 0) throw new Error("sem preço válido");
  return {
    price: C[last],
    time_utc: new Date(ts[last] * 1000).toISOString(),
    estado: (r.meta && r.meta.marketState) || null,
    symbol: (r.meta && r.meta.symbol) || null,
  };
}


// ---- Ativos e timeframes (Fase 6) ----
// Cada ativo tem candles de 15m a semanal. Os sinais de compra/venda seguem só para o ouro.
// O 4H não existe no Yahoo: é montado a partir do 1H pelo motor.
export const ATIVOS = [
  { sym: "GC=F", nome: "Ouro (futuro)", grupo: "ouro" },
  { sym: "^GSPC", nome: "S&P 500", grupo: "indice" },
  { sym: "^IXIC", nome: "Nasdaq Composite", grupo: "indice" },
  { sym: "^NDX", nome: "Nasdaq-100", grupo: "indice" },
  { sym: "^NYA", nome: "NYSE Composite", grupo: "indice" },
  { sym: "SI=F", nome: "Prata", grupo: "commodity" },
  { sym: "CL=F", nome: "Petróleo WTI", grupo: "commodity" },
  { sym: "BZ=F", nome: "Petróleo Brent", grupo: "commodity" },
  { sym: "HG=F", nome: "Cobre", grupo: "commodity" },
  { sym: "NG=F", nome: "Gás natural", grupo: "commodity" },
  { sym: "DX-Y.NYB", nome: "DXY", grupo: "macro" },
  { sym: "^TNX", nome: "Juros 10Y", grupo: "macro" },
  { sym: "^FVX", nome: "Juros 5Y", grupo: "macro" },
  { sym: "^VIX", nome: "VIX", grupo: "macro" },
];
// Intervalo do Yahoo -> período de histórico. 15m e 30m têm no máximo 60 dias.
export const TIMEFRAMES = { "15m": "60d", "30m": "60d", "1h": "2y", "1d": "2y", "1wk": "10y" };

const chaveJob = j => j.sym + "|" + j.iv + "|" + j.rg;
const ATIVOS_JOBS = ATIVOS.flatMap(a =>
  Object.entries(TIMEFRAMES).map(([iv, rg]) => ({ sym: a.sym, iv, rg, uso: a.nome + " · " + iv }))
);
// Une as séries antigas (mantidas para a página atual) com as novas, sem duplicar.
export const JOBS = (() => {
  const vistos = new Set();
  return [...JOBS_LEGACY, ...ATIVOS_JOBS].filter(j => {
    const k = chaveJob(j);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
})();
