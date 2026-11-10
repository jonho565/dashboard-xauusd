// Painel de ativos: seleção de ativo e timeframe, leitura sob demanda e indicadores.
// Lógica pura no topo (testável em Node); interface no fim (só no navegador).
(function (root) {
  const DURACAO = { "15m": 15 * 60e3, "30m": 30 * 60e3, "1h": 3600e3, "4h": 4 * 3600e3, "1d": 86400e3, "1wk": 7 * 86400e3 };
  const INTERVALO_TV = { "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D", "1wk": "W" };
  const LIMITE_MIN = { "15m": 60, "30m": 90, "1h": 120, "4h": 8 * 60, "1d": 3 * 24 * 60, "1wk": 10 * 24 * 60 };
  const TIMEFRAMES_PAINEL = ["15m", "30m", "1h", "4h", "1d", "1wk"];

  // Qual arquivo baixar para um timeframe. O 4H não existe no Yahoo: vem do 1H.
  function infoTimeframe(tf, tfs) {
    if (tf === "4h") return { iv: "1h", rg: tfs["1h"], agrega: true };
    return { iv: tf, rg: tfs[tf], agrega: false };
  }

  function nomeArquivo(sym, iv, rg) {
    return "data/chart/" + sym.replace(/[^A-Za-z0-9]/g, "_") + "_" + iv + "_" + rg + ".json";
  }

  // Converte o JSON publicado em barras { t (ms), o, h, l, c, v }, descartando barras incompletas.
  function candlesDoDoc(doc) {
    const r = doc && doc.chart && doc.chart.result && doc.chart.result[0];
    if (!r || !r.indicators || !r.indicators.quote) return [];
    const q = r.indicators.quote[0];
    const out = [];
    r.timestamp.forEach((ts, i) => {
      if (q.close[i] == null || q.high[i] == null || q.low[i] == null) return;
      out.push({
        t: ts * 1000,
        o: q.open && q.open[i] != null ? q.open[i] : q.close[i],
        h: q.high[i], l: q.low[i], c: q.close[i],
        v: q.volume && q.volume[i] != null ? q.volume[i] : 0,
      });
    });
    return out;
  }

  // Só candles FECHADOS: a barra em formação nunca entra na leitura.
  function fechados(candles, tf, agoraMs) {
    return root.Motor.somenteFechados(candles, agoraMs, DURACAO[tf]);
  }

  // Monta as barras do timeframe pedido a partir do arquivo lido.
  function barrasDoTimeframe(candles1ou, tf, agoraMs) {
    if (tf === "4h") {
      const h1 = root.Motor.somenteFechados(candles1ou, agoraMs, DURACAO["1h"]);
      return root.Motor.agregarHoras(h1, agoraMs);
    }
    return fechados(candles1ou, tf, agoraMs);
  }

  // Indicadores e estrutura do último candle fechado.
  function analisar(c, tf) {
    const I = root.Indicadores, E = root.Estrutura;
    const n = c.length;
    if (n < 50) return { insuficiente: true, n };
    const f = c.map(x => x.c), h = c.map(x => x.h), l = c.map(x => x.l), i = n - 1;
    const L = tf === "1wk" ? 2 : 3;
    const e20 = I.ema(f, 20), e50 = I.ema(f, 50), e200 = I.ema(f, 200);
    const atr = I.atr(h, l, f, 14)[i];
    const vol = I.volRealizada(f, 20);
    const reg = I.regimeVolatilidade(vol[i], vol);
    const est = E.analisar(c, { L });
    return {
      insuficiente: false, n,
      ultimo: c[i],
      ema20: e20[i], ema50: e50[i], ema200: e200[i],
      rsi: I.rsi(f, 14)[i],
      macdHist: I.macd(f).histograma[i],
      atr, atrPct: atr != null ? atr / c[i].c * 100 : null,
      volRegime: reg.regime,
      tendencia: est.tendencia,
      eventos: est.eventos.slice(-5).reverse().map(e => ({ tipo: e.tipo, nivel: e.nivel, quando: c[e.j].t })),
    };
  }

  // Situação dos dados (fonte, idade e bloqueio) de um arquivo lido.
  function situacao(candles, tf, agoraMs) {
    const ultimo = candles.length ? candles[candles.length - 1].t + DURACAO[tf] : null;
    return root.Motor.situacaoSerie({
      barras: candles.length, minimoBarras: 50, ultimaBarraMs: ultimo, agoraMs, limiteMinutos: LIMITE_MIN[tf],
    });
  }

  function grupos(ativos) {
    const ordem = ["ouro", "indice", "commodity", "macro"];
    return ordem.map(g => ({ grupo: g, itens: ativos.filter(a => a.grupo === g) })).filter(x => x.itens.length);
  }

  const api = { DURACAO, INTERVALO_TV, TIMEFRAMES_PAINEL, infoTimeframe, nomeArquivo, candlesDoDoc, fechados, barrasDoTimeframe, analisar, situacao, grupos };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Ativos = api;
})(typeof self !== "undefined" ? self : globalThis);
