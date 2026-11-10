// Motor quantitativo XAU/USD · Fase 1: candles fechados, agregação 1H→4H e bloqueios de dados.
// Funções puras (sem DOM), testáveis em Node. Candles: { t (ms, início da barra UTC), o, h, l, c, v }.
(function (root) {
  const H1 = 3600000, H4 = 4 * H1;

  // Remove a barra ainda em formação: ela só fecha quando t + duração <= agora.
  function somenteFechados(candles, agoraMs, duracaoMs) {
    return candles.filter(x => x.t + duracaoMs <= agoraMs);
  }

  // Agrega 1H em 4H pelos horários UTC alinhados a 00/04/08/12/16/20.
  // Só entra o bloco com as 4 barras de 1H completas e fechadas.
  function agregarHoras(candles1h, agoraMs, quantas = 4) {
    const blocos = new Map();
    for (const x of candles1h) {
      const k = Math.floor(x.t / H4) * H4;
      if (!blocos.has(k)) blocos.set(k, []);
      blocos.get(k).push(x);
    }
    const out = [];
    for (const [k, barras] of [...blocos.entries()].sort((a, b) => a[0] - b[0])) {
      if (barras.length !== quantas) continue; // bloco incompleto (pausa de sessão ou lacuna)
      if (k + H4 > agoraMs) continue;          // bloco ainda em formação
      barras.sort((a, b) => a.t - b.t);
      out.push({
        t: k,
        o: barras[0].o,
        h: Math.max(...barras.map(b => b.h)),
        l: Math.min(...barras.map(b => b.l)),
        c: barras[barras.length - 1].c,
        v: barras.reduce((s, b) => s + (b.v || 0), 0),
      });
    }
    return out;
  }

  // Situação da série: bloqueia sinais se não houver histórico ou se estiver desatualizada.
  function situacaoSerie({ barras, minimoBarras, ultimaBarraMs, agoraMs, limiteMinutos }) {
    if (!barras || barras < minimoBarras) return { ok: false, motivo: "histórico insuficiente (" + (barras || 0) + "/" + minimoBarras + ")" };
    if (ultimaBarraMs == null) return { ok: false, motivo: "sem data da última barra" };
    const idadeMin = (agoraMs - ultimaBarraMs) / 60000;
    if (idadeMin > limiteMinutos) return { ok: false, motivo: "desatualizada (" + Math.round(idadeMin) + " min)" };
    return { ok: true, motivo: "ok", idadeMin: Math.round(idadeMin) };
  }

  const api = { H1, H4, somenteFechados, agregarHoras, situacaoSerie };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Motor = api;
})(typeof self !== "undefined" ? self : globalThis);
