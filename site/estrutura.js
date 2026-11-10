// Estrutura de mercado · Fase 3.
// Entrada: candles FECHADOS { t, o, h, l, c } em ordem cronológica (use Motor.somenteFechados antes).
// Pivô de alta: máxima maior que as L barras anteriores e não menor que as L seguintes.
// Um pivô só existe depois de L barras fechadas após ele (confirmadoEm = i + L).
(function (root) {
  function pivos(c, L = 3) {
    const out = [];
    for (let i = L; i < c.length - L; i++) {
      let ehAlta = true, ehBaixa = true;
      for (let k = 1; k <= L; k++) {
        if (!(c[i].h > c[i - k].h && c[i].h >= c[i + k].h)) ehAlta = false;
        if (!(c[i].l < c[i - k].l && c[i].l <= c[i + k].l)) ehBaixa = false;
      }
      if (ehAlta) out.push({ i, tipo: "H", preco: c[i].h, confirmadoEm: i + L, rotulo: null });
      if (ehBaixa) out.push({ i, tipo: "L", preco: c[i].l, confirmadoEm: i + L, rotulo: null });
    }
    return out;
  }

  // Rotula cada pivô: HH/LH para topos, HL/LL para fundos, comparando com o pivô anterior do mesmo tipo.
  function rotular(piv) {
    let ultH = null, ultL = null;
    for (const p of piv) {
      if (p.tipo === "H") {
        p.rotulo = ultH == null ? "H" : (p.preco > ultH.preco ? "HH" : "LH");
        ultH = p;
      } else {
        p.rotulo = ultL == null ? "L" : (p.preco > ultL.preco ? "HL" : "LL");
        ultL = p;
      }
    }
    return piv;
  }

  // Tendência pela estrutura mais recente: alta = HH + HL; baixa = LH + LL; senão indefinida.
  function tendencia(piv) {
    const topos = piv.filter(p => p.tipo === "H" && p.rotulo !== "H");
    const fundos = piv.filter(p => p.tipo === "L" && p.rotulo !== "L");
    const uH = topos[topos.length - 1], uL = fundos[fundos.length - 1];
    if (!uH || !uL) return "indefinida";
    if (uH.rotulo === "HH" && uL.rotulo === "HL") return "alta";
    if (uH.rotulo === "LH" && uL.rotulo === "LL") return "baixa";
    return "indefinida";
  }

  // Eventos de estrutura em candles fechados.
  //   BOS_ALTA / BOS_BAIXA: fechamento além do último pivô confirmado (rompimento de estrutura).
  //   REJEICAO_TOPO / REJEICAO_FUNDO: pavio além do pivô, mas fechamento do lado de dentro.
  //   FALSO_ROMPIMENTO_ALTA / _BAIXA: após o BOS, fechamento de volta do lado antigo em até 3 barras.
  //   RETESTE_ALTA / _BAIXA: após o BOS, preço volta à zona do nível rompido e fecha do lado do rompimento.
  // Cada nível rompido gera no máximo um BOS; um novo pivô é necessário para outro BOS no mesmo lado.
  function eventos(c, piv, opts = {}) {
    const zonaPct = opts.zonaPct ?? 0.002;
    const janelaRetestes = opts.janelaRetestes ?? 20;
    const ev = [];
    const ativos = [];
    let ultH = null, ultL = null, quebradoH = false, quebradoL = false;
    for (let j = 0; j < c.length; j++) {
      // pivôs confirmados até a barra anterior
      for (const p of piv) {
        if (p.confirmadoEm === j - 1) {
          if (p.tipo === "H") { ultH = p; quebradoH = false; }
          else { ultL = p; quebradoL = false; }
        }
      }
      const b = c[j];
      const zona = b.c * zonaPct;
      if (ultH && !quebradoH) {
        if (b.c > ultH.preco) {
          ev.push({ j, tipo: "BOS_ALTA", nivel: ultH.preco });
          ativos.push({ lado: "alta", nivel: ultH.preco, idx: j, retestado: false, falso: false });
          quebradoH = true;
        } else if (b.h > ultH.preco) {
          ev.push({ j, tipo: "REJEICAO_TOPO", nivel: ultH.preco });
        }
      }
      if (ultL && !quebradoL) {
        if (b.c < ultL.preco) {
          ev.push({ j, tipo: "BOS_BAIXA", nivel: ultL.preco });
          ativos.push({ lado: "baixa", nivel: ultL.preco, idx: j, retestado: false, falso: false });
          quebradoL = true;
        } else if (b.l < ultL.preco) {
          ev.push({ j, tipo: "REJEICAO_FUNDO", nivel: ultL.preco });
        }
      }
      for (const a of ativos) {
        if (a.idx === j || a.falso) continue;
        if (a.lado === "alta") {
          if (!a.retestado && b.c < a.nivel && j - a.idx <= 3) {
            a.falso = true; ev.push({ j, tipo: "FALSO_ROMPIMENTO_ALTA", nivel: a.nivel });
          } else if (!a.retestado && j - a.idx <= janelaRetestes && b.l <= a.nivel + zona && b.c > a.nivel) {
            a.retestado = true; ev.push({ j, tipo: "RETESTE_ALTA", nivel: a.nivel });
          }
        } else {
          if (!a.retestado && b.c > a.nivel && j - a.idx <= 3) {
            a.falso = true; ev.push({ j, tipo: "FALSO_ROMPIMENTO_BAIXA", nivel: a.nivel });
          } else if (!a.retestado && j - a.idx <= janelaRetestes && b.h >= a.nivel - zona && b.c < a.nivel) {
            a.retestado = true; ev.push({ j, tipo: "RETESTE_BAIXA", nivel: a.nivel });
          }
        }
      }
    }
    return ev;
  }

  function analisar(c, opts = {}) {
    const L = opts.L ?? 3;
    const piv = rotular(pivos(c, L));
    return {
      pivos: piv,
      tendencia: tendencia(piv),
      eventos: eventos(c, piv, opts),
    };
  }

  const api = { pivos, rotular, tendencia, eventos, analisar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Estrutura = api;
})(typeof self !== "undefined" ? self : globalThis);
