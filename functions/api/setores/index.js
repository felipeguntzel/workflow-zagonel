import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { exigirPermissao } from "../../_lib/permissoes.js";

async function carregarEmpresasDosSetores(db) {
  try {
    return await all(db, "SELECT setor_id, empresa_id FROM setor_empresas");
  } catch (e) {
    return [];
  }
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "setores", "visualizar");
  if (erro) return erro;

  const setores = await all(context.env.DB, "SELECT * FROM setores ORDER BY id");
  const vinculos = await carregarEmpresasDosSetores(context.env.DB);

  const mapaVinculos = new Map();
  for (const v of vinculos) {
    if (!mapaVinculos.has(v.setor_id)) {
      mapaVinculos.set(v.setor_id, []);
    }
    mapaVinculos.get(v.setor_id).push(v.empresa_id);
  }

  for (const s of setores) {
    const empresasVinculadas = mapaVinculos.get(s.id);
    if (empresasVinculadas && empresasVinculadas.length > 0) {
      s.empresas = empresasVinculadas;
    } else if (s.empresa_id) {
      s.empresas = [s.empresa_id];
    } else {
      s.empresas = [];
    }
  }

  return json(setores);
}

export async function onRequestPost(context) {
  const { erro } = await exigirPermissao(context, "setores", "inserir");
  if (erro) return erro;

  const body = await context.request.json();
  if (!body.nome) return error("Campo obrigatório: nome");

  const empresas = Array.isArray(body.empresas)
    ? body.empresas.map(Number).filter(Boolean)
    : body.empresa_id
    ? [Number(body.empresa_id)]
    : [];

  if (empresas.length === 0) {
    return error("Selecione pelo menos uma empresa para o setor.");
  }

  const prazoPadrao = body.prazo_padrao_dias !== undefined && body.prazo_padrao_dias !== ""
    ? Number(body.prazo_padrao_dias)
    : 5;

  const res = await run(
    context.env.DB,
    "INSERT INTO setores (nome, empresa_id, centro_custo, prazo_padrao_dias) VALUES (?, ?, ?, ?)",
    body.nome,
    empresas[0],
    body.centro_custo || null,
    prazoPadrao
  );

  const novoId = res.meta.last_row_id;

  for (const empId of empresas) {
    await run(
      context.env.DB,
      "INSERT OR IGNORE INTO setor_empresas (setor_id, empresa_id) VALUES (?, ?)",
      novoId,
      empId
    );
  }

  const novo = await first(context.env.DB, "SELECT * FROM setores WHERE id = ?", novoId);
  novo.empresas = empresas;

  return json(novo, 201);
}
