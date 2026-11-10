// Pontuação e cenários de COMPRA/VENDA · Fase 4.
// Entrada: candles FECHADOS de 1D, 4H (agregado de 1H) e 1H; agoraMs = relógio atual.
// Regra: pontuação nunca gera operação sozinha; sinal exige gatilho confirmado e dados válidos.
(function (root) {
  const PESOS = { diario: 20, h4: 25, h1: 20, momentum: 15, estrutura: 8, gatilho: 7, volatilidade: 5 };
  const MINIMOS = { d1: 60, h4: 100, h1: 200 };
  const LIMITE_MIN = { d1: 3 * 24 * 60, h4: 8 * 60, h1: 90 };
  const DURACAO = { d1: 24 * 3600000, h4: 4 * 3600000, h1: 3600000 };

  // Níveis de um cenário. lado: "compra" | "venda".
  function niveis(lado, entrada, atr, estrutural) {
    const sinal = lado === "compra" ? 1 : -1;
    const stop = lado === "compra"
      ? Math.min(estrutural - 0.25 * atr, entrada - 1.0 * atr)
      : Math.max(estrutural + 0.25 * atr, entrada + 1.0 * atr);
    const R = Math.abs(entrada - stop);          // risco real: entrada até o stop efetivo
    const alvo1 = entrada + sinal * 1.5 * R;
    const alvo2 = entrada + sinal * 2.5 * R;
    return {
      entrada, stop, R,
      alvo1, alvo2,
      rr1: Math.abs(alvo1 - entrada) / R,      // calculado a partir dos valores efetivos
      rr2: Math.abs(alvo2 - entrada) / R,
    };
  }

  // Classificação pela pontuação e pelo gatilho. Pontuação sozinha nunca vira sinal.
  function classificar(score, gatilho) {
    if (score >= 75) return gatilho ? "SINAL (gatilho confirmado)" : "aguardando gatilho";
    if (score >= 60) return "observação";
    return "sem sinal";
  }

  function metade(valor, cheio) { return valor >= cheio ? cheio : valor > 0 ? cheio / 2 : 0; }

  // Pontuação de tendência: estrutura + médias alinhadas, do lado pedido.
  function pontosTendencia(tend, emaOk, peso, lado) {
    const alvo = lado === "compra" ? "alta" : "baixa";
    const a = tend === alvo ? 1 : 0, b = emaOk ? 1 : 0;
    return (a + b) === 2 ? peso : (a + b) === 1 ? peso / 2 : 0;
  }

  function avaliarTF(c, L) {
    const E = root.Estrutura, I = root.Indicadores;
    const est = E.analisar(c, { L });
    const f = c.map(x => x.c);
    const e20 = I.ema(f, 20), e50 = I.ema(f, 50), e200 = I.ema(f, 200);
    const i = f.length - 1;
    return {
      est, c, i,
      ema20: e20[i], ema50: e50[i], ema200: e200[i],
      altaEma: e20[i] > e50[i] && (e200[i] == null || e50[i] > e200[i]),
      baixaEma: e20[i] < e50[i] && (e200[i] == null || e50[i] < e200[i]),
    };
  }

  function avaliar({ d1, h4, h1, agoraMs }, opts = {}) {
    const M = root.Motor, I = root.Indicadores, E = root.Estrutura;
    const motivos = [];
    const series = { d1, h4, h1 };
    for (const k of ["d1", "h4", "h1"]) {
      const c = series[k];
      const fim = c.length ? c[c.length - 1].t + DURACAO[k] : null;
      const s = M.situacaoSerie({ barras: c.length, minimoBarras: MINIMOS[k], ultimaBarraMs: fim, agoraMs, limiteMinutos: LIMITE_MIN[k] });
      if (!s.ok) motivos.push(k + ": " + s.motivo);
    }
    if (motivos.length) return { estado: "bloqueado", motivos, compra: null, venda: null };

    const D = avaliarTF(d1, 2), H4 = avaliarTF(h4, 3), H1 = avaliarTF(h1, 3);
    const c1 = h1, n = c1.length - 1, b = c1[n];
    const f1 = c1.map(x => x.c);
    const rsi1 = I.rsi(f1, 14)[n];
    const macd1 = I.macd(f1);
    const hist1 = macd1.histograma[n];
    const atr1 = I.atr(c1.map(x => x.h), c1.map(x => x.l), f1, 14)[n];
    const e20_1 = I.ema(f1, 20)[n];
    const vol20 = I.volRealizada(f1, 20);
    const reg = I.regimeVolatilidade(vol20[n], vol20);
    const ev1 = H1.est.eventos.filter(e => e.j >= n - 19);

    function cenario(lado) {
      const alta = lado === "compra";
      const pts = {
        diario: pontosTendencia(D.est.tendencia, alta ? D.altaEma : D.baixaEma, PESOS.diario, lado),
        h4: pontosTendencia(H4.est.tendencia, alta ? H4.altaEma : H4.baixaEma, PESOS.h4, lado),
        h1: pontosTendencia(H1.est.tendencia, alta ? H1.altaEma : H1.baixaEma, PESOS.h1, lado),
        momentum: 0,
        estrutura: 0,
        gatilho: 0,
        volatilidade: 0,
      };
      if (rsi1 != null && hist1 != null) {
        const m = alta ? (rsi1 > 55 && hist1 > 0) : (rsi1 < 45 && hist1 < 0);
        const parcial = alta ? (rsi1 > 50 || hist1 > 0) : (rsi1 < 50 || hist1 < 0);
        pts.momentum = m ? PESOS.momentum : parcial ? PESOS.momentum / 2 : 0;
      }
      const tipoBOS = alta ? "BOS_ALTA" : "BOS_BAIXA";
      const tipoRet = alta ? "RETESTE_ALTA" : "RETESTE_BAIXA";
      const tipoFalso = alta ? "FALSO_ROMPIMENTO_ALTA" : "FALSO_ROMPIMENTO_BAIXA";
      const recentes = ev1.filter(e => e.tipo === tipoBOS || e.tipo === tipoRet);
      const ultimo = recentes[recentes.length - 1];
      const falsoDepois = ultimo && ev1.some(e => e.tipo === tipoFalso && e.j > ultimo.j);
      if (ultimo && !falsoDepois) pts.estrutura = PESOS.estrutura;
      const gatilhoOk = !!ultimo && !falsoDepois && n - ultimo.j <= 5 &&
        (alta ? (b.c > b.o && b.c > e20_1) : (b.c < b.o && b.c < e20_1));
      if (gatilhoOk) pts.gatilho = PESOS.gatilho;
      pts.volatilidade = reg.regime === "normal" ? PESOS.volatilidade : reg.regime === "baixa" ? 3 : reg.regime === "alta" ? 2 : 0;
      const score = Math.round(Object.values(pts).reduce((s, v) => s + v, 0) * 10) / 10;
      const cls = classificar(score, gatilhoOk);
      let niv = null;
      if (gatilhoOk && atr1 != null) {
        const estrutural = alta
          ? H1.est.pivos.filter(p => p.tipo === "L" && p.confirmadoEm <= n).slice(-1)[0]?.preco
          : H1.est.pivos.filter(p => p.tipo === "H" && p.confirmadoEm <= n).slice(-1)[0]?.preco;
        if (estrutural != null) niv = niveis(lado, b.c, atr1, estrutural);
      }
      return { lado, score, pontos: pts, gatilho: gatilhoOk, classificacao: cls, niveis: niv, regimeVolatilidade: reg.regime };
    }

    return { estado: "ok", motivos: [], compra: cenario("compra"), venda: cenario("venda") };
  }

  const api = { PESOS, MINIMOS, niveis, classificar, avaliar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Sinais = api;
})(typeof self !== "undefined" ? self : globalThis);
