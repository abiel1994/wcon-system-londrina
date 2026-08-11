/* ═══════════════════════════════════════════════════════════════════════════
   WCON SYSTEM — supabase.js v1.1 (Cuiabá)
   Conexão com banco de dados Supabase
   Atualizado: suporte a role Supervisor (Angélica)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://yiaezgjzyfnrmnqagoak.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpYWV6Z2p6eWZucm1ucWFnb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTMzMjYsImV4cCI6MjEwMTk4OTMyNn0.ulXq7wNjgjFCnxoK6V222T9YUXk5Hjk9z8TM2Q50Ynw';

// ── CLIENTE SUPABASE ──────────────────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
window.Supabase = sb;

/* ═══════════════════════════════════════════════════════════════════════════
   SERVIÇOS
   ═══════════════════════════════════════════════════════════════════════════ */
const Servicos = {

  /* ── VENDEDORES ──────────────────────────────────────────────────────────── */
  async listarVendedores() {
    const { data, error } = await sb.from('vendedores').select('*').order('nome');
    if (error) { console.error('Erro vendedores:', error); return []; }
    return data;
  },

  async salvarVendedor(vendedor) {
    if (vendedor.id) {
      const { data, error } = await sb.from('vendedores').update(vendedor).eq('id', vendedor.id).select().single();
      if (error) { console.error('Erro salvar vendedor:', error); return null; }
      return data;
    } else {
      const { data, error } = await sb.from('vendedores').insert(vendedor).select().single();
      if (error) { console.error('Erro criar vendedor:', error); return null; }
      return data;
    }
  },

  async excluirVendedor(id) {
    // NOVO: limpa qualquer referência apontando pra esse vendedor DIRETO no
    // banco (não depende do cache local, que pode estar desatualizado) —
    // senão o banco bloqueia a exclusão por chave estrangeira
    const { error: errDesvincular } = await sb.from('vendedores').update({ lider_id: null }).eq('lider_id', id);
    if (errDesvincular) { console.error('Erro ao desvincular equipe:', errDesvincular); return false; }

    const { error: errLeads1 } = await sb.from('leads_funil').update({ vendedor_id: null }).eq('vendedor_id', id);
    if (errLeads1) { console.error('Erro ao desvincular leads (vendedor_id):', errLeads1); return false; }

    const { error: errLeads2 } = await sb.from('leads_funil').update({ vendedor_anterior_id: null }).eq('vendedor_anterior_id', id);
    if (errLeads2) { console.error('Erro ao desvincular leads (vendedor_anterior_id):', errLeads2); return false; }

    const { error } = await sb.from('vendedores').delete().eq('id', id);
    if (error) { console.error('Erro excluir vendedor:', error); return false; }
    return true;
  },

  /* ── CLIENTES ────────────────────────────────────────────────────────────── */
  async listarClientes() {
    const { data, error } = await sb.from('clientes').select('*').order('nome');
    if (error) { console.error('Erro clientes:', error); return []; }
    return data;
  },

  async salvarCliente(cliente) {
    if (cliente.id) {
      const { data, error } = await sb.from('clientes').update(cliente).eq('id', cliente.id).select().single();
      if (error) { console.error('Erro salvar cliente:', error); return null; }
      return data;
    } else {
      const { data, error } = await sb.from('clientes').insert(cliente).select().single();
      if (error) { console.error('Erro criar cliente:', error); return null; }
      return data;
    }
  },

  async excluirCliente(id) {
    const { error } = await sb.from('clientes').delete().eq('id', id);
    if (error) { console.error('Erro excluir cliente:', error); return false; }
    return true;
  },

  async buscarCliente(termo) {
    const { data, error } = await sb.from('clientes')
      .select('*')
      .or(`nome.ilike.%${termo}%,cpf.ilike.%${termo}%,telefone.ilike.%${termo}%`)
      .order('nome');
    if (error) { console.error('Erro buscar cliente:', error); return []; }
    return data;
  },

  /* ── ACESSO A TABELAS POR VENDEDOR ───────────────────────────────────────── */
  async listarAcessoTabelas() {
    const { data, error } = await sb.from('acesso_tabelas').select('*');
    if (error) { console.error('Erro acesso_tabelas:', error); return []; }
    return data;
  },

  async salvarAcessoTabelas(vendedorId, tabelaIds) {
    const { error: errDel } = await sb.from('acesso_tabelas').delete().eq('vendedor_id', vendedorId);
    if (errDel) { console.error('Erro ao limpar acesso_tabelas:', errDel); return false; }
    if (tabelaIds.length === 0) return true;
    const rows = tabelaIds.map(tid => ({ vendedor_id: vendedorId, tabela_id: tid }));
    const { error: errIns } = await sb.from('acesso_tabelas').insert(rows);
    if (errIns) { console.error('Erro ao salvar acesso_tabelas:', errIns); return false; }
    return true;
  },

  /* ── TABELAS DE COMISSÃO ─────────────────────────────────────────────────── */
  async listarTabelas() {
    const { data, error } = await sb.from('tabelas_comissao').select('*').order('ref');
    if (error) { console.error('Erro tabelas:', error); return []; }
    return data;
  },

  // Tabela de comissão de gerência (com/sem líder de equipe) — se não existir
  // ainda no banco, retorna [] e o app usa o fallback fixo do app.js
  async listarTabelasComissaoGerencia() {
    const { data, error } = await sb.from('tabelas_comissao_gerencia').select('*');
    if (error) { console.warn('tabelas_comissao_gerencia não encontrada (usando fallback fixo):', error.message); return []; }
    return data;
  },

  // NOVO: override do líder de equipe (Supervisor/Closer) sobre a produção
  // da equipe, tabela completa por produto/parcela — quando existir uma
  // linha aqui pra tabela+unidade, tem prioridade sobre o cálculo antigo
  async listarTabelasOverrideLider() {
    const { data, error } = await sb.from('tabelas_override_lider').select('*');
    if (error) { console.warn('tabelas_override_lider não encontrada (opcional):', error.message); return []; }
    return data;
  },

  async listarTabelasComissaoSupervisor() {
    const { data, error } = await sb.from('tabelas_comissao_supervisor').select('*');
    if (error) { console.warn('tabelas_comissao_supervisor não encontrada (opcional):', error.message); return []; }
    return data;
  },

  /* ── TREINAMENTOS ────────────────────────────────────────────────────────── */
  async listarTreinamentos() {
    const { data, error } = await sb.from('treinamentos').select('*').order('criado_em', { ascending: false });
    if (error) { console.warn('treinamentos não encontrada (opcional):', error.message); return []; }
    return data;
  },

  async salvarTreinamento(t) {
    const { data, error } = await sb.from('treinamentos').insert(t).select().single();
    if (error) { console.error('Erro ao salvar treinamento:', error); return null; }
    return data;
  },

  async excluirTreinamento(id) {
    const { error } = await sb.from('treinamentos').delete().eq('id', id);
    if (error) { console.error('Erro ao excluir treinamento:', error); return false; }
    return true;
  },

  /* ── VENDAS ──────────────────────────────────────────────────────────────── */
  async listarVendas(filtros = {}) {
    let query = sb.from('vendas').select(`
      *,
      vendedor_info:vendedores!vendas_vendedor_id_fkey(id, nome, email),
      cliente:clientes(id, nome, cpf, telefone)
    `).order('dvenda', { ascending: false });

    if (filtros.vendedor_id) query = query.eq('vendedor_id', filtros.vendedor_id);
    if (filtros.status)      query = query.eq('status', filtros.status);
    if (filtros.mes)         query = query.gte('dvenda', filtros.mes + '-01').lte('dvenda', filtros.mes + '-31');

    const { data, error } = await query;
    if (error) { console.error('Erro vendas:', error); return []; }
    return data;
  },

  async salvarVenda(venda) {
    if (venda.id) {
      const { data, error } = await sb.from('vendas').update(venda).eq('id', venda.id).select().single();
      if (error) { console.error('Erro salvar venda:', error); return null; }
      return data;
    } else {
      const { data, error } = await sb.from('vendas').insert(venda).select().single();
      if (error) { console.error('Erro criar venda:', error); return null; }
      return data;
    }
  },

  async excluirVenda(id) {
    const { error } = await sb.from('vendas').delete().eq('id', id);
    if (error) { console.error('Erro excluir venda:', error); return false; }
    return true;
  },

  /* ── FECHAMENTOS ─────────────────────────────────────────────────────────── */
  async listarFechamentos(filtros = {}) {
    let query = sb.from('fechamentos').select(`
      *,
      vendedor:vendedores(id, nome)
    `).order('mes', { ascending: false });

    if (filtros.vendedor_id) query = query.eq('vendedor_id', filtros.vendedor_id);
    if (filtros.mes)         query = query.eq('mes', filtros.mes);
    if (filtros.status)      query = query.eq('status', filtros.status);

    const { data, error } = await query;
    if (error) { console.error('Erro fechamentos:', error); return []; }
    return data;
  },

  async salvarFechamento(fech) {
    if (fech.id) {
      const { data, error } = await sb.from('fechamentos').update(fech).eq('id', fech.id).select().single();
      if (error) { console.error('Erro salvar fechamento:', error); return null; }
      return data;
    } else {
      const { data, error } = await sb.from('fechamentos').insert(fech).select().single();
      if (error) { console.error('Erro criar fechamento:', error); return null; }
      return data;
    }
  },

  /* ── FECHAMENTOS DO GESTOR (vendedor_id = null) ─────────────────────────── */
  async listarFechamentosGestor() {
    const { data, error } = await sb.from('fechamentos').select('*').is('vendedor_id', null).order('mes');
    if (error) { console.error('Erro fechamentos gestor:', error); return []; }
    return data;
  },

  async salvarFechamentoGestorComValor(fech, valorLiquido) {
    const payload = {
      vendedor_id:   null,
      mes:           fech.mes,
      status:        fech.status,
      nf_numero:     fech.nfNumero || null,
      data_nf:       fech.dataNF || null,
      data_pgto:     fech.dataPgto || null,
      forma_pgto:    fech.formaPgto || null,
      obs:           fech.obs || '',
      valor_liquido: valorLiquido,
    };
    if (fech.id) {
      const { data, error } = await sb.from('fechamentos').update(payload).eq('id', fech.id).select().single();
      if (error) { console.error('Erro salvar fechamento gestor:', error); return null; }
      return data;
    } else {
      const { data, error } = await sb.from('fechamentos').insert(payload).select().single();
      if (error) { console.error('Erro criar fechamento gestor:', error); return null; }
      return data;
    }
  },

  async salvarFechamentoGestor(fech) {
    const payload = {
      vendedor_id: null,
      mes:         fech.mes,
      status:      fech.status,
      nf_numero:   fech.nfNumero || null,
      data_nf:     fech.dataNF || null,
      data_pgto:   fech.dataPgto || null,
      forma_pgto:  fech.formaPgto || null,
      obs:         fech.obs || '',
    };
    if (fech.id) {
      const { data, error } = await sb.from('fechamentos').update(payload).eq('id', fech.id).select().single();
      if (error) { console.error('Erro salvar fechamento gestor:', error); return null; }
      return data;
    } else {
      const { data, error } = await sb.from('fechamentos').insert(payload).select().single();
      if (error) { console.error('Erro criar fechamento gestor:', error); return null; }
      return data;
    }
  },

  /* ── ESTORNOS ────────────────────────────────────────────────────────────── */
  async listarEstornos() {
    const { data, error } = await sb.from('estornos').select(`
      *,
      venda:vendas(id, contrato, valor, tabela_id, cliente:clientes(nome))
    `).order('created_at', { ascending: false });
    if (error) { console.error('Erro estornos:', error); return []; }
    return data;
  },

  async salvarEstorno(estorno) {
    if (estorno.id) {
      const { data, error } = await sb.from('estornos').update(estorno).eq('id', estorno.id).select().single();
      if (error) { console.error('Erro salvar estorno:', error); return null; }
      return data;
    } else {
      const { data, error } = await sb.from('estornos').insert(estorno).select().single();
      if (error) { console.error('Erro criar estorno:', error); return null; }
      return data;
    }
  },

  /* ── FUNIL DE ATENDIMENTO ──────────────────────────────────────────────── */
  async listarLeadsFunil() {
    const { data, error } = await sb.from('leads_funil').select('*').order('criado_em_ts', { ascending: false });
    if (error) { console.error('Erro leads_funil:', error); return []; }
    return data;
  },

  async criarLeadFunil(lead) {
    const { data, error } = await sb.from('leads_funil').insert(lead).select().single();
    if (error) { console.error('Erro criar lead:', error); return null; }
    return data;
  },

  // NOVO: importação em massa (planilha) — insere vários leads de uma vez
  async criarLeadsFunilEmMassa(leads) {
    const { data, error } = await sb.from('leads_funil').insert(leads).select();
    if (error) { console.error('Erro na importação em massa:', error); return null; }
    return data;
  },

  async excluirLeadFunil(id) {
    const { error } = await sb.from('leads_funil').delete().eq('id', id);
    if (error) { console.error('Erro excluir lead:', error); return false; }
    return true;
  },

  async atualizarLeadFunil(id, campos) {
    const { data, error } = await sb.from('leads_funil').update(campos).eq('id', id).select().single();
    if (error) { console.error('Erro atualizar lead:', error); return null; }
    return data;
  },

  async getRodizio() {
    const { data, error } = await sb.from('funil_rodizio').select('*').eq('id', 1).single();
    if (error) { console.warn('funil_rodizio não encontrada:', error.message); return { ultimo_indice: -1 }; }
    return data;
  },

  async atualizarRodizio(ultimoIndice) {
    const { error } = await sb.from('funil_rodizio').update({ ultimo_indice: ultimoIndice }).eq('id', 1);
    if (error) console.error('Erro atualizar rodízio:', error);
  },

  async listarLigacoesFunil() {
    const { data, error } = await sb.from('funil_ligacoes').select('*');
    if (error) { console.warn('funil_ligacoes não encontrada:', error.message); return []; }
    return data;
  },

  async registrarLigacao(vendedorId, data, incremento) {
    const { data: existente } = await sb.from('funil_ligacoes').select('*').eq('vendedor_id', vendedorId).eq('data', data).maybeSingle();
    if (existente) {
      const { error } = await sb.from('funil_ligacoes').update({ quantidade: existente.quantidade + incremento }).eq('id', existente.id);
      if (error) console.error('Erro atualizar ligações:', error);
    } else {
      const { error } = await sb.from('funil_ligacoes').insert({ vendedor_id: vendedorId, data, quantidade: incremento });
      if (error) console.error('Erro criar registro de ligações:', error);
    }
  },

  // NOVO: salva os números do dia (ligações + conversadas) vindos do 3C —
  // define o valor exato (não soma), digitado manualmente pelo vendedor
  async salvarLigacoesConversadasDia(vendedorId, data, ligacoes, conversadas) {
    const { data: existente } = await sb.from('funil_ligacoes').select('*').eq('vendedor_id', vendedorId).eq('data', data).maybeSingle();
    if (existente) {
      const { error } = await sb.from('funil_ligacoes').update({ quantidade: ligacoes, conversadas }).eq('id', existente.id);
      if (error) { console.error('Erro salvar ligações/conversadas:', error); return false; }
    } else {
      const { error } = await sb.from('funil_ligacoes').insert({ vendedor_id: vendedorId, data, quantidade: ligacoes, conversadas });
      if (error) { console.error('Erro criar ligações/conversadas:', error); return false; }
    }
    return true;
  },

  // NOVO: configuração das metas diárias (editável pelo gestor)
  async carregarMetaDiariaConfig() {
    const { data, error } = await sb.from('metas_diarias_config').select('*').eq('id', 1).maybeSingle();
    if (error) { console.warn('metas_diarias_config não encontrada (usando padrão):', error.message); return null; }
    return data;
  },

  async salvarMetaDiariaConfig(config) {
    const { error } = await sb.from('metas_diarias_config').update(config).eq('id', 1);
    if (error) { console.error('Erro ao salvar meta diária:', error); return false; }
    return true;
  },

  // NOVO: gestor corrige um dia específico (define a quantidade exata, não soma)
  async editarQuantidadeLigacao(vendedorId, data, novaQuantidade) {
    const { data: existente } = await sb.from('funil_ligacoes').select('*').eq('vendedor_id', vendedorId).eq('data', data).maybeSingle();
    if (existente) {
      const { error } = await sb.from('funil_ligacoes').update({ quantidade: novaQuantidade }).eq('id', existente.id);
      if (error) { console.error('Erro editar ligações:', error); return false; }
    } else {
      const { error } = await sb.from('funil_ligacoes').insert({ vendedor_id: vendedorId, data, quantidade: novaQuantidade });
      if (error) { console.error('Erro criar registro de ligações:', error); return false; }
    }
    return true;
  },

  async excluirLigacao(vendedorId, data) {
    const { error } = await sb.from('funil_ligacoes').delete().eq('vendedor_id', vendedorId).eq('data', data);
    if (error) { console.error('Erro excluir ligações:', error); return false; }
    return true;
  },

  async listarIAFunil() {
    const { data, error } = await sb.from('funil_ia').select('*');
    if (error) { console.warn('funil_ia não encontrada:', error.message); return []; }
    return data;
  },

  async registrarIA(data, contatos, respostas, reunioes) {
    const { data: existente } = await sb.from('funil_ia').select('*').eq('data', data).maybeSingle();
    if (existente) {
      const { error } = await sb.from('funil_ia').update({
        contatos: existente.contatos + contatos,
        respostas: existente.respostas + respostas,
        reunioes: existente.reunioes + reunioes,
      }).eq('id', existente.id);
      if (error) console.error('Erro atualizar IA:', error);
    } else {
      const { error } = await sb.from('funil_ia').insert({ data, contatos, respostas, reunioes });
      if (error) console.error('Erro criar registro de IA:', error);
    }
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   CARREGAMENTO INICIAL — Preenche o DB com dados reais do Supabase
   ═══════════════════════════════════════════════════════════════════════════ */
async function carregarDadosIniciais() {
  mostrarCarregando(true);
  try {
    const [vendedores, clientes, tabelas, tabelasComissaoGerencia, tabelasOverrideLider, tabelasComissaoSupervisorDB, vendas, fechGestor, fechVendedores, acessoTabelas, leadsFunil, rodizio, ligacoesFunil, iaFunil, treinamentos, metaDiariaConfig] = await Promise.all([
      Servicos.listarVendedores(),
      Servicos.listarClientes(),
      Servicos.listarTabelas(),
      Servicos.listarTabelasComissaoGerencia(),
      Servicos.listarTabelasOverrideLider(),
      Servicos.listarTabelasComissaoSupervisor(),
      Servicos.listarVendas(),
      Servicos.listarFechamentosGestor(),
      Servicos.listarFechamentos(),
      Servicos.listarAcessoTabelas(),
      Servicos.listarLeadsFunil(),
      Servicos.getRodizio(),
      Servicos.listarLigacoesFunil(),
      Servicos.listarIAFunil(),
      Servicos.listarTreinamentos(),
      Servicos.carregarMetaDiariaConfig(),
    ]);

    // ── Vendedores ──────────────────────────────────────────────────────────
    DB.vendedores = vendedores.map(v => ({
      id:           v.id,
      nome:         v.nome,
      email:        v.email,
      meta:         parseFloat(v.meta || 0),
      dataEntrada:  v.data_entrada ? String(v.data_entrada).substring(0,10) : null,
      modelo:       v.modelo || 'modelo1',
      liderId:      v.lider_id || null, // quem é o líder de equipe dele (null = reporta direto ao gestor)
      unidade:      v.unidade || 'brusque',
      primeiroAcesso: v.primeiro_acesso !== false,
      foto:         v.foto_url || null,
    }));

    // ── Clientes ────────────────────────────────────────────────────────────
    DB.clientes = clientes.map(c => ({
      id:       c.id,
      nome:     c.nome,
      cpf:      c.cpf || '',
      cnpj:     c.cnpj || '',
      telefone: c.telefone || '',
      whatsapp: c.whatsapp || '',
      email:    c.email || '',
      endereco: c.endereco || '',
      cidade:   c.cidade || '',
      estado:   c.estado || '',
    }));

    // ── Tabelas de comissão (vendedores) ────────────────────────────────────
    DB.tabelas = tabelas.map(t => ({
      id:       t.id,
      nome:     t.nome,
      ref:      t.ref,
      parcelas: Array.isArray(t.parcelas) ? t.parcelas : JSON.parse(t.parcelas || '[]'),
      ativo:    t.ativo !== false,
      unidade:  t.unidade || 'brusque',
    }));

    // ── Comissão de gerência por produto (com/sem líder de equipe) ──────────
    if (tabelasComissaoGerencia && tabelasComissaoGerencia.length > 0) {
      DB.tabelasComissaoGerencia = tabelasComissaoGerencia.map(g => ({
        tabela_id:     g.tabela_id,
        unidade:       g.unidade || 'brusque',
        comSupervisor: Array.isArray(g.com_supervisor) ? g.com_supervisor : JSON.parse(g.com_supervisor || '[]'),
        semSupervisor: Array.isArray(g.sem_supervisor) ? g.sem_supervisor : JSON.parse(g.sem_supervisor || '[]'),
      }));
    }
    // Se a tabela não existir no banco ainda, DB.tabelasComissaoGerencia
    // definida fixa no app.js continua valendo (fallback).

    // NOVO: override do líder de equipe sobre a produção da equipe, tabela
    // completa por produto — só existe pra unidades que precisam (ex:
    // Blumenau). Se vazio, o cálculo cai pro comSupervisor de cima (Brusque).
    DB.tabelasOverrideLider = (tabelasOverrideLider || []).map(t => ({
      tabela_id: t.tabela_id,
      unidade:   t.unidade || 'brusque',
      parcelas:  Array.isArray(t.parcelas) ? t.parcelas : JSON.parse(t.parcelas || '[]'),
    }));

    // NOVO: tabela pessoal do líder (quando ele fecha venda sozinho), agora
    // com unidade — sobrescreve o fallback fixo do app.js se vier do banco
    if (tabelasComissaoSupervisorDB && tabelasComissaoSupervisorDB.length > 0) {
      DB.tabelasSupervisor = tabelasComissaoSupervisorDB.map(t => ({
        id:       t.id,
        nome:     t.nome,
        unidade:  t.unidade || 'brusque',
        parcelas: Array.isArray(t.parcelas) ? t.parcelas : JSON.parse(t.parcelas || '[]'),
      }));
    }

    // NOVO: treinamentos (scripts e vídeos)
    DB.treinamentos = (treinamentos || []).map(t => ({
      id:          t.id,
      titulo:      t.titulo,
      categoria:   t.categoria || 'abordagem',
      tipo:        t.tipo || 'video',
      urlVideo:    t.url_video || '',
      conteudo:    t.conteudo || '',
      publicoAlvo: t.publico_alvo || 'todos',
      unidade:     t.unidade || null,
      criadoPor:   t.criado_por || '',
      criadoEm:    t.criado_em || null,
    }));

    // NOVO: configuração das metas diárias — se não tiver no banco ainda,
    // mantém o fallback fixo (META_DIARIA) já definido no app.js
    if (metaDiariaConfig) {
      DB.metaDiariaConfig = {
        credito:      Number(metaDiariaConfig.credito),
        ligacoes:     Number(metaDiariaConfig.ligacoes),
        conversadas:  Number(metaDiariaConfig.conversadas),
        interessados: Number(metaDiariaConfig.interessados),
        agendamentos: Number(metaDiariaConfig.agendamentos),
        reunioes:     Number(metaDiariaConfig.reunioes),
      };
    }

    // ── Vendas ──────────────────────────────────────────────────────────────
    DB.vendas = vendas.map(v => {
      const normDate = d => d ? String(d).substring(0, 10) : null;

      let parcelas = [];
      try {
        if (Array.isArray(v.parcelas)) {
          parcelas = v.parcelas;
        } else if (v.parcelas && typeof v.parcelas === 'string') {
          const cleaned = v.parcelas
            .replace(/'/g, '"')
            .replace(/(\w+):/g, '"$1":')
            .trim();
          parcelas = JSON.parse(cleaned);
        } else if (v.parcelas && typeof v.parcelas === 'object') {
          parcelas = Object.values(v.parcelas);
        }
      } catch(e) {
        console.warn(`Parcelas inválidas no contrato ${v.contrato}:`, v.parcelas);
        parcelas = [];
      }

      return {
        id:         v.id,
        vendedor:   v.vendedor_id,
        cliente_id: v.cliente_id,
        cliente:    v.cliente?.nome || v.cliente_nome || '',
        contrato:   v.contrato || '',
        tabela:     v.tabela_id,
        categoria:  v.categoria || null,
        grupo:      v.grupo || '',
        cota:       v.cota || '',
        valor:      Number(v.valor) || 0,
        dvenda:     normDate(v.dvenda),
        d2parc:     normDate(v.d2parc),
        status:     v.status || 'ativo',
        dataInad:   normDate(v.data_inad) || null,
        parcelas,
        obs:        v.obs || '',
        estorno:    v.estorno
          ? (typeof v.estorno === 'string' ? JSON.parse(v.estorno) : v.estorno)
          : null,
        regularizacao: v.regularizacao
          ? (typeof v.regularizacao === 'string' ? JSON.parse(v.regularizacao) : v.regularizacao)
          : null,
        notifs:     v.notifs
          ? (typeof v.notifs === 'string' ? JSON.parse(v.notifs) : v.notifs)
          : [],
      };
    });

    // ── Fechamentos dos vendedores ──────────────────────────────────────────
    if (fechVendedores && fechVendedores.length > 0) {
      DB.fechamentos = fechVendedores
        .filter(f => f.vendedor_id !== null)
        .map(f => ({
          id:           f.id,
          vendedor:     f.vendedor_id,
          mes:          f.mes,
          status:       f.status || 'aberto',
          nfNumero:     f.nf_numero || null,
          dataNF:       f.data_nf ? String(f.data_nf).substring(0,10) : null,
          dataPgto:     f.data_pgto ? String(f.data_pgto).substring(0,10) : null,
          formaPgto:    f.forma_pgto || null,
          obs:          f.obs || '',
          valorLiquido: f.valor_liquido != null ? parseFloat(f.valor_liquido) : null,
          producao:     [],
          recorrencia:  [],
          estornos:     [],
        }));
      DB.nextFechId = Math.max(...DB.fechamentos.map(f => typeof f.id === 'number' ? f.id : 0), 7) + 1;
    }

    // ── Fechamentos do gestor ───────────────────────────────────────────────
    DB.fechamentosGestor = fechGestor.map(f => ({
      id:           f.id,
      mes:          f.mes,
      status:       f.status || 'aberto',
      nfNumero:     f.nf_numero || null,
      dataNF:       f.data_nf ? String(f.data_nf).substring(0,10) : null,
      dataPgto:     f.data_pgto ? String(f.data_pgto).substring(0,10) : null,
      formaPgto:    f.forma_pgto || null,
      obs:          f.obs || '',
      valorLiquido: f.valor_liquido != null ? parseFloat(f.valor_liquido) : null,
    }));

    // ── Acesso a tabelas por vendedor ────────────────────────────────────────
    DB.acessoTabelas = {};
    acessoTabelas.forEach(a => {
      if (!DB.acessoTabelas[a.vendedor_id]) DB.acessoTabelas[a.vendedor_id] = [];
      DB.acessoTabelas[a.vendedor_id].push(a.tabela_id);
    });

    // ── Funil de Atendimento ──────────────────────────────────────────────
    DB.leadsFunil = leadsFunil.map(l => ({
      id: l.id, nome: l.nome, email: l.email || '', celular: l.celular || '',
      interesse: l.interesse || [], valorCredito: parseFloat(l.valor_credito || 0),
      rendaFamiliar: parseFloat(l.renda_familiar || 0), decideCompra: l.decide_compra || '',
      parcelaIdeal: parseFloat(l.parcela_ideal || 0), recursoProprio: parseFloat(l.recurso_proprio || 0),
      pagaAluguel: l.paga_aluguel || 'nao', pagaAluguelValor: parseFloat(l.paga_aluguel_valor || 0),
      fgts: l.fgts || 'nao', fgtsValor: parseFloat(l.fgts_valor || 0),
      cidade: l.cidade || '', origemProspeccao: l.origem_prospeccao || '', profissao: l.profissao || '',
      observacoes: l.observacoes || '',
      origem: l.origem, vendedor: l.vendedor_id, vendedorAnterior: l.vendedor_anterior_id || null,
      etapa: l.etapa, perfil: l.perfil, motivoPerdido: l.motivo_perdido || null,
      tentativas: l.tentativas || 0, valorVenda: parseFloat(l.valor_venda || 0),
      vezesRedistribuido: l.vezes_redistribuido || 0, autoRedistribuidoEm: l.auto_redistribuido_em,
      dataReuniao1: l.data_reuniao1, horaReuniao1: l.hora_reuniao1,
      requerGestorReuniao1: l.requer_gestor_reuniao1, requerSupervisorReuniao1: l.requer_supervisor_reuniao1,
      dataReuniao2: l.data_reuniao2, horaReuniao2: l.hora_reuniao2,
      requerGestorReuniao2: l.requer_gestor_reuniao2, requerSupervisorReuniao2: l.requer_supervisor_reuniao2,
      criadoEm: l.criado_em, criadoEmTs: l.criado_em_ts, primeiroContatoTs: l.primeiro_contato_ts,
      historico: l.historico_etapas || [],
      anuncioOrigem: l.anuncio_origem || '',
      feedbacks: l.feedbacks || [],
      vendaId: l.venda_id || null,
      statusReuniao1: l.status_reuniao1 || null,
      statusReuniao2: l.status_reuniao2 || null,
      unidade: l.unidade || 'brusque',
      unidadeOrigem: l.unidade_origem || null,
      transferenciasUnidade: l.transferencias_unidade || [],
    }));

    DB.funilRodizio = { ultimoIndice: rodizio?.ultimo_indice ?? -1 };

    DB.funilLigacoes = {};
    DB.funilConversadas = {};
    ligacoesFunil.forEach(r => {
      const dataKey = String(r.data).substring(0,10);
      if (!DB.funilLigacoes[r.vendedor_id]) DB.funilLigacoes[r.vendedor_id] = {};
      if (!DB.funilConversadas[r.vendedor_id]) DB.funilConversadas[r.vendedor_id] = {};
      DB.funilLigacoes[r.vendedor_id][dataKey] = r.quantidade;
      DB.funilConversadas[r.vendedor_id][dataKey] = r.conversadas || 0;
    });

    DB.funilIA = {};
    iaFunil.forEach(r => {
      DB.funilIA[String(r.data).substring(0,10)] = { contatos: r.contatos, respostas: r.respostas, reunioes: r.reunioes };
    });

    console.log(`✅ Supabase carregado — ${DB.vendedores.length} vendedores · ${DB.clientes.length} clientes · ${DB.vendas.length} vendas · ${DB.leadsFunil.length} leads`);
    if (DB.vendas.length > 0) {
      console.log('📅 Exemplo dvenda:', DB.vendas[0].dvenda, '| d2parc:', DB.vendas[0].d2parc);
    }

  } catch (e) {
    console.error('Erro ao carregar dados do Supabase:', e);
    Dialog.alert('Erro de conexão', [
      'Não foi possível conectar ao banco de dados.',
      'Verifique sua conexão e recarregue a página.'
    ]);
  } finally {
    mostrarCarregando(false);
  }
}

function mostrarCarregando(show) {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText = `
      position:fixed;inset:0;background:#0C0E12ee;z-index:9999;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    `;
    el.innerHTML = `
      <div style="font-family:'DM Mono',monospace;font-size:24px;font-weight:700;letter-spacing:-1px">
        <span style="color:#ECEEF5">W</span><span style="color:#C8392B">CON</span>
      </div>
      <div style="width:40px;height:2px;background:#1E2128;border-radius:2px;overflow:hidden;margin-top:4px">
        <div id="loading-bar" style="width:0%;height:100%;background:#C8392B;transition:width 2s ease;border-radius:2px"></div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:#3D4250;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px">Carregando...</div>
      <style>@keyframes wcon-pulse{0%,100%{opacity:.4}50%{opacity:1}}</style>
    `;
    document.body.appendChild(el);
    setTimeout(() => {
      const bar = document.getElementById('loading-bar');
      if (bar) bar.style.width = '100%';
    }, 50);
  }
  el.style.display = show ? 'flex' : 'none';
}
