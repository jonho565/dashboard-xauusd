// Coleta os dados do Yahoo e grava arquivos estáticos em site/data/.
// Roda no GitHub Actions. Preço a cada execução.
// Candles: em :00-:09 e :30-:39 (UTC), na primeira execução (sem candles ainda)
// e em disparo manual (FORCAR_CANDLES=true).
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { JOBS, PRECO_SYMS, fetchChart, extractChart, extractPreco } from "./lib/mercado.mjs";

const safe = s => s.replace(/[^A-Za-z0-9]/g, "_");

function gravar(arq, obj) {
  const tmp = arq + ".tmp";
  writeFileSync(tmp, JSON.stringify(obj));
  renameSync(tmp, arq); // troca atômica: o site nunca lê arquivo pela metade
}

export function deveAtualizarCandles(agora, { forcar = false, statusAnterior = null } = {}) {
  if (forcar) return true;
  if (!statusAnterior || !Array.isArray(statusAnterior.jobs) || statusAnterior.jobs.length === 0) return true;
  return agora.getUTCMinutes() % 30 < 10;
}

export async function executar({ agora = new Date(), out = "site/data", fetchFn = fetch, forcar = false } = {}) {
  mkdirSync(join(out, "chart"), { recursive: true });
  const agoraIso = agora.toISOString();
  const statusArq = join(out, "status.json");
  const statusAnterior = existsSync(statusArq) ? JSON.parse(readFileSync(statusArq, "utf8")) : null;
  const resumo = { agora: agoraIso, preco: [], candles: null };

  for (const sym of PRECO_SYMS) {
    try {
      const d = extractPreco(await fetchChart(sym, "5m", "1d", fetchFn));
      gravar(join(out, `preco_${safe(sym)}.json`), { ...d, fetched_at: agoraIso, _source: "Yahoo Finance 5m (GitHub Actions)" });
      resumo.preco.push({ sym, ok: true, price: d.price });
    } catch (e) {
      resumo.preco.push({ sym, ok: false, error: String(e.message || e).slice(0, 200) });
    }
  }

  let status = statusAnterior || { jobs: [] };

  if (deveAtualizarCandles(agora, { forcar, statusAnterior })) {
    const jobs = [];
    for (const j of JOBS) {
      const arq = join(out, "chart", `${safe(j.sym)}_${j.iv}_${j.rg}.json`);
      const entrada = { symbol: j.sym, interval: j.iv, range: j.rg, uso: j.uso, file: arq.replace(/^site\//, "") };
      try {
        const payload = await fetchChart(j.sym, j.iv, j.rg, fetchFn);
        const { result, info } = extractChart(payload);
        gravar(arq, { chart: { result: [result], error: null }, _fetched_at: agoraIso, _source: "Yahoo Finance chart API (GitHub Actions)", _symbol_requested: j.sym });
        Object.assign(entrada, { ok: true, ...info, fetched_at: agoraIso });
      } catch (e) {
        // mantém o arquivo anterior; o status registra o erro
        Object.assign(entrada, { ok: false, error: String((e && e.message) || e).slice(0, 200) });
      }
      jobs.push(entrada);
    }
    status = { generated_at: agoraIso, ok: jobs.filter(x => x.ok).length, total: jobs.length, jobs };
    resumo.candles = { ok: status.ok, total: status.total };
  }
  status.ultima_execucao = agoraIso;
  gravar(statusArq, status);
  return resumo;
}

// Execução direta (GitHub Actions)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const forcar = process.env.FORCAR_CANDLES === "true";
  executar({ forcar }).then(r => {
    console.log(JSON.stringify(r));
    if (!r.preco.some(p => p.ok)) process.exit(1); // sem preço nenhum: falha visível no Actions
  });
}
