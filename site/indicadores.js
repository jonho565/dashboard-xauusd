// Indicadores · Fase 2. Funções puras sobre arrays de fechamento/máximas/mínimas.
// Convenções: EMA com alfa = 2/(n+1) semeada pela média simples dos primeiros n valores;
// RSI, ATR com suavização de Wilder (alfa = 1/n). Valores anteriores ao período são null.
(function (root) {
  function ema(valores, n) {
    const out = new Array(valores.length).fill(null);
    if (valores.length < n) return out;
    let s = 0;
    for (let i = 0; i < n; i++) s += valores[i];
    let prev = s / n;
    out[n - 1] = prev;
    const k = 2 / (n + 1);
    for (let i = n; i < valores.length; i++) {
      prev = valores[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function rsi(fech, n = 14) {
    const out = new Array(fech.length).fill(null);
    if (fech.length <= n) return out;
    let ganho = 0, perda = 0;
    for (let i = 1; i <= n; i++) {
      const d = fech[i] - fech[i - 1];
      if (d >= 0) ganho += d; else perda -= d;
    }
    ganho /= n; perda /= n;
    out[n] = perda === 0 ? 100 : 100 - 100 / (1 + ganho / perda);
    for (let i = n + 1; i < fech.length; i++) {
      const d = fech[i] - fech[i - 1];
      ganho = (ganho * (n - 1) + Math.max(d, 0)) / n;
      perda = (perda * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = perda === 0 ? 100 : 100 - 100 / (1 + ganho / perda);
    }
    return out;
  }

  // MACD: linha = EMA(rápida) - EMA(lenta); sinal = EMA(linha, sinal); histograma = linha - sinal.
  function macd(fech, rapida = 12, lenta = 26, sinal = 9) {
    const eR = ema(fech, rapida), eL = ema(fech, lenta);
    const linha = fech.map((_, i) => (eR[i] == null || eL[i] == null) ? null : eR[i] - eL[i]);
    const inicio = linha.findIndex(v => v != null);
    const base = inicio < 0 ? [] : linha.slice(inicio);
    const sinalParcial = ema(base, sinal);
    const sinalCompleto = new Array(fech.length).fill(null);
    for (let i = 0; i < sinalParcial.length; i++) sinalCompleto[inicio + i] = sinalParcial[i];
    const hist = linha.map((v, i) => (v == null || sinalCompleto[i] == null) ? null : v - sinalCompleto[i]);
    return { linha, sinal: sinalCompleto, histograma: hist };
  }

  // True Range e ATR de Wilder.
  function atr(max, min, fech, n = 14) {
    const out = new Array(fech.length).fill(null);
    if (fech.length <= n) return out;
    const tr = [];
    for (let i = 0; i < fech.length; i++) {
      if (i === 0) { tr.push(max[0] - min[0]); continue; }
      tr.push(Math.max(max[i] - min[i], Math.abs(max[i] - fech[i - 1]), Math.abs(min[i] - fech[i - 1])));
    }
    let s = 0;
    for (let i = 1; i <= n; i++) s += tr[i];
    let prev = s / n;
    out[n] = prev;
    for (let i = n + 1; i < fech.length; i++) {
      prev = (prev * (n - 1) + tr[i]) / n;
      out[i] = prev;
    }
    return out;
  }

  // Volatilidade realizada: desvio-padrão amostral dos log-retornos na janela de n períodos.
  function volRealizada(fech, n) {
    const out = new Array(fech.length).fill(null);
    const lr = [null];
    for (let i = 1; i < fech.length; i++) lr.push(Math.log(fech[i] / fech[i - 1]));
    for (let i = n; i < fech.length; i++) {
      const jan = lr.slice(i - n + 1, i + 1);
      const m = jan.reduce((a, b) => a + b, 0) / n;
      const v = jan.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1);
      out[i] = Math.sqrt(v);
    }
    return out;
  }

  // Regime: compara a volatilidade atual com a própria história (percentil) e com a expansão 20/60.
  function regimeVolatilidade(vol20Atual, historicoVol20) {
    const validos = historicoVol20.filter(v => v != null).sort((a, b) => a - b);
    if (vol20Atual == null || validos.length < 20) return { regime: null, motivo: "histórico insuficiente" };
    const pct = validos.filter(v => v <= vol20Atual).length / validos.length;
    const regime = pct < 0.33 ? "baixa" : pct > 0.67 ? "alta" : "normal";
    return { regime, percentil: Math.round(pct * 100) };
  }

  const api = { ema, rsi, macd, atr, volRealizada, regimeVolatilidade };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Indicadores = api;
})(typeof self !== "undefined" ? self : globalThis);
