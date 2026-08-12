/* ═══════════════════════════════════════════════════════════════════════════
   WCON SYSTEM — app.js v1.0
   Arquitetura: SPA modular, Data Layer centralizado, preparado para API REST
   Módulos: Dashboard, Vendedores, Clientes, Comissões, Relatórios,
            Inadimplência, Estornos, Tabelas, Configurações
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   0. CONFIG POR UNIDADE — únicas linhas que devem mudar entre Cuiabá/BSF/
   Brusque/Blumenau. Esse app.js é o MESMO arquivo pra todas as unidades —
   o que muda de negócio entre elas fica só aqui.
   ═══════════════════════════════════════════════════════════════════════════ */
// ─────────────────────────────────────────────────────────────────────────
// Regras de comissionamento e estorno DESTA unidade (Brusque). Não é uma
// config com toggle — é a regra real e única daqui. Se um dia precisar
// comparar com outra unidade, olha o app.js de lá, não uma flag aqui.
// ─────────────────────────────────────────────────────────────────────────
const PERCENTUAL_ESTORNO_RECEBIDA = 25; // % sobre a comissão já recebida — pode mudar no futuro

/* ═══════════════════════════════════════════════════════════════════════════
   FUNIL DE ATENDIMENTO — constantes
   ═══════════════════════════════════════════════════════════════════════════ */
const FUNIL_META = { reunioes: 20, vendas: 5, ticketMin: 200000, ticketMax: 300000, conversaoPago: 5, creditoProspectado: 15000000, ligacoes: 2000 };

// NOVO: metas diárias individuais (checklist "Minha Meta Diária")
const META_DIARIA = {
  credito: 750000,
  ligacoes: 100,
  conversadas: 35,
  interessados: 7,
  agendamentos: 3,
  reunioes: 1,
};
const FUNIL_ETAPAS = [
  { key: 'lead',            label: 'Lead' },
  { key: 'contato',         label: 'Contato' },
  { key: 'qualificacao',    label: 'Qualificação' },
  { key: 'agendamento',     label: 'Agendamento' },
  { key: 'reuniao1',        label: '1ª Reunião' },
  { key: 'reuniaoFeita',    label: 'Reunião Feita' },
  { key: 'reuniao2',        label: '2ª Reunião' },
  { key: 'analisando',      label: 'Analisando' },
  { key: 'aguardPagamento', label: 'Aguard. pagamento' },
  { key: 'venda',           label: 'Venda' },
  { key: 'followup',        label: 'Follow-up' },
];
const FUNIL_ETAPA_ORDEM = FUNIL_ETAPAS.map(e => e.key);
const FUNIL_ETAPA_REUNIAO_META = 'reuniao1';
const FUNIL_ANUNCIOS = ['YouTube', 'Site', 'Formulário WhatsApp', 'Facebook', 'Instagram', 'Planilha Alexandre', 'Formulário Instagram', 'Formulário Facebook', 'Marcelo Face', 'Marcelo Insta'];
const FUNIL_CORES_ETAPA = {
  lead:            { bg: '#EFF6FF', borda: '#378ADD' },
  contato:         { bg: '#FFF8E8', borda: '#EF9F27' },
  qualificacao:    { bg: '#F3EEFB', borda: '#8B5CF6' },
  agendamento:     { bg: '#EAF3DE', borda: '#639922' },
  reuniao1:        { bg: '#E6F1FB', borda: '#0C447C' },
  reuniaoFeita:    { bg: '#EAF3DE', borda: '#639922' },
  reuniao2:        { bg: '#E6F1FB', borda: '#0C447C' },
  analisando:      { bg: '#FFF8E8', borda: '#BA7517' },
  aguardPagamento: { bg: '#FFF8E8', borda: '#BA7517' },
  venda:           { bg: '#EAF3DE', borda: '#27500A' },
  followup:        { bg: '#F0F2F5', borda: '#9CA3AF' },
  desqualificado:  { bg: '#FCEBEB', borda: '#C8392B' },
};

// NOVO: máscara de moeda em tempo real (digita "500000" -> mostra "R$ 500.000,00")
function aplicarMascaraMoeda(input, event) {
  let raw = input.dataset.raw || '';
  const tipo = event && event.inputType;
  if (tipo === 'deleteContentBackward' || tipo === 'deleteContentForward') {
    raw = raw.slice(0, -1);
  } else if (tipo === 'insertFromPaste' || !event) {
    raw = input.value.replace(/\D/g, '');
  } else if (event && event.data && /\d/.test(event.data)) {
    raw = raw + event.data.replace(/\D/g, '');
  } else if (!tipo) {
    raw = input.value.replace(/\D/g, '');
  }
  input.dataset.raw = raw;
  if (!raw) { input.value = ''; return; }
  const num = parseInt(raw, 10);
  input.value = 'R$ ' + num.toLocaleString('pt-BR') + ',00';
}
function valorMoedaParaNumero(str) {
  if (!str) return 0;
  const limpo = String(str).replace(/[^\d,]/g, '');
  return parseFloat(limpo.replace(',', '.')) || 0;
}
function formatarValorMoedaInicial(valor) {
  if (!valor) return '';
  return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const FUNIL_INTERESSES = ['Auto', 'Imóvel', 'Moto', 'Serviços', 'Outros'];
const FUNIL_ORIGENS_PROSPECCAO = ['Tráfego pago', 'Ligação ativa', 'Indicação', 'Redes sociais', 'Porta a porta', 'Outro'];
const FUNIL_CIDADES = ['Brusque', 'Blumenau', 'Itajaí', 'Outra'];


/* ═══════════════════════════════════════════════════════════════════════════
   1. DATA LAYER — Fonte única de verdade (substituível por API/Supabase)
   ═══════════════════════════════════════════════════════════════════════════ */
const DB = {

  /* ── Usuários / Vendedores ─────────────────────────────────────────────── */
  // Vazio de propósito — sempre é sobrescrito por carregarDadosIniciais() com
  // os dados reais do Supabase de cada sistema (Cuiabá, BSF, etc.). Fica assim
  // pra não misturar dados de exemplo de um sistema com o outro.
  vendedores: [],

  /* ── Credenciais (não usado — login real é via Supabase Auth) ──────────── */
  usuarios: [],

  /* ── Acesso por vendedor a tabelas — usa email como chave ─────────────── */
  // Vazio de propósito. A fonte real é a tabela acesso_tabelas no Supabase
  // (carregada em DB.acessoTabelas por carregarDadosIniciais()). Se um
  // vendedor não tiver restrição configurada lá, getTabelasVendedor() já
  // retorna todas as tabelas ativas por padrão — não precisa de fallback aqui.
  acessoTabelas: {},

  /* ── Tabelas de comissão ───────────────────────────────────────────────── */
  // Fallback só usado se o Supabase falhar ao carregar — em uso normal, essas
  // 23 linhas vêm do banco (tabela tabelas_comissao) com os mesmos valores.
  tabelas: [
    { id:'SM',   nome:'Select Mais',                     ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'P01',  nome:'Tabela PAN 8025',                  ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'P02',  nome:'Tabela PAN 8029',                  ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'SMA',  nome:'Select Mais Agibank',               ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'BA',   nome:'Tabela B / BA',                     ref:'REF6', parcelas:[0.30,0.25,0.25,0.25,0.25,0.00,0.00,0.00,0.00,0.30], ativo:true },
    { id:'BI1',  nome:'Tabela B / BI1',                    ref:'REF6', parcelas:[0.30,0.25,0.25,0.25,0.25,0.00,0.00,0.00,0.00,0.30], ativo:true },
    { id:'BI2',  nome:'Tabela B / BI2',                    ref:'REF6', parcelas:[0.30,0.25,0.25,0.25,0.25,0.00,0.00,0.00,0.00,0.30], ativo:true },
    { id:'TSS',  nome:'Tabela Select Smart',                ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'PSE',  nome:'PSE',                                ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'ASE',  nome:'Auto Select Estendido',               ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'APE',  nome:'Tabela Parcelinha Auto',              ref:'REF4', parcelas:[0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10], ativo:true },
    { id:'MOTO', nome:'Tabela Moto',                        ref:'REF5', parcelas:[0.30,0.20,0.15,0.15,0.15,0.15,0.10,0.00,0.00,0.20], ativo:true },
    { id:'SERV', nome:'Tabela Serviços',                    ref:'REF5', parcelas:[0.30,0.20,0.15,0.15,0.15,0.15,0.10,0.00,0.00,0.20], ativo:true },
    { id:'TP',   nome:'TP',                                  ref:'REF4', parcelas:[0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10], ativo:true },
    { id:'PC2',  nome:'PC2',                                 ref:'REF6', parcelas:[0.30,0.25,0.25,0.25,0.25,0.00,0.00,0.00,0.00,0.30], ativo:true },
    { id:'TEP',  nome:'Tabela Estendido Prime',              ref:'REF4', parcelas:[0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10,0.10], ativo:true },
    { id:'SEP',  nome:'SEP',                                 ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'TPF',  nome:'Parcelinha Franquias',                ref:'REF6', parcelas:[0.30,0.25,0.25,0.25,0.25,0.00,0.00,0.00,0.00,0.30], ativo:true },
    { id:'SPF',  nome:'Select Pesados Franquias',            ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
    { id:'E1',   nome:'Plano Estendido 1% até 600mil',       ref:'REF3', parcelas:[0.22,0.22,0.22,0.22,0.22,0.22,0.00,0.00,0.00,0.00], ativo:true },
    { id:'SUE',  nome:'Super Crédito Estendido',             ref:'REF3', parcelas:[0.22,0.22,0.22,0.22,0.22,0.22,0.00,0.00,0.00,0.00], ativo:true },
    { id:'ETA',  nome:'Plano Estendido 1% Automóvel',        ref:'REF3', parcelas:[0.22,0.22,0.22,0.22,0.22,0.22,0.00,0.00,0.00,0.00], ativo:true },
    { id:'RD',   nome:'Black Friday 2024',                   ref:'REF7', parcelas:[0.40,0.40,0.25,0.25,0.00,0.00,0.00,0.00,0.00,0.40], ativo:true },
  ],

  /* ── Comissão de gerência por produto (com/sem líder de equipe acima) ────── */
  // Fallback só usado se o Supabase falhar — normalmente vem da tabela
  // tabelas_comissao_gerencia. Só as 3 primeiras parcelas de cada venda.
  tabelasComissaoGerencia: [
    { tabela_id:'SM',   comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'P01',  comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'P02',  comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'SMA',  comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'BA',   comSupervisor:[0.07,0.07,0.07], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'BI1',  comSupervisor:[0.07,0.07,0.07], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'BI2',  comSupervisor:[0.07,0.07,0.07], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'TSS',  comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'PSE',  comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'ASE',  comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'APE',  comSupervisor:[0.05,0.05,0.05], semSupervisor:[0.09,0.08,0.08] },
    { tabela_id:'MOTO', comSupervisor:[0.07,0.07,0.07], semSupervisor:[0.14,0.13,0.13] },
    { tabela_id:'SERV', comSupervisor:[0.07,0.07,0.07], semSupervisor:[0.14,0.13,0.13] },
    { tabela_id:'TP',   comSupervisor:[0.05,0.05,0.05], semSupervisor:[0.09,0.08,0.08] },
    { tabela_id:'PC2',  comSupervisor:[0.07,0.07,0.07], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'TEP',  comSupervisor:[0.05,0.05,0.05], semSupervisor:[0.09,0.08,0.08] },
    { tabela_id:'SEP',  comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'TPF',  comSupervisor:[0.07,0.07,0.07], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'SPF',  comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
    { tabela_id:'E1',   comSupervisor:[0.05,0.05,0.05], semSupervisor:[0.09,0.08,0.08] },
    { tabela_id:'SUE',  comSupervisor:[0.05,0.05,0.05], semSupervisor:[0.09,0.08,0.08] },
    { tabela_id:'ETA',  comSupervisor:[0.05,0.05,0.05], semSupervisor:[0.09,0.08,0.08] },
    { tabela_id:'RD',   comSupervisor:[0.10,0.10,0.10], semSupervisor:[0.17,0.17,0.16] },
  ],

  fechamentosGestor: [],

  /* ── Funil de Atendimento ──────────────────────────────────────────────── */
  leadsFunil: [],
  funilRodizio: { ultimoIndice: -1 },
  funilLigacoes: {}, // { vendedorId: { 'YYYY-MM-DD': qtd } }
  funilConversadas: {}, // { vendedorId: { 'YYYY-MM-DD': qtd } } — vem do 3C, manual
  metaDiariaConfig: null, // sobrescrito pelo banco se existir; senão usa META_DIARIA fixo
  treinamentos: [],
  funilIA: {},        // { 'YYYY-MM-DD': { contatos, respostas, reunioes } }

  nextFechGestorId: 1,

  /* ── Regras de estorno ─────────────────────────────────────────────────── */
  semEstorno: ['APE', 'TP', 'TEP'],
  acomp6: [],

  /* ── Vendas ────────────────────────────────────────────────────────────── */
  vendas: [],
  nextVendaId: 1,

  /* ── Fechamentos mensais de comissão ───────────────────────────────────── */
  fechamentos: [],
  nextFechId: 1,

};

/* ═══════════════════════════════════════════════════════════════════════════
   LEGENDA DE SIGLAS
   ═══════════════════════════════════════════════════════════════════════════ */
const SIGLA_LEGENDA = [
  { sigla:'SM',   nome:'Select Mais' },
  { sigla:'P01',  nome:'Tabela PAN 8025' },
  { sigla:'P02',  nome:'Tabela PAN 8029' },
  { sigla:'SMA',  nome:'Select Mais Agibank' },
  { sigla:'BA',   nome:'Tabela B / BA' },
  { sigla:'BI1',  nome:'Tabela B / BI1' },
  { sigla:'BI2',  nome:'Tabela B / BI2' },
  { sigla:'TSS',  nome:'Tabela Select Smart' },
  { sigla:'PSE',  nome:'PSE' },
  { sigla:'ASE',  nome:'Auto Select Estendido' },
  { sigla:'APE',  nome:'Tabela Parcelinha Auto' },
  { sigla:'MOTO', nome:'Tabela Moto' },
  { sigla:'SERV', nome:'Tabela Serviços' },
  { sigla:'TP',   nome:'TP' },
  { sigla:'PC2',  nome:'PC2' },
  { sigla:'TEP',  nome:'Tabela Estendido Prime' },
  { sigla:'SEP',  nome:'SEP' },
  { sigla:'TPF',  nome:'Parcelinha Franquias' },
  { sigla:'SPF',  nome:'Select Pesados Franquias' },
  { sigla:'E1',   nome:'Plano Estendido 1% até 600mil' },
  { sigla:'SUE',  nome:'Super Crédito Estendido' },
  { sigla:'ETA',  nome:'Plano Estendido 1% Automóvel' },
  { sigla:'RD',   nome:'Black Friday 2024' },
];
function legendaSigla(sigla) {
  return SIGLA_LEGENDA.find(s => s.sigla === sigla)?.nome || '';
}

const CATEGORIAS_PRODUTO = [
  { id:'AUTO',    nome:'Automóvel', icon:'AUTO', cor:'var(--brand)' },
  { id:'MOTO',    nome:'Moto',      icon:'MOTO', cor:'var(--amber)' },
  { id:'IMOVEL',  nome:'Imóvel',    icon:'IMÓV', cor:'var(--green)' },
  { id:'PESADO',  nome:'Pesado',    icon:'PESD', cor:'var(--blue)' },
  { id:'SERVICO', nome:'Serviço',   icon:'SERV', cor:'var(--purple)' },
];
function categoriaInfo(id) {
  return CATEGORIAS_PRODUTO.find(c => c.id === id) || { id:'OUTROS', nome:'Outros', icon:'—', cor:'var(--text3)' };
}

/* ── Persistência: salva parcelas/status de uma venda no Supabase ──────────── */
async function persistirVenda(v) {
  try {
    const { error } = await Supabase
      .from('vendas')
      .update({ parcelas: v.parcelas, status: v.status })
      .eq('id', v.id);
    if (error) console.error('Erro ao persistir parcelas/status:', error);
  } catch(e) {
    console.error('Erro ao persistir venda:', e);
  }
  try {
    await Supabase.from('vendas').update({ data_inad: v.dataInad || null }).eq('id', v.id);
  } catch(e) {}
  try {
    await Supabase.from('vendas').update({ notifs: v.notifs || [] }).eq('id', v.id);
  } catch(e) {}
  try {
    await Supabase.from('vendas').update({ estorno: v.estorno || null }).eq('id', v.id);
  } catch(e) {}
  try {
    await Supabase.from('vendas').update({ regularizacao: v.regularizacao || null }).eq('id', v.id);
  } catch(e) {}
}

function atualizarParcelasAtrasadas() {
  const hoje = today();
  const vendasAlteradas = [];

  DB.vendas.forEach(v => {
    if (v.status === 'cancelado' || v.status === 'concluido' || v.status === 'estornado') return;
    const parcs = calcParcelas(v);
    let mudou = false;

    if (v.parcelas[0] && v.parcelas[0].s === 'pendente') {
      v.parcelas[0].s = 'pago';
      mudou = true;
    }

    v.parcelas.forEach((p, i) => {
      if (i === 0) return;
      if (p.s !== 'pendente') return;
      const parc = parcs[i];
      if (!parc || !parc.dataVencCliente) return;
      if (parc.dataVencCliente < hoje) {
        p.s = 'atrasado';
        mudou = true;
        if (v.status === 'ativo') {
          v.status = 'inadimplente';
          v.dataInad = v.dataInad || parc.dataVencCliente;
        }
      }
    });

    const pagoCount = v.parcelas.filter(p => p.s === 'pago').length;
    if (pagoCount >= 10 && v.status !== 'concluido' && v.status !== 'cancelado' && v.status !== 'estornado') {
      v.status = 'concluido';
      mudou = true;
    }

    if (mudou) vendasAlteradas.push(v);
  });

  if (vendasAlteradas.length > 0 && typeof Supabase !== 'undefined') {
    vendasAlteradas.forEach(v => persistirVenda(v));
  }
}
const AppState = {
  user: null,
  currentModule: null,
  unidadeVisualizacao: null, // NOVO: seletor manual do gestor master — null = "Ambas", ou 'brusque'/'blumenau'
  modulo: {
    relatorio:     { mesSel: null, filterStatus: 'all', filterVend: null, sortCol: null, sortDir: 'asc', busca: '' },
    comissao:      { mesSel: null, filterVend: null },
    inadimplencia: { filterSit: 'all', filterVend: null, sortCol: null, sortDir: 'asc' },
    estornos:      { filterVend: null, filterStatus: 'all' },
    remuneracao:   { mesSel: null },

    tabelas:       { expandida: null, filterRef: 'all' },
    trabalho:      { vendId: null, filterSit: 'all' },
    funil:         { filtroVend: null, mesSel: null, colunasAbertas: {}, filtroMesPipeline: null },
    agendaFunil:   { mesCalendario: null, diaSelecionado: null },
    leadsPainel:   { mesSel: null },
    treinamentos:  { filtroCategoria: 'all' },
    metaDiaria:    { periodo: 'hoje', vendedorSelecionado: null, abaGestor: 'geral' },
    comissaoSupervisor: { mesSel: null, supervisorId: null },
    comissaoLideranca: { mesSel: null, selecionado: null },
    clientes:      { search: '' },
    vendedores:    {},
    dashboard:     { rankPeriodo: 'total' },
    configuracoes: {},
  },
  editing: { vendaId: null, fechId: null, contId: null },
};

/* ═══════════════════════════════════════════════════════════════════════════
   3. UTILITÁRIOS GLOBAIS
   ═══════════════════════════════════════════════════════════════════════════ */
const fmt = v => {
  const n = Number(v);
  if (n >= 999_999_500) {
    const bi = n / 1_000_000_000;
    return 'R$\u00a0' + bi.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + 'Bi';
  }
  if (n >= 1_000_000) {
    const mi = n / 1_000_000;
    return 'R$\u00a0' + mi.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + 'Mi';
  }
  return 'R$\u00a0' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
const today = () => new Date().toISOString().split('T')[0];
const todayMes = () => today().substring(0, 7);
const mesKey = s => s ? s.substring(0, 7) : '';
const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Filtro de vendedor em dropdown — aceita lista restrita (usado pelo supervisor)
function renderVendorFilter(filterVend, setterExpr, modulo, vendedoresList) {
  const lista = vendedoresList || DB.vendedores;
  const options = lista.map(v =>
    `<option value="${v.id}"${filterVend === v.id ? ' selected' : ''}>${v.nome}</option>`
  ).join('');
  return `
  <div class="vendor-filter">
    <select class="form-input vendor-filter-select" onchange="${setterExpr}=this.value||null;rerenderModule('${modulo}')">
      <option value=""${!filterVend ? ' selected' : ''}>Todos os vendedores</option>
      ${options}
    </select>
  </div>`;
}

function mesLabel(k) {
  if (!k) return '';
  const [y, m] = k.split('-');
  return MESES_NOMES[parseInt(m) - 1] + ' ' + y;
}

function renderMesNav(mesesDisp, mesSel, setterExpr, modulo, labelFn) {
  if (!mesesDisp || mesesDisp.length === 0) return '';
  const idx  = mesesDisp.indexOf(mesSel);
  const prev = idx > 0 ? mesesDisp[idx - 1] : null;
  const next = idx >= 0 && idx < mesesDisp.length - 1 ? mesesDisp[idx + 1] : null;
  const options = mesesDisp.map(m =>
    `<option value="${m}"${m === mesSel ? ' selected' : ''}>${mesLabel(m)}${labelFn ? labelFn(m) : ''}</option>`
  ).join('');
  return `
  <div class="mes-nav-compact">
    <button class="btn btn-ghost btn-sm btn-icon" ${prev ? '' : 'disabled'}
      onclick="${setterExpr}='${prev}';rerenderModule('${modulo}')" title="Mês anterior">‹</button>
    <select class="form-input mes-nav-select" onchange="${setterExpr}=this.value;rerenderModule('${modulo}')">
      ${options}
    </select>
    <button class="btn btn-ghost btn-sm btn-icon" ${next ? '' : 'disabled'}
      onclick="${setterExpr}='${next}';rerenderModule('${modulo}')" title="Próximo mês">›</button>
  </div>`;
}
function addMonths(ds, m) {
  if (!ds) return null;
  const d = new Date(ds + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + m);
  return d.toISOString().split('T')[0];
}
function dia10Seg(ds) {
  if (!ds) return null;
  const d = new Date(ds + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + 1);
  d.setDate(10);
  return d.toISOString().split('T')[0];
}
function diasAtras(ds) {
  if (!ds) return 0;
  const d = new Date(ds + 'T00:00:00'), t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((t - d) / 86400000);
}
function diasAte(ds) {
  const d = new Date(ds + 'T00:00:00'), t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}
function initials(nome) {
  if (!nome || typeof nome !== 'string') return '??';
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '??';
}

/* ── Lógica de Parcelas ───────────────────────────────────────────────────── */
// NOVO: aceita uma fonte de tabelas alternativa (usada para a comissão pessoal
// do supervisor, que usa uma tabela de percentuais própria — DB.tabelasSupervisor)
function calcParcelas(venda, tabelasSource) {
  let tabs = tabelasSource || DB.tabelas;
  // NOVO: como agora pode ter mais de uma tabela com o mesmo id (uma por
  // unidade, ex: "SM" de Brusque e "SM" de Blumenau), desambigua pela
  // unidade do vendedor da venda antes de procurar a tabela certa.
  if (!tabelasSource) {
    const unidadeVenda = DB.vendedores.find(v => v.id === venda.vendedor)?.unidade || 'brusque';
    const filtradas = tabs.filter(t => (t.unidade || 'brusque') === unidadeVenda);
    if (filtradas.length > 0) tabs = filtradas;
  }
  const tab   = tabs.find(t => t.id === venda.tabela);
  const acomp = getPeriodoAcomp(venda.tabela);
  const semD2 = !venda.d2parc;

  return (tab?.parcelas || []).map((pct, i) => {
    let dataVencCliente;
    if (i === 0) {
      dataVencCliente = venda.dvenda;
    } else if (semD2) {
      dataVencCliente = null;
    } else {
      dataVencCliente = addMonths(venda.d2parc, i - 1);
    }

    const dataPgto = dataVencCliente ? dia10Seg(dataVencCliente) : null;
    const mesRecebimento = dataPgto ? dataPgto.substring(0, 7) : null;

    return {
      n: i + 1,
      dataVencCliente,
      dataPgto,
      mesRecebimento,
      valor: venda.valor * pct / 100,
      pct,
      ativa: pct > 0 && (i === 0 || !semD2),
      dentroAcomp: i < acomp,
    };
  });
}

function parcelasDoMes(venda, mes) {
  return calcParcelas(venda)
    .filter(p => p.ativa && p.mesRecebimento === mes);
}

function vendasDoVendedor(vendedorId) {
  const vend = DB.vendedores.find(v => v.id === vendedorId);
  const dataEntrada = vend?.dataEntrada || null;
  return DB.vendas.filter(v => {
    if (v.vendedor !== vendedorId) return false;
    if (dataEntrada && v.dvenda && v.dvenda < dataEntrada) return false;
    return true;
  });
}

function calcComissaoMes(vendas, mes) {
  const producao   = [];
  const recorrencia = [];

  vendas.forEach(v => {
    if (v.status === 'cancelado') return;
    const tab = DB.tabelas.find(t => t.id === v.tabela);
    calcParcelas(v).forEach((p, i) => {
      if (!p.ativa || p.mesRecebimento !== mes) return;
      const statusParcCliente = v.parcelas[i]?.s;
      if (p.n > 1 && statusParcCliente !== 'pago') return;

      const item = {
        cliente:  v.cliente,
        contrato: v.contrato,
        tabela:   v.tabela,
        tabelaNome: tab?.nome || v.tabela,
        n:        p.n,
        parc:     p.n,
        valor:    p.valor,
        pct:      p.pct,
        dataVencCliente: p.dataVencCliente,
        dataPgto: p.dataPgto,
        bloqueada: p.n > 1 && statusParcCliente !== 'pago',
      };
      if (p.n === 1) producao.push(item);
      else recorrencia.push(item);
    });
  });

  return { producao, recorrencia };
}

function calcEstornosMes(vendas, mes) {
  const descontos = [];

  vendas.forEach(v => {
    if (!v.estorno || !v.estorno.autorizado) return;
    const est = v.estorno;

    if (est.tipo === 'integral' && est.parcPagas < 1) {
      descontos.push({
        cliente:   v.cliente,
        contrato:  v.contrato,
        tipo:      'integral',
        desc:      'Estorno integral',
        valor:     est.valorTotal,
        parcAtual: null,
        parcTotal: null,
      });
      return;
    }

    if (est.tipo === 'parcelado' && est.parcPagas < est.parcTotal) {
      const proxParc = est.parcPagas + 1;
      descontos.push({
        cliente:  v.cliente,
        contrato: v.contrato,
        tipo:     'parcelado',
        desc:     `Estorno parcela ${proxParc}/${est.parcTotal}`,
        valor:    est.valorParcela || (est.valorTotal / est.parcTotal),
        parcAtual: proxParc,
        parcTotal: est.parcTotal,
      });
    }
  });

  return descontos;
}

function getTabelasVendedor(uid) {
  // NOVO: cada unidade tem seus próprios percentuais nas mesmas tabelas —
  // filtra primeiro pela unidade do vendedor (ou do escopo de quem está
  // olhando, se for o gestor). Se não tiver unidade definida (gestor master
  // vendo "Ambas"), NÃO filtra — mostra tabelas das duas unidades.
  const vendUid = DB.vendedores.find(v => v.id === uid);
  const unidadeAlvo = vendUid?.unidade || unidadeEscopoAtual();
  const tabelasDaUnidade = unidadeAlvo ? DB.tabelas.filter(t => (t.unidade || 'brusque') === unidadeAlvo) : DB.tabelas;

  if (!uid || uid === 'gestor') return tabelasDaUnidade;
  const porId = (DB.acessoTabelas[uid] || []);
  if (porId.length > 0) return tabelasDaUnidade.filter(t => porId.includes(t.id));
  if (vendUid) {
    const porEmail = (DB.acessoTabelas[vendUid.email] || DB.acessoTabelas[vendUid.nome?.toLowerCase().split(' ')[0]] || []);
    if (porEmail.length > 0) return tabelasDaUnidade.filter(t => porEmail.includes(t.id));
  }
  return tabelasDaUnidade;
}

/* ── Lógica de Estorno / Inadimplência ───────────────────────────────────── */
function temEstorno(tabId) { return !DB.semEstorno.includes(tabId); }
function getPeriodoAcomp(tabId) { return DB.acomp6.includes(tabId) ? 6 : 10; }
function parcCancelamento(venda) {
  const idx = venda.parcelas.findIndex(p => p.s === 'cancelado');
  return idx >= 0 ? idx + 1 : null;
}
// NOVO: soma quanto de comissão já foi efetivamente paga pra essa venda
// (só as parcelas marcadas como 'pago') — base do modelo "percentualComissaoRecebida"
function totalComissaoRecebida(venda) {
  const parcs = calcParcelas(venda);
  let total = 0;
  parcs.forEach((p, i) => {
    if (venda.parcelas[i]?.s === 'pago') total += p.valor;
  });
  return total;
}

function calcEstorno(venda) {
  if (!temEstorno(venda.tabela)) return null;
  // Regra de Brusque: % fixo sobre a comissão já recebida até o cancelamento
  const recebido = totalComissaoRecebida(venda);
  if (recebido <= 0) return null;
  return { valor: recebido * PERCENTUAL_ESTORNO_RECEBIDA / 100, pct: PERCENTUAL_ESTORNO_RECEBIDA, faixa: null, maxParc: 1, parcCancelamento: null };
}
function situacao(venda) {
  if (venda.status === 'concluido')    return 'concluido';
  if (venda.status === 'cancelado')    return 'cancelado';
  if (venda.status === 'negociacao')   return 'negociacao';
  if (venda.status !== 'inadimplente') return 'adimplente';
  const dias = diasAtras(venda.dataInad || today());
  return dias > 60 ? 'critico' : 'atraso';
}
function sitBadge(sit) {
  const M = {
    adimplente: ['badge-green', 'ADIMPLENTE'],
    atraso:     ['badge-amber', 'EM ATRASO'],
    critico:    ['badge-red',   'CRÍTICO'],
    cancelado:  ['badge-gray',  'CANCELADO'],
    concluido:  ['badge-blue',  'CONCLUÍDO'],
    negociacao: ['badge-purple','EM NEGOCIAÇÃO'],
  };
  const [cls, lbl] = M[sit] || ['badge-gray', sit];
  return `<span class="badge ${cls}">${lbl}</span>`;
}

/* ── Cálculo de Comissão Líquida ─────────────────────────────────────────── */
function calcLiquido(fech) {
  if (fech.valorLiquido != null) {
    return { prod: fech.valorLiquido, rec: 0, estornos: 0, bruto: fech.valorLiquido, liquido: fech.valorLiquido };
  }
  const prod    = (fech.producao   || []).reduce((a, i) => a + i.valor, 0);
  const rec     = (fech.recorrencia|| []).reduce((a, i) => a + i.valor, 0);
  const est     = (fech.estornos   || []).reduce((a, i) => a + Math.abs(i.valor), 0);
  const bruto   = prod + rec - est;
  return { prod, rec, estornos: est, bruto, liquido: bruto };
}

function vendorName(id) {
  if (id === 'gestor') return 'Administrador';
  return DB.vendedores.find(v => v.id === id)?.nome || id;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Escopo de dados por role — Brusque só tem gestor e vendedor comum
   ═══════════════════════════════════════════════════════════════════════════ */
function vendasNoEscopo(u) {
  const isG = (u.role === 'gestor' || u.role === 'adm');
  // NOVO: venda "pertence" à unidade do vendedor dela — filtra pela unidade
  // em foco (seletor do gestor master, ou a própria unidade de quem loga)
  const unidade = unidadeEscopoAtual();
  const vendaNaUnidade = v => {
    if (!unidade) return true;
    return (DB.vendedores.find(x => x.id === v.vendedor)?.unidade || 'brusque') === unidade;
  };
  if (isG) return DB.vendas.filter(vendaNaUnidade);
  if (u.role === 'supervisor') {
    const idsEquipe = DB.vendedores.filter(v => v.liderId === u.id).map(v => v.id);
    return DB.vendas.filter(v => (v.vendedor === u.id || idsEquipe.includes(v.vendedor)) && vendaNaUnidade(v));
  }
  return DB.vendas.filter(v => v.vendedor === u.id && vendaNaUnidade(v));
}

function vendedoresNoEscopo(u) {
  const isG = (u.role === 'gestor' || u.role === 'adm');
  if (isG) return vendedoresNaUnidade();
  if (u.role === 'supervisor') {
    return DB.vendedores.filter(v => v.id === u.id || v.liderId === u.id);
  }
  return [DB.vendedores.find(v => v.id === u.id)].filter(Boolean);
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. ROTEADOR SPA — navegação entre módulos sem reload
   ═══════════════════════════════════════════════════════════════════════════ */
const Router = {
  modules: {
    dashboard:     { label: 'Dashboard',     icon: '◈', section: 'visao', render: renderDashboard },
    trabalho:      { label: 'Relatório de Trabalho', icon: '', section: 'visao', render: renderRelatorioTrabalho },
    vendedores:    { label: 'Vendedores',    icon: '◇', section: 'cadastro', render: renderVendedores },
    clientes:      { label: 'Clientes',      icon: '○', section: 'cadastro', render: renderClientes },

    funil:         { label: 'Funil de Atendimento', icon: '', section: 'comercial', render: renderFunil },
    agendaFunil:   { label: 'Agenda', icon: '', section: 'comercial', render: renderAgendaFunil },
    relatorio:     { label: 'Relatórios',    icon: '▦', section: 'comercial', render: renderRelatorio },

    comissao:      { label: 'Comissões Vendedores', icon: '◆', section: 'financeiro', render: renderComissao },
    comissaoLideranca: { label: 'Comissão Liderança', icon: '★', section: 'financeiro', render: renderComissaoLideranca },
    inadimplencia: { label: 'Inadimplência', icon: '▲', section: 'financeiro', render: renderInadimplencia },
    estornos:      { label: 'Estornos',      icon: '✕', section: 'financeiro', render: renderEstornos },

    painelExecutivo: { label: 'Painel Executivo', icon: '', section: 'gestor', render: renderPainelExecutivoFunil },
    leadsPainel:   { label: 'Leads', icon: '', section: 'gestor', render: renderLeadsPainelFunil },
    treinamentos:  { label: 'Treinamentos', icon: '', section: 'gestor', render: renderTreinamentos },
    metaDiaria:    { label: 'Minha Meta Diária', icon: '', section: 'visao', render: renderMetaDiaria },
    transferenciasUnidade: { label: 'Transferências entre Unidades', icon: '', section: 'gestor', render: renderTransferenciasUnidade },

    tabelas:       { label: 'Tabelas',       icon: '≡', section: 'configuracao', render: renderTabelas },
    configuracoes: { label: 'Configurações', icon: '⊙', section: 'configuracao', render: renderConfiguracoes },
  },

  navigate(id) {
    if (!this.modules[id]) return;
    AppState.currentModule = id;

    buildSidebar(); // reabre a seção do item clicado (se estava fechada) e marca o ativo

    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
    const el = document.getElementById('mod-' + id);
    if (el) {
      el.classList.add('active');
      el.innerHTML = this.modules[id].render();
      initModuleEvents(id);
    }

    closeMobileSidebar();
  },
};

function initModuleEvents(id) {
  document.querySelectorAll('.overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });
  if (id === 'funil') {
    setTimeout(atualizarBarraPipelineFunil, 0);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. AUTH
   ═══════════════════════════════════════════════════════════════════════════ */
// NOVO: lista de gestores/donos (antes era um único e-mail fixo — agora
// suporta vários, ex: Brusque vai ter o Abiel + mais 3 pessoas com o mesmo
// nível de acesso "gestor"). Pra adicionar alguém, só incluir um item aqui.
const GESTOR_USERS = [
  { email: 'abielnoguera@gmail.com', nome: 'Abiel Noguera' },
  { email: 'consorciosuk@gmail.com', nome: 'Caio Ubukata' },
];

// NOVO: cada ADM tem o próprio nome (antes o nome "Lilia" estava fixo pra
// qualquer e-mail dessa lista — quebrava se adicionasse uma segunda pessoa)
const ADM_USERS = [
  { email: 'liliasilvasiq@hotmail.com',        nome: 'Lilia' },
  { email: 'estevamgroupcompany@gmail.com',    nome: 'Caleb Rinavi' },
];

// Identifica o usuário (gestor / ADM / supervisor / vendedor) pelo usuário autenticado
function resolveUserByEmail(authUser) {
  const authEmail = (authUser?.email || authUser || '').toLowerCase();
  const authId    = authUser?.id || null;
  const meta = (authUser && authUser.user_metadata) || {};
  const gestorUser = GESTOR_USERS.find(g => g.email.toLowerCase() === authEmail);
  if (gestorUser) {
    return { id: authId || 'gestor', nome: gestorUser.nome, email: authEmail, role: 'gestor', unidadeEscopo: gestorUser.unidadeEscopo || null, foto: meta.foto_url || null };
  }
  const admUser = ADM_USERS.find(a => a.email.toLowerCase() === authEmail);
  if (admUser) {
    return { id: authId || 'adm', nome: admUser.nome, email: authEmail, role: 'adm', primeiroAcesso: meta.primeiro_acesso !== false, foto: meta.foto_url || null };
  }
  const vend = DB.vendedores.find(v => (v.email || '').toLowerCase() === authEmail);
  // NOVO: supervisor não é um campo próprio — é derivado de quem tem
  // liderId apontando pra esse vendedor (ou seja, alguém reporta a ele/ela)
  if (vend) {
    const ehSupervisor = DB.vendedores.some(v => v.liderId === vend.id);
    return { ...vend, role: ehSupervisor ? 'supervisor' : 'vendedor' };
  }
  return null;
}

async function doLogin() {
  const email = document.getElementById('lu').value.trim();
  const pwd   = document.getElementById('lp').value;
  const errEl = document.getElementById('login-error');
  if (errEl) errEl.style.display = 'none';

  if (!email) { Dialog.alert('Campo obrigatório', ['Digite seu e-mail para continuar.']); return; }
  if (!pwd)   { Dialog.alert('Campo obrigatório', ['Digite a senha para continuar.']); return; }

  const btn = document.querySelector('.btn-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

  try {
    const { data, error } = await Supabase.auth.signInWithPassword({ email, password: pwd });

    if (error || !data?.user) {
      throw new Error('Credenciais inválidas');
    }

    let user = resolveUserByEmail(data.user);

    if (!user) {
      await Supabase.auth.signOut();
      throw new Error('Este e-mail não está vinculado a nenhum vendedor cadastrado. Fale com o gestor.');
    }

    AppState.user = user;

    if ((user.role === 'vendedor' || user.role === 'adm' || user.role === 'supervisor') && user.primeiroAcesso) {
      document.getElementById('login').classList.add('hidden');
      document.getElementById('primeiro-acesso').classList.remove('hidden');
      return;
    }

    entrarNoApp();
  } catch (e) {
    console.error('Erro de login:', e);
    const msg = e.message === 'Credenciais inválidas'
      ? 'E-mail ou senha incorretos.'
      : e.message;
    if (errEl) { errEl.textContent = '⚠ ' + msg; errEl.style.display = 'block'; }
    else Dialog.alert('Erro ao entrar', [msg]);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar no sistema →'; }
  }
}

function entrarNoApp() {
  AppState.modulo.relatorio.mesSel = todayMes();
  AppState.modulo.comissao.mesSel  = todayMes();

  document.getElementById('login').classList.add('hidden');
  document.getElementById('primeiro-acesso').classList.add('hidden');
  document.getElementById('app').classList.add('show');

  buildShell();
  Router.navigate('dashboard');
}

let _isRecoveryFlow = false;

async function salvarNovaSenha() {
  const s1 = document.getElementById('pa-senha1').value;
  const s2 = document.getElementById('pa-senha2').value;
  const errEl = document.getElementById('pa-error');
  errEl.style.display = 'none';

  if (s1.length < 6) { errEl.textContent = '⚠ A senha precisa ter pelo menos 6 caracteres.'; errEl.style.display = 'block'; return; }
  if (s1 !== s2)     { errEl.textContent = '⚠ As senhas não coincidem.'; errEl.style.display = 'block'; return; }

  const btn = document.querySelector('#primeiro-acesso .btn-login');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    const { error: errPwd } = await Supabase.auth.updateUser({ password: s1 });
    if (errPwd) throw errPwd;

    const u = AppState.user;

    // NOVO: se veio do link de "esqueci minha senha", só troca a senha e
    // entra — não mexe em primeiro_acesso (isso é uma coisa separada)
    if (_isRecoveryFlow) {
      _isRecoveryFlow = false;
      if (!AppState.user) {
        const { data } = await Supabase.auth.getUser();
        const userResolvido = resolveUserByEmail(data?.user);
        if (!userResolvido) {
          errEl.textContent = '⚠ Senha salva, mas não conseguimos identificar seu acesso. Faça login normalmente.';
          errEl.style.display = 'block';
          document.getElementById('primeiro-acesso')?.classList.add('hidden');
          document.getElementById('login')?.classList.remove('hidden');
          return;
        }
        AppState.user = userResolvido;
      }
      entrarNoApp();
      return;
    }

    if (u.role === 'adm') {
      const { error: errAdm } = await Supabase.auth.updateUser({ data: { primeiro_acesso: false } });
      if (errAdm) console.warn('Não foi possível marcar primeiro_acesso=false (ADM):', errAdm);
    } else {
      const { error: errVend } = await Supabase.from('vendedores').update({ primeiro_acesso: false }).eq('id', u.id);
      if (errVend) console.warn('Não foi possível marcar primeiro_acesso=false:', errVend);
    }

    u.primeiroAcesso = false;
    const vendLocal = DB.vendedores.find(v => v.id === u.id);
    if (vendLocal) vendLocal.primeiroAcesso = false;

    entrarNoApp();
  } catch(e) {
    console.error('Erro ao definir senha:', e);
    errEl.textContent = '⚠ Não foi possível salvar a senha. Tente novamente.';
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar senha e entrar →'; }
  }
}

async function tentarSessaoSalva() {
  try {
    const { data } = await Supabase.auth.getSession();
    const authUser = data?.session?.user;
    if (!authUser?.email) return false;

    let user = resolveUserByEmail(authUser);
    if (!user) return false;

    AppState.user = user;
    if ((user.role === 'vendedor' || user.role === 'adm' || user.role === 'supervisor') && user.primeiroAcesso) {
      document.getElementById('login').classList.add('hidden');
      document.getElementById('primeiro-acesso').classList.remove('hidden');
      return true;
    }
    entrarNoApp();
    return true;
  } catch(e) {
    console.error('Erro ao restaurar sessão:', e);
    return false;
  }
}

function doLogout() {
  AppState.user = null;
  AppState.currentModule = null;
  try { Supabase.auth.signOut(); } catch(e) {}
  document.getElementById('login').classList.remove('hidden');
  document.getElementById('app').classList.remove('show');
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL CORPORATIVO — substitui confirm() e alert() nativos do navegador
   ═══════════════════════════════════════════════════════════════════════════ */
const Dialog = {
  _resolve: null,

  show({ titulo, linhas = [], tipo = 'confirm', btnOk = 'Confirmar', btnCancel = 'Cancelar' }) {
    return new Promise(resolve => {
      this._resolve = resolve;

      const cores = {
        confirm: { borda: 'var(--brand)',  icone: '◈', cor: 'var(--brand)'  },
        danger:  { borda: 'var(--red)',    icone: '▲', cor: 'var(--red)'    },
        warning: { borda: 'var(--amber)',  icone: '◉', cor: 'var(--amber)'  },
        success: { borda: 'var(--green)',  icone: '◆', cor: 'var(--green)'  },
        alert:   { borda: 'var(--blue)',   icone: '◎', cor: 'var(--blue)'   },
      };
      const { borda, icone, cor } = cores[tipo] || cores.confirm;

      const linhasHTML = linhas.map(l => {
        if (typeof l === 'string') {
          return `<div style="font-size:13px;color:var(--text2);line-height:1.6;padding:2px 0">${l}</div>`;
        }
        if (l.tipo === 'destaque') {
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--ink3);border-radius:6px;margin:4px 0;font-size:12px">
            <span style="color:var(--text2)">${l.label}</span>
            <span style="font-family:var(--mono);font-weight:700;color:${l.cor || 'var(--text)'}">${l.valor}</span>
          </div>`;
        }
        if (l.tipo === 'lista') {
          return `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0">
            <span style="color:${l.cor || cor};font-size:11px;margin-top:2px;flex-shrink:0">${l.icone || '—'}</span>
            <span style="font-size:12px;color:var(--text2);line-height:1.5">${l.texto}</span>
          </div>`;
        }
        if (l.tipo === 'divisor') {
          return `<div style="border-top:1px solid var(--line);margin:10px 0"></div>`;
        }
        return '';
      }).join('');

      const soBotaoOk = tipo === 'alert' || tipo === 'success';

      const el = document.createElement('div');
      el.id = 'wcon-dialog';
      el.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;
        display:flex;align-items:center;justify-content:center;
        backdrop-filter:blur(4px);animation:fadeIn .15s ease;
      `;
      el.innerHTML = `
        <div style="
          background:var(--ink2);border:1px solid var(--line2);
          border-top:2px solid ${borda};
          border-radius:var(--r2);padding:28px;width:440px;max-width:94vw;
          box-shadow:0 32px 80px rgba(0,0,0,0.6);
          animation:modalIn .2s ease;position:relative;
        ">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <span style="font-size:18px;color:${cor}">${icone}</span>
            <div style="font-size:16px;font-weight:700;letter-spacing:-0.3px">${titulo}</div>
          </div>
          <div style="margin-bottom:20px">${linhasHTML}</div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            ${!soBotaoOk ? `<button id="wcon-dialog-cancel" class="btn btn-ghost">${btnCancel}</button>` : ''}
            <button id="wcon-dialog-ok" class="btn ${tipo === 'danger' ? 'btn-danger' : tipo === 'success' ? 'btn-success' : 'btn-primary'}">${btnOk}</button>
          </div>
        </div>`;

      document.body.appendChild(el);

      document.getElementById('wcon-dialog-ok').onclick = () => this._fechar(true);
      const cancelBtn = document.getElementById('wcon-dialog-cancel');
      if (cancelBtn) cancelBtn.onclick = () => this._fechar(false);
      el.addEventListener('click', e => { if (e.target === el) this._fechar(false); });
    });
  },

  _fechar(result) {
    document.getElementById('wcon-dialog')?.remove();
    if (this._resolve) { this._resolve(result); this._resolve = null; }
  },

  confirm(titulo, linhas = [])  { return this.show({ titulo, linhas, tipo:'confirm', btnOk:'Confirmar' }); },
  danger(titulo, linhas = [])   { return this.show({ titulo, linhas, tipo:'danger',  btnOk:'Confirmar' }); },
  warning(titulo, linhas = [])  { return this.show({ titulo, linhas, tipo:'warning', btnOk:'Entendido', btnCancel:'Cancelar' }); },
  alert(titulo, linhas = [])    { return this.show({ titulo, linhas, tipo:'alert',   btnOk:'OK' }); },
  success(titulo, linhas = [])  { return this.show({ titulo, linhas, tipo:'success', btnOk:'OK' }); },
};

/* ═══════════════════════════════════════════════════════════════════════════
   SISTEMA DE NOTIFICAÇÕES
   ═══════════════════════════════════════════════════════════════════════════ */
const Notificacoes = {

  gerar(userId, isGestor) {
    const lista = [];
    const hoje  = today();

    if (isGestor) {
      const vendasBase = vendasNoEscopo(AppState.user);
      vendasBase.filter(v => v.regularizacao?.status === 'pendente').forEach(v => {
        lista.push({
          id:    `regul-${v.id}`,
          tipo:  'regularizacao',
          icone: '↻',
          titulo: `Regularização solicitada — ${v.cliente}`,
          desc:  `Contrato ${v.contrato} · ${vendorName(v.vendedor)} · cancelado`,
          acao:  () => Router.navigate('inadimplencia'),
          cor:   'var(--blue)',
          novidade: true,
        });
      });

      vendasBase.forEach(v => {
        v.parcelas.forEach((p, i) => {
          if (p.s !== 'aguard_aprov') return;
          const parc = calcParcelas(v)[i];
          lista.push({
            id:    `aprov-${v.id}-${i}`,
            tipo:  'aprovacao',
            icone: '🔔',
            titulo: `Aprovação pendente — ${v.cliente}`,
            desc:  `${i+1}ª parcela · ${vendorName(v.vendedor)} · ${fmtDate(parc?.dataVencCliente)}`,
            acao:  () => Router.navigate('inadimplencia'),
            cor:   'var(--blue)',
          });
        });
      });

      vendasBase.filter(v => v.status === 'inadimplente').forEach(v => {
        const dias = diasAtras(v.dataInad || hoje);
        if (dias > 60) {
          lista.push({
            id:    `critico-${v.id}`,
            tipo:  'critico',
            icone: '🚨',
            titulo: `Contrato crítico — ${v.cliente}`,
            desc:  `${dias} dias em atraso · ${vendorName(v.vendedor)}`,
            acao:  () => Router.navigate('inadimplencia'),
            cor:   'var(--red)',
          });
        }
      });

      vendasBase.filter(v => v.estorno && !v.estorno.autorizado).forEach(v => {
        lista.push({
          id:    `estorno-${v.id}`,
          tipo:  'estorno',
          icone: '⚠',
          titulo: `Estorno pendente — ${v.cliente}`,
          desc:  `Cancelamento na ${parcCancelamento(v)}ª parcela · autorização necessária`,
          acao:  () => Router.navigate('estornos'),
          cor:   'var(--amber)',
        });
      });

    } else {
      DB.vendas.filter(v => v.vendedor === userId).forEach(v => {
        const parcsAtrasadas = v.parcelas.filter(p => p.s === 'atrasado').length;
        if (parcsAtrasadas > 0) {
          lista.push({
            id:    `atraso-${v.id}`,
            tipo:  'atraso',
            icone: '⚠',
            titulo: `Parcela atrasada — ${v.cliente}`,
            desc:  `${parcsAtrasadas} parcela(s) em atraso · entre em contato com o cliente`,
            acao:  () => Router.navigate('inadimplencia'),
            cor:   'var(--amber)',
          });
        }
      });

      DB.vendas.filter(v => v.vendedor === userId).forEach(v => {
        (v.notifs || []).filter(n => !n.lida).forEach(n => {
          if (n.tipo === 'aprovado' || n.tipo === 'negociacao') {
            lista.push({
              id:    `notif-${v.id}-${n.tipo}-${n.parcIdx||0}`,
              tipo:  n.tipo,
              icone: n.tipo === 'negociacao' ? '📋' : '✅',
              titulo: n.tipo === 'negociacao'
                ? `Plano de pagamento ativo — ${v.cliente}`
                : `Pagamento aprovado — ${v.cliente}`,
              desc:  n.tipo === 'negociacao'
                ? 'Você não sofrerá estorno neste contrato · comissões futuras bloqueadas'
                : `${(n.parcIdx||0) + 1}ª parcela confirmada · comissão liberada`,
              acao:  () => { marcarNotifLida(v.id, n.parcIdx||0); Router.navigate('comissao'); },
              cor:   n.tipo === 'negociacao' ? 'var(--purple)' : 'var(--green)',
              novidade: true,
            });
          }
        });
      });

      DB.vendas.filter(v => v.vendedor === userId).forEach(v => {
        const parcs = calcParcelas(v);
        v.parcelas.forEach((p, i) => {
          if (p.s !== 'pendente') return;
          const parc = parcs[i];
          if (!parc) return;
          const diasVenc = diasAte(parc.dataVencCliente);
          if (diasVenc <= 3 && diasVenc >= 0) {
            lista.push({
              id:    `vence-${v.id}-${i}`,
              tipo:  'vencendo',
              icone: '📅',
              titulo: `Parcela vence em ${diasVenc === 0 ? 'hoje' : diasVenc + ' dias'} — ${v.cliente}`,
              desc:  `${i+1}ª parcela · vence ${fmtDate(parc.dataVencCliente)}`,
              acao:  () => Router.navigate('inadimplencia'),
              cor:   'var(--amber)',
            });
          }
        });
      });
    }

    return lista;
  },

  count(userId, isGestor) {
    return this.gerar(userId, isGestor).length;
  },
};

function marcarNotifLida(vendaId, parcIdx) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v || !v.notifs) return;
  const n = v.notifs.find(x => x.parcIdx === parcIdx);
  if (n) n.lida = true;
}

function atualizarSino() {
  const u     = AppState.user;
  if (!u) return;
  const isG   = (u.role === 'gestor' || u.role === 'adm');
  const count = Notificacoes.count(u.id, isG);
  const badge = document.getElementById('notif-badge');
  const sino  = document.getElementById('btn-sino');
  if (badge) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
  if (sino) sino.title = count > 0 ? `${count} notificação(ões)` : 'Notificações';
}

function abrirNotificacoes() {
  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const lista = Notificacoes.gerar(u.id, isG);

  let html = '';
  if (lista.length === 0) {
    html = `<div style="padding:24px;text-align:center;color:var(--text3);font-family:var(--mono);font-size:12px">
      ✓ Nenhuma notificação pendente
    </div>`;
  } else {
    html = lista.map(n => `
      <div onclick="(${n.acao.toString()})()" style="
        display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);
        cursor:pointer;transition:background var(--transition);
        ${n.novidade ? 'background:rgba(61,184,122,0.04)' : ''}
      " onmouseover="this.style.background='var(--ink3)'" onmouseout="this.style.background='${n.novidade ? 'rgba(61,184,122,0.04)' : ''}'">
        <span style="font-size:18px;flex-shrink:0;margin-top:1px">${n.icone}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:${n.cor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.titulo}</div>
          <div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-top:2px;line-height:1.4">${n.desc}</div>
        </div>
        ${n.novidade ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0;margin-top:4px"></span>` : ''}
      </div>`).join('');
  }

  document.getElementById('notif-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.style.cssText = `
    position:fixed;top:${58}px;right:12px;width:340px;max-height:480px;
    background:var(--ink2);border:1px solid var(--line2);border-radius:var(--r2);
    box-shadow:0 16px 48px rgba(0,0,0,0.5);z-index:400;overflow:hidden;
    animation:modalIn .15s ease;
  `;
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line);flex-shrink:0">
      <span style="font-size:13px;font-weight:700">Notificações</span>
      ${lista.length > 0 ? `<span class="badge badge-red">${lista.length}</span>` : '<span style="font-size:11px;color:var(--text3)">Tudo em dia ✓</span>'}
    </div>
    <div style="overflow-y:auto;max-height:420px">${html}</div>
  `;
  document.body.appendChild(panel);

  setTimeout(() => {
    document.addEventListener('click', function fechar(e) {
      if (!panel.contains(e.target) && e.target.id !== 'btn-sino') {
        panel.remove();
        document.removeEventListener('click', fechar);
      }
    });
  }, 100);
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. SHELL — Header + Sidebar
   ═══════════════════════════════════════════════════════════════════════════ */
// NOVO: seletor de unidade no header — só aparece pro gestor master (sem
// unidadeEscopo). Deixa ele escolher "Brusque só", "Blumenau só" ou "Ambas".
function atualizarSeletorUnidade() {
  const u = AppState.user;
  const wrap = document.getElementById('unidade-switch-wrap');
  if (!wrap) return;
  if (!u || u.role !== 'gestor' && u.role !== 'adm' || u.unidadeEscopo) { wrap.innerHTML = ''; return; }

  // Se só existe UMA unidade nos dados (caso de Londrina, sem uma 2ª
  // unidade tipo Blumenau), não faz sentido mostrar esse seletor.
  const unidadesExistentes = new Set(DB.vendedores.map(v => v.unidade || 'brusque'));
  if (unidadesExistentes.size <= 1) { wrap.innerHTML = ''; return; }

  const atual = AppState.unidadeVisualizacao || 'todas';
  const opcoes = [['todas','Ambas'],['brusque','Brusque'],['blumenau','Blumenau']];
  wrap.innerHTML = `<div style="display:flex;gap:2px;background:var(--ink3);border-radius:8px;padding:3px;margin-right:6px">
    ${opcoes.map(([val,lbl]) => `<div onclick="trocarUnidadeVisualizacao('${val}')" style="padding:5px 10px;font-size:10px;font-weight:700;border-radius:6px;cursor:pointer;${atual===val?'background:var(--brand);color:#fff':'color:var(--text3)'}">${lbl}</div>`).join('')}
  </div>`;
}

function trocarUnidadeVisualizacao(valor) {
  AppState.unidadeVisualizacao = valor === 'todas' ? null : valor;
  atualizarSeletorUnidade();
  buildSidebar();
  if (AppState.currentModule) rerenderModule(AppState.currentModule);
}

function buildShell() {
  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');

  document.getElementById('header-user-name').textContent = u.nome;
  document.getElementById('header-user-role').textContent = isG ? (u.role === 'adm' ? 'ADM' : 'Gestor') : (u.role === 'supervisor' ? termoLiderEquipeDoVendedor(u.id) : 'Vendedor');
  document.getElementById('header-user-avatar').innerHTML = u.foto
    ? `<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : initials(u.nome);

  buildSidebar();
  atualizarSeletorUnidade();

  atualizarSino();

  clearInterval(AppState._notifInterval);
  AppState._notifInterval = setInterval(() => {
    atualizarParcelasAtrasadas();
    atualizarSino();
    buildSidebar();
  }, 30000);
}

function buildSidebar() {
  const u = AppState.user;
  if (!u) return;
  const isG   = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';

  const sections = {
    visao:        'Visão geral',
    cadastro:     'Cadastros',
    comercial:    'Comercial',
    financeiro:   'Financeiro',
    gestor:       'Gestão',
    configuracao: 'Sistema',
  };

  const temTreinamentos = isG; // por enquanto só gestor — depois liberamos pra todos

  const podeTabelas = podeAcessarTabelas();
  const visibles = isG
    ? ['dashboard','trabalho','vendedores','clientes','funil','agendaFunil','relatorio','comissao','comissaoLideranca','inadimplencia','estornos','painelExecutivo','leadsPainel',...(!u.unidadeEscopo?['transferenciasUnidade']:[]),...(podeTabelas?['tabelas']:[]),'configuracoes']
    : isSup
      ? ['dashboard','trabalho','funil','agendaFunil','relatorio','comissao','comissaoLideranca','inadimplencia','estornos',...(podeTabelas?['tabelas']:[])]
      : ['dashboard','trabalho','funil','agendaFunil','relatorio','comissao','inadimplencia','estornos',...(podeTabelas?['tabelas']:[])];

  const vendasEscopoBadge = vendasNoEscopo(u);
  const badges = {
    inadimplencia: vendasEscopoBadge.filter(v => v.status === 'inadimplente').length,
    estornos: vendasEscopoBadge.filter(v => v.estorno && !v.estorno.autorizado).length,
  };

  // NOVO: seções do menu são colapsáveis — fechadas por padrão, o usuário
  // pode abrir quantas quiser ao mesmo tempo. A seção da página atual sempre
  // fica aberta (senão o item ativo desapareceria da tela).
  if (!AppState.sidebarAbertas) AppState.sidebarAbertas = {};

  const grupos = {};
  const ordemSecoes = [];
  visibles.forEach(id => {
    const sec = Router.modules[id].section;
    if (!grupos[sec]) { grupos[sec] = []; ordemSecoes.push(sec); }
    grupos[sec].push(id);
  });

  // NOVO: card de Treinamentos — separado das seções, sempre em destaque no
  // topo do menu (é onboarding, precisa ser a primeira coisa que a pessoa vê)
  let html = '';
  if (temTreinamentos) {
    const ativoTreino = AppState.currentModule === 'treinamentos' ? ' active' : '';
    html += `<div class="nav-treinamentos-destaque${ativoTreino}" id="nav-treinamentos" onclick="Router.navigate('treinamentos')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:16px">🎓</span>
          <div>
            <div style="font-size:12px;font-weight:800;color:#fff">Treinamentos</div>
            <div style="font-size:9px;color:#ffffffcc">Onboarding · comece aqui</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // NOVO: card de Minha Meta Diária — destaque verde, pra todo mundo (gestor,
  // supervisor e vendedor), logo abaixo de Treinamentos
  const ativoMeta = AppState.currentModule === 'metaDiaria' ? ' active' : '';
  html += `<div class="nav-treinamentos-destaque nav-meta-diaria-destaque${ativoMeta}" id="nav-meta-diaria" onclick="Router.navigate('metaDiaria')">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:16px">✅</span>
      <div>
        <div style="font-size:12px;font-weight:800;color:#fff">Minha Meta Diária</div>
        <div style="font-size:9px;color:#ffffffcc">Checklist do dia</div>
      </div>
    </div>
  </div>`;

  ordemSecoes.forEach(sec => {
    const itens = grupos[sec];
    const temAtual = itens.includes(AppState.currentModule);
    const aberta = !!AppState.sidebarAbertas[sec] || temAtual;
    html += `<div class="sb-section-label" onclick="toggleSecaoMenu('${sec}')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none">
      <span>${sections[sec]}</span>
      <span style="font-size:9px;color:var(--text3)">${aberta ? '▾' : '▸'}</span>
    </div>`;
    html += `<div class="sb-section-items" style="${aberta ? '' : 'display:none'}">`;
    itens.forEach(id => {
      const mod = Router.modules[id];
      const badge = badges[id] ? `<span class="nav-badge">${badges[id]}</span>` : '';
      const ativo = AppState.currentModule === id ? ' active' : '';
      html += `<div class="nav-item${ativo}" id="nav-${id}" data-tooltip="${mod.label}" onclick="Router.navigate('${id}')">
        <span class="nav-label">${mod.label}</span>
        ${badge}
      </div>`;
    });
    html += `</div>`;
  });

  document.getElementById('sidebar-nav').innerHTML = html;
}

function toggleSecaoMenu(sec) {
  if (!AppState.sidebarAbertas) AppState.sidebarAbertas = {};
  AppState.sidebarAbertas[sec] = !AppState.sidebarAbertas[sec];
  buildSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function closeMobileSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('mobile-overlay');
  if (sb.classList.contains('mobile-open')) {
    sb.classList.remove('mobile-open');
    ov.classList.remove('show');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. MODAL ENGINE
   ═══════════════════════════════════════════════════════════════════════════ */
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

/* ═══════════════════════════════════════════════════════════════════════════
   8. MÓDULO: DASHBOARD EXECUTIVO
   ═══════════════════════════════════════════════════════════════════════════ */
let _loteriaFederalCache = undefined;
async function carregarLoteriaFederal() {
  if (_loteriaFederalCache !== undefined) return _loteriaFederalCache;
  try {
    const res = await fetch('/.netlify/functions/loteria');
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.numeros || data.numeros.length === 0) throw new Error('Sem números');
    _loteriaFederalCache = { concurso: data.concurso, numeros: data.numeros };
  } catch(e) {
    console.error('Erro ao buscar Loteria Federal:', e);
    _loteriaFederalCache = null;
  }
  return _loteriaFederalCache;
}

function renderLoteriaFederal() {
  if (_loteriaFederalCache === undefined) {
    carregarLoteriaFederal().then(() => {
      const box = document.getElementById('loteria-federal-box');
      if (box) box.innerHTML = renderLoteriaFederal();
    });
    return `<div style="font-size:12px;color:var(--text3)">Buscando último resultado...</div>`;
  }

  if (_loteriaFederalCache === null) {
    return `
      <div class="alert alert-amber">⚠ Não foi possível buscar o resultado agora. Verifique sua conexão.</div>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="_loteriaFederalCache=undefined;document.getElementById('loteria-federal-box').innerHTML=renderLoteriaFederal()">↻ Tentar novamente</button>
      <div style="margin-top:10px;font-size:11px;color:var(--text3)">Você pode conferir manualmente em <span style="font-family:var(--mono)">loterias.caixa.gov.br/Paginas/Federal.aspx</span></div>`;
  }

  const { concurso, numeros } = _loteriaFederalCache;
  const primeiro = numeros[0];
  let milharNum = parseInt(primeiro.slice(-4), 10);
  if (milharNum >= 5000) milharNum -= 5000;
  const milhar  = String(milharNum).padStart(4, '0');
  const centena = primeiro.slice(-3);

  const premiosHTML = `
    <div style="text-align:center">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">1º Prêmio</div>
      <div style="font-family:var(--mono);font-size:22px;font-weight:700">${primeiro}</div>
    </div>`;

  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px">
      <span style="font-size:12px;color:var(--text2)">Concurso <strong style="font-family:var(--mono)">${concurso}</strong></span>
      <button class="btn btn-ghost btn-sm" onclick="_loteriaFederalCache=undefined;document.getElementById('loteria-federal-box').innerHTML=renderLoteriaFederal()" title="Atualizar">↻</button>
    </div>
    <div style="margin-bottom:12px">${premiosHTML}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div style="background:var(--ink3);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Grupos até ~900 participantes</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--brand)">${centena}</div>
        <div style="font-size:10px;color:var(--text3)">centena de referência</div>
      </div>
      <div style="background:var(--ink3);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Grupos até ~5.000 participantes</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--brand)">${milhar}</div>
        <div style="font-size:10px;color:var(--text3)">milhar de referência</div>
      </div>
    </div>
    <div class="alert alert-amber" style="margin-bottom:12px">
      ⚠ Referência baseada apenas no 1º prêmio (últimos dígitos). O regulamento da Embracon prevê regras adicionais
      (composição com os 5 prêmios, exclusões por limite de participantes, substituição de cota excluída, números adicionais
      para grupos acima de 5.000). <strong>É necessária a conferência com o resultado oficial divulgado pela Embracon</strong>
      para a definição exata da cota contemplada.
    </div>
    <div style="font-size:11px;color:var(--text3);line-height:1.5">
      Use o(s) dígito(s) final(is) acima conforme a tabela de contemplação vigente do seu administrador (Embracon).
      Fonte: resultados oficiais da Caixa, espelhados diariamente.
      <a href="https://loterias.caixa.gov.br/Paginas/Federal.aspx" target="_blank" rel="noopener" style="color:var(--brand)">Conferir no site oficial da Caixa ↗</a>
    </div>`;
}

function renderDashboard() {
  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const vendas = vendasNoEscopo(u);

  const totalVendas   = vendas.length;
  const totalCreditos = vendas.reduce((a, v) => a + v.valor, 0);
  // NOVO: produção do mês atual, pro card dividido (total | mês)
  const vendasMesAtual = vendas.filter(v => mesKey(v.dvenda) === todayMes());
  const producaoMesAtual = vendasMesAtual.reduce((a, v) => a + v.valor, 0);
  const inadim        = vendas.filter(v => v.status === 'inadimplente').length;
  const cancelados    = vendas.filter(v => v.status === 'cancelado').length;
  const concluidos    = vendas.filter(v => v.status === 'concluido').length;

  const mesSel = todayMes();
  const fechsMes = DB.fechamentos.filter(f => f.mes === mesSel && (isG || f.vendedor === u.id));
  const comPendente = fechsMes.filter(f => f.status !== 'pago').reduce((a, f) => a + calcLiquido(f).liquido, 0);
  const comPago     = DB.fechamentos.filter(f => f.status === 'pago' && (isG || f.vendedor === u.id)).reduce((a, f) => {
    return a + (f.valorLiquido != null ? f.valorLiquido : calcLiquido(f).liquido);
  }, 0);

  // NOVO: supervisor nunca aparece no ranking de vendedores
  const rankPeriodo = AppState.modulo.dashboard.rankPeriodo || 'total';
  const hoje = new Date();
  let dataLimite = null;
  if (rankPeriodo === 'mensal')     dataLimite = todayMes() + '-01';
  else if (rankPeriodo === 'trimestral') dataLimite = addMonths(today(), -2)?.substring(0,7) + '-01';
  else if (rankPeriodo === 'semestral')  dataLimite = addMonths(today(), -5)?.substring(0,7) + '-01';
  else if (rankPeriodo === 'anual')      dataLimite = `${hoje.getFullYear()}-01-01`;

  const ranking = vendedoresNaUnidade().filter(v => v.role !== 'supervisor').map(v => {
    const vv = DB.vendas.filter(x => x.vendedor === v.id && (!dataLimite || (x.dvenda && x.dvenda >= dataLimite)));
    return { ...v, total: vv.reduce((a, x) => a + x.valor, 0), qtd: vv.length };
  }).sort((a, b) => b.total - a.total);

  const maxRank = ranking[0]?.total || 1;
  const TROFEUS = ['🏆','🥈','🥉'];

  const rankHTML = ranking.map((r, i) => `
    <div class="rank-bar">
      <span class="rank-pos">${TROFEUS[i] || (i+1)}</span>
      <div class="rank-avatar">${r.foto ? `<img src="${r.foto}" style="width:100%;height:100%;object-fit:cover">` : initials(r.nome)}</div>
      <span class="rank-name">${r.nome.split(' ')[0]}</span>
      <div class="rank-track"><div class="rank-fill" style="width:${(r.total/maxRank*100).toFixed(0)}%;background:${i===0?'var(--gold)':i===1?'var(--text2)':'var(--text3)'}"></div></div>
      <span class="rank-val">${fmt(r.total)}</span>
    </div>`).join('');

  const RANK_PERIODOS = [
    ['total','Produção total'], ['mensal','Mensal'], ['trimestral','Trimestral'],
    ['semestral','Semestral'], ['anual','Anual'],
  ];
  const rankPeriodoSelect = `<select class="form-input" style="width:auto;min-width:140px;height:30px;padding:0 8px;font-size:12px" onchange="AppState.modulo.dashboard.rankPeriodo=this.value;rerenderModule('dashboard')">
    ${RANK_PERIODOS.map(([k,l]) => `<option value="${k}"${rankPeriodo===k?' selected':''}>${l}</option>`).join('')}
  </select>`;

  const estornosPend = vendas.filter(v => v.estorno && !v.estorno.autorizado).length;

  const catTotais = CATEGORIAS_PRODUTO.map(c => {
    const vv = vendas.filter(v => (v.categoria || 'OUTROS') === c.id);
    return { ...c, total: vv.reduce((a,v)=>a+v.valor,0), qtd: vv.length };
  });
  const outrosVV = vendas.filter(v => !CATEGORIAS_PRODUTO.some(c => c.id === (v.categoria || '')));
  if (outrosVV.length > 0) catTotais.push({ id:'OUTROS', nome:'Outros / não classificado', icon:'▪', cor:'var(--text3)', total: outrosVV.reduce((a,v)=>a+v.valor,0), qtd: outrosVV.length });
  const maxCat = Math.max(1, ...catTotais.map(c=>c.total));
  const catHTML = catTotais.filter(c=>c.qtd>0 || c.id!=='OUTROS').map(c => `
    <div class="rank-bar">
      <span class="rank-pos"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c.cor}"></span></span>
      <span class="rank-name">${c.nome}</span>
      <div class="rank-track"><div class="rank-fill" style="width:${(c.total/maxCat*100).toFixed(0)}%;background:${c.cor}"></div></div>
      <span class="rank-val">${fmt(c.total)}</span>
    </div>`).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">${isG ? 'Dashboard Executivo' : 'Dashboard'}</div>
    <div class="page-sub">// ${isG ? 'visão consolidada da equipe' : (u.role==='supervisor' ? 'minha equipe' : 'minha carteira')} · ${mesLabel(todayMes())}</div>
  </div>
  <div class="page-actions">
    <button class="btn btn-ghost btn-sm" onclick="Router.navigate('relatorio')">↗ Ver relatórios</button>
  </div>
</div>

<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">
  ${isG ? 'Carteira da equipe (histórico)' : (u.role==='supervisor' ? 'Carteira da minha equipe (histórico)' : 'Minha carteira (histórico)')}
</div>
<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:18px">
  <div class="stat-card gold">
    <div class="stat-label">Produção total</div>
    <div style="display:flex;gap:16px;align-items:flex-end;margin-top:6px">
      <div>
        <div style="font-size:20px;font-weight:500;font-family:var(--mono);letter-spacing:-0.5px;color:var(--text)">${fmt(totalCreditos)}</div>
        <div class="stat-meta" style="margin-top:2px">${totalVendas} contrato(s) · histórico</div>
      </div>
      <div style="width:1px;align-self:stretch;background:var(--line)"></div>
      <div>
        <div style="font-size:15px;font-weight:600;font-family:var(--mono);color:var(--brand)">${fmt(producaoMesAtual)}</div>
        <div class="stat-meta" style="margin-top:2px">${mesLabel(todayMes())}</div>
      </div>
    </div>
  </div>
  <div class="stat-card red">
    <div class="stat-label">Inadimplentes</div>
    <div class="stat-value">${inadim}</div>
    <div class="stat-meta">${vendas.length > 0 ? ((inadim/vendas.length*100).toFixed(0))+'% do portfolio' : '—'}</div>
  </div>
  <div class="stat-card blue">
    <div class="stat-label">Cancelados</div>
    <div class="stat-value">${cancelados}</div>
    <div class="stat-meta">Total histórico</div>
  </div>
  <div class="stat-card purple">
    <div class="stat-label">Estornos pend.</div>
    <div class="stat-value">${estornosPend}</div>
    <div class="stat-meta">Aguardando autorização</div>
  </div>
</div>

<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">
  Comissões — ${mesLabel(todayMes())}
</div>
${(() => {
  const hoje      = today();
  const dia       = parseInt(hoje.split('-')[2]);
  const mesPago   = DB.fechamentos.filter(f => (isG || f.vendedor === u.id) && f.status === 'pago' && f.mes === todayMes());
  const valorMes  = mesPago.reduce((a, f) => {
    const vendasF = vendasDoVendedor(f.vendedor).filter(v => v.status !== 'cancelado');
    const { producao, recorrencia } = calcComissaoMes(vendasF, f.mes);
    const vEst = calcEstornosMes(vendasF, f.mes).reduce((s,e) => s+e.valor, 0);
    const base = f.valorLiquido != null ? f.valorLiquido : producao.reduce((s,i)=>s+i.valor,0) + recorrencia.reduce((s,i)=>s+i.valor,0);
    return a + base - vEst;
  }, 0);
  const jaFoiPago = dia >= 10 || mesPago.length > 0;

  const proxMes   = addMonths(todayMes() + '-01', 1)?.substring(0, 7);

  const pendAprov = vendedoresNaUnidade().reduce((a, vend) => {
    if (!isG && vend.id !== u.id) return a;
    const vendasV = vendasDoVendedor(vend.id).filter(v => v.status !== 'cancelado');
    const { producao, recorrencia } = calcComissaoMes(vendasV, proxMes);
    return a + producao.reduce((s,i)=>s+i.valor,0) + recorrencia.reduce((s,i)=>s+i.valor,0);
  }, 0);

  const recFutura = vendedoresNaUnidade().reduce((a, vend) => {
    if (!isG && vend.id !== u.id) return a;
    const vendasV = vendasDoVendedor(vend.id).filter(v => v.status === 'ativo');
    let total = 0;
    vendasV.forEach(v => {
      calcParcelas(v).forEach((p, i) => {
        if (!p.ativa) return;
        if (!p.dataPgto || p.dataPgto <= hoje) return;
        const statusParc = v.parcelas[i]?.s;
        if (statusParc === 'pago') return;
        total += p.valor;
      });
    });
    return a + total;
  }, 0);

  return `<div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card ${jaFoiPago ? 'green' : 'amber'}">
      <div class="stat-label">${jaFoiPago ? 'Pago mês atual' : 'A receber este mês'}</div>
      <div class="stat-value">${jaFoiPago ? fmt(valorMes) : fmt(comPendente)}</div>
      <div class="stat-meta">${jaFoiPago ? mesLabel(todayMes()) : 'Ainda não pago'}</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Já recebido total</div>
      <div class="stat-value">${fmt(comPago)}</div>
      <div class="stat-meta">Histórico acumulado</div>
    </div>
    <div class="stat-card" style="border-top:2px solid var(--amber)">
      <div class="stat-label" style="margin-bottom:8px">A receber (futuro)</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
        <span style="color:var(--text3)">Pagamento em ${mesLabel(proxMes)}</span>
        <span style="font-family:var(--mono);font-weight:600">${fmt(pendAprov)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px">
        <span style="color:var(--green)">↗ Recorrência futura</span>
        <span style="font-family:var(--mono);font-weight:600;color:var(--green)">${fmt(recFutura)}</span>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:6px;font-size:10px;color:var(--text3)">
        Se clientes permanecerem adimplentes
      </div>
    </div>
  </div>`;
})()}

<div class="dashboard-grid three">
  <div class="card">
    <div class="card-header">
      <span class="card-title">Ranking de Vendedores</span>
      ${rankPeriodoSelect}
    </div>
    <div style="padding:16px">${rankHTML}</div>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="card-title">Produção por Segmento</span>
      <span class="chip">Produção total${isG ? ' · equipe' : ''}</span>
    </div>
    <div style="padding:16px">
      ${catHTML || `<div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">Sem dados de categoria</div><div class="empty-sub">Cadastre vendas informando a categoria do produto</div></div>`}
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <span class="card-title">Loteria Federal</span>
      <span class="chip">Regra de contemplação</span>
    </div>
    <div style="padding:16px" id="loteria-federal-box">
      ${renderLoteriaFederal()}
    </div>
  </div>
</div>

<div class="dashboard-grid three">
  ${isG ? `
  <div class="card">
    <div class="card-header"><span class="card-title">Status Contratos</span></div>
    <div style="padding:16px">
      ${['ativo','inadimplente','cancelado','concluido'].map(s => {
        const cnt = DB.vendas.filter(v => v.status === s).length;
        const dot = s === 'inadimplente' || s === 'cancelado' ? 'var(--brand)' : 'var(--line2)';
        const labels = {ativo:'Ativos',inadimplente:'Inadimplentes',cancelado:'Cancelados',concluido:'Concluídos'};
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0"></div>
          <span style="font-size:12px;flex:1;color:var(--text2)">${labels[s]}</span>
          <span style="font-family:var(--mono);font-size:13px;font-weight:500;color:${cnt > 0 && (s==='inadimplente'||s==='cancelado') ? 'var(--brand)' : s==='concluido' ? 'var(--blue)' : 'var(--text)'}">${cnt}</span>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-header"><span class="card-title">Fechamentos — ${mesLabel(mesSel)}</span></div>
    <div style="padding:16px">
      ${['aberto','aguardando_nf','aprovado','pago'].map(s => {
        const cnt = DB.fechamentos.filter(f => f.mes === mesSel && f.status === s).length;
        const labels = {aberto:'Em aberto',aguardando_nf:'Aguard. NF',aprovado:'Aprovado',pago:'Pago'};
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:7px;height:7px;border-radius:50%;background:var(--line2);flex-shrink:0"></div>
          <span style="font-size:12px;flex:1;color:var(--text2)">${labels[s]}</span>
          <span style="font-family:var(--mono);font-size:13px;font-weight:500">${cnt}</span>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-header"><span class="card-title">Integrações</span></div>
    <div style="padding:16px">
      ${[
        ['◈','Power BI','Preparado'],
        ['◉','WhatsApp API','Em breve'],
        ['⬡','Supabase','Preparado'],
        ['◎','Tráfego Pago','Em breve'],
      ].map(([ic,lbl,st]) => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:14px;color:var(--text3)">${ic}</span>
          <span style="font-size:12px;flex:1;color:var(--text2)">${lbl}</span>
          <span class="badge badge-gray" style="font-size:9px;color:${st==='Preparado'?'var(--text)':'var(--text3)'}">${st}</span>
        </div>`).join('')}
    </div>
  </div>` : `

  <div class="card">
    <div class="card-header"><span class="card-title">Meus contratos</span></div>
    <div style="padding:16px">
      ${['ativo','inadimplente','cancelado','concluido'].map(s => {
        const cnt = vendas.filter(v => v.status === s).length;
        const dot = s === 'inadimplente' || s === 'cancelado' ? 'var(--brand)' : 'var(--line2)';
        const labels = {ativo:'Ativos',inadimplente:'Inadimplentes',cancelado:'Cancelados',concluido:'Concluídos'};
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0"></div>
          <span style="font-size:12px;flex:1;color:var(--text2)">${labels[s]}</span>
          <span style="font-family:var(--mono);font-size:13px;font-weight:500;color:${cnt > 0 && (s==='inadimplente'||s==='cancelado') ? 'var(--brand)' : s==='concluido' ? 'var(--blue)' : 'var(--text)'}">${cnt}</span>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-header"><span class="card-title">Próximos recebimentos</span></div>
    <div style="padding:16px">
      ${(() => {
        const proxMeses = [todayMes(), addMonths(todayMes(),1), addMonths(todayMes(),2)];
        return proxMeses.map(m => {
          const { producao, recorrencia } = calcComissaoMes(DB.vendas.filter(v => v.vendedor === u.id), m);
          const total = producao.reduce((a,i)=>a+i.valor,0) + recorrencia.reduce((a,i)=>a+i.valor,0);
          return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:11px;font-family:var(--mono);color:var(--text3);min-width:70px">${mesLabel(m)}</span>
            <div style="flex:1;height:3px;background:var(--ink3);border-radius:2px;overflow:hidden">
              <div style="height:100%;background:var(--brand);width:${Math.min(100,total/100)}%;opacity:.6"></div>
            </div>
            <span style="font-family:var(--mono);font-size:12px;font-weight:500">${fmt(total)}</span>
          </div>`;
        }).join('');
      })()}
    </div>
  </div>

  <div class="card">
    <div class="card-header"><span class="card-title">Meu desempenho</span></div>
    <div style="padding:16px">
      ${(() => {
        const minhasVendas  = DB.vendas.filter(v => v.vendedor === u.id);
        const totalCred     = minhasVendas.reduce((a,v)=>a+v.valor,0);
        const inadimV        = minhasVendas.filter(v=>v.status==='inadimplente').length;
        const concluidosV    = minhasVendas.filter(v=>v.status==='concluido').length;
        const taxa          = minhasVendas.length > 0 ? Math.round((concluidosV/minhasVendas.length)*100) : 0;

        const vendedor   = DB.vendedores.find(v => v.id === u.id);
        const metaMensal = vendedor?.meta || 0;
        const vendasMes  = minhasVendas.filter(v => mesKey(v.dvenda) === todayMes());
        const prodMes    = vendasMes.reduce((a,v) => a + v.valor, 0);
        const pctMeta    = metaMensal > 0 ? Math.min(((prodMes / metaMensal) * 100), 999) : 0;
        const corMeta    = pctMeta >= 100 ? 'var(--green)' : pctMeta >= 70 ? 'var(--amber)' : 'var(--brand)';

        const anoAtual      = new Date().getFullYear();
        const mesInicioOp   = 4;
        const metaAnualProp = metaMensal * (13 - mesInicioOp);
        const prodAnual     = minhasVendas
          .filter(v => v.dvenda && v.dvenda.startsWith(String(anoAtual)) && parseInt(v.dvenda.split('-')[1]) >= mesInicioOp)
          .reduce((a,v) => a + v.valor, 0);
        const pctAnual   = metaAnualProp > 0 ? Math.min(((prodAnual / metaAnualProp) * 100), 999) : 0;
        const corAnual   = pctAnual >= 100 ? 'var(--green)' : pctAnual >= 70 ? 'var(--amber)' : 'var(--brand)';

        const metaHTML = metaMensal > 0 ? `
          <div style="background:var(--ink3);border-radius:10px;padding:14px;margin-bottom:14px">
            <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px">META DO MÊS — ${mesLabel(todayMes())}</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:13px;font-weight:700;color:${corMeta}">${prodMes >= metaMensal ? '🏆 META BATIDA!' : fmt(prodMes)}</span>
              <span style="font-size:12px;color:var(--text2)">de ${fmt(metaMensal)}</span>
            </div>
            <div style="background:var(--ink4);border-radius:6px;height:8px;margin-bottom:6px">
              <div style="background:${corMeta};height:8px;border-radius:6px;width:${Math.min(pctMeta,100)}%;transition:width .5s ease"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px">
              <span style="color:${corMeta};font-weight:700">${pctMeta.toFixed(1)}% atingido</span>
              ${prodMes < metaMensal ? `<span style="color:var(--text3)">Faltam ${fmt(metaMensal - prodMes)}</span>` : '<span style="color:var(--green)">✓ Parabéns!</span>'}
            </div>
          </div>
          <div style="background:var(--ink3);border-radius:10px;padding:14px;margin-bottom:14px">
            <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px">META ANUAL PROPORCIONAL ${anoAtual}</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:13px;font-weight:700;color:${corAnual}">${prodAnual >= metaAnualProp ? '🏆 META ANUAL BATIDA!' : fmt(prodAnual)}</span>
              <span style="font-size:12px;color:var(--text2)">de ${fmt(metaAnualProp)}</span>
            </div>
            <div style="background:var(--ink4);border-radius:6px;height:8px;margin-bottom:6px">
              <div style="background:${corAnual};height:8px;border-radius:6px;width:${Math.min(pctAnual,100)}%;transition:width .5s ease"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px">
              <span style="color:${corAnual};font-weight:700">${pctAnual.toFixed(1)}% atingido</span>
              ${prodAnual < metaAnualProp ? `<span style="color:var(--text3)">Faltam ${fmt(metaAnualProp - prodAnual)}</span>` : '<span style="color:var(--green)">✓ Incrível!</span>'}
            </div>
          </div>` : `
          <div style="background:var(--ink3);border-radius:10px;padding:14px;margin-bottom:14px;text-align:center">
            <div style="font-size:12px;color:var(--text3)">Meta não definida ainda</div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">Fale com o gestor para definir sua meta mensal</div>
          </div>`;

        return metaHTML + `
          <div style="display:flex;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:12px;color:var(--text2)">Volume total carteira</span>
            <span style="font-family:var(--mono);font-size:12px;font-weight:500">${fmt(totalCred)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:12px;color:var(--text2)">Inadimplentes</span>
            <span style="font-family:var(--mono);font-size:12px;font-weight:500;color:${inadimV>0?'var(--brand)':'var(--text)'}">${inadimV}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:12px;color:var(--text2)">Taxa conclusão</span>
            <span style="font-family:var(--mono);font-size:12px;font-weight:500">${taxa}%</span>
          </div>`;
      })()}
    </div>
  </div>`}
</div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. MÓDULO: VENDEDORES
   ═══════════════════════════════════════════════════════════════════════════ */
async function excluirVendedorUI(id) {
  const v = DB.vendedores.find(x => x.id === id);
  if (!v) return;
  const vendas = DB.vendas.filter(x => x.vendedor === id);
  const equipe = DB.vendedores.filter(x => x.liderId === id);

  const _ok = await Dialog.danger('Excluir vendedor', [
    { tipo:'destaque', label:'Vendedor', valor: v.nome },
    { tipo:'destaque', label:'E-mail',   valor: v.email },
    ...(vendas.length > 0 ? [
      { tipo:'divisor' },
      `⚠ Este vendedor possui ${vendas.length} contrato(s) registrado(s). Excluir o cadastro pode causar erro ao exibir esses contratos. Recomenda-se não excluir vendedores com histórico de vendas.`
    ] : []),
    ...(equipe.length > 0 ? [
      { tipo:'divisor' },
      `⚠ Este vendedor é líder de equipe de: ${equipe.map(e=>e.nome).join(', ')}. Ao excluir, eles passam a reportar direto ao gestor (perdem o líder).`
    ] : []),
    { tipo:'divisor' },
    'Esta ação não pode ser desfeita.'
  ]);
  if (!_ok) return;

  // Se for líder de equipe, desvincula quem reporta a ele(a) antes de excluir
  // (senão o banco bloqueia a exclusão por causa da referência)
  for (const membro of equipe) {
    await Servicos.salvarVendedor({ id: membro.id, lider_id: null });
  }

  const sucesso = await Servicos.excluirVendedor(id);
  if (!sucesso) {
    Dialog.alert('Erro ao excluir', ['Não foi possível excluir o vendedor no banco de dados.']);
    return;
  }

  await carregarDadosIniciais();
  rerenderModule('vendedores');
}

let _acessoTabelasTarget = null;
let _definirLiderTarget = null;

function abrirDefinirLiderUI(vendedorId) {
  const v = DB.vendedores.find(x => x.id === vendedorId);
  if (!v) return;
  _definirLiderTarget = vendedorId;
  document.getElementById('mdl-sub').textContent = `Vendedor: ${v.nome}`;
  const select = document.getElementById('mdl-lider');
  const opcoes = DB.vendedores.filter(x => x.id !== vendedorId);
  select.innerHTML = '<option value="">Ninguém (reporta direto ao gestor)</option>' +
    opcoes.map(x => `<option value="${x.id}" ${v.liderId===x.id?'selected':''}>${x.nome}</option>`).join('');
  openModal('m-definir-lider');
}

async function salvarLiderUI() {
  const novoLider = document.getElementById('mdl-lider').value || null;
  await Servicos.salvarVendedor({ id: _definirLiderTarget, lider_id: novoLider });
  closeModal('m-definir-lider');
  await carregarDadosIniciais();
  rerenderModule('vendedores');
}

function abrirAcessoTabelas(vendedorId) {
  const v = DB.vendedores.find(x => x.id === vendedorId);
  if (!v) return;
  _acessoTabelasTarget = vendedorId;
  const restritas = DB.acessoTabelas[vendedorId] || [];

  document.getElementById('mat-sub').textContent = `Vendedor: ${v.nome}`;
  document.getElementById('mat-lista').innerHTML = DB.tabelas
    .filter(t => t.ativo !== false)
    .map(t => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer">
        <input type="checkbox" value="${t.id}" ${restritas.includes(t.id) ? 'checked' : ''}>
        <span>${t.id} — ${t.nome} (${t.ref})</span>
      </label>`).join('');

  openModal('m-acesso-tab');
}

async function salvarAcessoTabelasUI() {
  const vendedorId = _acessoTabelasTarget;
  if (!vendedorId) return;
  const selecionadas = [...document.querySelectorAll('#mat-lista input:checked')].map(c => c.value);

  const btn = document.querySelector('#m-acesso-tab .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    const ok = await Servicos.salvarAcessoTabelas(vendedorId, selecionadas);
    if (!ok) throw new Error('Não foi possível salvar no banco de dados.');
    if (selecionadas.length === 0) delete DB.acessoTabelas[vendedorId];
    else DB.acessoTabelas[vendedorId] = selecionadas;
    closeModal('m-acesso-tab');
    Dialog.success('Acesso atualizado', [
      selecionadas.length === 0
        ? 'Vendedor sem restrição — vê todas as tabelas ativas.'
        : `Vendedor restrito a ${selecionadas.length} tabela(s) selecionada(s).`
    ]);
  } catch(e) {
    console.error('Erro ao salvar acesso a tabelas:', e);
    Dialog.alert('Erro ao salvar', [e.message || 'Não foi possível salvar.']);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
}

// NOVO: define/edita a meta mensal de um vendedor (persiste no Supabase)
async function definirMetaVendedor(vendedorId) {
  const vend = DB.vendedores.find(v => v.id === vendedorId);
  if (!vend) return;

  const atual = vend.meta > 0 ? String(vend.meta) : '';
  const entrada = window.prompt(`Meta mensal para ${vend.nome} (em R$, só números):`, atual);
  if (entrada === null) return; // cancelou

  const num = parseFloat(entrada.replace(/\./g, '').replace(',', '.'));
  if (!num || num <= 0) {
    Dialog.alert('Valor inválido', ['Informe um valor numérico maior que zero. Ex: 800000']);
    return;
  }

  try {
    const { error } = await Supabase.from('vendedores').update({ meta: num }).eq('id', vendedorId);
    if (error) throw error;
    vend.meta = num;
    Dialog.success('Meta atualizada', [
      { tipo:'destaque', label:'Vendedor', valor: vend.nome },
      { tipo:'destaque', label:'Meta mensal', valor: fmt(num), cor:'var(--brand)' },
    ]);
    rerenderModule('vendedores');
  } catch(e) {
    console.error('Erro ao definir meta:', e);
    Dialog.alert('Erro ao salvar', ['Não foi possível salvar a meta no banco de dados.']);
  }
}

function abrirNovoVendedor() {
  document.getElementById('nv-nome').value = '';
  document.getElementById('nv-email').value = '';
  const unidadeEscopo = unidadeEscopoAtual();
  const wrap = document.getElementById('nv-unidade-wrap');
  if (unidadeEscopo) {
    // Gerente de unidade (ex: Blumenau) não escolhe — sempre cadastra na
    // própria unidade dele
    wrap.style.display = 'none';
    document.getElementById('nv-unidade').value = unidadeEscopo;
  } else {
    wrap.style.display = 'block';
    document.getElementById('nv-unidade').value = 'brusque';
  }
  openModal('m-vendedor');
}

async function salvarNovoVendedor() {
  const nome  = document.getElementById('nv-nome').value.trim();
  const email = document.getElementById('nv-email').value.trim();
  const unidade = document.getElementById('nv-unidade').value || unidadeEscopoAtual() || 'brusque';

  if (!nome)  { Dialog.alert('Campo obrigatório', ['Informe o nome do vendedor.']); return; }
  if (!email) { Dialog.alert('Campo obrigatório', ['Informe o e-mail do vendedor.']); return; }
  if (DB.vendedores.some(v => (v.email||'').toLowerCase() === email.toLowerCase())) {
    Dialog.alert('E-mail já cadastrado', ['Já existe um vendedor com este e-mail.']);
    return;
  }

  const btn = document.querySelector('#m-vendedor .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    const data = await Servicos.salvarVendedor({ nome, email, ativo: true, primeiro_acesso: true, unidade });
    if (!data) throw new Error('Não foi possível salvar o vendedor no banco de dados.');

    DB.vendedores.push({ id: data.id, nome, email, modelo: 'modelo1', unidade, primeiroAcesso: true });

    closeModal('m-vendedor');
    Dialog.success('Vendedor cadastrado', [
      { tipo:'destaque', label:'Nome', valor: nome },
      { tipo:'destaque', label:'E-mail', valor: email },
      { tipo:'divisor' },
      'Falta um passo: crie o login dele em Authentication → Users (Supabase), usando este mesmo e-mail e uma senha provisória. No primeiro acesso, ele vai definir a senha definitiva.'
    ]);
    rerenderModule('vendedores');
    buildSidebar();
  } catch(e) {
    console.error('Erro ao salvar vendedor:', e);
    Dialog.alert('Erro ao salvar', [e.message || 'Não foi possível salvar no banco de dados.']);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar vendedor'; }
  }
}

function renderVendedores() {
  const u = AppState.user;
  const isGestorPuro = (u.role === 'gestor' || u.role === 'adm');

  const rows = vendedoresNaUnidade().map(v => {
    const vendas = DB.vendas.filter(x => x.vendedor === v.id && x.status !== 'cancelado');
    const total  = vendas.reduce((a, x) => a + x.valor, 0);
    const inadim = vendas.filter(x => x.status === 'inadimplente').length;

    // NOVO: progresso da meta mensal (vendas do mês atual / meta)
    const prodMes = vendas
      .filter(x => mesKey(x.dvenda) === todayMes())
      .reduce((a, x) => a + x.valor, 0);
    const pctMeta = v.meta > 0 ? Math.min((prodMes / v.meta) * 100, 999) : 0;
    const corMeta = pctMeta >= 100 ? 'var(--green)' : pctMeta >= 70 ? 'var(--amber)' : 'var(--brand)';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:30px;height:30px;border-radius:8px;background:var(--gold-dim);border:1px solid var(--gold-glow);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--gold);overflow:hidden">${v.foto ? `<img src="${v.foto}" style="width:100%;height:100%;object-fit:cover">` : initials(v.nome)}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${v.nome}${v.unidade==='blumenau' ? ' <span class="badge" style="font-size:8px;background:#EEEDFE;color:#26215C">BLUMENAU</span>' : ''}${DB.vendedores.some(x=>x.liderId===v.id) ? ' <span class="badge badge-purple" style="font-size:8px">LÍDER DE EQUIPE</span>' : ''}</div>
            ${v.liderId ? `<div style="font-size:10px;color:var(--text3)">reporta a: ${DB.vendedores.find(x=>x.id===v.liderId)?.nome || '—'}</div>` : ''}
            <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${v.email}</div>
          </div>
        </div>
      </td>
      <td><span class="chip">${v.id}</span></td>
      <td>
        ${v.meta > 0
          ? `<div style="min-width:130px">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
                <span style="font-family:var(--mono);font-size:11px;font-weight:600;color:${corMeta}">${fmt(prodMes)}</span>
                <span style="font-size:10px;color:var(--text3)">${pctMeta.toFixed(0)}%</span>
              </div>
              <div style="background:var(--ink4);border-radius:4px;height:6px;overflow:hidden">
                <div style="background:${corMeta};height:6px;border-radius:4px;width:${Math.min(pctMeta,100)}%;transition:width .4s ease"></div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:3px">
                <span style="font-size:9px;color:var(--text3)">de ${fmt(v.meta)}</span>
                <button class="btn btn-ghost btn-sm" style="padding:0 4px;font-size:9px;height:auto" onclick="definirMetaVendedor('${v.id}')" title="Editar meta">✎</button>
              </div>
            </div>`
          : `<button class="btn btn-ghost btn-sm" onclick="definirMetaVendedor('${v.id}')" title="Definir meta">+ Definir meta</button>`
        }
      </td>
      <td class="td-mono">${fmt(total)}</td>
      <td class="td-mono">${vendas.length}</td>
      <td>${inadim > 0 ? `<span class="badge badge-amber">${inadim}</span>` : '<span class="badge badge-green">0</span>'}</td>
      <td><span class="badge badge-green">ATIVO</span></td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="Router.navigate('relatorio')" title="Ver relatório">▦</button>
          ${isGestorPuro ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="abrirAcessoTabelas('${v.id}')" title="Tabelas liberadas para este vendedor">🔑</button>` : ''}
          ${isGestorPuro ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="abrirDefinirLiderUI('${v.id}')" title="Definir líder de equipe" style="color:var(--purple)">👥</button>` : ''}
          ${isGestorPuro ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="excluirVendedorUI('${v.id}')" title="Excluir vendedor" style="color:var(--red)">✕</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">Vendedores</div>
    <div class="page-sub">// equipe comercial · ${vendedoresNaUnidade().length} cadastrados</div>
  </div>
  <div class="page-actions">
    ${isGestorPuro ? `<button class="btn btn-primary btn-sm" onclick="abrirNovoVendedor()">+ Novo vendedor</button>` : ''}
  </div>
</div>
<div class="card">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Vendedor</th><th>Login</th><th>Meta mensal</th><th>Créditos</th><th>Contratos</th><th>Inadimp.</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>

<div class="overlay" id="m-acesso-tab">
  <div class="modal" style="max-width:480px">
    <button class="btn btn-ghost btn-icon no-print" onclick="closeModal('m-acesso-tab')" style="position:absolute;top:14px;right:14px">✕</button>
    <div class="modal-title">Tabelas liberadas</div>
    <div class="modal-sub" id="mat-sub"></div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
      Se nenhuma estiver marcada, o vendedor vê <strong>todas</strong> as tabelas ativas (padrão). Marque apenas se quiser restringir.
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#mat-lista input').forEach(c=>c.checked=true)">Marcar todas</button>
      <button class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#mat-lista input').forEach(c=>c.checked=false)">Desmarcar todas (sem restrição)</button>
    </div>
    <div id="mat-lista" style="max-height:320px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:10px"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-acesso-tab')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarAcessoTabelasUI()">Salvar</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-vendedor">
  <div class="modal" style="max-width:440px">
    <button class="btn btn-ghost btn-icon no-print" onclick="closeModal('m-vendedor')" style="position:absolute;top:14px;right:14px">✕</button>
    <div class="modal-title">Novo vendedor</div>
    <div class="modal-sub">Cadastra o vendedor no sistema. O acesso (login) precisa ser criado separadamente no Supabase Auth.</div>
    <div class="form-row cols-1">
      <div class="form-group"><label>Nome completo *</label><input id="nv-nome" placeholder="Nome do vendedor"></div>
    </div>
    <div class="form-row cols-1">
      <div class="form-group"><label>E-mail *</label><input type="email" id="nv-email" placeholder="email@exemplo.com"></div>
    </div>
    <div class="form-row cols-1" id="nv-unidade-wrap">
      <div class="form-group">
        <label>Unidade</label>
        <select id="nv-unidade">
          <option value="brusque">Brusque</option>
          <option value="blumenau">Blumenau</option>
        </select>
      </div>
    </div>
    <div class="form-row cols-1">
      <div class="form-group">
        <label>Meta mensal (R$)</label>
        <input type="number" id="nv-meta" placeholder="Ex: 800000" min="0" step="10000">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Meta individual sugerida pelo gestor. O vendedor pode ajustar para cima.</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-top:4px">
      Esse e-mail deve ser o mesmo usado para criar o login dele em Authentication → Users no Supabase.
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-vendedor')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarNovoVendedor()">Salvar vendedor</button>
    </div>
  </div>
</div>

<!-- NOVO: Modal Definir Líder de Equipe -->
<div class="overlay" id="m-definir-lider">
  <div class="modal" style="max-width:420px">
    <button class="modal-close" onclick="closeModal('m-definir-lider')">✕</button>
    <div class="modal-title">Líder de equipe</div>
    <div class="modal-sub" id="mdl-sub"></div>
    <div class="form-group">
      <label>Este vendedor reporta a:</label>
      <select id="mdl-lider">
        <option value="">Ninguém (reporta direto ao gestor)</option>
      </select>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
      Se escolher alguém aqui, essa pessoa passa a ser líder de equipe automaticamente (comissão de supervisão + acesso à aba "Comissão Supervisor" sobre quem reporta a ela).
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-definir-lider')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarLiderUI()">Salvar</button>
    </div>
  </div>
</div>
`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. MÓDULO: CLIENTES
   ═══════════════════════════════════════════════════════════════════════════ */
async function excluirClienteUI(clienteId) {
  const c = DB.clientes.find(x => x.id === clienteId);
  if (!c) return;
  const contratos = DB.vendas.filter(v => v.cliente_id === clienteId);

  if (contratos.length > 0) {
    Dialog.alert('Não é possível excluir', [
      { tipo:'destaque', label:'Cliente', valor: c.nome },
      `Este cliente possui ${contratos.length} contrato(s) vinculado(s). Exclua ou transfira os contratos primeiro (Relatório → ✕) antes de excluir o cadastro do cliente.`
    ]);
    return;
  }

  const _ok = await Dialog.danger('Excluir cliente', [
    { tipo:'destaque', label:'Cliente', valor: c.nome },
    'Este cliente não possui contratos vinculados. Esta ação não pode ser desfeita.'
  ]); if (!_ok) return;

  const sucesso = await Servicos.excluirCliente(clienteId);
  if (!sucesso) {
    Dialog.alert('Erro ao excluir', ['Não foi possível excluir o cliente no banco de dados.']);
    return;
  }

  DB.clientes = DB.clientes.filter(x => x.id !== clienteId);
  rerenderModule('clientes');
}

function renderClientes() {
  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const st  = AppState.modulo.clientes;

  const vendas   = vendasNoEscopo(u);
  // NOVO: cliente "pertence" à unidade através do(s) contrato(s) dele — se
  // tiver unidade selecionada, só mostra quem tem pelo menos 1 contrato
  // dentro do escopo atual (evita clientes de Brusque aparecendo em Blumenau)
  const unidadeAtualClientes = unidadeEscopoAtual();
  const clientes = unidadeAtualClientes
    ? (DB.clientes || []).filter(c => vendas.some(v => v.cliente_id === c.id))
    : (DB.clientes || []);

  const busca = (st.search || '').toLowerCase();
  const listaFilt = clientes.filter(c =>
    !busca ||
    c.nome?.toLowerCase().includes(busca) ||
    c.cpf?.replace(/\D/g,'').includes(busca.replace(/\D/g,'')) ||
    c.telefone?.includes(busca) ||
    c.email?.toLowerCase().includes(busca)
  );

  const contratosCliente = (cliId) =>
    vendas.filter(v => v.cliente_id === cliId || v.cliente === DB.clientes.find(c=>c.id===cliId)?.nome);

  const rows = listaFilt.map(c => {
    const contratos = contratosCliente(c.id);
    const sit = contratos.length === 0 ? null :
      contratos.some(v => situacao(v) === 'critico') ? 'critico' :
      contratos.some(v => situacao(v) === 'atraso')  ? 'atraso'  :
      contratos.some(v => v.status === 'negociacao') ? 'negociacao' :
      contratos.every(v => v.status === 'concluido') ? 'concluido' : 'adimplente';

    return `<tr onclick="abrirClienteDetalhe('${c.id}')" style="cursor:pointer">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--brand-dim);border:1px solid var(--brand-border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--brand);flex-shrink:0">${initials(c.nome)}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${c.nome}</div>
            <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${c.cpf || c.cnpj || '—'}</div>
          </div>
        </div>
      </td>
      <td style="font-size:12px;color:var(--text2)">${c.telefone || '—'}</td>
      <td style="font-size:12px;color:var(--text2)">${c.email || '—'}</td>
      <td>
        <span class="chip">${contratos.length} contrato(s)</span>
      </td>
      <td>${sit ? sitBadge(sit) : '<span class="badge badge-gray">SEM CONTRATO</span>'}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();abrirClienteDetalhe('${c.id}')" title="Ver detalhes">▦</button>
          ${podeCadastrarVenda() ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();abrirNovoContrato('${c.id}')" title="Novo contrato">+ Contrato</button>` : ''}
          ${isG ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();excluirClienteUI('${c.id}')" title="Excluir cliente" style="color:var(--red)">✕</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">Clientes</div>
    <div class="page-sub">// ${listaFilt.length} clientes · ${vendas.length} contratos</div>
  </div>
  <div class="page-actions">
    <button class="btn btn-primary btn-sm" onclick="abrirCadastroCliente()">+ Novo cliente</button>
  </div>
</div>

<div class="card" style="margin-bottom:16px">
  <div style="padding:16px">
    <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Buscar cliente</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <div style="position:relative;flex:1;min-width:220px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3);font-size:13px">⌕</span>
        <input type="text" placeholder="Nome, CPF, CNPJ, telefone ou e-mail..."
          style="width:100%;background:var(--ink3);border:1px solid var(--line);border-radius:7px;padding:9px 12px 9px 32px;color:var(--text);font-family:var(--font);font-size:13px;outline:none"
          value="${st.search || ''}"
          oninput="AppState.modulo.clientes.search=this.value;clearTimeout(window._buscaTimer);window._buscaTimer=setTimeout(()=>rerenderModule('clientes'),350)"
          onfocus="this.style.borderColor='var(--brand)'" onblur="this.style.borderColor='var(--line)'">
      </div>
      ${st.search ? `<button class="btn btn-ghost btn-sm" onclick="AppState.modulo.clientes.search='';rerenderModule('clientes')">Limpar</button>` : ''}
    </div>
    ${st.search && listaFilt.length === 0 ? `
    <div style="margin-top:12px;padding:12px;background:var(--ink3);border-radius:8px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;color:var(--text2)">Nenhum cliente encontrado para "<strong>${st.search}</strong>"</span>
      <button class="btn btn-primary btn-sm" onclick="abrirCadastroCliente('${st.search}')">+ Cadastrar novo</button>
    </div>` : ''}
  </div>
</div>

<div class="card">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Cliente</th>
        <th>Telefone</th>
        <th>E-mail</th>
        <th>Contratos</th>
        <th>Situação</th>
        <th>Ações</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="td-center" style="padding:48px;color:var(--text3)">
        <div style="font-size:24px;margin-bottom:8px;opacity:.4">○</div>
        <div style="font-weight:600;margin-bottom:4px">Nenhum cliente cadastrado</div>
        <div style="font-size:11px;font-family:var(--mono)">Clique em "+ Novo cliente" para começar</div>
      </td></tr>`}</tbody>
    </table>
  </div>
</div>

<div class="overlay" id="m-cliente">
  <div class="modal" style="width:700px">
    <button class="modal-close" onclick="closeModal('m-cliente')">✕</button>
    <div class="modal-title" id="mc-title">Novo cliente</div>
    <div class="modal-sub" id="mc-sub">Preencha os dados do cliente e do primeiro contrato</div>

    <div class="form-divider">Identificação</div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Nome completo *</label><input id="mc-nome" placeholder="Nome completo do cliente"></div>
      <div class="form-group">
        <label>CPF / CNPJ *</label>
        <input id="mc-doc" placeholder="000.000.000-00 ou 00.000.000/0001-00"
          oninput="formatarDocumento(this)">
      </div>
    </div>

    <div class="form-divider">Contato</div>
    <div class="form-row cols-3">
      <div class="form-group"><label>Telefone</label><input id="mc-tel" placeholder="(00) 00000-0000" oninput="formatarTelefone(this)"></div>
      <div class="form-group"><label>WhatsApp</label><input id="mc-wpp" placeholder="(00) 00000-0000" oninput="formatarTelefone(this)"></div>
      <div class="form-group"><label>E-mail</label><input id="mc-email" type="email" placeholder="email@exemplo.com"></div>
    </div>

    <div class="form-divider">Endereço</div>
    <div class="form-row cols-2">
      <div class="form-group" style="grid-column:1/-1"><label>Endereço</label><input id="mc-end" placeholder="Rua, número, complemento"></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Cidade</label><input id="mc-cidade" placeholder="Cidade"></div>
      <div class="form-group"><label>Estado</label>
        <select id="mc-estado">
          <option value="">Selecione...</option>
          ${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(e=>`<option value="${e}">${e}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-divider" id="mc-div-contrato" style="display:flex;align-items:center;justify-content:space-between">
      <span>Contrato</span>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:400;color:var(--text2);cursor:pointer;text-transform:none;letter-spacing:0">
        <input type="checkbox" id="mc-sem-contrato" onchange="toggleContratoForm()"> Cadastrar só o cliente por agora
      </label>
    </div>
    <div id="mc-contrato-form">
      <div class="form-row cols-4">
        <div class="form-group"><label>Nº Contrato</label><input id="mc-contr" placeholder="ex: 9999999"></div>
        <div class="form-group">
          <label>Tabela / Produto *</label>
          <select id="mc-tab" onchange="previewComissaoCliente()"></select>
        </div>
        <div class="form-group"><label>Valor do crédito *</label><input type="number" id="mc-val" placeholder="0,00" oninput="previewComissaoCliente()"></div>
        <div class="form-group">
          <label>Categoria *</label>
          <select id="mc-cat">${CATEGORIAS_PRODUTO.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-row cols-3">
        <div class="form-group"><label>Data da venda *</label><input type="date" id="mc-dvenda" oninput="previewComissaoCliente()"></div>
        <div class="form-group"><label>Venc. 2ª parcela cliente *</label><input type="date" id="mc-d2parc" oninput="previewComissaoCliente()"></div>
        <div class="form-group" id="mc-vend-row">
          <label>Vendedor *</label>
          <select id="mc-vend" onchange="onVendedorChangeCliente()"></select>
        </div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>Grupo</label><input id="mc-grupo" placeholder="ex: 1234" inputmode="numeric"></div>
        <div class="form-group"><label>Cota</label><input id="mc-cota" placeholder="ex: 056" inputmode="numeric"></div>
      </div>
      <div id="mc-preview-com" style="background:var(--ink3);border-radius:8px;border:1px solid var(--line);min-height:48px;overflow:hidden">
        <div style="padding:12px;font-size:11px;color:var(--text3);font-family:var(--mono)">Preencha tabela, valor e datas para ver a projeção de comissões...</div>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-cliente')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarCliente()">Salvar cliente →</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-cli-det">
  <div class="modal" style="width:720px">
    <button class="modal-close" onclick="closeModal('m-cli-det')">✕</button>
    <div class="modal-title" id="mcd-title"></div>
    <div class="modal-sub" id="mcd-sub"></div>
    <div id="mcd-body"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-cli-det')">Fechar</button>
      <button class="btn btn-primary btn-sm" id="mcd-btn-contrato">+ Novo contrato</button>
    </div>
  </div>
</div>`;
}

function formatarDocumento(el) {
  let v = el.value.replace(/\D/g,'');
  if (v.length <= 11) {
    v = v.replace(/(\d{3})(\d)/,'$1.$2')
         .replace(/(\d{3})(\d)/,'$1.$2')
         .replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  } else {
    v = v.replace(/(\d{2})(\d)/,'$1.$2')
         .replace(/(\d{3})(\d)/,'$1.$2')
         .replace(/(\d{3})(\d)/,'$1/$2')
         .replace(/(\d{4})(\d{1,2})$/,'$1-$2');
  }
  el.value = v;
}

function formatarTelefone(el) {
  let v = el.value.replace(/\D/g,'');
  if (v.length > 10) {
    v = v.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
  } else {
    v = v.replace(/(\d{2})(\d{4})(\d{4})/,'($1) $2-$3');
  }
  el.value = v;
}

function toggleContratoForm() {
  const hide = document.getElementById('mc-sem-contrato')?.checked;
  document.getElementById('mc-contrato-form').style.display = hide ? 'none' : 'block';
}

function onVendedorChangeCliente() {
  const vid = document.getElementById('mc-vend')?.value || AppState.user.id;
  const tabs = getTabelasVendedor(vid);
  document.getElementById('mc-tab').innerHTML = tabs.map(t => `<option value="${t.id}">${t.nome} (${t.ref})</option>`).join('');
  previewComissaoCliente();
}

function previewComissaoCliente() {
  const tabId = document.getElementById('mc-tab')?.value;
  const val   = parseFloat(document.getElementById('mc-val')?.value) || 0;
  const dv    = document.getElementById('mc-dvenda')?.value;
  const d2    = document.getElementById('mc-d2parc')?.value;
  const prev  = document.getElementById('mc-preview-com');
  if (!prev) return;
  if (!tabId || !val || !dv || !d2) {
    prev.innerHTML = '<div style="padding:12px;font-size:11px;color:var(--text3);font-family:var(--mono)">Preencha tabela, valor e datas para ver a projeção...</div>';
    return;
  }
  const pc    = calcParcelas({ tabela:tabId, valor:val, dvenda:dv, d2parc:d2, parcelas:[] });
  const ativas = pc.filter(p => p.ativa);
  const total  = ativas.reduce((a,p) => a+p.valor, 0);
  const tab    = DB.tabelas.find(t => t.id === tabId);
  prev.innerHTML = `
    <div style="padding:8px 12px;background:var(--ink4);border-bottom:1px solid var(--line);font-size:11px;font-family:var(--mono);display:flex;justify-content:space-between">
      <span style="color:var(--text2)">${tab?.nome} · ${ativas.length} parcelas</span>
      <span style="color:var(--brand);font-weight:700">Total: ${fmt(total)}</span>
    </div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
      <thead><tr>${['#','Venc. cliente','Pgto comissão','Valor','%'].map(h=>`<th style="padding:5px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;background:var(--ink3);text-align:left">${h}</th>`).join('')}</tr></thead>
      <tbody>${ativas.map(p=>`<tr><td style="padding:5px 10px;font-family:var(--mono);font-size:11px;color:var(--text3)">${p.n}ª</td><td style="padding:5px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${fmtDate(p.dataVencCliente)}</td><td style="padding:5px 10px;font-family:var(--mono);font-size:11px;color:var(--brand)">${fmtDate(p.dataPgto)}</td><td style="padding:5px 10px;font-family:var(--mono);font-size:11px;color:var(--brand)">${fmt(p.valor)}</td><td style="padding:5px 10px;font-family:var(--mono);font-size:10px;color:var(--text3)">${p.pct}%</td></tr>`).join('')}</tbody>
    </table></div>`;
}

let _editClienteId = null;

function abrirCadastroCliente(nomePre = '') {
  _editClienteId = null;
  document.getElementById('mc-title').textContent = 'Novo cliente';
  document.getElementById('mc-sub').textContent   = 'Preencha os dados do cliente e do primeiro contrato';
  ['mc-nome','mc-doc','mc-tel','mc-wpp','mc-email','mc-end','mc-cidade','mc-contr','mc-val','mc-dvenda','mc-d2parc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('mc-nome').value = nomePre;
  document.getElementById('mc-estado').value = '';
  document.getElementById('mc-sem-contrato').checked = false;
  document.getElementById('mc-contrato-form').style.display = 'block';

  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const uid = isG ? (DB.vendedores[0]?.id || u.id) : u.id;

  const vendRow = document.getElementById('mc-vend-row');
  if (vendRow) vendRow.style.display = isG ? 'block' : 'none';
  if (isG) {
    document.getElementById('mc-vend').innerHTML = vendedoresNaUnidade().map(v=>`<option value="${v.id}">${v.nome}</option>`).join('');
  }

  const tabs = getTabelasVendedor(uid).filter(t => t.ativo !== false);
  document.getElementById('mc-tab').innerHTML = tabs.map(t=>`<option value="${t.id}">${t.id} — ${t.nome} (${t.ref})</option>`).join('');
  document.getElementById('mc-dvenda').value = today();

  document.getElementById('mc-preview-com').innerHTML = '<div style="padding:12px;font-size:11px;color:var(--text3);font-family:var(--mono)">Preencha tabela, valor e datas para ver a projeção...</div>';
  openModal('m-cliente');
  setTimeout(() => document.getElementById('mc-nome')?.focus(), 100);
}

function abrirNovoContrato(cliId) {
  const c = DB.clientes?.find(x => x.id === cliId);
  if (!c) return;
  _editClienteId = cliId;
  document.getElementById('mc-title').textContent = `Novo contrato — ${c.nome}`;
  document.getElementById('mc-sub').textContent   = 'Adicionar contrato para cliente existente';

  document.getElementById('mc-nome').value   = c.nome;
  document.getElementById('mc-doc').value    = c.cpf || c.cnpj || '';
  document.getElementById('mc-tel').value    = c.telefone || '';
  document.getElementById('mc-wpp').value    = c.whatsapp || '';
  document.getElementById('mc-email').value  = c.email || '';
  document.getElementById('mc-end').value    = c.endereco || '';
  document.getElementById('mc-cidade').value = c.cidade || '';
  document.getElementById('mc-estado').value = c.estado || '';

  document.getElementById('mc-sem-contrato').checked = false;
  document.getElementById('mc-contrato-form').style.display = 'block';
  ['mc-contr','mc-val','mc-dvenda','mc-d2parc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('mc-dvenda').value = today();

  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const uid = isG ? (DB.vendedores[0]?.id || u.id) : u.id;
  const vendRow = document.getElementById('mc-vend-row');
  if (vendRow) vendRow.style.display = isG ? 'block' : 'none';
  if (isG) {
    document.getElementById('mc-vend').innerHTML = vendedoresNaUnidade().map(v=>`<option value="${v.id}">${v.nome}</option>`).join('');
  }
  const tabs = getTabelasVendedor(uid).filter(t => t.ativo !== false);
  document.getElementById('mc-tab').innerHTML = tabs.map(t=>`<option value="${t.id}">${t.id} — ${t.nome} (${t.ref})</option>`).join('');

  openModal('m-cliente');
}

async function salvarCliente() {
  const nome   = document.getElementById('mc-nome').value.trim();
  const doc    = document.getElementById('mc-doc').value.trim();
  const tel    = document.getElementById('mc-tel').value.trim();
  const wpp    = document.getElementById('mc-wpp').value.trim();
  const email  = document.getElementById('mc-email').value.trim();
  const end    = document.getElementById('mc-end').value.trim();
  const cidade = document.getElementById('mc-cidade').value.trim();
  const estado = document.getElementById('mc-estado').value;
  const semCont= document.getElementById('mc-sem-contrato').checked;

  if (!semCont && !podeCadastrarVenda()) {
    Dialog.alert('Cadastro bloqueado', ['As tabelas de comissionamento estão em remodelagem. Cadastro de contrato/venda nova temporariamente indisponível. Você ainda pode cadastrar o cliente marcando "Cadastrar só o cliente por agora".']);
    return;
  }

  if (!nome) { Dialog.alert('Campo obrigatório', ['Informe o nome do cliente.']); return; }

  const isCNPJ = doc.replace(/\D/g,'').length > 11;
  const cliObj = { nome, telefone:tel, whatsapp:wpp, email, endereco:end, cidade, estado };
  if (isCNPJ) cliObj.cnpj = doc; else cliObj.cpf = doc;

  const btn = document.querySelector('#m-cliente .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    let cliId = _editClienteId;
    if (!DB.clientes) DB.clientes = [];

    if (!cliId) {
      const data = await Servicos.salvarCliente(cliObj);
      if (!data) throw new Error('Não foi possível salvar o cliente no banco de dados.');
      cliId = data.id;
      DB.clientes.push({ ...cliObj, id: cliId });
    } else {
      const data = await Servicos.salvarCliente({ ...cliObj, id: cliId });
      if (!data) throw new Error('Não foi possível atualizar o cliente no banco de dados.');
      const idx = DB.clientes.findIndex(c => c.id === cliId);
      if (idx >= 0) Object.assign(DB.clientes[idx], cliObj);
    }

    if (!semCont) {
      const tabId = document.getElementById('mc-tab').value;
      const val   = parseFloat(document.getElementById('mc-val').value) || 0;
      const dv    = document.getElementById('mc-dvenda').value;
      const d2    = document.getElementById('mc-d2parc').value;
      const cat   = document.getElementById('mc-cat').value;
      const grupo = document.getElementById('mc-grupo').value.trim();
      const cota  = document.getElementById('mc-cota').value.trim();
      const contr = document.getElementById('mc-contr').value.trim();
      const u     = AppState.user;
      const isG   = (u.role === 'gestor' || u.role === 'adm');
      const uid   = isG ? (document.getElementById('mc-vend')?.value || u.id) : u.id;

      if (!val || !dv || !d2) { Dialog.alert('Dados do contrato', ['Preencha: valor, data da venda e vencimento da 2ª parcela.']); return; }

      const tab = DB.tabelas.find(t => t.id === tabId);
      const parcelas = (tab?.parcelas || []).map(p => ({ s: p > 0 ? 'pendente' : 'fora' }));
      if (parcelas[0]) parcelas[0].s = 'pago';

      const contratoNum = contr || `${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;

      const vData = await Servicos.salvarVenda({
        vendedor_id: uid,
        cliente_id:  cliId,
        contrato:    contratoNum,
        tabela_id:   tabId,
        categoria:   cat,
        grupo:       grupo,
        cota:        cota,
        valor:       val,
        dvenda:      dv,
        d2parc:      d2,
        status:      'ativo',
        obs:         '',
        parcelas,
      });
      if (!vData) throw new Error('Não foi possível salvar o contrato no banco de dados.');

      DB.vendas.push({
        id: vData.id, vendedor: uid, cliente_id: cliId, cliente: nome,
        contrato: vData.contrato, tabela: tabId, categoria: cat, grupo, cota,
        valor: val, dvenda: dv, d2parc: d2,
        status: 'ativo', dataInad: null, obs: '', parcelas,
      });
    }

    closeModal('m-cliente');
    Dialog.success('Cliente salvo', [
      { tipo:'destaque', label:'Cliente', valor:nome },
      semCont ? 'Cliente cadastrado sem contrato.' : 'Cliente e contrato registrados com sucesso.',
    ]);
    rerenderModule('clientes');
  } catch(e) {
    console.error('Erro ao salvar cliente/venda:', e);
    Dialog.alert('Erro ao salvar', [e.message || 'Não foi possível salvar no banco de dados. Verifique sua conexão e tente novamente.']);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
}

function abrirClienteDetalhe(cliId) {
  const c = DB.clientes?.find(x => x.id === cliId);
  if (!c) return;
  const contratos = DB.vendas.filter(v => v.cliente_id === cliId || v.cliente === c.nome);

  document.getElementById('mcd-title').textContent = c.nome;
  document.getElementById('mcd-sub').textContent   = `${c.cpf || c.cnpj || 'Sem documento'} · ${contratos.length} contrato(s)`;

  const docLabel = c.cnpj ? 'CNPJ' : 'CPF';
  document.getElementById('mcd-body').innerHTML = `
    <div class="det-grid" style="margin-bottom:16px">
      <div class="det-item"><div class="det-label">${docLabel}</div><div class="det-value" style="font-family:var(--mono)">${c.cpf || c.cnpj || '—'}</div></div>
      <div class="det-item"><div class="det-label">Telefone</div><div class="det-value">${c.telefone || '—'}</div></div>
      <div class="det-item"><div class="det-label">WhatsApp</div><div class="det-value">${c.whatsapp || '—'}</div></div>
      <div class="det-item"><div class="det-label">E-mail</div><div class="det-value">${c.email || '—'}</div></div>
      ${c.endereco ? `<div class="det-item" style="grid-column:1/-1"><div class="det-label">Endereço</div><div class="det-value">${c.endereco}${c.cidade ? ', '+c.cidade : ''}${c.estado ? ' — '+c.estado : ''}</div></div>` : ''}
    </div>
    ${contratos.length > 0 ? `
    <div class="form-divider">Contratos</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Contrato</th><th>Vendedor</th><th>Tabela</th><th>Valor</th><th>Parcelas</th><th>Situação</th></tr></thead>
      <tbody>
        ${contratos.map(v => {
          const tab = DB.tabelas.find(t => t.id === v.tabela);
          const sit = situacao(v);
          const pg  = v.parcelas.filter(p=>p.s==='pago').length;
          const tot = v.parcelas.filter(p=>p.s!=='fora').length;
          return `<tr>
            <td><div style="font-weight:600;font-family:var(--mono);font-size:12px">${v.contrato}</div><div style="font-size:10px;color:var(--text3)">${fmtDate(v.dvenda)}</div></td>
            <td><span class="chip">${vendorName(v.vendedor).split(' ')[0]}</span></td>
            <td style="font-size:12px">${tab?.nome || v.tabela}</td>
            <td class="td-mono">${fmt(v.valor)}</td>
            <td><div style="font-size:11px;font-family:var(--mono)">${pg}/${tot} pagas</div></td>
            <td>${sitBadge(sit)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>` : `<div class="empty-state" style="padding:24px"><div class="empty-title">Sem contratos</div><div class="empty-sub">Nenhum contrato vinculado a este cliente</div></div>`}`;

  document.getElementById('mcd-btn-contrato').onclick = () => { closeModal('m-cli-det'); abrirNovoContrato(cliId); };
  openModal('m-cli-det');
}

/* ═══════════════════════════════════════════════════════════════════════════
   11. MÓDULO: RELATÓRIO DE VENDAS
   ═══════════════════════════════════════════════════════════════════════════ */
function filtrarRelatorio() {
  const st    = AppState.modulo.relatorio;
  const u     = AppState.user;
  const isG   = u.role === 'gestor' || u.role === 'adm';
  const busca = (st.busca || '').trim().toLowerCase();

  const lista = st.filterVend ? DB.vendas.filter(v => v.vendedor === st.filterVend) : vendasNoEscopo(u);

  const buscaFiltro = v =>
    (v.contrato||'').toLowerCase().includes(busca) ||
    (v.cliente||'').toLowerCase().includes(busca)  ||
    (v.grupo||'').toLowerCase().includes(busca)    ||
    (v.cota||'').toLowerCase().includes(busca);

  const vendasMes  = busca ? lista.filter(buscaFiltro) : lista.filter(v => mesKey(v.dvenda) === st.mesSel);
  const vendasFilt = st.filterStatus === 'all' ? vendasMes : vendasMes.filter(v => v.status === st.filterStatus);

  const tbody = document.querySelector('#mod-relatorio tbody');
  if (!tbody) return;

  if (vendasFilt.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isG ? 9 : 8}" class="td-center" style="padding:40px;color:var(--text3)">Nenhuma venda encontrada</td></tr>`;
    return;
  }

  tbody.innerHTML = vendasFilt.map(v => {
    const tab   = DB.tabelas.find(t => t.id === v.tabela);
    const vend  = DB.vendedores.find(x => x.id === v.vendedor);
    const parcs = calcParcelas(v);
    const comTot = parcs.reduce((a, p) => a + p.valor, 0);
    const pagas  = (v.parcelas || []).filter(p => p.s === 'pago').length;
    const total  = (v.parcelas || []).length;
    const statusBadge = {
      ativo:        'badge-green',
      inadimplente: 'badge-amber',
      cancelado:    'badge-gray',
      concluido:    'badge-blue',
      estornado:    'badge-red',
    }[v.status] || 'badge-gray';

    return `<tr onclick="abrirDetalheVenda('${v.id}')" style="cursor:pointer">
      <td>
        <div style="font-weight:600;font-size:13px">${v.cliente||'—'}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${v.contrato||'—'} ${v.grupo?'· G'+v.grupo:''} ${v.cota?'· C'+v.cota:''}</div>
      </td>
      ${isG ? `<td style="font-size:12px;color:var(--text2)">${vend?.nome||'—'}</td>` : ''}
      <td><span class="chip" style="font-size:10px">${tab?.nome||v.tabela||'—'}</span></td>
      <td class="td-mono">${fmt(v.valor)}</td>
      <td class="td-mono">${fmt(comTot)}</td>
      <td style="font-size:11px;font-family:var(--mono)">${pagas}/${total}</td>
      <td><span class="badge ${statusBadge}">${v.status?.toUpperCase()||'—'}</span></td>
      <td style="font-size:11px;font-family:var(--mono)">${fmtDate(v.dvenda)}</td>
      <td class="no-print">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();abrirDetalheVenda('${v.id}')">Ver</button>
      </td>
    </tr>`;
  }).join('');
}

// NOVO: abre o modal de detalhe da venda a partir da busca do Relatório
// (reaproveita o mesmo modal/estrutura de verVendaDetalhe)
function abrirDetalheVenda(id) {
  verVendaDetalhe(id);
}

function renderRelatorio() {
  const u  = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';
  const st  = AppState.modulo.relatorio;
  const uid = st.filterVend;

  const lista = uid ? DB.vendas.filter(v => v.vendedor === uid) : vendasNoEscopo(u);

  const mesesDisp = [...new Set(lista.map(v => mesKey(v.dvenda)).filter(Boolean))].sort();
  if (!mesesDisp.includes(todayMes())) mesesDisp.push(todayMes());
  mesesDisp.sort();
  if (!st.mesSel || !mesesDisp.includes(st.mesSel)) st.mesSel = mesesDisp[mesesDisp.length - 1] || todayMes();

  const busca = (st.busca || '').trim().toLowerCase();
  const buscaFiltro = v => {
    if (!busca) return true;
    return (v.contrato||'').toLowerCase().includes(busca)
        || (v.cliente||'').toLowerCase().includes(busca)
        || (v.grupo||'').toLowerCase().includes(busca)
        || (v.cota||'').toLowerCase().includes(busca);
  };

  const vendasMes  = busca ? lista.filter(buscaFiltro) : lista.filter(v => mesKey(v.dvenda) === st.mesSel);
  const vendasFilt = st.filterStatus === 'all' ? vendasMes : vendasMes.filter(v => v.status === st.filterStatus);

  const totalCred  = vendasMes.reduce((a, v) => a + v.valor, 0);
  const inadimp    = vendasMes.filter(v => v.status === 'inadimplente').length;
  const cancelados = vendasMes.filter(v => v.status === 'cancelado').length;

  const mesNav = renderMesNav(mesesDisp, st.mesSel, "AppState.modulo.relatorio.mesSel", 'relatorio');

  const statusCounts = { all: vendasMes.length };
  ['ativo','inadimplente','cancelado'].forEach(s => {
    statusCounts[s] = vendasMes.filter(v => v.status === s).length;
  });

  const pills = [
    ['all','Todos',statusCounts.all,'filter-pill-all'],
    ['ativo','Ativos',statusCounts.ativo,'filter-pill-green'],
    ['inadimplente','Inadimp.',statusCounts.inadimplente,'filter-pill-amber'],
    ['cancelado','Cancelados',statusCounts.cancelado,'filter-pill-gray'],
  ].map(([s, lbl, cnt, cls]) =>
    `<button class="filter-pill ${cls}${st.filterStatus === s ? ' active' : ''}"
      onclick="AppState.modulo.relatorio.filterStatus='${s}';rerenderModule('relatorio')">${lbl} <strong>(${cnt})</strong></button>`
  ).join('');

  const vendorPills = (isG || isSup) ? renderVendorFilter(st.filterVend, "AppState.modulo.relatorio.filterVend", 'relatorio', vendedoresNoEscopo(u)) : '';

  const rows = vendasFilt.map(v => {
    const tab = DB.tabelas.find(t => t.id === v.tabela);
    const parcelas = calcParcelas(v);
    const comTotal = parcelas.filter(p => p.ativa).reduce((a, p) => a + p.valor, 0);
    const badge = { ativo:'badge-green', inadimplente:'badge-amber', cancelado:'badge-gray', concluido:'badge-blue' }[v.status] || 'badge-gray';
    const label = { ativo:'ATIVO', inadimplente:'INADIMPLENTE', cancelado:'CANCELADO', concluido:'CONCLUÍDO' }[v.status] || v.status.toUpperCase();
    return `<tr onclick="verVendaDetalhe(${v.id})" style="cursor:pointer">
      <td>
        <div style="font-weight:600">${v.cliente}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${v.contrato}${(v.grupo || v.cota) ? ` · G${v.grupo||'—'}/C${v.cota||'—'}` : ''}</div>
        ${!v.d2parc ? `<div style="font-size:9px;color:var(--red);font-weight:700;margin-top:2px" title="Cadastro incompleto: edite a venda e informe o vencimento da 2ª parcela">⚠ Sem venc. 2ª parcela</div>` : ''}
      </td>
      ${(isG || isSup) ? `<td><span class="chip">${vendorName(v.vendedor).split(' ')[0]}</span></td>` : ''}
      <td>
        <div style="font-size:12px">${tab?.nome || v.tabela}</div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${tab?.ref || ''}</div>
      </td>
      <td class="td-mono">${fmt(v.valor)}</td>
      <td class="td-mono" style="color:var(--gold)">${fmt(comTotal)}</td>
      <td>
        <div class="parc-dots">
          ${v.parcelas.slice(0, 8).map((p, i) => {
            const cls = p.s === 'pago' ? 'paid' : p.s === 'bloq' ? 'blocked' : p.s === 'cancelado' ? 'canceled' : p.s === 'fora' ? 'out' : 'pending';
            const label = p.s === 'pago' ? '✓' : p.s === 'cancelado' ? '✗' : (i+1);
            return `<div class="parc-dot ${cls}">${label}</div>`;
          }).join('')}
        </div>
      </td>
      <td><span class="badge ${badge}" style="font-size:9px">${label}</span></td>
      <td style="font-size:11px;color:var(--text2);font-family:var(--mono)">${fmtDate(v.dvenda)}</td>
      <td>
        <div class="no-print" style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();editarVenda('${v.id}')" title="Editar">✎</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="event.stopPropagation();excluirVenda('${v.id}')" title="Excluir">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">Relatório de Vendas</div>
    <div class="page-sub">// ${mesLabel(st.mesSel)} · ${uid ? vendorName(uid) : 'Todos os vendedores'}</div>
  </div>
  <div class="page-actions no-print">
    <button class="btn btn-primary btn-sm" onclick="abrirNovaVenda()" style="${podeCadastrarVenda()?'':'display:none'}">+ Nova venda</button>
    ${podeCadastrarVenda() ? '' : `<span class="chip" style="background:var(--red-dim);color:var(--brand);font-weight:600">⚠ Cadastro de venda temporariamente bloqueado — tabelas em remodelagem</span>`}
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 Imprimir</button>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-card gold">
    <div class="stat-label">Produção</div>
    <div class="stat-value">${fmt(totalCred)}</div>
    <div class="stat-meta">${busca ? vendasMes.length + " resultado(s) na busca" : vendasMes.length + " contrato(s) no mês"}</div>
  </div>
  <div class="stat-card amber">
    <div class="stat-label">Inadimplentes</div>
    <div class="stat-value">${inadimp}</div>
    <div class="stat-meta">${vendasMes.length > 0 ? ((inadimp/vendasMes.length*100).toFixed(0))+'% do mês' : '—'}</div>
  </div>
  <div class="stat-card red">
    <div class="stat-label">Cancelados</div>
    <div class="stat-value">${cancelados}</div>
    <div class="stat-meta">Mês selecionado</div>
  </div>
</div>

${mesNav ? `<div class="month-nav">${mesNav}</div>` : ''}
${vendorPills}
<div class="form-group" style="max-width:320px;margin-bottom:12px">
  <input type="text" placeholder="Buscar por cliente, contrato, grupo ou cota..." value="${st.busca||''}"
    id="relatorio-busca"
    oninput="AppState.modulo.relatorio.busca=this.value;filtrarRelatorio()"
    onfocus="this.select()">
</div>
${busca ? `<div style="font-size:11px;color:var(--text3);margin:-6px 0 12px">Busca ativa em todos os meses — ${vendasMes.length} resultado(s) para "${busca}"</div>` : ''}
<div class="filter-bar">${pills}</div>

<div class="card">
  <div class="card-header">
    <span class="card-title">${busca ? "Resultados da busca" : "Vendas — " + mesLabel(st.mesSel)}</span>
    <span class="chip">${vendasFilt.length} registros</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Cliente / Contrato</th>
        ${(isG || isSup) ? '<th>Vendedor</th>' : ''}
        <th>Tabela</th><th>Valor</th><th>Comissão total</th><th>Parcelas</th><th>Status</th><th>Data</th><th class="no-print">Ações</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="${(isG||isSup) ? 9 : 8}" class="td-center" style="padding:40px;color:var(--text3)">Nenhuma venda no período</td></tr>`}</tbody>
    </table>
  </div>
</div>

<div class="overlay" id="m-venda">
  <div class="modal">
    <button class="modal-close" onclick="closeModal('m-venda')">✕</button>
    <div class="modal-title" id="mv-title">Registrar venda</div>
    <div class="modal-sub">Preencha os dados. As parcelas serão calculadas automaticamente.</div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Cliente</label><input id="mv-cli" placeholder="Nome do cliente" oninput="previewComissao()"></div>
      <div class="form-group"><label>Nº Contrato</label><input id="mv-contr" placeholder="ex: 2025/001"></div>
    </div>
    <div class="form-row cols-4">
      <div class="form-group">
        <label>Tabela / Produto</label>
        <select id="mv-tab" onchange="previewComissao()"></select>
      </div>
      <div class="form-group"><label>Valor da venda (R$)</label><input type="number" id="mv-val" placeholder="0,00" oninput="previewComissao()"></div>
      <div class="form-group">
        <label>Categoria</label>
        <select id="mv-cat">${CATEGORIAS_PRODUTO.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="mv-status">
          <option value="ativo">Ativo</option>
          <option value="inadimplente">Inadimplente</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Data da venda</label><input type="date" id="mv-dvenda" oninput="previewComissao()"></div>
      <div class="form-group"><label>Vencto. 2ª parcela do cliente</label><input type="date" id="mv-d2parc" oninput="previewComissao()"></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Grupo</label><input id="mv-grupo" placeholder="ex: 1234" inputmode="numeric"></div>
      <div class="form-group"><label>Cota</label><input id="mv-cota" placeholder="ex: 056" inputmode="numeric"></div>
    </div>
    <div class="form-row cols-1" id="mv-vend-row" style="display:none">
      <div class="form-group"><label>Vendedor</label><select id="mv-vend" onchange="onVendedorChange()"></select></div>
    </div>
    <div class="form-row cols-1">
      <div class="form-group"><label>Observação (opcional)</label><textarea id="mv-obs" placeholder="Ex: renovação, acordo, observação..."></textarea></div>
    </div>
    <div class="form-divider">Projeção de comissões</div>
    <div id="mv-preview" style="background:var(--ink3);border-radius:8px;border:1px solid var(--line);overflow:hidden;min-height:60px">
      <div style="padding:14px;font-size:11px;color:var(--text3);font-family:var(--mono)">Preencha tabela, valor e datas para ver a projeção...</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-venda')">Cancelar</button>
      <button class="btn btn-primary" onclick="saveVenda()">Salvar venda →</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-venda-det">
  <div class="modal" style="width:720px">
    <button class="modal-close" onclick="closeModal('m-venda-det')">✕</button>
    <div class="modal-title" id="mvd-title"></div>
    <div class="modal-sub" id="mvd-sub"></div>
    <div id="mvd-body"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-venda-det')">Fechar</button>
    </div>
  </div>
</div>`;
}

let _vendaOrigemLeadId = null;

// NOVO: abre o formulário REAL de Nova Venda (mesmo do Relatórios/Vendedores),
// pré-preenchido com os dados do lead do Funil — pra gerar comissionamento
// de verdade quando um lead vira Venda, em vez de só guardar um valor solto.
function abrirNovaVendaDoLead(leadId) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  _vendaOrigemLeadId = leadId;

  abrirNovaVenda(); // monta o formulário base (tabelas, visibilidade de vendedor, etc.)

  document.getElementById('mv-title').textContent = 'Registrar venda — ' + lead.nome;
  document.getElementById('mv-cli').value = lead.nome;
  if (lead.valorCredito) document.getElementById('mv-val').value = lead.valorCredito;

  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  if (isG) {
    const selectVend = document.getElementById('mv-vend');
    if (selectVend) {
      selectVend.value = lead.vendedor;
      onVendedorChange(); // atualiza tabelas disponíveis pro vendedor certo
    }
  }
}

function abrirNovaVenda() {
  AppState.editing.vendaId = null;
  document.getElementById('mv-title').textContent = 'Registrar venda';
  document.getElementById('mv-cli').value = '';
  document.getElementById('mv-contr').value = '';
  document.getElementById('mv-val').value = '';
  document.getElementById('mv-dvenda').value = today();
  document.getElementById('mv-d2parc').value = '';
  document.getElementById('mv-status').value = 'ativo';
  document.getElementById('mv-cat').value = 'AUTO';
  document.getElementById('mv-obs').value = '';
  document.getElementById('mv-grupo').value = '';
  document.getElementById('mv-cota').value = '';

  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const tabs = getTabelasVendedor(isG ? (DB.vendedores[0]?.id || u.id) : u.id);
  document.getElementById('mv-tab').innerHTML = tabs.map(t => `<option value="${t.id}">${t.nome} (${t.ref})</option>`).join('');
  document.getElementById('mv-vend-row').style.display = isG ? 'grid' : 'none';
  if (isG) {
    document.getElementById('mv-vend').innerHTML = vendedoresNaUnidade().map(v => `<option value="${v.id}">${v.nome}</option>`).join('');
    document.getElementById('mv-vend').onchange = onVendedorChange;
  }
  document.getElementById('mv-preview').innerHTML = '<div style="padding:14px;font-size:11px;color:var(--text3);font-family:var(--mono)">Preencha tabela, valor e datas para ver a projeção...</div>';
  openModal('m-venda');
}

function editarVenda(id) {
  const v = DB.vendas.find(x => x.id === id);
  if (!v) return;

  if (!document.getElementById('m-venda')) {
    Router.navigate('relatorio');
    setTimeout(() => editarVenda(id), 150);
    return;
  }

  AppState.editing.vendaId = id;
  document.getElementById('mv-title').textContent = 'Editar — ' + v.cliente;
  document.getElementById('mv-cli').value   = v.cliente;
  document.getElementById('mv-contr').value = v.contrato;
  document.getElementById('mv-val').value   = v.valor;
  document.getElementById('mv-dvenda').value = v.dvenda || '';
  document.getElementById('mv-d2parc').value = v.d2parc || '';
  document.getElementById('mv-status').value = v.status;
  document.getElementById('mv-cat').value   = v.categoria || 'AUTO';
  document.getElementById('mv-obs').value   = v.obs || '';
  document.getElementById('mv-grupo').value = v.grupo || '';
  document.getElementById('mv-cota').value  = v.cota || '';

  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const uid = isG ? v.vendedor : u.id;
  const tabs = getTabelasVendedor(uid).filter(t => t.ativo !== false);

  document.getElementById('mv-tab').innerHTML = tabs.map(t =>
    `<option value="${t.id}">${t.id} — ${t.nome} (${t.ref})</option>`
  ).join('');
  document.getElementById('mv-tab').value = v.tabela;
  document.getElementById('mv-vend-row').style.display = isG ? 'grid' : 'none';

  if (isG) {
    document.getElementById('mv-vend').innerHTML = DB.vendedores.map(vv =>
      `<option value="${vv.id}"${vv.id === v.vendedor ? ' selected' : ''}>${vv.nome}</option>`
    ).join('');
  }
  previewComissao();
  openModal('m-venda');
}

function onVendedorChange() {
  const vid = document.getElementById('mv-vend')?.value || AppState.user.id;
  const tabs = getTabelasVendedor(vid);
  document.getElementById('mv-tab').innerHTML = tabs.map(t => `<option value="${t.id}">${t.nome} (${t.ref})</option>`).join('');
  previewComissao();
}

function previewComissao() {
  const tabId = document.getElementById('mv-tab')?.value;
  const val   = parseFloat(document.getElementById('mv-val')?.value) || 0;
  const dv    = document.getElementById('mv-dvenda')?.value;
  const d2    = document.getElementById('mv-d2parc')?.value;
  const prev  = document.getElementById('mv-preview');
  if (!prev) return;
  if (!tabId || !val || !dv || !d2) {
    prev.innerHTML = '<div style="padding:14px;font-size:11px;color:var(--text3);font-family:var(--mono)">Preencha tabela, valor e datas para ver a projeção...</div>';
    return;
  }
  const pc = calcParcelas({ tabela: tabId, valor: val, dvenda: dv, d2parc: d2, parcelas: [] });
  const ativas = pc.filter(p => p.ativa);
  const total  = ativas.reduce((a, p) => a + p.valor, 0);
  const tab    = DB.tabelas.find(t => t.id === tabId);
  const rows   = ativas.map(p => `<tr>
    <td style="color:var(--text3);font-family:var(--mono);padding:6px 10px">${p.n}ª</td>
    <td style="font-family:var(--mono);font-size:11px;color:var(--text2);padding:6px 10px">${fmtDate(p.dataVencCliente)}</td>
    <td style="font-family:var(--mono);font-size:11px;color:var(--gold);padding:6px 10px">${fmtDate(p.dataPgto)}</td>
    <td style="font-family:var(--mono);color:var(--gold);padding:6px 10px">${fmt(p.valor)}</td>
    <td style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:6px 10px">${p.pct}%</td>
  </tr>`).join('');
  prev.innerHTML = `
  <div style="padding:8px 12px;background:var(--ink4);border-bottom:1px solid var(--line);font-size:11px;font-family:var(--mono);display:flex;justify-content:space-between">
    <span style="color:var(--text2)">${tab?.nome} · ${tab?.ref} · ${ativas.length} parcelas</span>
    <span style="color:var(--gold);font-weight:600">Total: ${fmt(total)}</span>
  </div>
  <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
    <thead><tr>${['#','Venc. cliente','Pgto comissão','Valor','%'].map(h => `<th style="padding:6px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;background:var(--ink3);text-align:left">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

async function saveVenda() {
  if (!AppState.editing.vendaId && !podeCadastrarVenda()) {
    Dialog.alert('Cadastro bloqueado', ['As tabelas de comissionamento estão em remodelagem. Cadastro de venda nova temporariamente indisponível.']);
    return;
  }
  const cli   = document.getElementById('mv-cli').value.trim();
  const contr = document.getElementById('mv-contr').value.trim();
  const tabId = document.getElementById('mv-tab').value;
  const val   = parseFloat(document.getElementById('mv-val').value) || 0;
  const dv    = document.getElementById('mv-dvenda').value;
  const d2    = document.getElementById('mv-d2parc').value;
  const status= document.getElementById('mv-status').value;
  const cat   = document.getElementById('mv-cat').value;
  const obs   = document.getElementById('mv-obs').value.trim();
  const grupo = document.getElementById('mv-grupo').value.trim();
  const cota  = document.getElementById('mv-cota').value.trim();
  const u     = AppState.user;
  const uid   = (u.role === 'gestor' || u.role === 'adm') ? (document.getElementById('mv-vend')?.value || u.id) : u.id;
  if (!cli || !val || !dv || !d2) { Dialog.alert('Campos obrigatórios', ['Preencha: Cliente, Valor, Data da venda e Vencimento da 2ª parcela.']); return; }

  const tab = DB.tabelas.find(t => t.id === tabId);

  if (AppState.editing.vendaId) {
    const v = DB.vendas.find(x => x.id === AppState.editing.vendaId);
    if (!v) return;

    let parcelasAjustadas = v.parcelas;
    let statusAjustado = status;
    let dataInadAjustada = v.dataInad;
    if (d2 !== v.d2parc) {
      const novosCalc = calcParcelas({ tabela: tabId, valor: val, dvenda: dv, d2parc: d2, parcelas: [] });
      const hoje = today();
      parcelasAjustadas = v.parcelas.map((p, i) => {
        if (p.s === 'atrasado') {
          const novaData = novosCalc[i]?.dataVencCliente;
          if (novaData && novaData >= hoje) return { ...p, s: 'pendente' };
        }
        return p;
      });
      const aindaAtrasado = parcelasAjustadas.some(p => p.s === 'atrasado');
      if (statusAjustado === 'inadimplente' && !aindaAtrasado) {
        statusAjustado = 'ativo';
        dataInadAjustada = null;
      }
    }

    try {
      await Supabase
        .from('vendas')
        .update({
          contrato:     contr,
          tabela_id:    tabId,
          categoria:    cat,
          grupo:        grupo,
          cota:         cota,
          valor:        val,
          dvenda:       dv,
          d2parc:       d2,
          status:       statusAjustado,
          obs:          obs,
          vendedor_id:  uid,
          parcelas:     parcelasAjustadas,
        })
        .eq('id', AppState.editing.vendaId);
      try {
        await Supabase.from('vendas').update({ data_inad: dataInadAjustada || null }).eq('id', AppState.editing.vendaId);
      } catch(e) {}

      Object.assign(v, { cliente: cli, contrato: contr, tabela: tabId, categoria: cat, grupo, cota, valor: val, dvenda: dv, d2parc: d2, status: statusAjustado, obs, vendedor: uid, parcelas: parcelasAjustadas, dataInad: dataInadAjustada });
      Dialog.success('Venda atualizada', [{ tipo:'destaque', label:'Cliente', valor: cli }]);
    } catch(e) {
      console.error('Erro ao salvar venda:', e);
      Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco. Verifique sua conexão.']);
      return;
    }
  } else {
    const parcelas = (tab?.parcelas || []).map(p => ({ s: p > 0 ? 'pendente' : 'fora' }));
    if (parcelas[0]) parcelas[0].s = 'pago';

    try {
      let { data: cliData } = await Supabase.from('clientes').select('id').eq('nome', cli).single();
      if (!cliData) {
        const { data: newCli } = await Supabase.from('clientes').insert({ nome: cli }).select().single();
        cliData = newCli;
      }

      const { data: novaVenda, error } = await Supabase
        .from('vendas')
        .insert({
          vendedor_id: uid,
          cliente_id:  cliData?.id,
          contrato:    contr || `${new Date().getFullYear()}/${String(Date.now()).slice(-4)}`,
          tabela_id:   tabId,
          categoria:   cat,
          grupo:       grupo,
          cota:        cota,
          valor:       val,
          dvenda:      dv,
          d2parc:      d2,
          status:      'ativo',
          obs:         obs,
          parcelas:    parcelas,
        })
        .select()
        .single();

      if (error) throw error;

      DB.vendas.push({
        id: novaVenda.id, vendedor: uid, cliente_id: cliData?.id,
        cliente: cli, contrato: novaVenda.contrato, tabela: tabId, categoria: cat, grupo, cota,
        valor: val, dvenda: dv, d2parc: d2, status: 'ativo', obs,
        dataInad: null, parcelas, estorno: null, notifs: [],
      });

      // NOVO: se essa venda veio de um lead do Funil de Atendimento, linka
      // o lead a essa venda e move ele pra etapa Venda de verdade
      if (_vendaOrigemLeadId) {
        const leadOrigem = DB.leadsFunil.find(l => l.id === _vendaOrigemLeadId);
        if (leadOrigem) {
          const historico = [...(leadOrigem.historico||[]), { etapa:'venda', data: today() }];
          await Servicos.atualizarLeadFunil(_vendaOrigemLeadId, {
            etapa: 'venda', valor_venda: val, venda_id: novaVenda.id, historico_etapas: historico,
          });
        }
        _vendaOrigemLeadId = null;
      }

      AppState.modulo.relatorio.mesSel = mesKey(dv);
      Dialog.success('Venda cadastrada', [{ tipo:'destaque', label:'Cliente', valor: cli }]);
    } catch(e) {
      console.error('Erro ao inserir venda:', e);
      Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco. Verifique sua conexão.']);
      return;
    }
  }
  closeModal('m-venda');
  await carregarDadosIniciais();
  rerenderModule('relatorio');
  rerenderModule('funil');
}

async function excluirVenda(id) {
  const _ok1 = await Dialog.danger('Excluir venda', [
    'Esta ação não pode ser desfeita.',
    { tipo:'lista', icone:'—', texto:'A venda será removida permanentemente do sistema' }
  ]); if (!_ok1) return;
  try {
    await Supabase.from('vendas').delete().eq('id', id);
    const idx = DB.vendas.findIndex(v => v.id === id);
    if (idx >= 0) DB.vendas.splice(idx, 1);
    rerenderModule('relatorio');
  } catch(e) {
    console.error('Erro ao excluir venda:', e);
    Dialog.alert('Erro ao excluir', ['Não foi possível excluir no banco.']);
  }
}

function verVendaDetalhe(id) {
  const v = DB.vendas.find(x => x.id === id);
  if (!v) return;
  const tab = DB.tabelas.find(t => t.id === v.tabela);
  const pc  = calcParcelas(v);
  document.getElementById('mvd-title').textContent = v.cliente;
  document.getElementById('mvd-sub').textContent   = `Contrato: ${v.contrato} · ${tab?.nome || v.tabela}`;
  document.getElementById('mvd-body').innerHTML = `
    <div class="det-grid">
      <div class="det-item"><div class="det-label">Vendedor</div><div class="det-value">${vendorName(v.vendedor)}</div></div>
      <div class="det-item"><div class="det-label">Valor</div><div class="det-value" style="font-family:var(--mono);color:var(--gold)">${fmt(v.valor)}</div></div>
      <div class="det-item"><div class="det-label">Data da venda</div><div class="det-value">${fmtDate(v.dvenda)}</div></div>
      <div class="det-item"><div class="det-label">Tabela</div><div class="det-value">${tab?.nome || v.tabela} <span class="chip">${tab?.ref || ''}</span></div></div>
    </div>
    ${v.obs ? `<div style="padding:10px 14px;background:var(--ink3);border-radius:8px;font-size:12px;color:var(--text2);margin-bottom:16px">📝 ${v.obs}</div>` : ''}
    <div class="form-divider">Projeção de parcelas</div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Venc. cliente</th><th>Pgto comissão</th><th>Valor</th><th>%</th><th>Status</th></tr></thead>
      <tbody>${pc.filter(p => p.ativa).map((p, i) => {
        const st = v.parcelas[i]?.s || 'pendente';
        const badge = { pago: 'badge-green', bloq: 'badge-red', cancelado: 'badge-gray', pendente: 'badge-gray' }[st] || 'badge-gray';
        const lbl   = { pago: 'PAGO', bloq: 'BLOQUEADA', cancelado: 'CANCELADA', pendente: 'PENDENTE' }[st] || st;
        return `<tr>
          <td class="td-mono">${p.n}ª</td>
          <td class="td-mono">${fmtDate(p.dataVencCliente)}</td>
          <td class="td-mono" style="color:var(--gold)">${fmtDate(p.dataPgto)}</td>
          <td class="td-mono" style="color:var(--gold)">${fmt(p.valor)}</td>
          <td class="td-mono">${p.pct}%</td>
          <td><span class="badge ${badge}" style="font-size:9px">${lbl}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  openModal('m-venda-det');
}

function verClienteDetalhe(id) { verVendaDetalhe(id); }

/* ═══════════════════════════════════════════════════════════════════════════
   12. MÓDULO: COMISSÕES
   ═══════════════════════════════════════════════════════════════════════════ */
function renderComissao() {
  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';
  const st  = AppState.modulo.comissao;

  const todosVendedores = isG
    ? (st.filterVend ? [DB.vendedores.find(v => v.id === st.filterVend)] : vendedoresNoEscopo(u)).filter(Boolean)
    : [DB.vendedores.find(v => v.id === u.id)].filter(Boolean);

  const todasVendas = isG
    ? (st.filterVend ? DB.vendas.filter(v => v.vendedor === st.filterVend) : vendasNoEscopo(u))
    : DB.vendas.filter(v => v.vendedor === u.id);

  const mesesSet = new Set();
  todasVendas.forEach(v => {
    if (v.status === 'cancelado') return;
    calcParcelas(v).forEach(p => {
      if (p.ativa) mesesSet.add(p.mesRecebimento);
    });
  });
  const todosFechs = isG
    ? (st.filterVend ? DB.fechamentos.filter(f => f.vendedor === st.filterVend) : DB.fechamentos)
    : DB.fechamentos.filter(f => f.vendedor === u.id);
  todosFechs.forEach(f => mesesSet.add(f.mes));

  const mesesDisp = [...mesesSet].sort();
  if (!mesesDisp.includes(todayMes())) mesesDisp.push(todayMes());
  mesesDisp.sort();
  if (!st.mesSel || !mesesDisp.includes(st.mesSel)) st.mesSel = mesesDisp[mesesDisp.length - 1] || todayMes();

  const fechsMes = todosFechs.filter(f => f.mes === st.mesSel);

  const vendasDoMes = todasVendas.filter(v =>
    v.status !== 'cancelado' && mesKey(v.dvenda) === st.mesSel
  );
  const volVendas   = vendasDoMes.reduce((a, v) => a + v.valor, 0);
  const qtdVendas   = vendasDoMes.length;

  const comTotalGerada = vendasDoMes.reduce((a, v) => {
    return a + calcParcelas(v).filter(p => p.ativa).reduce((s, p) => s + p.valor, 0);
  }, 0);

  let totProd = 0, totRec = 0, totEst = 0, totLiq = 0;
  todosVendedores.forEach(vend => {
    const vendasVend = todasVendas.filter(v => v.vendedor === vend.id);
    const { producao, recorrencia } = calcComissaoMes(vendasVend, st.mesSel);
    totProd += producao.reduce((a, i) => a + i.valor, 0);
    totRec  += recorrencia.reduce((a, i) => a + i.valor, 0);
    const fech = fechsMes.find(f => f.vendedor === vend.id);
    if (fech) {
      totEst += fech.estornos.reduce((a, i) => a + Math.abs(i.valor), 0);
    }
  });
  totLiq = totProd + totRec - totEst;

  const mesNav = renderMesNav(mesesDisp, st.mesSel, "AppState.modulo.comissao.mesSel", 'comissao', m => {
    const fechM = todosFechs.filter(f => f.mes === m);
    if (fechM.length === 0) return '';
    const allPago = fechM.every(f => f.status === 'pago');
    return allPago ? ' — ✓ Pago' : ' — Pendente';
  });

  const vendorTabs = isG ? renderVendorFilter(st.filterVend, "AppState.modulo.comissao.filterVend", 'comissao', vendedoresNoEscopo(u)) : '';

  const fechCards = todosVendedores.map(vend => {
    const vendasVend = vendasDoVendedor(vend.id).filter(v => v.status !== 'cancelado');
    const { producao, recorrencia } = calcComissaoMes(vendasVend, st.mesSel);
    const fech = fechsMes.find(f => f.vendedor === vend.id);

    const estornosDinamicos = calcEstornosMes(vendasVend, st.mesSel);
    const estornosRegistrados = fech?.estornos || [];
    const estornos = estornosRegistrados.length > 0
      ? estornosRegistrados
      : estornosDinamicos.map(e => ({ ...e, valor: -e.valor, desc: e.desc }));

    const vProd = producao.reduce((a, i) => a + i.valor, 0);
    const vRec  = recorrencia.reduce((a, i) => a + i.valor, 0);
    const vEst  = estornosDinamicos.reduce((a, i) => a + i.valor, 0);
    const baseValor = (fech?.valorLiquido != null) ? fech.valorLiquido : (vProd + vRec);
    const vLiq = baseValor - vEst;

    if (vend.dataEntrada && vend.dataEntrada.substring(0,7) > st.mesSel) return '';

    if (vProd === 0 && vRec === 0 && !fech) return '';

    const statusAtual = fech?.status || 'aberto';
    const statusMap = {
      aberto:        ['fech-status fech-aberto',    '◌','Em aberto — aguardando fechamento'],
      aguardando_nf: ['fech-status fech-aguardando','◎','Aguardando emissão da Nota Fiscal'],
      aprovado:      ['fech-status fech-aprovado',  '◈','Aprovado — aguardando pagamento'],
      pago:          ['fech-status fech-pago',       '◆','Pago — comissão liquidada'],
    };
    const [sc, ic, sm] = statusMap[statusAtual];

    const btnAcao = !isG ? '' : statusAtual === 'aberto'
      ? `<button class="btn btn-success btn-sm" onclick="fecharMesVendedor('${vend.id}','${st.mesSel}')">✓ Fechar mês</button>`
      : statusAtual === 'aguardando_nf'
      ? `<div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="registrarNF('${fech.id}')">📄 NF (opcional)</button>
          <button class="btn btn-primary btn-sm" onclick="aprovarFechamento('${fech.id}')">✓ Aprovar</button>
         </div>`
      : statusAtual === 'aprovado'
      ? `<button class="btn btn-primary btn-sm" onclick="abrirPgto('${fech.id}')">💰 Confirmar pagamento</button>`
      : '';

    const rowsProd = producao.map(p => `<tr>
      <td><div style="font-weight:600;font-size:12px">${p.cliente}</div>
          <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${p.contrato} · ${p.tabelaNome}</div></td>
      <td class="td-mono" style="color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
      <td class="td-mono" style="color:var(--brand)">${fmtDate(p.dataPgto)}</td>
      <td class="td-mono" style="color:var(--green);font-weight:600">${fmt(p.valor)}</td>
      <td class="td-mono" style="color:var(--text3)">${p.pct.toFixed(2)}%</td>
    </tr>`).join('');

    const rowsRec = recorrencia.map(p => `<tr>
      <td>
        <div style="font-weight:600;font-size:12px">${p.cliente}</div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${p.contrato} · <span style="color:var(--blue)">${p.parc}ª parcela</span> · ${p.tabelaNome}</div>
      </td>
      <td class="td-mono" style="color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
      <td class="td-mono" style="color:var(--brand)">${fmtDate(p.dataPgto)}</td>
      <td class="td-mono" style="color:var(--blue);font-weight:600">${fmt(p.valor)}</td>
      <td class="td-mono" style="color:var(--text3)">${p.pct.toFixed(2)}%</td>
    </tr>`).join('');

    const rowsEst = estornosDinamicos.map(e => `<tr style="background:rgba(200,57,43,0.03)">
      <td>
        <div style="font-weight:600;font-size:12px">${e.cliente}</div>
        <div style="font-size:10px;font-family:var(--mono);color:var(--text3)">${e.contrato}</div>
      </td>
      <td colspan="2">
        <span class="badge ${e.tipo === 'integral' ? 'badge-red' : 'badge-amber'}" style="font-size:9px">
          ${e.tipo === 'integral' ? 'INTEGRAL' : `PARCELA ${e.parcAtual}/${e.parcTotal}`}
        </span>
        <span style="font-size:11px;color:var(--text3);margin-left:6px">${e.desc}</span>
      </td>
      <td class="td-mono" style="color:var(--red);font-weight:700;text-align:right">-${fmt(e.valor)}</td>
      <td></td>
    </tr>`).join('');

    const tabelaHTML = (rowsProd || rowsRec || rowsEst) ? `
    <div class="table-wrap" style="margin-top:14px">
      <table>
        <thead><tr>
          <th>Cliente / Contrato</th>
          <th>Venc. cliente</th>
          <th>Pgto comissão</th>
          <th>Valor</th>
          <th>%</th>
        </tr></thead>
        <tbody>
          ${producao.length > 0 ? `<tr><td colspan="5" style="padding:6px 12px;background:var(--ink4);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase">PRODUÇÃO — 1ª parcelas</td></tr>${rowsProd}` : ''}
          ${recorrencia.length > 0 ? `<tr><td colspan="5" style="padding:6px 12px;background:var(--ink4);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase">RECORRÊNCIA — 2ª+ parcelas</td></tr>${rowsRec}` : ''}
          ${estornos.length > 0 ? `<tr><td colspan="5" style="padding:6px 12px;background:var(--ink4);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase">ESTORNOS</td></tr>${rowsEst}` : ''}
        </tbody>
      </table>
    </div>` : '';

    return `<div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div>
          <span class="card-title">${vend.nome}</span>
          ${fech?.nfNumero ? `<span class="chip" style="margin-left:8px">${fech.nfNumero}</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${btnAcao}
          <button class="btn btn-ghost btn-sm" onclick="verDemonstrativoVendedor('${vend.id}','${st.mesSel}')">👁 Demonstrativo</button>
        </div>
      </div>
      <div style="padding:14px 16px">
        <div class="${sc}" style="margin-bottom:14px">${ic} ${sm}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
          <div style="background:var(--ink3);border-radius:8px;padding:12px">
            <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Produção</div>
            <div style="font-size:16px;font-weight:700;font-family:var(--mono);color:var(--green)">${fmt(vProd)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${producao.length} contrato(s)</div>
          </div>
          <div style="background:var(--ink3);border-radius:8px;padding:12px">
            <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Recorrência</div>
            <div style="font-size:16px;font-weight:700;font-family:var(--mono);color:var(--blue)">${fmt(vRec)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${recorrencia.length} parcela(s)</div>
          </div>
          ${vEst > 0 ? `<div style="background:var(--ink3);border-radius:8px;padding:12px">
            <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Estornos</div>
            <div style="font-size:16px;font-weight:700;font-family:var(--mono);color:var(--red)">-${fmt(vEst)}</div>
          </div>` : ''}
          <div style="background:var(--brand-dim);border:1px solid var(--brand-border);border-radius:8px;padding:12px">
            <div style="font-size:9px;font-weight:700;color:var(--brand);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Líquido NF</div>
            <div style="font-size:18px;font-weight:800;font-family:var(--mono);color:var(--brand)">${fmt(vLiq)}</div>
          </div>
        </div>
        ${fech?.dataPgto ? `<div class="alert alert-green" style="margin-top:12px;margin-bottom:0">✓ Pago em ${fmtDate(fech.dataPgto)} via ${fech.formaPgto?.toUpperCase()}</div>` : ''}
        ${tabelaHTML}
      </div>
    </div>`;
  }).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">Comissões</div>
    <div class="page-sub">// fechamento mensal · ${mesLabel(st.mesSel)}</div>
  </div>
  <div class="page-actions no-print">
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 Imprimir</button>
  </div>
</div>

<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">
  Vendas que você fez em ${mesLabel(st.mesSel)}
</div>
<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:18px">
  <div class="stat-card gold">
    <div class="stat-label">Vendas do mês</div>
    <div class="stat-value">${fmt(volVendas)}</div>
    <div class="stat-meta">${qtdVendas} contrato(s)</div>
  </div>
  <div class="stat-card amber">
    <div class="stat-label">Comissão futura gerada</div>
    <div class="stat-value">${fmt(comTotalGerada)}</div>
    <div class="stat-meta">Total a receber ao longo dos meses</div>
  </div>
</div>

<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">
  O que você recebe em ${mesLabel(st.mesSel)}
</div>
<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
  <div class="stat-card blue">
    <div class="stat-label">Produção</div>
    <div class="stat-value">${fmt(totProd)}</div>
    <div class="stat-meta">1ª parcela de vendas anteriores</div>
  </div>
  <div class="stat-card blue">
    <div class="stat-label">Recorrência</div>
    <div class="stat-value">${fmt(totRec)}</div>
    <div class="stat-meta">2ª+ parcelas</div>
  </div>
  ${totEst > 0 ? `<div class="stat-card red">
    <div class="stat-label">Estornos</div>
    <div class="stat-value">-${fmt(totEst)}</div>
    <div class="stat-meta">Descontos aplicados</div>
  </div>` : ''}
  <div class="stat-card red">
    <div class="stat-label">Total a receber</div>
    <div class="stat-value">${fmt(totLiq)}</div>
    <div class="stat-meta">Valor líquido deste mês</div>
  </div>
</div>

<div class="month-nav">${mesNav}</div>
${vendorTabs}


${fechCards || '<div class="empty-state"><div class="empty-icon">◆</div><div class="empty-title">Nenhum fechamento</div><div class="empty-sub">Sem dados para o período selecionado</div></div>'}

<div class="overlay" id="m-pgto">
  <div class="modal" style="width:480px">
    <button class="modal-close" onclick="closeModal('m-pgto')">✕</button>
    <div class="modal-title">Confirmar pagamento</div>
    <div class="modal-sub" id="mp-sub"></div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Data do pagamento</label><input type="date" id="mp-data"></div>
      <div class="form-group"><label>Forma de pagamento</label>
        <select id="mp-forma">
          <option value="transferencia">Transferência bancária</option>
          <option value="pix">PIX</option>
          <option value="deposito">Depósito</option>
        </select>
      </div>
    </div>
    <div class="form-row cols-1">
      <div class="form-group"><label>Observação</label><input type="text" id="mp-obs" placeholder="ex: PIX chave CPF"></div>
    </div>
    <div id="mp-preview" style="padding:12px;background:var(--ink3);border-radius:8px;font-size:12px;color:var(--text2);font-family:var(--mono)"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-pgto')">Cancelar</button>
      <button class="btn btn-success" onclick="confirmarPgto()">✓ Confirmar pagamento</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-demo">
  <div class="modal" style="width:640px">
    <button class="modal-close no-print" onclick="closeModal('m-demo')">✕</button>
    <div class="modal-title" id="md-title">Demonstrativo para NF</div>
    <div class="modal-sub" id="md-sub"></div>
    <div id="md-body"></div>
    <div class="modal-actions no-print">
      <button class="btn btn-ghost" onclick="closeModal('m-demo')">Fechar</button>
      <button class="btn btn-ghost" onclick="window.print()">🖨 Imprimir</button>
      <button class="btn btn-primary" id="md-btn-acao"></button>
    </div>
  </div>
</div>`;
}

let _pgtoTarget = null;

async function fecharMes(fid) {
  const f = DB.fechamentos.find(x => x.id === fid);
  if (!f) return;
  const liq  = calcLiquido(f);
  const vend = DB.vendedores.find(v => v.id === f.vendedor);
  const _ok2 = await Dialog.confirm(`Fechar mês — ${vend?.nome}`, [
    `Mês de referência: ${mesLabel(f.mes)}`,
    { tipo:'destaque', label:'Valor para NF', valor:fmt(liq.liquido), cor:'var(--brand)' }
  ]); if (!_ok2) return;
  f.status = 'aguardando_nf';
  rerenderModule('comissao');
}

function registrarNF(fid) {
  const f = DB.fechamentos.find(x => String(x.id) === String(fid));
  if (!f) return;
  const nr = window.prompt('Número da NF recebida:');
  if (!nr) return;
  const data = window.prompt('Data da NF (AAAA-MM-DD):', today());
  if (!data) return;
  f.nfNumero = nr; f.dataNF = data; f.status = 'aprovado';
  rerenderModule('comissao');
}

async function aprovarFechamento(fid) {
  const f    = DB.fechamentos.find(x => String(x.id) === String(fid));
  if (!f) return;
  const vend = DB.vendedores.find(v => v.id === f.vendedor);
  const vendas = vendasDoVendedor(f.vendedor).filter(v => v.status !== 'cancelado');
  const { producao, recorrencia } = calcComissaoMes(vendas, f.mes);
  const vLiq = (f.valorLiquido != null) ? f.valorLiquido :
    producao.reduce((a,i)=>a+i.valor,0) + recorrencia.reduce((a,i)=>a+i.valor,0);

  const ok = await Dialog.confirm(`Aprovar fechamento — ${vend?.nome}`, [
    `Mês: ${mesLabel(f.mes)}`,
    { tipo:'destaque', label:'Valor aprovado', valor: fmt(vLiq), cor:'var(--brand)' },
    'Após aprovação, o pagamento poderá ser confirmado.',
  ]);
  if (!ok) return;

  f.status = 'aprovado';
  const { error } = await Supabase.from('fechamentos').update({ status:'aprovado' }).eq('id', fid);
  if (error) { Dialog.alert('Erro', [error.message]); return; }
  rerenderModule('comissao');
}

async function fecharMesVendedor(vendId, mes) {
  const vend   = DB.vendedores.find(v => v.id === vendId);
  const vendas = vendasDoVendedor(vendId).filter(v => v.status !== 'cancelado');
  const { producao, recorrencia } = calcComissaoMes(vendas, mes);
  const vLiq = producao.reduce((a,i)=>a+i.valor,0) + recorrencia.reduce((a,i)=>a+i.valor,0);

  const _ok3 = await Dialog.confirm(`Fechar mês — ${vend?.nome}`, [
    `Mês de referência: ${mesLabel(mes)}`,
    { tipo:'destaque', label:'Valor para NF', valor:fmt(vLiq), cor:'var(--brand)' }
  ]);
  if (!_ok3) return;

  let fech = DB.fechamentos.find(f => f.vendedor === vendId && f.mes === mes);

  if (!fech || typeof fech.id === 'number') {
    const payload = { vendedor_id: vendId, mes, status: 'aguardando_nf' };
    const { data, error } = await Supabase.from('fechamentos').insert(payload).select().single();
    if (error) { Dialog.alert('Erro ao fechar mês', [error.message]); return; }

    if (fech) {
      fech.id     = data.id;
      fech.status = 'aguardando_nf';
    } else {
      fech = { id: data.id, vendedor: vendId, mes, status:'aguardando_nf', valorLiquido: null, producao:[], recorrencia:[], estornos:[], nfNumero:null, dataNF:null, dataPgto:null, formaPgto:null, obs:'' };
      DB.fechamentos.push(fech);
    }
  } else {
    fech.status = 'aguardando_nf';
    await Supabase.from('fechamentos').update({ status:'aguardando_nf' }).eq('id', fech.id);
  }

  rerenderModule('comissao');
}

function abrirPgto(fid) {
  _pgtoTarget = fid;
  const f    = DB.fechamentos.find(x => String(x.id) === String(fid));
  const vend = DB.vendedores.find(v => v.id === f.vendedor);
  const vendas = DB.vendas.filter(v => v.vendedor === f.vendedor && v.status !== 'cancelado');
  const { producao, recorrencia } = calcComissaoMes(vendas, f.mes);
  const vLiq = producao.reduce((a,i)=>a+i.valor,0) + recorrencia.reduce((a,i)=>a+i.valor,0);
  document.getElementById('mp-sub').textContent = `${vend?.nome} · ${mesLabel(f.mes)}`;
  document.getElementById('mp-data').value  = today();
  document.getElementById('mp-obs').value   = '';
  document.getElementById('mp-preview').textContent = `Valor a pagar: ${fmt(vLiq)}${f.nfNumero ? ' · NF: ' + f.nfNumero : ''}`;
  openModal('m-pgto');
}

function confirmarPgto() {
  const f    = DB.fechamentos.find(x => x.id === _pgtoTarget);
  if (!f) return;
  const data = document.getElementById('mp-data').value;
  const forma= document.getElementById('mp-forma').value;
  const obs  = document.getElementById('mp-obs').value;
  if (!data) { Dialog.alert('Data obrigatória', ['Informe a data do pagamento para continuar.']); return; }

  const vendas = DB.vendas.filter(v => v.vendedor === f.vendedor && v.status !== 'cancelado');
  const { producao, recorrencia } = calcComissaoMes(vendas, f.mes);
  const valorLiquido = producao.reduce((a,i)=>a+i.valor,0) + recorrencia.reduce((a,i)=>a+i.valor,0);

  f.status = 'pago'; f.dataPgto = data; f.formaPgto = forma; f.obs = obs;
  f.valor_liquido = valorLiquido;

  Supabase.from('fechamentos').update({ status:'pago', data_pgto:data, forma_pgto:forma, obs, valor_liquido:valorLiquido }).eq('id', f.id)
    .then(({ error }) => { if (error) console.error('Erro ao salvar valor_liquido:', error); });

  closeModal('m-pgto');
  rerenderModule('comissao');
}

function verDemonstrativoVendedor(vendId, mes) {
  const vend        = DB.vendedores.find(v => v.id === vendId);
  const vendasAtivas = DB.vendas.filter(v => v.vendedor === vendId && v.status !== 'cancelado');
  const vendasTodas  = DB.vendas.filter(v => v.vendedor === vendId);
  const { producao, recorrencia } = calcComissaoMes(vendasAtivas, mes);
  const fech   = DB.fechamentos.find(f => f.vendedor === vendId && f.mes === mes);
  const isG    = (AppState.user.role === 'gestor' || AppState.user.role === 'adm');

  const estornosDin = calcEstornosMes(vendasTodas, mes);
  const vendas = vendasAtivas;

  const vProd = producao.reduce((a,i)=>a+i.valor,0);
  const vRec  = recorrencia.reduce((a,i)=>a+i.valor,0);
  const vEst  = estornosDin.reduce((a,e)=>a+e.valor,0);
  const vLiq  = vProd + vRec - vEst;

  document.getElementById('md-title').textContent = `Demonstrativo para NF — ${vend?.nome}`;
  document.getElementById('md-sub').textContent   = `${mesLabel(mes)} · Base de cálculo para emissão da nota fiscal`;

  const thHTML = `<tr style="background:var(--ink4)">
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left;white-space:nowrap">Cliente</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Contrato</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Tabela</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:center;white-space:nowrap">Parcela</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left;white-space:nowrap">Venc. cliente</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right;white-space:nowrap">Valor venda</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right">Comissão</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right;white-space:nowrap">%</th>
  </tr>`;

  function totalParcAtivasVenda(venda) {
    const tab = DB.tabelas.find(t => t.id === venda.tabela);
    return (tab?.parcelas || []).filter(p => p > 0).length;
  }

  const prodRows = producao.map(p => {
    const venda = vendas.find(v => v.contrato === p.contrato);
    const totalParc = venda ? totalParcAtivasVenda(venda) : '?';
    return `<tr style="border-bottom:1px solid var(--line)">
      <td style="padding:8px 10px;font-size:12px;font-weight:600">${p.cliente}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${p.contrato}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${p.tabelaNome}</td>
      <td style="padding:8px 10px;text-align:center">
        <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green);background:var(--green-dim);border:1px solid var(--green-glow);border-radius:5px;padding:2px 8px;white-space:nowrap">
          1ª&nbsp;/&nbsp;${totalParc}
        </span>
      </td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:12px;color:var(--text2);text-align:right">${venda ? fmt(venda.valor) : '—'}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green);text-align:right">${fmt(p.valor)}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text3);text-align:right">${p.pct}%</td>
    </tr>`;
  }).join('');

  const recRows = recorrencia.map(p => {
    const venda = vendas.find(v => v.contrato === p.contrato);
    const totalParc = venda ? totalParcAtivasVenda(venda) : '?';
    return `<tr style="border-bottom:1px solid var(--line)">
      <td style="padding:8px 10px;font-size:12px;font-weight:600">${p.cliente}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${p.contrato}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${p.tabelaNome}</td>
      <td style="padding:8px 10px;text-align:center">
        <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--blue);background:var(--blue-dim);border:1px solid var(--blue-glow);border-radius:5px;padding:2px 8px;white-space:nowrap">
          ${p.parc}ª&nbsp;/&nbsp;${totalParc}
        </span>
      </td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:12px;color:var(--text2);text-align:right">${venda ? fmt(venda.valor) : '—'}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--blue);text-align:right">${fmt(p.valor)}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text3);text-align:right">${p.pct}%</td>
    </tr>`;
  }).join('');

  const estRows = estornosDin.map(e => `<tr style="border-bottom:1px solid var(--line);background:rgba(200,57,43,0.03)">
    <td style="padding:8px 10px;font-size:12px;font-weight:600">${e.cliente}</td>
    <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${e.contrato}</td>
    <td style="padding:8px 10px">
      <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--red);background:var(--red-dim);border:1px solid var(--red-glow);border-radius:5px;padding:2px 8px;white-space:nowrap">
        ${e.tipo === 'integral' ? 'INTEGRAL' : `${e.parcAtual}/${e.parcTotal}`}
      </span>
    </td>
    <td style="padding:8px 10px;font-size:11px;color:var(--text3)">${e.desc}</td>
    <td style="padding:8px 10px"></td>
    <td style="padding:8px 10px"></td>
    <td style="padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--red);text-align:right">-${fmt(e.valor)}</td>
    <td style="padding:8px 10px"></td>
  </tr>`).join('');

  function subtotalRow(label, valor, cor) {
    return `<tr style="background:var(--ink4)">
      <td colspan="7" style="padding:8px 10px;font-size:11px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:1px">${label}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:700;color:${cor};text-align:right">${valor}</td>
    </tr>`;
  }

  const totalLinhas = producao.length + recorrencia.length + estornosDin.length;
  document.getElementById('md-body').classList.toggle('compact-print', totalLinhas > 10);

  // CORRIGIDO: a 1ª parcela é sempre paga no mês SEGUINTE à venda (regra do
  // dia10Seg) — então o demonstrativo de um mês mostra produção do mês ANTERIOR
  const mesProducaoV = addMonths(mes + '-01', -1)?.substring(0, 7);
  const volumeTotalV = vendas
    .filter(v => v.status !== 'cancelado' && mesKey(v.dvenda) === mesProducaoV)
    .reduce((a, v) => a + v.valor, 0);

  document.getElementById('md-body').innerHTML = `
  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:14px 16px;background:var(--ink3);border-radius:10px;border:1px solid var(--line);margin-bottom:14px">
      <div style="font-size:11px;color:var(--text3);font-family:var(--mono);line-height:1.8">
        WCON System · Mundo do Consórcio<br>
        CNPJ: 00.000.000/0001-00<br>
        Emissão: ${fmtDate(today())}
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:800;color:var(--brand);letter-spacing:-0.5px">DEMONSTRATIVO</div>
        <div style="font-size:12px;color:var(--text2);font-family:var(--mono);margin-top:2px">${mesLabel(mes)} · ${vend?.nome}</div>
        ${fech?.nfNumero ? `<div style="font-size:11px;color:var(--brand);font-family:var(--mono);margin-top:2px">${fech.nfNumero} · ${fmtDate(fech.dataNF)}</div>` : ''}
      </div>
    </div>

    <div class="demo-resumo-print" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--ink3);border-radius:10px;border:1px solid var(--line);margin-bottom:14px">
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:1.5px;text-transform:uppercase">Volume total produzido</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">Produção de ${mesLabel(mesProducaoV)} · gera a comissão paga em ${mesLabel(mes)}</div>
      </div>
      <div style="font-size:22px;font-weight:800;font-family:var(--mono);color:var(--text)">${fmt(volumeTotalV)}</div>
    </div>

    <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">

          ${producao.length > 0 ? `
          <thead>
            <tr style="background:var(--green-dim)">
              <td colspan="8" style="padding:7px 12px;font-size:10px;font-weight:700;color:var(--green);letter-spacing:1.5px;text-transform:uppercase">
                PRODUÇÃO — 1ª parcelas
              </td>
            </tr>
            ${thHTML}
          </thead>
          <tbody>
            ${prodRows}
            ${subtotalRow('Subtotal produção', fmt(vProd), 'var(--green)')}
          </tbody>` : ''}

          ${recorrencia.length > 0 ? `
          <thead>
            <tr style="background:var(--blue-dim)">
              <td colspan="8" style="padding:7px 12px;font-size:10px;font-weight:700;color:var(--blue);letter-spacing:1.5px;text-transform:uppercase;border-top:2px solid var(--line)">
                RECORRÊNCIA · ${recorrencia.length} contrato(s)
              </td>
            </tr>
            ${thHTML}
          </thead>
          <tbody>
            ${recRows}
            ${subtotalRow('Subtotal recorrência', fmt(vRec), 'var(--blue)')}
          </tbody>` : ''}

          ${estornosDin.length > 0 ? `
          <thead>
            <tr style="background:var(--red-dim)">
              <td colspan="8" style="padding:7px 12px;font-size:10px;font-weight:700;color:var(--red);letter-spacing:1.5px;text-transform:uppercase;border-top:2px solid var(--line)">
                ESTORNOS / DESCONTOS · ${estornosDin.length} item(s)
              </td>
            </tr>
            <tr style="background:var(--ink4)">
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Cliente</th>
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Contrato</th>
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Tipo</th>
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Descrição</th>
              <th></th>
              <th></th>
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right">Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${estRows}
            ${subtotalRow('Subtotal estornos', '-' + fmt(vEst), 'var(--red)')}
          </tbody>` : ''}

          <tbody>
            <tr style="background:var(--ink3);border-top:2px solid var(--line2)">
              <td colspan="7" style="padding:10px 12px;font-size:13px;font-weight:700;color:var(--text)">Total bruto</td>
              <td style="padding:10px 12px;font-family:var(--mono);font-size:14px;font-weight:700;color:var(--text);text-align:right">${fmt(vProd + vRec)}</td>
            </tr>
            ${vEst > 0 ? `<tr style="background:var(--red-dim)">
              <td colspan="7" style="padding:8px 12px;font-size:12px;font-weight:600;color:var(--red)">Total estornos</td>
              <td style="padding:8px 12px;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--red);text-align:right">-${fmt(vEst)}</td>
            </tr>` : ''}
          </tbody>

        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:var(--brand-dim);border-top:2px solid var(--brand-border)">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--brand);letter-spacing:1.5px;text-transform:uppercase">VALOR LÍQUIDO PARA NF</div>
          <div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-top:2px">Base de cálculo para emissão da nota fiscal</div>
        </div>
        <div style="font-size:24px;font-weight:800;font-family:var(--mono);color:var(--brand)">${fmt(vLiq)}</div>
      </div>
    </div>
  </div>`;

  const btnAcao = document.getElementById('md-btn-acao');
  if (isG && fech) {
    if (fech.status === 'aguardando_nf') {
      btnAcao.textContent = '📄 Registrar NF'; btnAcao.className = 'btn btn-purple';
      btnAcao.onclick = () => { registrarNF(fech.id); closeModal('m-demo'); };
    } else if (fech.status === 'aprovado') {
      btnAcao.textContent = '💰 Confirmar pagamento'; btnAcao.className = 'btn btn-primary';
      btnAcao.onclick = () => { closeModal('m-demo'); abrirPgto(fech.id); };
    } else {
      btnAcao.textContent = ''; btnAcao.style.display = 'none';
    }
  } else if (btnAcao) {
    btnAcao.style.display = 'none';
  }
  openModal('m-demo');
}

function verDemonstrativo(fid) {
  const f = DB.fechamentos.find(x => x.id === fid);
  if (f) verDemonstrativoVendedor(f.vendedor, f.mes);
}

/* ═══════════════════════════════════════════════════════════════════════════
   13. MÓDULO: INADIMPLÊNCIA
   ═══════════════════════════════════════════════════════════════════════════ */
function renderInadimplencia() {
  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';
  const st  = AppState.modulo.inadimplencia;

  atualizarParcelasAtrasadas();

  let lista = vendasNoEscopo(u);
  if (st.filterVend && (isG || isSup)) lista = lista.filter(v => v.vendedor === st.filterVend);

  const listaFilt = st.filterSit === 'all' ? lista : lista.filter(v => situacao(v) === st.filterSit);

  const aguardAprov = DB.vendas.filter(v =>
    vendasNoEscopo(u).some(x => x.id === v.id) &&
    v.parcelas.some(p => p.s === 'aguard_aprov')
  );

  const countSit = (s) => lista.filter(v => situacao(v) === s).length;
  const inadimTotal = lista.filter(v => v.status === 'inadimplente').reduce((a, v) => a + v.valor, 0);

  const vendorTabs = (isG || isSup) ? renderVendorFilter(st.filterVend, "AppState.modulo.inadimplencia.filterVend", 'inadimplencia', vendedoresNoEscopo(u)) : '';

  const pills = [
    ['all','Todos',lista.length,'filter-pill-all'],
    ['adimplente','Adimplentes',countSit('adimplente'),'filter-pill-green'],
    ['atraso','Em atraso',countSit('atraso'),'filter-pill-amber'],
    ['critico','Críticos',countSit('critico'),'filter-pill-red'],
    ['concluido','Concluídos',countSit('concluido'),'filter-pill-blue'],
    ['cancelado','Cancelados',countSit('cancelado'),'filter-pill-gray'],
  ].map(([s, lbl, cnt, cls]) =>
    `<button class="filter-pill ${cls}${st.filterSit === s ? ' active' : ''}"
      onclick="AppState.modulo.inadimplencia.filterSit='${s}';rerenderModule('inadimplencia')">${lbl} (${cnt})</button>`
  ).join('');

  const notifAprov = aguardAprov.length > 0 ? `
    <div class="alert alert-blue" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <span>🔔 <strong>${aguardAprov.length} contrato(s)</strong> com parcelas aguardando aprovação de pagamento</span>
      ${(isG || isSup) ? `<button class="btn btn-blue btn-sm" onclick="AppState.modulo.inadimplencia.filterSit='aguard_aprov';rerenderModule('inadimplencia')">Ver pendentes</button>` : ''}
    </div>` : '';

  const dotMap = {
    pago:        { cls:'paid',     label:'PAGO' },
    pendente:    { cls:'pending',  label:'PENDENTE' },
    atrasado:    { cls:'blocked',  label:'ATRASADO' },
    aguard_aprov:{ cls:'pending',  label:'AGUARD. APROVAÇÃO' },
    negociacao:  { cls:'pending',  label:'EM NEGOCIAÇÃO' },
    bloq:        { cls:'blocked',  label:'BLOQUEADO' },
    cancelado:   { cls:'canceled', label:'CANCELADO' },
    fora:        { cls:'out',      label:'FORA' },
  };

  const cards = listaFilt.map(v => {
    const sit  = situacao(v);
    const tab  = DB.tabelas.find(t => t.id === v.tabela);
    const dias = v.dataInad ? diasAtras(v.dataInad) : 0;
    const est  = calcEstorno(v);
    const parcs = calcParcelas(v);
    const extraClass = sit === 'critico' ? ' critico' : sit === 'cancelado' ? ' cancelado' : '';

    const pagoCount  = v.parcelas.filter(p => p.s === 'pago').length;
    const totalParc  = v.parcelas.filter(p => p.s !== 'fora').length;
    const temAguard  = v.parcelas.some(p => p.s === 'aguard_aprov');

    const dots = v.parcelas.map((p, i) => {
      const info = dotMap[p.s] || dotMap.pendente;
      const parc = parcs[i];
      const venc = parc ? fmtDate(parc.dataVencCliente) : '';
      return `<div class="parc-dot ${info.cls}" title="${i+1}ª parc. · ${info.label}${venc ? ' · Venc: ' + venc : ''}">${p.s === 'pago' ? '✓' : i+1}</div>`;
    }).join('');

    const parcsAtivas = parcs.filter(p => p.ativa);
    const tabelaParcs = `
    <div style="margin-top:14px">
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">
        Controle de parcelas do cliente
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;border:1px solid var(--line);border-radius:8px;overflow:hidden">
          <thead><tr style="background:var(--ink4)">
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;text-align:left">Parcela</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;text-align:left">Venc. cliente</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;text-align:left">Status</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;text-align:right">Comissão</th>
            ${!isG ? '<th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;text-align:center">Ação</th>' : '<th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;text-align:center">Aprovação</th>'}
          </tr></thead>
          <tbody>
            ${parcsAtivas.map((p, i) => {
              const ps = v.parcelas[i]?.s || 'pendente';
              const stMap = {
                pago:         { badge:'badge-green',  label:'PAGO' },
                pendente:     { badge:'badge-gray',   label:'PENDENTE' },
                atrasado:     { badge:'badge-red',    label:'ATRASADO' },
                aguard_aprov: { badge:'badge-blue',   label:'AGUARD. APROVAÇÃO' },
                bloq:         { badge:'badge-red',    label:'BLOQUEADO' },
                cancelado:    { badge:'badge-gray',   label:'CANCELADO' },
              };
              const { badge, label } = stMap[ps] || { badge:'badge-gray', label:ps };

              let btnVend = '';
              if (!isG && (ps === 'pendente' || ps === 'atrasado')) {
                btnVend = `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();solicitarPagamento('${v.id}',${i})" title="Informar que cliente pagou">✓ Cliente pagou</button>`;
              } else if (!isG && ps === 'aguard_aprov') {
                btnVend = `<span style="font-size:11px;color:var(--blue);font-family:var(--mono)">Aguardando gestor</span>`;
              } else if (!isG && ps === 'pago') {
                btnVend = `<span style="font-size:11px;color:var(--green);font-family:var(--mono)">✓ Aprovado</span>`;
              }

              let btnGest = '';
              if (isG && ps === 'aguard_aprov') {
                btnGest = `
                  <div style="display:flex;gap:4px;justify-content:center">
                    <button class="btn btn-success btn-sm" onclick="event.stopPropagation();aprovarPagamento('${v.id}',${i})" title="Aprovar pagamento">✓</button>
                    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();rejeitarPagamento('${v.id}',${i})" title="Rejeitar">✕</button>
                  </div>`;
              } else if (isG && ps === 'pago') {
                btnGest = `<div style="display:flex;gap:6px;align-items:center;justify-content:center">
                    <span style="font-size:11px;color:var(--green);font-family:var(--mono)">✓ Pago</span>
                    <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();desfazerPagamento('${v.id}',${i})" title="Corrigir — desfazer esta confirmação de pagamento">✎</button>
                  </div>`;
              } else if (isG && (ps === 'pendente' || ps === 'atrasado')) {
                btnGest = `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();darBaixaPagamento('${v.id}',${i})" title="Confirmar pagamento direto (cliente pagou e já foi aprovado)">✓ Dar baixa</button>`;
              }

              const rowColor = ps === 'atrasado' ? 'background:rgba(200,57,43,0.04)' :
                               ps === 'aguard_aprov' ? 'background:rgba(90,154,232,0.04)' :
                               ps === 'pago' ? 'background:rgba(61,184,122,0.04)' : '';

              return `<tr style="border-bottom:1px solid var(--line);${rowColor}">
                <td style="padding:8px 10px;font-family:var(--mono);font-size:12px;font-weight:600">${p.n}ª</td>
                <td style="padding:8px 10px;font-family:var(--mono);font-size:12px;color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
                <td style="padding:8px 10px"><span class="badge ${badge}" style="font-size:9px">${label}</span></td>
                <td style="padding:8px 10px;font-family:var(--mono);font-size:12px;color:${ps==='pago'?'var(--green)':ps==='atrasado'||ps==='bloq'?'var(--red)':'var(--text3)'};text-align:right;font-weight:${ps==='pago'?'700':'400'}">${ps !== 'pago' && ps !== 'cancelado' ? fmt(p.valor) : ps === 'pago' ? fmt(p.valor) : '—'}</td>
                <td style="padding:8px 10px;text-align:center">${isG ? btnGest : btnVend}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

    let infoExtra = '';
    if (sit === 'atraso' || sit === 'critico') {
      const acomp = getPeriodoAcomp(v.tabela);
      infoExtra = `<div class="alert ${sit === 'critico' ? 'alert-red' : 'alert-amber'}" style="margin-top:12px">
        ⚠ Inadimplente há ${dias} dias ${sit === 'critico' ? '— STATUS CRÍTICO (>60 dias)' : ''}
        · Acompanhamento até a ${acomp}ª parcela
      </div>`;
    }
    if (sit === 'negociacao') {
      const parcAtual = v.parcelas.filter(p => p.s === 'pago').length + 1;
      infoExtra = `<div class="alert alert-blue" style="margin-top:12px">
        📋 Plano de pagamento ativo — empresa pagando parcelas do cliente
        · Comissões futuras bloqueadas · Monitorando até a 10ª parcela
        · Parcela atual: ${parcAtual}ª / 10ª
        ${parcAtual >= 10 ? '<br><strong>✓ 10ª parcela atingida — empresa pode encerrar o plano</strong>' : ''}
      </div>`;
    }
    if (temAguard) {
      infoExtra += `<div class="alert alert-blue" style="margin-top:8px">
        🔔 ${v.parcelas.filter(p=>p.s==='aguard_aprov').length} parcela(s) aguardando aprovação do gestor
      </div>`;
    }
    if (sit === 'cancelado' && est) {
      const auto = v.estorno?.autorizado;
      infoExtra += `<div class="alert ${auto ? 'alert-green' : 'alert-red'}" style="margin-top:8px">
        ${auto ? '✓ Plano de estorno autorizado' : '⚠ Estorno pendente de autorização'}
        · ${fmt(est.valor)} em até ${est.maxParc}x · Parc. ${est.faixa} · ${est.pct}%
        ${!auto && isG ? `<button class="btn btn-danger btn-sm" style="margin-left:12px" onclick="event.stopPropagation();autorizarEstorno('${v.id}')">Autorizar estorno</button>` : ''}
      </div>`;
    }
    if (sit === 'cancelado') {
      const reg = v.regularizacao;
      if (reg?.status === 'pendente') {
        infoExtra += `<div class="alert alert-blue" style="margin-top:8px">
          ⏳ Regularização solicitada em ${fmtDate(reg.solicitadoEm)} — aguardando aprovação do gestor.
          ${isG ? `
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn btn-success btn-sm" onclick="event.stopPropagation();aprovarRegularizacao('${v.id}')">✓ Aprovar e reativar contrato</button>
              <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();rejeitarRegularizacao('${v.id}')">✕ Rejeitar</button>
            </div>` : ''}
        </div>`;
      } else if (!isG) {
        infoExtra += `<div class="alert alert-gray" style="margin-top:8px">
          Contrato cancelado.
          ${reg?.status === 'rejeitado' ? '<div style="margin-top:4px;font-size:11px">Sua última solicitação de regularização foi rejeitada pelo gestor.</div>' : ''}
          <div style="margin-top:8px">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();solicitarRegularizacao('${v.id}')">↻ Solicitar regularização</button>
          </div>
        </div>`;
      } else if (reg?.status === 'rejeitado') {
        infoExtra += `<div class="alert alert-gray" style="margin-top:8px">Solicitação de regularização do vendedor foi rejeitada.</div>`;
      }
    }

    return `<div class="contrato-card${extraClass}">
      <div class="contrato-header" onclick="toggleContrato(this)">
        <div class="contrato-info">
          <div class="contrato-name">${v.cliente}</div>
          <div class="contrato-meta">
            <span>${v.contrato}</span>
            <span>${isG ? vendorName(v.vendedor) : ''}</span>
            <span>${tab?.nome || v.tabela}</span>
            <span>${fmt(v.valor)}</span>
          </div>
        </div>
        <div class="contrato-badges">
          ${sitBadge(sit)}
          ${dias > 0 && sit !== 'adimplente' && sit !== 'concluido' && sit !== 'cancelado' && sit !== 'negociacao' ? `<span class="badge badge-gray">${dias}d atrás</span>` : ''}
          ${temAguard ? `<span class="badge badge-blue">AGUARD. APROV.</span>` : ''}
          <button class="btn btn-ghost btn-sm btn-icon">▾</button>
        </div>
      </div>
      <div class="contrato-body">
        <div class="parc-dots" style="margin-top:12px">${dots}</div>
        <div style="font-size:10px;color:var(--text2);font-family:var(--mono);margin-top:4px">${pagoCount}/${totalParc} parcelas pagas</div>
        ${infoExtra}
        ${tabelaParcs}
        ${isG && (sit === 'atraso' || sit === 'critico') ? `
        <div class="decisao-box" style="margin-top:14px">
          <div class="decisao-title">Ação sobre o contrato</div>
          <div class="decisao-opts">
            <div class="decisao-opt" onclick="toggleDecisao(this,'estorno')">
              <div class="decisao-opt-title">🚫 Cancelar e estornar</div>
              <div class="decisao-opt-desc">Cancela o contrato e aciona o processo de estorno</div>
            </div>
            <div class="decisao-opt" onclick="toggleDecisao(this,'plano')">
              <div class="decisao-opt-title">📋 Plano de pagamento</div>
              <div class="decisao-opt-desc">Empresa paga parcelas do cliente · vendedor não sofre estorno · comissões futuras bloqueadas até a 10ª parcela</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();cancelarContrato('${v.id}')">🚫 Confirmar cancelamento</button>
            <button class="btn btn-purple btn-sm" onclick="event.stopPropagation();ativarPlanoNegociacao('${v.id}')">📋 Ativar plano de pagamento</button>
          </div>
        </div>` : ''}
        ${isG && sit === 'negociacao' ? `
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();encerrarPlano('${v.id}')">Encerrar plano</button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('') || '<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-title">Nenhum registro</div><div class="empty-sub">Nenhum cliente com essa situação</div></div>';

  return `
<div class="page-header">
  <div>
    <div class="page-title">Inadimplência</div>
    <div class="page-sub">// monitoramento de contratos · ${listaFilt.length} registros</div>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-card red">
    <div class="stat-label">Em atraso</div>
    <div class="stat-value">${countSit('atraso')}</div>
    <div class="stat-meta">≤ 60 dias</div>
  </div>
  <div class="stat-card amber">
    <div class="stat-label">Críticos</div>
    <div class="stat-value">${countSit('critico')}</div>
    <div class="stat-meta">> 60 dias</div>
  </div>
  <div class="stat-card blue">
    <div class="stat-label">Aguard. aprovação</div>
    <div class="stat-value">${aguardAprov.length}</div>
    <div class="stat-meta">Parcelas p/ confirmar</div>
  </div>
  <div class="stat-card green">
    <div class="stat-label">Adimplentes</div>
    <div class="stat-value">${countSit('adimplente')}</div>
    <div class="stat-meta">Em dia</div>
  </div>
  <div class="stat-card gold">
    <div class="stat-label">Volume inadimp.</div>
    <div class="stat-value">${fmt(inadimTotal)}</div>
    <div class="stat-meta">Créditos em risco</div>
  </div>
</div>

${notifAprov}
${vendorTabs}
<div class="filter-bar">${pills}</div>
${cards}

<div class="overlay" id="m-inad-det">
  <div class="modal" style="width:640px">
    <button class="modal-close" onclick="closeModal('m-inad-det')">✕</button>
    <div class="modal-title" id="mi-title"></div>
    <div class="modal-sub" id="mi-sub"></div>
    <div id="mi-body"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal('m-inad-det')">Fechar</button></div>
  </div>
</div>`;
}

function toggleContrato(el) {
  const body = el.nextElementSibling;
  body.classList.toggle('open');
}

function toggleDecisao(el, tipo) {
  const parent = el.parentElement;
  parent.querySelectorAll('.decisao-opt').forEach(o => o.classList.remove('sel-estorno', 'sel-plano'));
  el.classList.add(tipo === 'estorno' ? 'sel-estorno' : 'sel-plano');
}

async function autorizarEstorno(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v || !v.estorno) return;
  const _ok5 = await Dialog.danger(`Autorizar estorno`, [
    { tipo:'destaque', label:'Cliente', valor:v.cliente },
    { tipo:'destaque', label:'Valor do estorno', valor:fmt(v.estorno.valorTotal), cor:'var(--red)' }
  ]); if (!_ok5) return;
  v.estorno.autorizado = true;
  await persistirVenda(v);
  rerenderModule('inadimplencia');
}

async function solicitarPagamento(vendaId, parcIdx) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const parc = calcParcelas(v)[parcIdx];
  const _ok6 = await Dialog.confirm(`Confirmar pagamento do cliente`, [
    { tipo:'destaque', label:'Parcela', valor:`${parcIdx + 1}ª parcela` },
    { tipo:'destaque', label:'Vencimento', valor:fmtDate(parc?.dataVencCliente) },
    { tipo:'divisor' },
    'Após confirmar, o gestor precisará aprovar para liberar a comissão.'
  ]); if (!_ok6) return;
  v.parcelas[parcIdx].s = 'aguard_aprov';
  await persistirVenda(v);
  rerenderModule('inadimplencia');
  buildSidebar();
}

async function solicitarRegularizacao(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const _ok = await Dialog.confirm('Solicitar regularização', [
    { tipo:'destaque', label:'Cliente', valor: v.cliente },
    { tipo:'destaque', label:'Contrato', valor: v.contrato },
    'O gestor será notificado e poderá aprovar a reativação deste contrato, voltando a gerar comissão normalmente.'
  ]); if (!_ok) return;

  v.regularizacao = { status: 'pendente', solicitadoEm: today() };
  if (!v.notifs) v.notifs = [];
  v.notifs.push({ tipo:'regularizacao', lida:false, data: today(), msg:`Solicitação de regularização do contrato ${v.contrato} (${v.cliente})` });

  await persistirVenda(v);
  rerenderModule('inadimplencia');
  atualizarSino();
  buildSidebar();
}

async function aprovarRegularizacao(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const _ok = await Dialog.confirm('Aprovar regularização', [
    { tipo:'destaque', label:'Cliente', valor: v.cliente },
    { tipo:'destaque', label:'Contrato', valor: v.contrato },
    'O contrato volta a ficar ATIVO. Parcelas que estavam canceladas voltam para PENDENTE/ATRASADO conforme o vencimento, e o estorno pendente é removido.'
  ]); if (!_ok) return;

  const pc = calcParcelas(v);
  v.parcelas.forEach((p, i) => {
    if (p.s === 'cancelado') {
      const venc = pc[i]?.dataVencCliente ? new Date(pc[i].dataVencCliente + 'T00:00:00') : null;
      p.s = (venc && venc < new Date()) ? 'atrasado' : 'pendente';
    }
  });

  const temAtraso = v.parcelas.some(p => p.s === 'atrasado');
  v.status = temAtraso ? 'inadimplente' : 'ativo';
  if (temAtraso && !v.dataInad) v.dataInad = today();
  if (!temAtraso) v.dataInad = null;

  v.estorno = null;
  v.regularizacao = { status: 'aprovado', solicitadoEm: v.regularizacao?.solicitadoEm, aprovadoEm: today() };

  await persistirVenda(v);
  rerenderModule('inadimplencia');
  atualizarSino();
  buildSidebar();
}

async function rejeitarRegularizacao(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const _ok = await Dialog.danger('Rejeitar regularização', [
    { tipo:'destaque', label:'Cliente', valor: v.cliente },
    { tipo:'destaque', label:'Contrato', valor: v.contrato },
    'O contrato permanece CANCELADO. O vendedor poderá solicitar novamente, se necessário.'
  ]); if (!_ok) return;

  v.regularizacao = { status: 'rejeitado', solicitadoEm: v.regularizacao?.solicitadoEm, rejeitadoEm: today() };

  await persistirVenda(v);
  rerenderModule('inadimplencia');
  buildSidebar();
}

async function desfazerPagamento(vendaId, parcIdx) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const parc = calcParcelas(v)[parcIdx];
  const _ok9 = await Dialog.danger(`Desfazer confirmação de pagamento`, [
    { tipo:'destaque', label:'Cliente', valor:v.cliente },
    { tipo:'destaque', label:'Parcela', valor:`${parcIdx + 1}ª parcela` },
    { tipo:'destaque', label:'Comissão a remover', valor:fmt(parc?.valor), cor:'var(--red)' },
    { tipo:'divisor' },
    'Use isso quando o gestor confirmou o pagamento por engano. A parcela volta para PENDENTE/ATRASADO e a comissão deixa de ser contada.'
  ]); if (!_ok9) return;

  const venc = parc?.dataVencCliente ? new Date(parc.dataVencCliente + 'T00:00:00') : null;
  v.parcelas[parcIdx].s = (venc && venc < new Date()) ? 'atrasado' : 'pendente';

  if (Array.isArray(v.notifs)) v.notifs = v.notifs.filter(n => n.parcIdx !== parcIdx);

  if (v.status === 'concluido') {
    v.status = v.parcelas[parcIdx].s === 'atrasado' ? 'inadimplente' : 'ativo';
    if (v.status === 'inadimplente' && !v.dataInad) v.dataInad = today();
  }

  await persistirVenda(v);
  rerenderModule('inadimplencia');
  atualizarSino();
  buildSidebar();
}

async function aprovarPagamento(vendaId, parcIdx) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const parc = calcParcelas(v)[parcIdx];
  const _ok7 = await Dialog.success(`Aprovar pagamento`, [
    { tipo:'destaque', label:'Cliente', valor:v.cliente },
    { tipo:'destaque', label:'Parcela', valor:`${parcIdx + 1}ª parcela` },
    { tipo:'destaque', label:'Comissão liberada', valor:fmt(parc?.valor), cor:'var(--green)' }
  ]); if (!_ok7) return;
  v.parcelas[parcIdx].s = 'pago';

  if (!v.notifs) v.notifs = [];
  v.notifs.push({ parcIdx, lida: false, data: today() });

  const parcsAtivas = v.parcelas.filter((p, i) => calcParcelas(v)[i]?.ativa);
  const todasPagas  = parcsAtivas.every(p => p.s === 'pago');
  if (todasPagas) v.status = 'concluido';
  else if (v.status === 'inadimplente') {
    const temAtrasado = v.parcelas.some(p => p.s === 'atrasado' || p.s === 'aguard_aprov');
    if (!temAtrasado) { v.status = 'ativo'; v.dataInad = null; }
  }
  await persistirVenda(v);
  rerenderModule('inadimplencia');
  atualizarSino();
  buildSidebar();
}

async function darBaixaPagamento(vendaId, parcIdx) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const parc = calcParcelas(v)[parcIdx];
  const _ok = await Dialog.success(`Dar baixa em pagamento`, [
    { tipo:'destaque', label:'Cliente', valor:v.cliente },
    { tipo:'destaque', label:'Parcela', valor:`${parcIdx + 1}ª parcela` },
    { tipo:'destaque', label:'Comissão liberada', valor:fmt(parc?.valor), cor:'var(--green)' },
    { tipo:'divisor' },
    'Confirma que o cliente pagou esta parcela? A comissão será liberada imediatamente.'
  ]); if (!_ok) return;

  v.parcelas[parcIdx].s = 'pago';

  if (!v.notifs) v.notifs = [];
  v.notifs.push({ parcIdx, lida: false, data: today() });

  const parcsAtivas = v.parcelas.filter((p, i) => calcParcelas(v)[i]?.ativa);
  const todasPagas  = parcsAtivas.every(p => p.s === 'pago');
  if (todasPagas) v.status = 'concluido';
  else if (v.status === 'inadimplente') {
    const temAtrasado = v.parcelas.some(p => p.s === 'atrasado' || p.s === 'aguard_aprov');
    if (!temAtrasado) { v.status = 'ativo'; v.dataInad = null; }
  }
  await persistirVenda(v);
  rerenderModule('inadimplencia');
  atualizarSino();
  buildSidebar();
}

async function rejeitarPagamento(vendaId, parcIdx) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const _ok8 = await Dialog.danger(`Rejeitar pagamento`, [
    { tipo:'destaque', label:'Cliente', valor:v.cliente },
    { tipo:'destaque', label:'Parcela', valor:`${parcIdx + 1}ª parcela` },
    'A parcela voltará para o status ATRASADO.'
  ]); if (!_ok8) return;
  v.parcelas[parcIdx].s = 'atrasado';
  await persistirVenda(v);
  rerenderModule('inadimplencia');
  buildSidebar();
}

async function ativarPlanoNegociacao(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const est = calcEstorno(v);
  const parcRestantes = v.parcelas.filter(p => p.s === 'pendente' || p.s === 'atrasado').length;
  const _ok9 = await Dialog.warning(`Ativar Plano de Pagamento`, [
    { tipo:'destaque', label:'Cliente', valor:v.cliente },
    est ? { tipo:'destaque', label:'Estorno evitado', valor:fmt(est.valor), cor:'var(--green)' } : 'Sem estorno aplicável',
    { tipo:'destaque', label:'Parcelas restantes', valor:String(parcRestantes) },
    { tipo:'divisor' },
    { tipo:'lista', icone:'—', texto:'Contrato muda para EM NEGOCIAÇÃO' },
    { tipo:'lista', icone:'—', texto:'Empresa paga as parcelas do cliente até a 10ª' },
    { tipo:'lista', icone:'—', texto:'Vendedor não sofrerá estorno' },
    { tipo:'lista', icone:'—', texto:'Comissões futuras do vendedor ficam bloqueadas' },
  ].filter(Boolean)); if (!_ok9) return;

  v.status   = 'negociacao';
  v.dataInad = null;

  v.parcelas.forEach(p => {
    if (p.s === 'atrasado' || p.s === 'pendente') p.s = 'negociacao';
  });

  if (!v.notifs) v.notifs = [];
  v.notifs.push({
    tipo:  'negociacao',
    lida:   false,
    data:   today(),
    msg:   'Plano de pagamento ativo — você não sofrerá estorno neste contrato.',
  });

  rerenderModule('inadimplencia');
  atualizarSino();
  buildSidebar();
  await persistirVenda(v);
}

async function cancelarContrato(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const est = calcEstorno(v);
  const _ok10 = await Dialog.danger(`Cancelar contrato`, [
    { tipo:'destaque', label:'Cliente', valor:v.cliente },
    est ? { tipo:'destaque', label:'Valor do estorno', valor:fmt(est.valor), cor:'var(--red)' } : 'Sem estorno aplicável para este contrato.',
  ].filter(Boolean)); if (!_ok10) return;
  v.status = 'cancelado';
  v.parcelas.forEach(p => {
    if (p.s === 'pendente' || p.s === 'atrasado' || p.s === 'aguard_aprov') p.s = 'cancelado';
  });
  if (est) v.estorno = { valorTotal: est.valor, parcTotal: est.maxParc, parcPagas: 0, autorizado: false };
  await persistirVenda(v);
  rerenderModule('inadimplencia');
  buildSidebar();
}

async function encerrarPlano(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const parcAtual = v.parcelas.filter(p => p.s === 'pago').length;
  const _ok11 = await Dialog.confirm(`Encerrar plano de pagamento`, [
    { tipo:'destaque', label:'Cliente', valor:v.cliente },
    { tipo:'destaque', label:'Parcela atual', valor:`${parcAtual}ª parcela` },
    'A empresa não precisará mais pagar as parcelas do cliente.',
    'O contrato será marcado como cancelado.'
  ]); if (!_ok11) return;
  v.status = 'cancelado';
  v.parcelas.forEach(p => { if (p.s === 'negociacao') p.s = 'cancelado'; });
  await persistirVenda(v);
  rerenderModule('inadimplencia');
  buildSidebar();
}

/* ═══════════════════════════════════════════════════════════════════════════
   14. MÓDULO: ESTORNOS
   ═══════════════════════════════════════════════════════════════════════════ */
function renderEstornos() {
  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';
  const st  = AppState.modulo.estornos;

  let lista = vendasNoEscopo(u).filter(v => v.status === 'cancelado' && !DB.semEstorno.includes(v.tabela));
  if (st.filterVend && (isG || isSup)) lista = lista.filter(v => v.vendedor === st.filterVend);

  const totalEstorno = lista.reduce((a, v) => {
    const e = calcEstorno(v);
    return a + (e?.valor || 0);
  }, 0);
  const pendAutorizacao = lista.filter(v => v.estorno && !v.estorno.autorizado).length;
  const emAndamento     = lista.filter(v => v.estorno && v.estorno.autorizado && v.estorno.parcPagas < v.estorno.parcTotal).length;
  const concluidos      = lista.filter(v => v.estorno && v.estorno.parcPagas >= v.estorno.parcTotal).length;

  const vendorTabs = (isG || isSup) ? renderVendorFilter(st.filterVend, "AppState.modulo.estornos.filterVend", 'estornos', vendedoresNoEscopo(u)) : '';

  const cards = lista.map(v => {
    const tab = DB.tabelas.find(t => t.id === v.tabela);
    const est = calcEstorno(v);
    if (!est) return '';

    const auto = v.estorno?.autorizado;
    const parcPagas = v.estorno?.parcPagas || 0;
    const parcTotal = v.estorno?.parcTotal || est.maxParc;
    const progPct   = parcTotal > 0 ? (parcPagas / parcTotal * 100).toFixed(0) : 0;
    const statusEst = !auto ? 'Pendente autorização' : parcPagas >= parcTotal ? 'Concluído' : 'Em andamento';
    const badgeEst  = !auto ? 'badge-amber' : parcPagas >= parcTotal ? 'badge-blue' : 'badge-green';

    const parcCancN = parcCancelamento(v);
    const dotMap    = { pago:'paid', bloq:'blocked', cancelado:'canceled', pendente:'pending', fora:'out' };
    const dots      = v.parcelas.map((p, i) => `<div class="parc-dot ${dotMap[p.s] || 'pending'}">${p.s === 'pago' ? '✓' : p.s === 'cancelado' ? '✗' : i+1}</div>`).join('');

    return `<div class="contrato-card${!auto ? ' critico' : ''}">
      <div class="contrato-header" onclick="toggleContrato(this)">
        <div class="contrato-info">
          <div class="contrato-name">${v.cliente}</div>
          <div class="contrato-meta">
            <span>${v.contrato}</span>
            <span>${vendorName(v.vendedor)}</span>
            <span>${tab?.nome || v.tabela}</span>
            <span>Cancelou na ${parcCancN}ª parcela · Faixa ${est.faixa}</span>
          </div>
        </div>
        <div class="contrato-badges">
          <span class="badge ${badgeEst}">${statusEst.toUpperCase()}</span>
          <span class="badge badge-red">${fmt(est.valor)}</span>
          <button class="btn btn-ghost btn-sm btn-icon">▾</button>
        </div>
      </div>
      <div class="contrato-body">
        <div class="parc-dots" style="margin-top:12px">${dots}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:14px">
          <div style="background:var(--ink3);border-radius:8px;padding:12px">
            <div class="det-label">Valor crédito</div>
            <div class="det-value" style="font-family:var(--mono)">${fmt(v.valor)}</div>
          </div>
          <div style="background:var(--ink3);border-radius:8px;padding:12px">
            <div class="det-label">Valor estorno</div>
            <div class="det-value" style="font-family:var(--mono);color:var(--red)">${fmt(est.valor)}</div>
          </div>
          <div style="background:var(--ink3);border-radius:8px;padding:12px">
            <div class="det-label">Parcelamento</div>
            <div class="det-value">${parcPagas}/${parcTotal} parcelas</div>
          </div>
          <div style="background:var(--ink3);border-radius:8px;padding:12px">
            <div class="det-label">% sobre crédito</div>
            <div class="det-value">${est.pct}%</div>
          </div>
        </div>

        ${auto && parcTotal > 0 ? `
        <div style="margin-top:14px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:6px">
            <span>Progresso de pagamento</span>
            <span style="font-family:var(--mono)">${parcPagas}/${parcTotal} · ${progPct}%</span>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:${progPct}%;background:${parcPagas >= parcTotal ? 'var(--blue)' : 'var(--green)'}"></div>
          </div>
        </div>` : ''}

        ${!auto && isG ? `
        <div class="alert alert-amber" style="margin-top:14px">
          Estorno não autorizado — aguardando decisão do gestor
        </div>
        <div class="modal-actions" style="margin-top:10px;border:none;padding-top:0">
          <button class="btn btn-ghost" onclick="event.stopPropagation();recusarParcelamentoEstorno('${v.id}')">Cobrar integral</button>
          <button class="btn btn-danger" onclick="event.stopPropagation();autorizarEstornoComParc('${v.id}')">Autorizar parcelamento</button>
        </div>` : ''}

        ${auto && parcPagas < parcTotal ? `
        <div class="modal-actions" style="margin-top:10px;border:none;padding-top:0">
          <button class="btn btn-success btn-sm" onclick="event.stopPropagation();registrarParcEstorno('${v.id}')">+ Registrar parcela paga</button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('') || `
    <div class="empty-state">
      <div class="empty-icon">✕</div>
      <div class="empty-title">Nenhum estorno registrado</div>
      <div class="empty-sub">Contratos cancelados com direito a estorno aparecerão aqui</div>
    </div>`;

  return `
<div class="page-header">
  <div>
    <div class="page-title">Estornos</div>
    <div class="page-sub">// controle de cancelamentos e devoluções de comissão</div>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-card red">
    <div class="stat-label">Total em estorno</div>
    <div class="stat-value">${fmt(totalEstorno)}</div>
    <div class="stat-meta">${lista.length} contratos</div>
  </div>
  <div class="stat-card amber">
    <div class="stat-label">Pend. autorização</div>
    <div class="stat-value">${pendAutorizacao}</div>
    <div class="stat-meta">Aguardando gestor</div>
  </div>
  <div class="stat-card green">
    <div class="stat-label">Em andamento</div>
    <div class="stat-value">${emAndamento}</div>
    <div class="stat-meta">Parcelamentos ativos</div>
  </div>
  <div class="stat-card blue">
    <div class="stat-label">Concluídos</div>
    <div class="stat-value">${concluidos}</div>
    <div class="stat-meta">Pagos integralmente</div>
  </div>
</div>

${vendorTabs}
${cards}`;
}

async function autorizarEstornoComParc(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const est = calcEstorno(v);
  if (!est) return;

  const ok = await Dialog.danger('Autorizar parcelamento de estorno', [
    { tipo:'destaque', label:'Cliente',        valor: v.cliente },
    { tipo:'destaque', label:'Valor total',    valor: fmt(est.valor), cor:'var(--red)' },
    { tipo:'destaque', label:'Parcelas',       valor: `${est.maxParc}x de ${fmt(est.valor / est.maxParc)}`, cor:'var(--amber)' },
    { tipo:'divisor' },
    'O estorno será descontado em parcelas no próximo recebível do vendedor.',
    'Aparecerá no demonstrativo como: Estorno parcela 1/' + est.maxParc + ', 2/' + est.maxParc + '...',
  ]);
  if (!ok) return;

  v.estorno = {
    valorTotal: est.valor,
    parcTotal:  est.maxParc,
    parcPagas:  0,
    autorizado: true,
    tipo:       'parcelado',
    valorParcela: est.valor / est.maxParc,
  };
  await persistirVenda(v);
  rerenderModule('estornos');
}

async function recusarParcelamentoEstorno(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v) return;
  const est = calcEstorno(v);
  if (!est) return;

  const ok = await Dialog.danger('Cobrar estorno integral', [
    { tipo:'destaque', label:'Cliente',     valor: v.cliente },
    { tipo:'destaque', label:'Valor total', valor: fmt(est.valor), cor:'var(--red)' },
    { tipo:'divisor' },
    'O valor integral será descontado no próximo recebível do vendedor.',
    'Aparecerá no demonstrativo como: Estorno integral.',
  ]);
  if (!ok) return;

  v.estorno = {
    valorTotal:  est.valor,
    parcTotal:   1,
    parcPagas:   0,
    autorizado:  true,
    tipo:        'integral',
    valorParcela: est.valor,
  };
  await persistirVenda(v);
  rerenderModule('estornos');
}

async function registrarParcEstorno(vendaId) {
  const v = DB.vendas.find(x => x.id === vendaId);
  if (!v || !v.estorno) return;
  if (v.estorno.parcPagas >= v.estorno.parcTotal) {
    Dialog.alert('Estorno concluído', ['Todas as parcelas de estorno já foram registradas.']);
    return;
  }
  v.estorno.parcPagas++;
  await persistirVenda(v);
  rerenderModule('estornos');
}

/* ═══════════════════════════════════════════════════════════════════════════
   15. MÓDULO: TABELAS
   ═══════════════════════════════════════════════════════════════════════════ */
function renderTabelas() {
  const u   = AppState.user;
  if (!podeAcessarTabelas()) {
    return `<div class="page-header"><div><div class="page-title">Acesso restrito</div><div class="page-sub">// essa área está em remodelagem no momento</div></div></div>`;
  }
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';
  const isGestorPuro = (u.role === 'gestor' || u.role === 'adm');
  const st  = AppState.modulo.tabelas;

  let tabsVis = getTabelasVendedor(isG ? 'gestor' : u.id);
  if (!isG) tabsVis = tabsVis.filter(t => t.ativo !== false);
  const refs    = [...new Set(tabsVis.map(t => t.ref))];

  const tabsFilt = st.filterRef === 'all' ? tabsVis : tabsVis.filter(t => t.ref === st.filterRef);

  const pills = [
    ['all','Todas',tabsVis.length],
    ...refs.map(r => [r, `Paga em ${r}`, tabsVis.filter(t => t.ref === r).length]),
  ].map(([s, lbl, cnt]) =>
    `<button class="filter-pill filter-pill-${s === 'all' ? 'all' : 'gray'}${st.filterRef === s ? ' active' : ''}"
      onclick="AppState.modulo.tabelas.filterRef='${s}';rerenderModule('tabelas')">${lbl} (${cnt})</button>`
  ).join('');

  const renderTabelaRow = (tab) => {
    const expanded = st.expandida === tab.id;
    const inativa = tab.ativo === false;

    const totalVendedor = (tab.parcelas.reduce((a,p) => a+p, 0)).toFixed(4).replace(/\.?0+$/,'');
    const linhaCompacta = (parcelas) => parcelas.map((p,i) => {
      if (p === 0) return '';
      return `<div style="text-align:center;min-width:32px">
        <div style="font-size:8px;color:var(--text3)">${i+1}ª</div>
        <div style="font-size:11px;font-weight:700;font-family:var(--mono);color:var(--text)">${p.toFixed(4).replace(/\.?0+$/,'')}%</div>
      </div>`;
    }).join('');

    // NOVO: estrutura real de Londrina — Consultor, Supervisor Treinee
    // (vendas próprias) e Supervisor Treinee (override sobre a equipe),
    // tudo num card só compacto, com divisórias internas
    const tabSupervisorPropria = DB.tabelasSupervisor.find(t => t.id === tab.id && (t.unidade||'') === 'londrina');
    const tabOverrideEquipe = DB.tabelasOverrideLider.find(t => t.tabela_id === tab.id && t.unidade === 'londrina');

    const linhaFaixa = (label, cor, parcelas, corTotal) => {
      if (!parcelas) return '';
      const total = parcelas.reduce((a,p)=>a+p,0).toFixed(4).replace(/\.?0+$/,'');
      return `<div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:10px;font-weight:700;color:${cor};text-transform:uppercase">${label}</span>
          <span style="font-size:12px;font-weight:800;font-family:var(--mono);color:${corTotal}">${total}%</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${linhaCompacta(parcelas)}</div>
      </div>`;
    };

    const blocoComissao = `
      ${linhaFaixa('Consultor', 'var(--text2)', tab.parcelas, 'var(--text)')}
      ${tabSupervisorPropria ? linhaFaixa('Supervisor Treinee · vendas próprias', '#0C447C', tabSupervisorPropria.parcelas, '#0C447C') : ''}
      ${tabOverrideEquipe ? linhaFaixa('Supervisor Treinee · override equipe', '#27500A', tabOverrideEquipe.parcelas, '#27500A').replace('border-bottom:1px solid var(--line)','border-bottom:none') : ''}
    `;

    return `<div class="tabela-card"${inativa ? ' style="opacity:0.55"' : ''}>
      <div class="tabela-header" onclick="toggleTabela('${tab.id}')">
        <div>
          <div class="tabela-name">${tab.nome}</div>
          <div class="tabela-ref">id: ${tab.id} · ${tab.ref}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${inativa ? `<span class="badge badge-gray" style="font-size:9px">INATIVA</span>` : ''}
          <button class="btn ${expanded ? 'btn-primary' : 'btn-ghost'} btn-sm">Detalhes ${expanded ? '▴' : '▾'}</button>
        </div>
      </div>
      <div class="tabela-body${expanded ? ' open' : ''}">
        ${blocoComissao}
        ${isGestorPuro ? `
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-ghost btn-sm" onclick="editarTabela('${tab.id}','${tab.unidade||'brusque'}')">✎ Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="verSimulacao('${tab.id}','${tab.unidade||'brusque'}')">◎ Simular venda</button>
          <button class="btn ${inativa ? 'btn-primary' : 'btn-danger'} btn-sm" onclick="toggleAtivoTabela('${tab.id}','${tab.unidade||'brusque'}')">${inativa ? '✓ Reativar' : '⊘ Desativar'}</button>
        </div>` : ''}
      </div>
    </div>`;
  };

  const cardsLista = tabsFilt.map(renderTabelaRow).join('');

  const semEstornoInfo = DB.semEstorno.map(id => {
    const t = DB.tabelas.find(x => x.id === id);
    return t ? `<span class="chip">${t.nome}</span>` : '';
  }).join(' ');

  const acomp6Info = DB.acomp6.length > 0 ? DB.acomp6.map(id => {
    const t = DB.tabelas.find(x => x.id === id);
    return t ? `<span class="chip">${t.nome}</span>` : '';
  }).join(' ') : '<span style="font-size:12px;color:var(--text3)">Nenhuma tabela nessa condição</span>';

  return `
<div class="page-header">
  <div>
    <div class="page-title">Tabelas de Comissão</div>
    <div class="page-sub">// estrutura de parcelas e percentuais por produto</div>
  </div>
  ${isGestorPuro ? `<div class="page-actions"><button class="btn btn-primary btn-sm" onclick="abrirNovaTabela()">+ Nova tabela</button></div>` : ''}
</div>

<div class="filter-bar">${pills}</div>

${cardsLista || `<div class="empty-state"><div class="empty-sub">Nenhuma tabela com o filtro atual</div></div>`}

<div class="card" style="margin-top:20px">
  <div class="card-header"><span class="card-title">Regras de estorno</span></div>
  <div class="card-body">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div class="form-divider">Tabelas sem direito a estorno</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:8px">Quando cancelado, apenas perde comissões futuras:</p>
        ${semEstornoInfo}
      </div>
      <div>
        <div class="form-divider">Acompanhamento até 6ª parcela</div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:8px">Monitoramento de inadimplência encerra na 6ª:</p>
        ${acomp6Info}
      </div>
    </div>
    <div style="margin-top:16px">
      <div class="form-divider">Regra de estorno em vigor</div>
      <div style="background:var(--red-dim);border:1px solid var(--brand-border);border-radius:8px;padding:14px">
        <div style="font-size:13px;font-weight:700;color:var(--brand);margin-bottom:4px">${PERCENTUAL_ESTORNO_RECEBIDA}% sobre a comissão já recebida</div>
        <div style="font-size:12px;color:var(--text2)">Se a venda for cancelada, o vendedor devolve ${PERCENTUAL_ESTORNO_RECEBIDA}% de tudo que já recebeu de comissão até o cancelamento (não é sobre o valor da venda, é sobre o que já entrou no bolso).</div>
      </div>
    </div>
  </div>
</div>

<div class="overlay" id="m-simul">
  <div class="modal">
    <button class="modal-close" onclick="closeModal('m-simul')">✕</button>
    <div class="modal-title" id="ms-title">Simular venda</div>
    <div class="modal-sub">Calcule a projeção de comissões para essa tabela</div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Valor do crédito (R$)</label><input type="number" id="ms-val" placeholder="Ex: 50000" oninput="simularTabela()"></div>
      <div class="form-group"><label>Data da venda</label><input type="date" id="ms-dv" value="${today()}" oninput="simularTabela()"></div>
    </div>
    <div class="form-row cols-1">
      <div class="form-group"><label>Vencto. 2ª parcela cliente</label><input type="date" id="ms-d2" oninput="simularTabela()"></div>
    </div>
    <div id="ms-result"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-simul')">Fechar</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-nova-tab">
  <div class="modal" style="width:640px">
    <button class="modal-close" onclick="closeModal('m-nova-tab')">✕</button>
    <div class="modal-title">Nova tabela de comissão</div>
    <div class="modal-sub">Configure os percentuais por parcela</div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Nome da tabela *</label><input id="nt-nome" placeholder="Ex: Select Mais / SMA"></div>
      <div class="form-group"><label>Referência *</label><input id="nt-ref" placeholder="Ex: REF 3"></div>
    </div>
    <div class="form-divider">Percentuais por parcela (0 = inativo)</div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px">
      ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n => `
        <div class="form-group" style="margin-bottom:0">
          <label style="font-size:9px">${n}ª parcela</label>
          <input type="number" id="nt-p${n}" placeholder="0.00" step="0.01" min="0" max="1"
            style="padding:7px 8px;font-size:12px;font-family:var(--mono)"
            oninput="previewNovaTabela()">
        </div>`).join('')}
    </div>
    <div id="nt-preview" style="background:var(--ink3);border-radius:8px;padding:12px;font-size:11px;color:var(--text3);font-family:var(--mono)">
      Preencha os percentuais para ver a prévia...
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-nova-tab')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarNovaTabela()">Salvar tabela →</button>
    </div>
  </div>
</div>`;
}

function editarTabela(tabId, unidade) {
  if (!document.getElementById('m-nova-tab')) { rerenderModule('tabelas'); setTimeout(() => editarTabela(tabId, unidade), 150); return; }
  const tab = DB.tabelas.find(t => t.id === tabId && (t.unidade||'brusque') === (unidade||'brusque'));
  if (!tab) return;
  document.getElementById('nt-nome').value = tab.nome;
  document.getElementById('nt-ref').value  = tab.ref;
  const parcelas = Array.isArray(tab.parcelas) ? tab.parcelas : [];
  [1,2,3,4,5,6,7,8,9,10,11,12].forEach((n,i) => {
    const el = document.getElementById(`nt-p${n}`);
    if (el) el.value = parcelas[i] > 0 ? parcelas[i] : '';
  });
  previewNovaTabela();
  document.querySelector('#m-nova-tab .modal-title').textContent = 'Editar tabela — ' + tab.nome;
  const btnSalvar = document.querySelector('#m-nova-tab .btn-primary');
  if (btnSalvar) btnSalvar.onclick = () => salvarEdicaoTabela(tabId, unidade);
  openModal('m-nova-tab');
}

async function salvarEdicaoTabela(tabId, unidade) {
  const nome = document.getElementById('nt-nome').value.trim();
  const ref  = document.getElementById('nt-ref').value.trim();
  if (!nome || !ref) { Dialog.alert('Campos obrigatórios', ['Preencha nome e referência da tabela.']); return; }
  const parcelas = [1,2,3,4,5,6,7,8,9,10,11,12].map(n => parseFloat(document.getElementById(`nt-p${n}`)?.value) || 0);
  try {
    const { error } = await Supabase.from('tabelas_comissao').update({ nome, ref, parcelas }).eq('id', tabId).eq('unidade', unidade||'brusque');
    if (error) throw error;
    const tab = DB.tabelas.find(t => t.id === tabId && (t.unidade||'brusque') === (unidade||'brusque'));
    if (tab) Object.assign(tab, { nome, ref, parcelas });
    closeModal('m-nova-tab');
    Dialog.success('Tabela atualizada', [{ tipo:'destaque', label:'Nome', valor: nome }]);
    rerenderModule('tabelas');
  } catch(e) {
    Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco.']);
  }
}

function abrirNovaTabela() {
  if (!document.getElementById('m-nova-tab')) { rerenderModule('tabelas'); setTimeout(abrirNovaTabela, 150); return; }
  [1,2,3,4,5,6,7,8,9,10,11,12].forEach(n => { const el = document.getElementById(`nt-p${n}`); if (el) el.value = ''; });
  document.getElementById('nt-nome').value = '';
  document.getElementById('nt-ref').value  = '';
  document.getElementById('nt-preview').innerHTML = 'Preencha os percentuais para ver a prévia...';
  openModal('m-nova-tab');
}

function previewNovaTabela() {
  const parcelas = [1,2,3,4,5,6,7,8,9,10,11,12].map(n => parseFloat(document.getElementById(`nt-p${n}`)?.value) || 0);
  const ativas   = parcelas.filter(p => p > 0);
  const total    = ativas.reduce((a, p) => a + p, 0);
  document.getElementById('nt-preview').innerHTML = ativas.length > 0
    ? `${ativas.length} parcelas ativas · Total: ${(total * 100).toFixed(2)}% · ${parcelas.map((p,i) => p > 0 ? `${i+1}ª=${(p*100).toFixed(2)}%` : '').filter(Boolean).join(' · ')}`
    : 'Preencha os percentuais para ver a prévia...';
}

async function salvarNovaTabela() {
  const nome = document.getElementById('nt-nome').value.trim();
  const ref  = document.getElementById('nt-ref').value.trim();
  if (!nome || !ref) { Dialog.alert('Campos obrigatórios', ['Preencha nome e referência da tabela.']); return; }
  const parcelas = [1,2,3,4,5,6,7,8,9,10,11,12].map(n => parseFloat(document.getElementById(`nt-p${n}`)?.value) || 0);
  try {
    const { data, error } = await Supabase.from('tabelas_comissao').insert({ nome, ref, parcelas, ativo: true }).select().single();
    if (error) throw error;
    DB.tabelas.push({ id: data.id, nome, ref, parcelas, ativo: true });
    closeModal('m-nova-tab');
    Dialog.success('Tabela criada', [{ tipo:'destaque', label:'Nome', valor: nome }, { tipo:'destaque', label:'Ref', valor: ref }]);
    rerenderModule('tabelas');
  } catch(e) {
    console.error('Erro ao salvar tabela:', e);
    Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco.']);
  }
}

async function toggleAtivoTabela(tabId, unidade) {
  const tab = DB.tabelas.find(t => t.id === tabId && (t.unidade||'brusque') === (unidade||'brusque'));
  if (!tab) return;
  const novoAtivo = !(tab.ativo !== false);
  try {
    const { error } = await Supabase.from('tabelas_comissao').update({ ativo: novoAtivo }).eq('id', tabId).eq('unidade', unidade||'brusque');
    if (error) throw error;
    tab.ativo = novoAtivo;
    rerenderModule('tabelas');
  } catch(e) {
    console.error('Erro ao alterar status da tabela:', e);
    Dialog.alert('Erro ao salvar', ['Não foi possível alterar o status da tabela no banco.']);
  }
}

function toggleTabela(id) {
  AppState.modulo.tabelas.expandida = AppState.modulo.tabelas.expandida === id ? null : id;
  rerenderModule('tabelas');
}

let _simulTabela = null;
let _simulUnidade = null;
function verSimulacao(tabId, unidade) {
  _simulTabela = tabId;
  _simulUnidade = unidade || 'brusque';
  const tab = DB.tabelas.find(t => t.id === tabId && (t.unidade||'brusque') === _simulUnidade);
  document.getElementById('ms-title').textContent = `Simular — ${tab?.nome}`;
  document.getElementById('ms-val').value = '';
  document.getElementById('ms-d2').value = '';
  document.getElementById('ms-result').innerHTML = '';
  openModal('m-simul');
}

function simularTabela() {
  const val = parseFloat(document.getElementById('ms-val')?.value) || 0;
  const dv  = document.getElementById('ms-dv')?.value;
  const d2  = document.getElementById('ms-d2')?.value;
  const res = document.getElementById('ms-result');
  if (!res) return;
  if (!val || !dv || !d2 || !_simulTabela) { res.innerHTML = ''; return; }
  const tabelasDaUnidade = DB.tabelas.filter(t => (t.unidade||'brusque') === (_simulUnidade||'brusque'));
  const pc = calcParcelas({ tabela: _simulTabela, valor: val, dvenda: dv, d2parc: d2, parcelas: [] }, tabelasDaUnidade);
  const ativas = pc.filter(p => p.ativa);
  const total  = ativas.reduce((a, p) => a + p.valor, 0);
  res.innerHTML = `
    <div style="margin-top:14px;background:var(--gold-dim);border:1px solid var(--gold-glow);border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="font-weight:700;color:var(--gold)">Total de comissões</span>
      <span style="font-family:var(--mono);font-size:18px;font-weight:800;color:var(--gold)">${fmt(total)}</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Venc. cliente</th><th>Pgto comissão</th><th>Valor</th><th>%</th></tr></thead>
      <tbody>${ativas.map(p => `<tr>
        <td class="td-mono">${p.n}ª</td>
        <td class="td-mono">${fmtDate(p.dataVencCliente)}</td>
        <td class="td-mono" style="color:var(--gold)">${fmtDate(p.dataPgto)}</td>
        <td class="td-mono" style="color:var(--gold)">${fmt(p.valor)}</td>
        <td class="td-mono">${p.pct}%</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   16. MÓDULO: REMUNERAÇÃO DO GESTOR
   ═══════════════════════════════════════════════════════════════════════════ */
// Usado só pra agrupar tabelas em "Prime" (maior %) vs "Básica" (menor %) no
// demonstrativo do gestor — usa o total da regra "sem líder de equipe"
// (tabelas_comissao_gerencia) como referência de qual produto rende mais.
function getPctGestor(tabId) {
  const unidade = unidadeEscopoAtual() || 'brusque';
  const regra = buscarRegraPorTabelaOuRef(DB.tabelasComissaoGerencia, 'tabela_id', tabId, unidade);
  if (!regra) return 0;
  return regra.semSupervisor.reduce((a, p) => a + p, 0);
}

// NOVO: comissão PESSOAL do líder de equipe (quando ele fecha uma venda
// sozinho). Se a unidade dele tiver uma tabela própria cadastrada em
// tabelas_comissao_supervisor (ex: Blumenau — "Individual"), usa essa. Se
// não tiver (ex: Brusque hoje), usa a tabela normal de vendedor mesmo —
// comportamento igual ao que já existia antes.
function calcComissaoPessoalLider(liderId, mes) {
  const unidadeLider = DB.vendedores.find(v => v.id === liderId)?.unidade || 'brusque';
  const vendasPessoais = DB.vendas.filter(v => v.vendedor === liderId && v.status !== 'cancelado');
  const producao = [], recorrencia = [];

  vendasPessoais.forEach(v => {
    const regraPropria = buscarRegraPorTabelaOuRef(DB.tabelasSupervisor, 'id', v.tabela, unidadeLider);
    const tabOriginal = DB.tabelas.find(t => t.id === v.tabela && (t.unidade||'brusque') === unidadeLider);
    // Se achou regra própria (Individual), usa os percentuais dela; senão
    // cai na tabela normal de vendedor (comportamento antigo, ex: Brusque)
    const tabParaCalculo = regraPropria
      ? [{ id: v.tabela, nome: tabOriginal?.nome || v.tabela, parcelas: regraPropria.parcelas }]
      : undefined;
    const tab = regraPropria ? tabParaCalculo[0] : tabOriginal;
    if (!tab) return;
    calcParcelas(v, tabParaCalculo).forEach((p, i) => {
      if (!p.ativa || p.mesRecebimento !== mes) return;
      const statusParcCliente = v.parcelas[i]?.s;
      if (p.n > 1 && statusParcCliente !== 'pago') return;
      const item = { cliente: v.cliente, contrato: v.contrato, tabela: v.tabela, tabelaNome: tab?.nome || v.tabela, n: p.n, parc: p.n, valor: p.valor, pct: p.pct };
      if (p.n === 1) producao.push(item); else recorrencia.push(item);
    });
  });
  return { producao, recorrencia };
}

// NOVO: comissão do líder de equipe (Supervisor/Closer) sobre as vendas da
// sua equipe. Se a unidade tiver uma tabela própria de override cadastrada
// (tabelas_override_lider — ex: Blumenau), usa ela, com todas as parcelas
// que tiverem percentual. Se não tiver (ex: Brusque hoje), cai no cálculo
// antigo — mesma % que o gerente recebe nesse cenário (comSupervisor),
// limitado às 3 primeiras parcelas.
// NOVO: busca numa lista de regras (override/gerência/supervisor) primeiro
// pelo id exato da tabela (ex: "SM_BLU"), e se não achar, tenta pela
// REFERÊNCIA daquela tabela (ex: "REF7") — permite cadastrar só 1 linha por
// grupo de referência em vez de repetir pra cada produto, já que dentro do
// mesmo grupo os percentuais costumam ser iguais.
function buscarRegraPorTabelaOuRef(lista, campoId, tabelaVendaId, unidade) {
  const exata = lista.find(r => r[campoId] === tabelaVendaId && (r.unidade || 'brusque') === unidade);
  if (exata) return exata;
  const tabInfo = DB.tabelas.find(t => t.id === tabelaVendaId && (t.unidade||'brusque') === unidade);
  if (!tabInfo?.ref) return null;
  return lista.find(r => r[campoId] === tabInfo.ref && (r.unidade || 'brusque') === unidade) || null;
}

function calcComissaoSupervisorMes(supervisorId, mes) {
  const itens = [];
  const idsEquipe = DB.vendedores.filter(v => v.liderId === supervisorId).map(v => v.id);
  const unidadeLider = DB.vendedores.find(v => v.id === supervisorId)?.unidade || 'brusque';
  DB.vendas.forEach(v => {
    if (v.status === 'cancelado') return;
    if (!idsEquipe.includes(v.vendedor)) return;
    const tab = DB.tabelas.find(t => t.id === v.tabela);

    const overrideProprio = buscarRegraPorTabelaOuRef(DB.tabelasOverrideLider, 'tabela_id', v.tabela, unidadeLider);
    const regraAntiga = !overrideProprio ? DB.tabelasComissaoGerencia.find(g => g.tabela_id === v.tabela && (g.unidade || 'brusque') === unidadeLider) : null;
    if (!overrideProprio && !regraAntiga) return;

    calcParcelas(v).forEach((p, i) => {
      if (!p.ativa) return;
      if (!overrideProprio && p.n > 3) return; // regra antiga só vale nas 3 primeiras
      if (p.mesRecebimento !== mes) return;
      const statusParcCliente = v.parcelas[i]?.s;
      if (p.n > 1 && statusParcCliente !== 'pago') return;
      const pct = overrideProprio ? overrideProprio.parcelas[p.n - 1] : regraAntiga.comSupervisor[p.n - 1];
      if (!pct) return;
      itens.push({
        cliente: v.cliente, contrato: v.contrato, vendedor: v.vendedor,
        tabela: v.tabela, tabelaNome: tab?.nome || v.tabela, n: p.n,
        valor: v.valor * pct / 100, pct,
      });
    });
  });
  return itens;
}

function calcRemuneracaoMes(mes) {
  const producao    = [];
  const recorrencia = [];

  vendasNoEscopo({ role: 'gestor' }).forEach(v => {
    if (v.status === 'cancelado') return;
    const tab = DB.tabelas.find(t => t.id === v.tabela);
    const vend = DB.vendedores.find(x => x.id === v.vendedor);
    const unidadeVenda = vend?.unidade || 'brusque';
    const regra = buscarRegraPorTabelaOuRef(DB.tabelasComissaoGerencia, 'tabela_id', v.tabela, unidadeVenda);
    if (!regra) return; // tabela sem regra de gerência cadastrada — não gera comissão de gerência

    const temLider = !!(vend && vend.liderId); // tem líder de equipe acima dele?
    const pcts = temLider ? regra.comSupervisor : regra.semSupervisor;

    calcParcelas(v).forEach((p, i) => {
      if (!p.ativa || p.n > 3) return; // regra de gerência só vale nas 3 primeiras parcelas
      if (p.mesRecebimento !== mes) return;
      const statusParcCliente = v.parcelas[i]?.s;
      if (p.n > 1 && statusParcCliente !== 'pago') return;

      const pct = pcts[p.n - 1];
      if (!pct) return;

      const item = {
        cliente:         v.cliente,
        contrato:        v.contrato,
        tabela:          v.tabela,
        tabelaNome:      tab?.nome || v.tabela,
        vendedor:        v.vendedor,
        n:               p.n,
        parc:            p.n,
        valor:           v.valor * pct / 100,
        pct,
        dvenda:          v.dvenda,
        dataVencCliente: p.dataVencCliente,
        dataPgto:        p.dataPgto,
        ref:             temLider ? 'Com líder de equipe' : 'Sem líder de equipe',
      };

      if (p.n === 1) producao.push(item);
      else recorrencia.push(item);
    });
  });

  return { producao, recorrencia };
}

const _faixaOrigemCache = {};
function faixaOrigemMes(mesOrigem) {
  if (_faixaOrigemCache[mesOrigem]) return _faixaOrigemCache[mesOrigem];
  const producaoMesEquipe = DB.vendas
    .filter(v => mesKey(v.dvenda) === mesOrigem)
    .reduce((a, v) => a + v.valor, 0);
  let faixa;
  if (producaoMesEquipe >= 3000000)      faixa = 'normal';
  else if (producaoMesEquipe >= 2500000) faixa = 'minimo';
  else                                    faixa = 'bloqueado';
  return (_faixaOrigemCache[mesOrigem] = { faixa, producaoMesEquipe });
}

function aplicarTravaGestor(mes, producaoItems, recorrenciaItems) {
  let vProdFinal = 0, vRecFinal = 0;
  const minimosAplicados = new Set();
  const origens = { normal: new Set(), minimo: new Set(), bloqueado: new Set() };

  (producaoItems || []).forEach(item => {
    const mesOrigem = mesKey(item.dvenda);
    const { faixa, producaoMesEquipe } = faixaOrigemMes(mesOrigem);
    origens[faixa].add(mesOrigem + '|' + fmt(producaoMesEquipe));
    if (faixa === 'normal') {
      vProdFinal += item.valor;
    } else if (faixa === 'minimo') {
      if (!minimosAplicados.has(mesOrigem)) { vProdFinal += 4000; minimosAplicados.add(mesOrigem); }
    }
  });

  (recorrenciaItems || []).forEach(item => {
    const mesOrigem = mesKey(item.dvenda);
    const { faixa, producaoMesEquipe } = faixaOrigemMes(mesOrigem);
    origens[faixa].add(mesOrigem + '|' + fmt(producaoMesEquipe));
    if (faixa === 'normal') vRecFinal += item.valor;
  });

  const vLiqFinal = vProdFinal + vRecFinal;
  return {
    vProdFinal, vRecFinal, vLiqFinal,
    origensMinimo:    [...origens.minimo],
    origensBloqueado: [...origens.bloqueado],
  };
}

function renderRemuneracao() {
  const st = AppState.modulo.remuneracao;

  const mesesSet = new Set();
  vendasNoEscopo({ role: 'gestor' }).forEach(v => {
    if (v.status === 'cancelado') return;
    calcParcelas(v).forEach(p => {
      if (p.ativa && p.n <= 2) mesesSet.add(p.mesRecebimento);
    });
  });
  DB.fechamentosGestor.forEach(f => mesesSet.add(f.mes));

  const mesesDisp = [...mesesSet].sort();
  if (!mesesDisp.includes(todayMes())) mesesDisp.push(todayMes());
  mesesDisp.sort();
  if (!st.mesSel || !mesesDisp.includes(st.mesSel)) st.mesSel = mesesDisp[mesesDisp.length - 1] || todayMes();

  const { producao, recorrencia } = calcRemuneracaoMes(st.mesSel);
  const fech = DB.fechamentosGestor.find(f => f.mes === st.mesSel);

  const vProd = producao.reduce((a, i) => a + i.valor, 0);
  const vRec  = recorrencia.reduce((a, i) => a + i.valor, 0);
  const { vProdFinal, vRecFinal, vLiqFinal: vLiq, origensMinimo, origensBloqueado } = aplicarTravaGestor(st.mesSel, producao, recorrencia);

  const vendasDoMes = vendasNoEscopo({ role: 'gestor' }).filter(v => mesKey(v.dvenda) === st.mesSel);
  const totalVendidoMes = vendasDoMes.reduce((a, v) => a + v.valor, 0);

  const acumPago     = DB.fechamentosGestor.filter(f => f.status === 'pago')
    .reduce((a, f) => {
      const { producao: p, recorrencia: r } = calcRemuneracaoMes(f.mes);
      return a + aplicarTravaGestor(f.mes, p, r).vLiqFinal;
    }, 0);

  const totalCredEquipe = vendasNoEscopo({ role: 'gestor' })
    .filter(v => v.status !== 'cancelado')
    .reduce((a, v) => a + v.valor, 0);

  const mesNav = renderMesNav(mesesDisp, st.mesSel, "AppState.modulo.remuneracao.mesSel", 'remuneracao', m => {
    const f = DB.fechamentosGestor.find(x => x.mes === m);
    if (f?.status === 'pago') return ' — ✓ Pago';
    if (f || mesesSet.has(m)) return ' — Pendente';
    return '';
  });

  const statusAtual = fech?.status || (vLiq > 0 ? 'aberto' : (origensBloqueado.length > 0 && origensMinimo.length === 0 ? 'sem_comissao' : 'aberto'));
  const statusMap = {
    aberto:        ['fech-status fech-aberto',    '◌', 'Em aberto — aguardando fechamento'],
    sem_comissao:  ['fech-status fech-aberto',    '⊘', 'Produção abaixo do mínimo — sem comissão neste mês'],
    aguardando_nf: ['fech-status fech-aguardando','◎', 'Aguardando emissão da Nota Fiscal'],
    aprovado:      ['fech-status fech-aprovado',  '◈', 'Aprovado — aguardando pagamento'],
    pago:          ['fech-status fech-pago',      '◆', 'Pago — remuneração liquidada'],
  };
  const [sc, ic, sm] = statusMap[statusAtual] || ['fech-status fech-aberto','◌','Em aberto'];

  const btnAcao = statusAtual === 'aberto'
    ? `<button class="btn btn-success btn-sm" onclick="fecharMesGestor('${st.mesSel}')">✓ Fechar mês</button>`
    : statusAtual === 'sem_comissao'
    ? `<button class="btn btn-success btn-sm" onclick="darBaixaMesGestor('${st.mesSel}')">✓ Dar baixa (sem comissão)</button>`
    : statusAtual === 'aguardando_nf'
    ? `<button class="btn btn-purple btn-sm" onclick="registrarNFGestor('${st.mesSel}')">📄 Registrar NF</button>`
    : statusAtual === 'aprovado'
    ? `<button class="btn btn-primary btn-sm" onclick="abrirPgtoGestor('${st.mesSel}')">💰 Confirmar pagamento</button>`
    : '';

  const rowsProd = producao.map(p => `<tr>
    <td>
      <div style="font-weight:600;font-size:12px">${p.cliente}</div>
      <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${p.contrato} · ${p.tabelaNome} · <span style="color:var(--text2)">${vendorName(p.vendedor)}</span></div>
    </td>
    <td class="td-mono" style="color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
    <td class="td-mono" style="color:var(--brand)">${fmtDate(p.dataPgto)}</td>
    <td><span class="badge ${p.ref === 'REF 3' ? 'badge-gold' : 'badge-blue'}">${p.ref}</span></td>
    <td class="td-mono" style="color:var(--green);font-weight:600">${fmt(p.valor)}</td>
    <td class="td-mono" style="color:var(--text3)">${p.pct.toFixed(1)}%</td>
  </tr>`).join('');

  const rowsRec = recorrencia.map(p => `<tr>
    <td>
      <div style="font-weight:600;font-size:12px">${p.cliente}</div>
      <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${p.contrato} · <span style="color:var(--blue)">${p.parc}ª parcela</span> · ${vendorName(p.vendedor)}</div>
    </td>
    <td class="td-mono" style="color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
    <td class="td-mono" style="color:var(--brand)">${fmtDate(p.dataPgto)}</td>
    <td><span class="badge ${p.ref === 'REF 3' ? 'badge-gold' : 'badge-blue'}">${p.ref}</span></td>
    <td class="td-mono" style="color:var(--blue);font-weight:600">${fmt(p.valor)}</td>
    <td class="td-mono" style="color:var(--text3)">${p.pct.toFixed(1)}%</td>
  </tr>`).join('');

  const tabelaHTML = (producao.length > 0 || recorrencia.length > 0) ? `
  <div class="table-wrap" style="margin-top:14px">
    <table>
      <thead><tr>
        <th>Cliente / Contrato / Vendedor</th>
        <th>Venc. cliente</th>
        <th>Pgto remuneração</th>
        <th>Ref</th>
        <th>Valor</th>
        <th>%</th>
      </tr></thead>
      <tbody>
        ${producao.length > 0 ? `
        <tr><td colspan="6" style="padding:6px 12px;background:var(--ink4);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase">
          PRODUÇÃO — 1ª parcelas · ${producao.length} contrato(s)
        </td></tr>${rowsProd}` : ''}
        ${recorrencia.length > 0 ? `
        <tr><td colspan="6" style="padding:6px 12px;background:var(--ink4);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase">
          RECORRÊNCIA — 2ª parcelas · ${recorrencia.length} contrato(s)
        </td></tr>${rowsRec}` : ''}
      </tbody>
    </table>
  </div>` : '';

  const semDados = producao.length === 0 && recorrencia.length === 0;

  return `
<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">
  Produção da equipe — ${mesLabel(st.mesSel)}
</div>
<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:18px">
  <div class="stat-card purple">
    <div class="stat-label">Vendido no mês</div>
    <div class="stat-value">${fmt(totalVendidoMes)}</div>
    <div class="stat-meta">${vendasDoMes.length} contrato(s)</div>
  </div>
  <div class="stat-card amber">
    <div class="stat-label">Créditos equipe</div>
    <div class="stat-value">${fmt(totalCredEquipe)}</div>
    <div class="stat-meta">Portfolio total (histórico)</div>
  </div>
  <div class="stat-card gold">
    <div class="stat-label">Total recebido</div>
    <div class="stat-value">${fmt(acumPago)}</div>
    <div class="stat-meta">Histórico pago</div>
  </div>
</div>

<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">
  Sua comissão — ${mesLabel(st.mesSel)}
</div>
<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
  <div class="stat-card blue">
    <div class="stat-label">Comissão — produção</div>
    <div class="stat-value">${fmt(vProdFinal)}</div>
    <div class="stat-meta">${producao.length} contrato(s)${vProdFinal !== vProd ? ' · ajustada pela trava' : ''}</div>
  </div>
  <div class="stat-card blue">
    <div class="stat-label">Comissão — recorrência</div>
    <div class="stat-value">${fmt(vRecFinal)}</div>
    <div class="stat-meta">${recorrencia.length} parcela(s)</div>
  </div>
  <div class="stat-card red">
    <div class="stat-label">Total a receber</div>
    <div class="stat-value">${fmt(vLiq)}</div>
    <div class="stat-meta">Valor líquido deste mês</div>
  </div>
</div>

<div class="month-nav">${mesNav}</div>

<div class="card">
  <div class="card-header">
    <span class="card-title">Remuneração — ${mesLabel(st.mesSel)}</span>
    <div style="display:flex;gap:8px;align-items:center">
      ${!semDados ? btnAcao : ''}
      ${!semDados ? `<button class="btn btn-ghost btn-sm" onclick="verDemonstrativoGestor('${st.mesSel}')">👁 Demonstrativo</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 Imprimir</button>
    </div>
  </div>
  <div style="padding:14px 16px">
    ${semDados
      ? `<div class="empty-state"><div class="empty-icon">★</div><div class="empty-title">Sem recebimentos neste mês</div><div class="empty-sub">Nenhuma parcela com vencimento no período</div></div>`
      : `<div class="${sc}" style="margin-bottom:14px">${ic} ${sm}</div>
         ${origensMinimo.length > 0 ? `<div class="alert alert-amber" style="margin-bottom:14px">
           ⚠ Vendas com origem em ${origensMinimo.map(o => { const [m,v] = o.split('|'); return `<strong>${mesLabel(m)}</strong> (produção da equipe ${v})`; }).join(', ')} —
           entre R$ 2.500.000 e R$ 3.000.000: a comissão de produção desses meses foi substituída pelo mínimo garantido de R$ 4.000,00 (sem recorrência futura dessas vendas — apenas o fixo).
         </div>` : ''}
         ${origensBloqueado.length > 0 ? `<div class="alert alert-red" style="margin-bottom:14px">
           ⚠ Vendas com origem em ${origensBloqueado.map(o => { const [m,v] = o.split('|'); return `<strong>${mesLabel(m)}</strong> (produção da equipe ${v})`; }).join(', ')} —
           abaixo de R$ 2.500.000: produção e recorrência dessas vendas não geram comissão para o gestor.
         </div>` : ''}
         <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
           <div style="background:var(--ink3);border-radius:8px;padding:12px">
             <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Comissão — produção</div>
             <div style="font-size:16px;font-weight:700;font-family:var(--mono);color:var(--green)">${fmt(vProdFinal)}</div>
             <div style="font-size:10px;color:var(--text3);margin-top:2px">${producao.length} contrato(s)</div>
           </div>
           <div style="background:var(--ink3);border-radius:8px;padding:12px">
             <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Comissão — recorrência</div>
             <div style="font-size:16px;font-weight:700;font-family:var(--mono);color:var(--blue)">${fmt(vRecFinal)}</div>
             <div style="font-size:10px;color:var(--text3);margin-top:2px">${recorrencia.length} parcela(s)</div>
           </div>
           <div style="background:var(--brand-dim);border:1px solid var(--brand-border);border-radius:8px;padding:12px">
             <div style="font-size:9px;font-weight:700;color:var(--brand);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Líquido NF</div>
             <div style="font-size:18px;font-weight:800;font-family:var(--mono);color:var(--brand)">${fmt(vLiq)}</div>
           </div>
         </div>
         ${fech?.dataPgto ? `<div class="alert alert-green" style="margin-bottom:14px">✓ Pago em ${fmtDate(fech.dataPgto)} via ${fech.formaPgto?.toUpperCase()}</div>` : ''}
         ${tabelaHTML}`
    }
  </div>
</div>

<div class="overlay" id="m-pgto-g">
  <div class="modal" style="width:480px">
    <button class="modal-close" onclick="closeModal('m-pgto-g')">✕</button>
    <div class="modal-title">Confirmar pagamento — Gestor</div>
    <div class="modal-sub" id="mpg-sub"></div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Data do pagamento</label><input type="date" id="mpg-data"></div>
      <div class="form-group"><label>Forma de pagamento</label>
        <select id="mpg-forma">
          <option value="transferencia">Transferência bancária</option>
          <option value="pix">PIX</option>
          <option value="deposito">Depósito</option>
        </select>
      </div>
    </div>
    <div class="form-row cols-1">
      <div class="form-group"><label>Observação</label><input type="text" id="mpg-obs" placeholder="ex: PIX chave CPF"></div>
    </div>
    <div id="mpg-preview" style="padding:12px;background:var(--ink3);border-radius:8px;font-size:12px;color:var(--text2);font-family:var(--mono)"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-pgto-g')">Cancelar</button>
      <button class="btn btn-success" onclick="confirmarPgtoGestor()">✓ Confirmar pagamento</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-demo-g">
  <div class="modal" style="width:660px">
    <button class="modal-close no-print" onclick="closeModal('m-demo-g')">✕</button>
    <div class="modal-title" id="mdg-title">Demonstrativo — Gestor</div>
    <div class="modal-sub" id="mdg-sub"></div>
    <div id="mdg-body"></div>
    <div class="modal-actions no-print">
      <button class="btn btn-ghost" onclick="closeModal('m-demo-g')">Fechar</button>
      <button class="btn btn-ghost" onclick="window.print()">🖨 Imprimir</button>
    </div>
  </div>
</div>`;
}

let _pgtoGestorTarget = null;

async function persistirFechamentoGestor(f) {
  const data = await Servicos.salvarFechamentoGestor(f);
  if (!data) {
    Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco. Verifique sua conexão e tente novamente.']);
    return false;
  }
  f.id = data.id;
  return true;
}

async function persistirFechamentoGestorComValor(f, valorLiquido) {
  const data = await Servicos.salvarFechamentoGestorComValor(f, valorLiquido);
  if (!data) {
    Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco. Verifique sua conexão e tente novamente.']);
    return false;
  }
  f.id = data.id;
  return true;
}

async function darBaixaMesGestor(mes) {
  const { producao, recorrencia } = calcRemuneracaoMes(mes);
  const { vLiqFinal } = aplicarTravaGestor(mes, producao, recorrencia);

  const _ok = await Dialog.confirm('Dar baixa no mês — sem comissão', [
    `Mês de referência: ${mesLabel(mes)}`,
    `Nenhuma venda com origem qualificada (≥ R$ 2.500.000 no mês de venda) gerou comissão neste mês.`,
    { tipo:'destaque', label:'Valor a registrar', valor:fmt(vLiqFinal), cor:'var(--brand)' }
  ]); if (!_ok) return;

  let f = DB.fechamentosGestor.find(x => x.mes === mes);
  if (!f) {
    f = { id: null, mes, status:'pago', nfNumero:null, dataNF:null, dataPgto:today(), formaPgto:'—', obs:'Produção da equipe abaixo do mínimo — sem comissão' };
    DB.fechamentosGestor.push(f);
  } else {
    f.status = 'pago';
    f.dataPgto = today();
    f.formaPgto = f.formaPgto || '—';
    f.obs = f.obs || 'Produção da equipe abaixo do mínimo — sem comissão';
  }
  if (!await persistirFechamentoGestor(f)) return;
  rerenderModule('comissaoLideranca');
}

async function fecharMesGestor(mes) {
  const { producao, recorrencia } = calcRemuneracaoMes(mes);
  const { vLiqFinal: vLiq, origensMinimo, origensBloqueado } = aplicarTravaGestor(mes, producao, recorrencia);
  const avisos = [];
  origensMinimo.forEach(o => { const [m,v] = o.split('|'); avisos.push(`⚠ Origem ${mesLabel(m)} (produção ${v}): mínimo garantido de R$ 4.000,00 (sem recorrência dessas vendas).`); });
  origensBloqueado.forEach(o => { const [m,v] = o.split('|'); avisos.push(`⚠ Origem ${mesLabel(m)} (produção ${v}): sem comissão (produção e recorrência).`); });
  const _ok4 = await Dialog.confirm(`Fechar mês — Remuneração Gestor`, [
    `Mês de referência: ${mesLabel(mes)}`,
    ...avisos,
    { tipo:'destaque', label:'Valor para NF', valor:fmt(vLiq), cor:'var(--brand)' }
  ]); if (!_ok4) return;
  let f = DB.fechamentosGestor.find(x => x.mes === mes);
  if (!f) {
    f = { id: null, mes, status:'aguardando_nf', nfNumero:null, dataNF:null, dataPgto:null, formaPgto:null, obs:'' };
    DB.fechamentosGestor.push(f);
  } else {
    f.status = 'aguardando_nf';
  }
  if (!await persistirFechamentoGestor(f)) return;
  rerenderModule('comissaoLideranca');
}

async function registrarNFGestor(mes) {
  let f = DB.fechamentosGestor.find(x => x.mes === mes);
  if (!f) return;
  const nr = window.prompt('Número da NF:');
  if (!nr) return;
  const data = window.prompt('Data da NF (AAAA-MM-DD):', today());
  if (!data) return;
  f.nfNumero = nr; f.dataNF = data; f.status = 'aprovado';
  if (!await persistirFechamentoGestor(f)) return;
  rerenderModule('comissaoLideranca');
}

function abrirPgtoGestor(mes) {
  _pgtoGestorTarget = mes;
  const { producao, recorrencia } = calcRemuneracaoMes(mes);
  const { vLiqFinal: vLiq } = aplicarTravaGestor(mes, producao, recorrencia);
  const f = DB.fechamentosGestor.find(x => x.mes === mes);
  document.getElementById('mpg-sub').textContent     = `Gestor · ${mesLabel(mes)}`;
  document.getElementById('mpg-data').value          = today();
  document.getElementById('mpg-obs').value           = '';
  document.getElementById('mpg-preview').textContent = `Valor a pagar: ${fmt(vLiq)}${f?.nfNumero ? ' · NF: ' + f.nfNumero : ''}`;
  openModal('m-pgto-g');
}

async function confirmarPgtoGestor() {
  const mes = _pgtoGestorTarget;
  let f = DB.fechamentosGestor.find(x => x.mes === mes);
  if (!f) return;
  const data  = document.getElementById('mpg-data').value;
  const forma = document.getElementById('mpg-forma').value;
  const obs   = document.getElementById('mpg-obs').value;
  if (!data) { Dialog.alert('Data obrigatória', ['Informe a data do pagamento para continuar.']); return; }

  const { producao, recorrencia } = calcRemuneracaoMes(mes);
  const { vLiqFinal: valorLiquido } = aplicarTravaGestor(mes, producao, recorrencia);

  f.status = 'pago'; f.dataPgto = data; f.formaPgto = forma; f.obs = obs;
  f.valorLiquido = valorLiquido;

  if (!await persistirFechamentoGestorComValor(f, valorLiquido)) return;
  closeModal('m-pgto-g');
  rerenderModule('comissaoLideranca');
}
function verDemonstrativoGestor(mes) {
  const { producao, recorrencia } = calcRemuneracaoMes(mes);
  const fech = DB.fechamentosGestor.find(f => f.mes === mes);
  const vProd = producao.reduce((a,i)=>a+i.valor,0);
  const vRec  = recorrencia.reduce((a,i)=>a+i.valor,0);
  const vLiq  = aplicarTravaGestor(mes, producao, recorrencia).vLiqFinal;

  document.getElementById('mdg-title').textContent = `Demonstrativo — Gestor · ${mesLabel(mes)}`;
  document.getElementById('mdg-sub').textContent   = `Base de cálculo para emissão da nota fiscal`;

  const thHTML = `<tr style="background:var(--ink4)">
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Cliente</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Contrato</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Tabela</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:center;white-space:nowrap">Parcela</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left;white-space:nowrap">Venc. cliente</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Vendedor</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right;white-space:nowrap">Valor venda</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right">Comissão</th>
    <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right;white-space:nowrap">%</th>
  </tr>`;

  function totalParcAtivasVenda(contrato) {
    const v = DB.vendas.find(x => x.contrato === contrato);
    if (!v) return '?';
    const tab = DB.tabelas.find(t => t.id === v.tabela);
    return (tab?.parcelas || []).filter(p => p > 0).length;
  }

  const prodRows = producao.map(p => {
    const totalParc = totalParcAtivasVenda(p.contrato);
    const venda = DB.vendas.find(x => x.contrato === p.contrato);
    return `<tr style="border-bottom:1px solid var(--line)">
      <td style="padding:8px 10px;font-size:12px;font-weight:600">${p.cliente}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${p.contrato}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${p.tabelaNome}</td>
      <td style="padding:8px 10px;text-align:center">
        <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green);background:var(--green-dim);border:1px solid var(--green-glow);border-radius:5px;padding:2px 8px;white-space:nowrap">
          1ª&nbsp;/&nbsp;${totalParc}
        </span>
      </td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${vendorName(p.vendedor).split(' ')[0]}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:12px;color:var(--text2);text-align:right">${venda ? fmt(venda.valor) : '—'}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green);text-align:right">${fmt(p.valor)}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text3);text-align:right">${p.pct}%</td>
    </tr>`;
  }).join('');

  const recRows = recorrencia.map(p => {
    const totalParc = totalParcAtivasVenda(p.contrato);
    const venda = DB.vendas.find(x => x.contrato === p.contrato);
    return `<tr style="border-bottom:1px solid var(--line)">
      <td style="padding:8px 10px;font-size:12px;font-weight:600">${p.cliente}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${p.contrato}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${p.tabelaNome}</td>
      <td style="padding:8px 10px;text-align:center">
        <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--blue);background:var(--blue-dim);border:1px solid var(--blue-glow);border-radius:5px;padding:2px 8px;white-space:nowrap">
          ${p.parc}ª&nbsp;/&nbsp;${totalParc}
        </span>
      </td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${fmtDate(p.dataVencCliente)}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${vendorName(p.vendedor).split(' ')[0]}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:12px;color:var(--text2);text-align:right">${venda ? fmt(venda.valor) : '—'}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--blue);text-align:right">${fmt(p.valor)}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text3);text-align:right">${p.pct}%</td>
    </tr>`;
  }).join('');

  function subtotalRow(label, valor, cor, cols) {
    return `<tr style="background:var(--ink4)">
      <td colspan="${cols}" style="padding:8px 10px;font-size:11px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:1px">${label}</td>
      <td style="padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:700;color:${cor};text-align:right">${valor}</td>
    </tr>`;
  }

  const totalLinhasG = producao.length + recorrencia.length;
  document.getElementById('mdg-body').classList.toggle('compact-print', totalLinhasG > 10);

  // NOVO: agrupa as tabelas por percentual real do gestor (dinâmico — não
  // hardcoded — então se um dia mudar getPctGestor, o resumo acompanha)
  const corPrime  = { bg:'#E6F1FB', bgGlow:'#85B7EB', texto:'#042C53', textoSub:'#0C447C' };
  const corBasica = { bg:'#EEEDFE', bgGlow:'#AFA9EC', texto:'#26215C', textoSub:'#3C3489' };
  const tabelasAtivas = DB.tabelas.filter(t => t.ativo !== false);
  const maxPctGestor = Math.max(...tabelasAtivas.map(t => getPctGestor(t.id)), 0);
  const tabelasPrimeG  = tabelasAtivas.filter(t => getPctGestor(t.id) === maxPctGestor);
  const tabelasBasicaG = tabelasAtivas.filter(t => getPctGestor(t.id) !== maxPctGestor);
  const pctPrimeG  = maxPctGestor;
  const pctBasicaG = tabelasBasicaG[0] ? getPctGestor(tabelasBasicaG[0].id) : 0;
  const chipsPrimeG = tabelasPrimeG.map(t => `<span style="font-size:10px;font-family:var(--mono);background:${corPrime.bg};color:${corPrime.texto};padding:3px 8px;border-radius:4px">${t.id}</span>`).join('');
  const chipsBasicaG = tabelasBasicaG.map(t => `<span style="font-size:10px;font-family:var(--mono);background:${corBasica.bg};color:${corBasica.texto};padding:3px 8px;border-radius:4px">${t.id}</span>`).join('');

  // CORRIGIDO: a 1ª parcela é sempre paga no mês SEGUINTE à venda
  const mesProducaoG = addMonths(mes + '-01', -1)?.substring(0, 7);
  const volumeTotalG = DB.vendas
    .filter(v => v.status !== 'cancelado' && mesKey(v.dvenda) === mesProducaoG)
    .reduce((a, v) => a + v.valor, 0);

  document.getElementById('mdg-body').innerHTML = `
  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:14px 16px;background:var(--ink3);border-radius:10px;border:1px solid var(--line);margin-bottom:14px">
      <div style="font-size:11px;color:var(--text3);font-family:var(--mono);line-height:1.8">
        WCON System · Mundo do Consórcio<br>
        CNPJ: 00.000.000/0001-00<br>
        Emissão: ${fmtDate(today())}
      </div>
      <div style="text-align:right">
        <div style="font-size:18px;font-weight:800;color:var(--brand);letter-spacing:-0.5px">DEMONSTRATIVO GESTOR</div>
        <div style="font-size:12px;color:var(--text2);font-family:var(--mono);margin-top:2px">${mesLabel(mes)} · Abiel Noguera</div>
        ${fech?.nfNumero ? `<div style="font-size:11px;color:var(--brand);font-family:var(--mono);margin-top:2px">${fech.nfNumero} · ${fmtDate(fech.dataNF)}</div>` : ''}
      </div>
    </div>

    <div class="demo-resumo-print">
    <div style="background:var(--ink2);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">Como funciona o comissionamento</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div style="background:${corPrime.bg};border:1px solid ${corPrime.bgGlow};border-radius:8px;padding:12px">
          <div style="font-size:11px;font-weight:700;color:${corPrime.texto}">TABELAS PRIME</div>
          <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:${corPrime.texto};margin:4px 0 6px">${(pctPrimeG*2).toFixed(2)}%</div>
          <div style="font-size:11px;color:${corPrime.textoSub};font-family:var(--mono)">${pctPrimeG}% · ${pctPrimeG}%</div>
          <div style="font-size:9px;color:${corPrime.textoSub};opacity:.85;margin-top:4px">1ª / 2ª parcela do cliente</div>
        </div>
        <div style="background:${corBasica.bg};border:1px solid ${corBasica.bgGlow};border-radius:8px;padding:12px">
          <div style="font-size:11px;font-weight:700;color:${corBasica.texto}">TABELAS BÁSICAS</div>
          <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:${corBasica.texto};margin:4px 0 6px">${(pctBasicaG*2).toFixed(2)}%</div>
          <div style="font-size:11px;color:${corBasica.textoSub};font-family:var(--mono)">${pctBasicaG}% · ${pctBasicaG}%</div>
          <div style="font-size:9px;color:${corBasica.textoSub};opacity:.85;margin-top:4px">1ª / 2ª parcela do cliente</div>
        </div>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:10px">
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Tabelas por modelo</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${chipsPrimeG}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${chipsBasicaG}</div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--ink3);border-radius:10px;border:1px solid var(--line);margin-bottom:14px">
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:1.5px;text-transform:uppercase">Volume total produzido</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">Produção da equipe em ${mesLabel(mesProducaoG)} · gera a comissão paga em ${mesLabel(mes)}</div>
      </div>
      <div style="font-size:22px;font-weight:800;font-family:var(--mono);color:var(--text)">${fmt(volumeTotalG)}</div>
    </div>
    </div>

    <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">

          ${producao.length > 0 ? `
          <thead>
            <tr style="background:var(--green-dim)">
              <td colspan="9" style="padding:7px 12px;font-size:10px;font-weight:700;color:var(--green);letter-spacing:1.5px;text-transform:uppercase">
                PRODUÇÃO — 1ª parcelas · ${producao.length} contrato(s)
              </td>
            </tr>
            ${thHTML}
          </thead>
          <tbody>
            ${prodRows}
            ${subtotalRow('Subtotal produção', fmt(vProd), 'var(--green)', 8)}
          </tbody>` : ''}

          ${recorrencia.length > 0 ? `
          <thead>
            <tr style="background:var(--blue-dim)">
              <td colspan="9" style="padding:7px 12px;font-size:10px;font-weight:700;color:var(--blue);letter-spacing:1.5px;text-transform:uppercase;border-top:2px solid var(--line)">
                RECORRÊNCIA · ${recorrencia.length} contrato(s)
              </td>
            </tr>
            ${thHTML}
          </thead>
          <tbody>
            ${recRows}
            ${subtotalRow('Subtotal recorrência', fmt(vRec), 'var(--blue)', 8)}
          </tbody>` : ''}

          <tbody>
            <tr style="background:var(--ink3);border-top:2px solid var(--line2)">
              <td colspan="8" style="padding:10px 12px;font-size:13px;font-weight:700;color:var(--text)">Total bruto</td>
              <td style="padding:10px 12px;font-family:var(--mono);font-size:14px;font-weight:700;color:var(--text);text-align:right">${fmt(vLiq)}</td>
            </tr>
          </tbody>

        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:var(--brand-dim);border-top:2px solid var(--brand-border)">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--brand);letter-spacing:1.5px;text-transform:uppercase">VALOR LÍQUIDO PARA NF</div>
          <div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-top:2px">Base de cálculo para emissão da nota fiscal</div>
        </div>
        <div style="font-size:24px;font-weight:800;font-family:var(--mono);color:var(--brand)">${fmt(vLiq)}</div>
      </div>
    </div>
  </div>`;

  openModal('m-demo-g');
}

/* ═══════════════════════════════════════════════════════════════════════════
   17. MÓDULO: CONFIGURAÇÕES
   ═══════════════════════════════════════════════════════════════════════════ */
async function uploadFotoPerfil(input) {
  const file = input.files?.[0];
  if (!file) return;
  const u = AppState.user;
  if (file.size > 2 * 1024 * 1024) {
    Dialog.alert('Arquivo muito grande', ['Escolha uma imagem de até 2MB.']);
    return;
  }

  const statusEl = document.getElementById('perfil-foto-status');
  if (statusEl) statusEl.textContent = 'Enviando...';

  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${u.id}.${ext}`;

    const { error: errUp } = await Supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
      cacheControl: '3600',
    });
    if (errUp) throw errUp;

    const { data: urlData } = Supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = urlData.publicUrl + '?t=' + Date.now();

    if (u.role === 'vendedor' || u.role === 'supervisor') {
      const { error: errDb } = await Supabase.from('vendedores').update({ foto_url: publicUrl }).eq('id', u.id);
      if (errDb) throw errDb;
      const vendLocal = DB.vendedores.find(v => v.id === u.id);
      if (vendLocal) vendLocal.foto = publicUrl;
    } else {
      const { error: errAuth } = await Supabase.auth.updateUser({ data: { foto_url: publicUrl } });
      if (errAuth) throw errAuth;
    }

    u.foto = publicUrl;
    if (statusEl) statusEl.textContent = 'Foto atualizada!';
    rerenderModule('configuracoes');
    buildShell();
  } catch(e) {
    console.error('Erro ao enviar foto:', e);
    if (statusEl) statusEl.textContent = '';
    Dialog.alert('Erro ao enviar foto', [
      'Não foi possível enviar a imagem.',
      'Verifique se o bucket "avatars" existe no Supabase Storage e está marcado como público.'
    ]);
  }
}

function renderConfiguracoes() {
  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isGestorPuro = u.role === 'gestor';

  if (!isGestorPuro) {
    return `
<div class="page-header">
  <div>
    <div class="page-title">Configurações</div>
    <div class="page-sub">// perfil</div>
  </div>
</div>

<div class="dashboard-grid three">
  <div class="card">
    <div class="card-header"><span class="card-title">Meu perfil</span></div>
    <div class="card-body">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        <div id="perfil-avatar" style="width:64px;height:64px;border-radius:50%;background:var(--ink3);border:1px solid var(--line2);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--text2);overflow:hidden;flex-shrink:0">
          ${u.foto ? `<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover">` : initials(u.nome)}
        </div>
        <div>
          <input type="file" id="perfil-foto-input" accept="image/*" style="display:none" onchange="uploadFotoPerfil(this)">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('perfil-foto-input').click()">Alterar foto</button>
          <div id="perfil-foto-status" style="font-size:11px;color:var(--text3);margin-top:6px"></div>
        </div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>Nome</label><input value="${u.nome || u.name || ''}" disabled></div>
        <div class="form-group"><label>E-mail</label><input value="${u.email || '—'}" disabled></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Para alterar seus dados de cadastro, fale com o gestor.</div>
    </div>
  </div>
</div>`;
  }
  return `
<div class="page-header">
  <div>
    <div class="page-title">Configurações</div>
    <div class="page-sub">// sistema · integrações · perfil</div>
  </div>
</div>

<div class="dashboard-grid three">
  <div class="card">
    <div class="card-header"><span class="card-title">Perfil do sistema</span></div>
    <div class="card-body">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--line)">
        <div id="perfil-avatar" style="width:64px;height:64px;border-radius:50%;background:var(--ink3);border:1px solid var(--line2);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--text2);overflow:hidden;flex-shrink:0">
          ${u.foto ? `<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover">` : initials(u.nome)}
        </div>
        <div>
          <div style="font-weight:600;font-size:13px;margin-bottom:2px">${u.nome}</div>
          <input type="file" id="perfil-foto-input" accept="image/*" style="display:none" onchange="uploadFotoPerfil(this)">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('perfil-foto-input').click()">Alterar foto</button>
          <div id="perfil-foto-status" style="font-size:11px;color:var(--text3);margin-top:6px"></div>
        </div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>Nome da empresa</label><input value="WCON System"></div>
        <div class="form-group"><label>CNPJ</label><input value="00.000.000/0001-00"></div>
      </div>
      <div class="form-row cols-1">
        <div class="form-group"><label>Endereço</label><input placeholder="Rua, número, cidade, estado"></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="alert('Salvo! (Conecte a um backend para persistência)')">Salvar</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><span class="card-title">Integrações</span></div>
    <div class="card-body">
      ${[
        ['Supabase (banco de dados)', '⬡', 'Configurar string de conexão para persistência de dados'],
        ['API REST própria', '◎', 'Endpoint base para integração com sistema legado'],
        ['WhatsApp Business', '◉', 'Token e número do bot para envio automático de cobranças'],
        ['Power BI', '◈', 'Workspace ID e Dataset ID para dashboards avançados'],
        ['Tráfego Pago (Meta/Google)', '▣', 'Chaves de acesso para rastreamento de leads e conversões'],
      ].map(([lbl, ic, desc]) => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">
          <span style="font-size:18px;color:var(--text3);margin-top:2px">${ic}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;margin-bottom:2px">${lbl}</div>
            <div style="font-size:11px;color:var(--text3)">${desc}</div>
          </div>
          <button class="btn btn-ghost btn-sm">Configurar</button>
        </div>`).join('')}
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><span class="card-title">Arquitetura do sistema</span></div>
  <div class="card-body">
    <div style="font-family:var(--mono);font-size:11px;color:var(--text2);line-height:2">
      <div style="color:var(--gold);font-weight:700;margin-bottom:8px">WCON System v1.0 — Estrutura de arquivos</div>
      <div>📁 wcon-system/</div>
      <div style="padding-left:20px">📄 index.html &nbsp;&nbsp;&nbsp;<span style="color:var(--text3)">// Shell HTML, modais, estrutura SPA</span></div>
      <div style="padding-left:20px">📄 style.css &nbsp;&nbsp;&nbsp;&nbsp;<span style="color:var(--text3)">// Design System, tokens, componentes</span></div>
      <div style="padding-left:20px">📄 app.js &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:var(--text3)">// Data Layer, Router, Módulos, Lógica</span></div>
      <div style="margin-top:12px;color:var(--gold);font-weight:700">Camadas preparadas para evolução</div>
      <div style="padding-left:20px;color:var(--text3)">DB.* → Substituir por Supabase / API REST</div>
      <div style="padding-left:20px;color:var(--text3)">AppState → Compatível com Redux / Pinia</div>
      <div style="padding-left:20px;color:var(--text3)">Router → Compatível com Vue Router / React Router</div>
      <div style="padding-left:20px;color:var(--text3)">Módulos → Isolados, migráveis para componentes</div>
    </div>
  </div>
</div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   18. UTILITÁRIO: RE-RENDER DE MÓDULO ATIVO
   ═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   NOVO — MÓDULO: RELATÓRIO DE TRABALHO
   Histórico completo de contratos + clientes + status de um vendedor,
   consolidado numa tela só. Gestor/Supervisor escolhem quem ver; vendedor
   comum só vê o próprio.
   ═══════════════════════════════════════════════════════════════════════════ */
function renderRelatorioTrabalho() {
  const u   = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';
  const st  = AppState.modulo.trabalho;
  const podeEscolher = isG || isSup;

  const listaEscopo = isG ? DB.vendedores : vendedoresNoEscopo(u);
  let vendId;
  if (podeEscolher) {
    if (!st.vendId || !listaEscopo.some(v => v.id === st.vendId)) {
      st.vendId = listaEscopo[0]?.id || u.id;
    }
    vendId = st.vendId;
  } else {
    vendId = u.id;
  }

  const vend = DB.vendedores.find(v => v.id === vendId);
  if (!vend) {
    return `<div class="page-header"><div><div class="page-title">Relatório de Trabalho</div></div></div>
    <div class="empty-state"><div class="empty-icon">○</div><div class="empty-title">Nenhum vendedor encontrado</div></div>`;
  }

  const seletor = podeEscolher ? renderVendorFilter(st.vendId, "AppState.modulo.trabalho.vendId", 'trabalho', listaEscopo) : '';

  const contratos = DB.vendas.filter(v => v.vendedor === vendId);
  const total        = contratos.length;
  const volumeTotal  = contratos.filter(v => v.status !== 'cancelado').reduce((a, v) => a + v.valor, 0);
  const ativos       = contratos.filter(v => v.status === 'ativo').length;
  const inadimplentes= contratos.filter(v => v.status === 'inadimplente').length;
  const cancelados   = contratos.filter(v => v.status === 'cancelado').length;
  const concluidos   = contratos.filter(v => v.status === 'concluido').length;

  const contarSit = s => contratos.filter(v => situacao(v) === s).length;
  const pills = [
    ['all','Todos', total, 'filter-pill-all'],
    ['adimplente','Adimplentes', contarSit('adimplente'), 'filter-pill-green'],
    ['atraso','Em atraso', contarSit('atraso'), 'filter-pill-amber'],
    ['critico','Críticos', contarSit('critico'), 'filter-pill-red'],
    ['concluido','Concluídos', contarSit('concluido'), 'filter-pill-blue'],
    ['cancelado','Cancelados', contarSit('cancelado'), 'filter-pill-gray'],
    ['negociacao','Em negociação', contarSit('negociacao'), 'filter-pill-blue'],
  ].map(([s,lbl,cnt,cls]) =>
    `<button class="filter-pill ${cls}${st.filterSit === s ? ' active' : ''}"
      onclick="AppState.modulo.trabalho.filterSit='${s}';rerenderModule('trabalho')">${lbl} (${cnt})</button>`
  ).join('');

  const listaFilt = st.filterSit === 'all' ? contratos : contratos.filter(v => situacao(v) === st.filterSit);
  const listaOrdenada = [...listaFilt].sort((a, b) => (b.dvenda || '').localeCompare(a.dvenda || ''));

  const rows = listaOrdenada.map(v => {
    const tab   = DB.tabelas.find(t => t.id === v.tabela);
    const sit   = situacao(v);
    const pago  = v.parcelas.filter(p => p.s === 'pago').length;
    const totalParc = v.parcelas.filter(p => p.s !== 'fora').length;
    return `<tr onclick="verVendaDetalhe('${v.id}')" style="cursor:pointer">
      <td>
        <div style="font-weight:600;font-size:13px">${v.cliente}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${v.contrato}${(v.grupo||v.cota) ? ` · G${v.grupo||'—'}/C${v.cota||'—'}` : ''}</div>
      </td>
      <td style="font-size:12px">${tab?.nome || v.tabela}</td>
      <td class="td-mono">${fmt(v.valor)}</td>
      <td class="td-mono" style="font-size:11px">${fmtDate(v.dvenda)}</td>
      <td style="font-size:11px;font-family:var(--mono)">${pago}/${totalParc}</td>
      <td>${sitBadge(sit)}</td>
    </tr>`;
  }).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">Relatório de Trabalho</div>
    <div class="page-sub">// histórico completo de contratos e clientes · ${vend.nome}</div>
  </div>
  <div class="page-actions no-print">
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 Imprimir</button>
  </div>
</div>

${seletor}

<div class="stats-grid">
  <div class="stat-card gold">
    <div class="stat-label">Volume total</div>
    <div class="stat-value">${fmt(volumeTotal)}</div>
    <div class="stat-meta">${total} contrato(s) no histórico</div>
  </div>
  <div class="stat-card green">
    <div class="stat-label">Ativos</div>
    <div class="stat-value">${ativos}</div>
  </div>
  <div class="stat-card amber">
    <div class="stat-label">Inadimplentes</div>
    <div class="stat-value">${inadimplentes}</div>
  </div>
  <div class="stat-card blue">
    <div class="stat-label">Concluídos</div>
    <div class="stat-value">${concluidos}</div>
  </div>
  <div class="stat-card red">
    <div class="stat-label">Cancelados</div>
    <div class="stat-value">${cancelados}</div>
  </div>
</div>

<div class="filter-bar">${pills}</div>

<div class="card">
  <div class="card-header">
    <span class="card-title">Todos os contratos</span>
    <span class="chip">${listaOrdenada.length} registro(s)</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Cliente / Contrato</th><th>Tabela</th><th>Valor</th><th>Data venda</th><th>Parcelas</th><th>Situação</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="td-center" style="padding:40px;color:var(--text3)">Nenhum contrato encontrado</td></tr>`}</tbody>
    </table>
  </div>
</div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FUNIL DE ATENDIMENTO
   ═══════════════════════════════════════════════════════════════════════════ */
// NOVO: retorna a unidade do usuário logado (gestor com unidadeEscopo, ou a
// unidade do próprio vendedor/supervisor) — null = gestor master, vê tudo
// NOVO: terminologia varia por unidade — Brusque chama de "Supervisor",
// Blumenau chama a mesma função (líder de equipe) de "Closer"
function termoLiderEquipe(unidade) {
  return 'Supervisor Treinee'; // Londrina é sistema único, sempre esse termo
}
function termoLiderEquipeDoVendedor(vendId) {
  const unidade = DB.vendedores.find(v => v.id === vendId)?.unidade;
  return termoLiderEquipe(unidade);
}

function unidadeEscopoAtual() {
  const u = AppState.user;
  if (!u) return null;
  // Usuário travado numa unidade (gerente de Blumenau, ou vendedor/supervisor comum)
  if (u.unidadeEscopo) return u.unidadeEscopo;
  const propriaUnidade = DB.vendedores.find(v => v.id === u.id)?.unidade;
  if (propriaUnidade) return propriaUnidade;
  // NOVO: gestor master pode escolher manualmente "ver só Brusque" ou "só
  // Blumenau" — se não escolher nada (ou escolher "Ambas"), vê tudo (null)
  return AppState.unidadeVisualizacao || null;
}

// NOVO: lista de vendedores respeitando o escopo de unidade de quem está logado
function vendedoresNaUnidade() {
  const unidade = unidadeEscopoAtual();
  return unidade ? DB.vendedores.filter(v => v.unidade === unidade) : DB.vendedores;
}

function leadsVisiveisFunil() {
  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const st = AppState.modulo.funil;

  // NOVO: escopo de unidade — gestor com unidadeEscopo (ex: Gerente de
  // Blumenau) só vê leads da unidade dele. Gestor master (sem unidadeEscopo)
  // vê tudo, de todas as unidades.
  const unidadeAtual = unidadeEscopoAtual();
  const base = unidadeAtual ? DB.leadsFunil.filter(l => l.unidade === unidadeAtual) : DB.leadsFunil;

  if (isG) {
    if (st.filtroVend === '__sem_vendedor__') return base.filter(l => !l.vendedor);
    return st.filtroVend ? base.filter(l => l.vendedor === st.filtroVend) : base;
  }
  // NOVO: supervisor/líder de equipe (ex: Paulo) vê os próprios leads +
  // os leads de quem reporta a ele (a equipe toda), não só os dele — e
  // agora também pode filtrar por uma pessoa específica da própria equipe
  if (u.role === 'supervisor') {
    const idsEquipe = DB.vendedores.filter(v => v.liderId === u.id).map(v => v.id);
    if (st.filtroVend) {
      // só deixa filtrar por si mesmo ou por quem reporta a ele — não dá
      // pra "escapar" digitando o id de outra pessoa fora da equipe
      const filtroValido = st.filtroVend === u.id || idsEquipe.includes(st.filtroVend);
      return filtroValido ? base.filter(l => l.vendedor === st.filtroVend) : [];
    }
    return base.filter(l => l.vendedor === u.id || idsEquipe.includes(l.vendedor));
  }
  return base.filter(l => l.vendedor === u.id);
}

function dataUltimaEtapaFunil(lead, etapaAlvo) {
  const evento = [...(lead.historico || [])].reverse().find(h => h.etapa === etapaAlvo);
  return evento ? evento.data : null;
}

function emEtapaOuDepoisFunil(lista, etapa) {
  const idx = FUNIL_ETAPA_ORDEM.indexOf(etapa);
  return lista.filter(l => l.etapa !== 'desqualificado' && FUNIL_ETAPA_ORDEM.indexOf(l.etapa) >= idx).length;
}

function proximoDoRodizioFunil() {
  const idx = (DB.funilRodizio.ultimoIndice + 1) % DB.vendedores.length;
  return { vendedorId: DB.vendedores[idx]?.id, idx };
}

function melhorPerformanceFunil(excluirVendId, mes) {
  const candidatos = DB.vendedores.filter(v => v.id !== excluirVendId);
  const ranking = candidatos.map(v => {
    const doVend = DB.leadsFunil.filter(l => l.vendedor === v.id && l.criadoEm && l.criadoEm.substring(0,7) === mes);
    const vendas = doVend.filter(l => l.etapa === 'venda').length;
    const conversao = doVend.length > 0 ? vendas / doVend.length : 0;
    return { id: v.id, vendas, conversao };
  });
  ranking.sort((a,b) => b.vendas - a.vendas || b.conversao - a.conversao);
  return ranking[0]?.id || DB.vendedores[0]?.id;
}

function renderFunil() {
  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';
  const st = AppState.modulo.funil;
  if (!st.mesSel) st.mesSel = todayMes();

  // NOVO: quando o gestor vê "Todos os vendedores", a meta escala pela
  // quantidade de gente na equipe (20 reuniões x 5 pessoas = 100, etc.)
  const multMeta = (isG && !st.filtroVend) ? Math.max(vendedoresNaUnidade().length, 1) : 1;
  const metaReunioes = FUNIL_META.reunioes * multMeta;
  const metaVendas = FUNIL_META.vendas * multMeta;
  const metaLigacoes = FUNIL_META.ligacoes * multMeta;
  const metaCredito = FUNIL_META.creditoProspectado * multMeta;

  const leadsVisiveis = leadsVisiveisFunil();
  const mesesDisp = Array.from(new Set([...DB.leadsFunil.map(l => (l.criadoEm||'').substring(0,7)).filter(Boolean), todayMes()])).sort();
  const ehTotal = st.mesSel === 'total';
  const leadsVisiveisMes = ehTotal ? leadsVisiveis : leadsVisiveis.filter(l => (l.criadoEm||'').substring(0,7) === st.mesSel);

  const totalReunioes = leadsVisiveis.filter(l => {
    const d = dataUltimaEtapaFunil(l, FUNIL_ETAPA_REUNIAO_META);
    return d && (ehTotal || d.substring(0,7) === st.mesSel);
  }).length;

  const vendasDoMes = leadsVisiveis.filter(l => l.etapa === 'venda' && (ehTotal || (dataUltimaEtapaFunil(l,'venda')||'').substring(0,7) === st.mesSel));
  const totalVendas = vendasDoMes.length;
  const valorVendasTotal = vendasDoMes.reduce((a,l) => a + (l.valorVenda||0), 0);

  // NOVO: ticket médio baseado no valor de crédito dos leads ATIVOS do mês
  // (atualiza desde o cadastro, não só quando a venda fecha)
  const leadsAtivosMes = leadsVisiveisMes.filter(l => l.etapa !== 'desqualificado' && (l.valorCredito||0) > 0);
  const ticketMedio = leadsAtivosMes.length > 0
    ? leadsAtivosMes.reduce((a,l) => a + l.valorCredito, 0) / leadsAtivosMes.length
    : 0;

  const leadsPago    = leadsVisiveisMes.filter(l => l.origem === 'trafego');
  const vendasPago   = leadsPago.filter(l => l.etapa === 'venda').length;
  const conversaoPagoReal = leadsPago.length > 0 ? (vendasPago/leadsPago.length)*100 : 0;

  function totalLigacoesVend(vendId) {
    const porDia = DB.funilLigacoes[vendId] || {};
    return Object.entries(porDia).filter(([d]) => ehTotal || d.substring(0,7) === st.mesSel).reduce((a,[,v]) => a+v, 0);
  }
  const totalLigacoes = isG
    ? (st.filtroVend ? totalLigacoesVend(st.filtroVend) : vendedoresNaUnidade().reduce((a,v) => a+totalLigacoesVend(v.id), 0))
    : totalLigacoesVend(u.id);

  const creditoProspectado = leadsVisiveisMes.filter(l => l.etapa !== 'desqualificado').reduce((a,l) => a+(l.valorCredito||0), 0);
  const ticketRef = ticketMedio > 0 ? ticketMedio : (FUNIL_META.ticketMin+FUNIL_META.ticketMax)/2;
  const projecaoPorVolume = creditoProspectado * 0.10;
  const vendasProjPorReuniao = totalReunioes / 5;
  const projecaoPorReuniao = vendasProjPorReuniao * ticketRef;
  const projecaoMedia = (projecaoPorVolume + projecaoPorReuniao) / 2;
  const pctProjRealizada = projecaoMedia > 0 ? Math.min((valorVendasTotal/projecaoMedia)*100, 999) : 0;

  // NOVO: funil em cascata + taxas de conversão — usa a MAIOR etapa que
  // cada lead já alcançou (não só a etapa atual), então mesmo quem depois
  // desqualificou ainda conta como "chegou até ali" no funil
  function maiorEtapaIndice(l) {
    const idxAtual = FUNIL_ETAPA_ORDEM.indexOf(l.etapa);
    const idxHist = (l.historico || []).map(h => FUNIL_ETAPA_ORDEM.indexOf(h.etapa)).filter(i => i >= 0);
    return Math.max(idxAtual, ...idxHist, -1);
  }
  const idxQualif = FUNIL_ETAPA_ORDEM.indexOf('qualificacao');
  const idxAgend  = FUNIL_ETAPA_ORDEM.indexOf('agendamento');
  const idxReuniaoFeita = FUNIL_ETAPA_ORDEM.indexOf('reuniaoFeita');
  const idxReuniao2 = FUNIL_ETAPA_ORDEM.indexOf('reuniao2');

  const leadsComEtapa = leadsVisiveisMes.map(l => ({ l, idx: maiorEtapaIndice(l) }));
  const qtdLeadsCascata = leadsComEtapa.length;
  const qtdQualifCascata = leadsComEtapa.filter(x => x.idx >= idxQualif).length;
  const qtdAgendCascata  = leadsComEtapa.filter(x => x.idx >= idxAgend).length;
  const qtdReuniaoCascata = leadsComEtapa.filter(x => x.idx >= idxReuniaoFeita).length;
  const qtdReuniao2Cascata = leadsComEtapa.filter(x => x.idx >= idxReuniao2).length;

  // NOVO: "Venda" conta pelo MÊS EM QUE FECHOU, não pelo mês em que o lead
  // entrou — por isso busca em TODOS os leads (leadsVisiveis, sem filtro de
  // criadoEm), olhando a data da etapa "venda" no histórico
  const leadsVendidosNoPeriodo = leadsVisiveis.filter(l => {
    if (!l.vendaId) return false;
    const dataFecho = dataUltimaEtapaFunil(l, 'venda');
    return dataFecho && (ehTotal || dataFecho.substring(0,7) === st.mesSel);
  });
  const qtdVendaCascata = leadsVendidosNoPeriodo.length;

  const taxaComparecimento = qtdAgendCascata > 0 ? (qtdReuniaoCascata/qtdAgendCascata)*100 : 0;
  // NOVO: taxa de fechamento agora é a partir da 2ª reunião — é o ponto a
  // partir do qual existe chance real de venda
  const taxaFechamento = qtdReuniao2Cascata > 0 ? (qtdVendaCascata/qtdReuniao2Cascata)*100 : 0;
  const conversaoGeral = qtdLeadsCascata > 0 ? (qtdVendaCascata/qtdLeadsCascata)*100 : 0;

  // NOVO: Vida útil do lead — duas métricas separadas, do cadastro até
  // fechar E do primeiro contato até fechar (pediu as duas)
  function calcularDias(campoInicio) {
    return leadsVendidosNoPeriodo.map(l => {
      const inicioStr = campoInicio === 'cadastro' ? l.criadoEm : l.primeiroContatoTs;
      if (!inicioStr) return null;
      const inicio = new Date(campoInicio === 'cadastro' ? inicioStr+'T00:00:00' : inicioStr);
      const fimStr = dataUltimaEtapaFunil(l, 'venda');
      const fim = fimStr ? new Date(fimStr+'T00:00:00') : null;
      if (!fim) return null;
      return Math.round((fim - inicio) / 86400000);
    }).filter(d => d !== null && d >= 0);
  }
  const diasDesdeCadastro = calcularDias('cadastro');
  const diasDesdeContato  = calcularDias('contato');
  const media = arr => arr.length > 0 ? Math.round(arr.reduce((a,d)=>a+d,0)/arr.length) : null;
  const vidaUtilCadastro = media(diasDesdeCadastro);
  const vidaUtilContato  = media(diasDesdeContato);
  const vidaUtilMin = diasDesdeCadastro.length > 0 ? Math.min(...diasDesdeCadastro) : null;
  const vidaUtilMax = diasDesdeCadastro.length > 0 ? Math.max(...diasDesdeCadastro) : null;

  // Distribuição por faixa (baseada no tempo desde o cadastro)
  const faixasVidaUtil = [
    ['0-7 dias', diasDesdeCadastro.filter(d => d <= 7).length],
    ['8-15 dias', diasDesdeCadastro.filter(d => d >= 8 && d <= 15).length],
    ['16-30 dias', diasDesdeCadastro.filter(d => d >= 16 && d <= 30).length],
    ['+30 dias', diasDesdeCadastro.filter(d => d > 30).length],
  ];

  const _leadsSemVendedor = DB.leadsFunil.filter(l => !l.vendedor && l.etapa !== 'venda' && l.etapa !== 'desqualificado').length;
  // NOVO: líder de equipe (Supervisor/Supervisor Treinee) também pode
  // filtrar por vendedor — mas só entre os próprios liderados + ele mesmo,
  // não o time inteiro da unidade (isso continua exclusivo do gestor)
  const equipeDoLider = isSup ? [u, ...DB.vendedores.filter(v => v.liderId === u.id)] : [];
  const vendorTabsFunil = isG ? `
  <div class="vendor-filter">
    <select class="form-input vendor-filter-select" onchange="AppState.modulo.funil.filtroVend=this.value||null;rerenderModule('funil')">
      <option value=""${!st.filtroVend ? ' selected' : ''}>Todos os vendedores</option>
      <option value="__sem_vendedor__" style="color:var(--brand);font-weight:700"${st.filtroVend==='__sem_vendedor__' ? ' selected' : ''}>⚠ Não atribuído (${_leadsSemVendedor})</option>
      ${vendedoresNaUnidade().map(v => `<option value="${v.id}"${st.filtroVend === v.id ? ' selected' : ''}>${v.nome}</option>`).join('')}
    </select>
  </div>` : isSup ? `
  <div class="vendor-filter">
    <select class="form-input vendor-filter-select" onchange="AppState.modulo.funil.filtroVend=this.value||null;rerenderModule('funil')">
      <option value=""${!st.filtroVend ? ' selected' : ''}>Toda a equipe</option>
      ${equipeDoLider.map(v => `<option value="${v.id}"${st.filtroVend === v.id ? ' selected' : ''}>${v.nome}${v.id===u.id?' (eu)':''}</option>`).join('')}
    </select>
  </div>` : '';

  // NOVO: navegador de mês das Metas ganha um botão extra "Total" (soma tudo,
  // sem filtrar por mês nenhum)
  const mesNavFunil = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
    ${renderMesNav(mesesDisp, ehTotal ? mesesDisp[mesesDisp.length-1] : st.mesSel, "AppState.modulo.funil.mesSel", 'funil')}
    <button class="btn ${ehTotal?'btn-primary':'btn-ghost'} btn-sm" onclick="AppState.modulo.funil.mesSel='total';rerenderModule('funil')">Total</button>
  </div>`;

  // NOVO: pipeline agora mostra TODOS os leads por padrão (não filtra mais
  // pelo mês das Metas) — só filtra se o usuário escolher um mês específico
  // no seletor próprio do pipeline (filtroMesPipeline)
  const leadsPipeline = st.filtroMesPipeline
    ? leadsVisiveis.filter(l => (l.criadoEm||'').substring(0,7) === st.filtroMesPipeline)
    : leadsVisiveis;

  function colunaLeads(etapaKey) {
    return leadsPipeline.filter(l => l.etapa === etapaKey).sort((a,b) => (b.criadoEm||'').localeCompare(a.criadoEm||''));
  }
  if (!st.colunasAbertas) st.colunasAbertas = {};

  // NOVO: "redistribuicao_sistema" é uma origem que só a gestão enxerga —
  // pro vendedor, aparece disfarçada como "Pessoal" (ele não sabe que
  // aquele lead já foi trabalhado por outra pessoa antes)
  function origemLabel(origem) {
    if (origem === 'redistribuicao_sistema') return isG ? 'Redistribuição Sistema' : 'Pessoal';
    if (origem === 'trafego') return 'Tráfego';
    if (origem === 'pessoal') return 'Pessoal';
    return 'Discadora/IA';
  }
  function origemCores(origem) {
    if (origem === 'redistribuicao_sistema') return isG ? { bg:'#FFF8E8', cor:'#7A4A0A' } : { bg:'#F3EEFB', cor:'#5B21B6' };
    if (origem === 'trafego') return { bg:'#E6F1FB', cor:'#0C447C' };
    if (origem === 'pessoal') return { bg:'#F3EEFB', cor:'#5B21B6' };
    return { bg:'var(--ink4)', cor:'var(--text2)' };
  }

  function montarCard(lead) {
    const idxAtual = FUNIL_ETAPA_ORDEM.indexOf(lead.etapa);
    const proxima = FUNIL_ETAPA_ORDEM[idxAtual+1];
    const origCores = origemCores(lead.origem);
    const corEtapa = FUNIL_CORES_ETAPA[lead.etapa] || { bg: 'var(--ink2)', borda: 'var(--line)' };
    const semVendedor = !lead.vendedor;
    const mesLead = (lead.criadoEm||'').substring(0,7);
    const mesLeadIdx = mesLead ? parseInt(mesLead.substring(5,7),10)-1 : null;
    const seloMes = mesLeadIdx != null ? `<span class="chip" style="background:${corEtapa.borda}22;color:${corEtapa.borda};font-size:8px;font-weight:700;flex-shrink:0">${MESES_CURTOS[mesLeadIdx].toUpperCase()}</span>` : '';
    return `<div style="background:#fff;border-radius:8px;padding:10px;margin-bottom:8px;cursor:pointer;border-left:4px solid ${corEtapa.borda};box-shadow:0 1px 3px rgba(0,0,0,0.06)" onclick="verDetalheLeadFunil('${lead.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:2px">
        <div style="font-size:13px;font-weight:700;color:#1A1D24">${lead.nome}</div>
        ${seloMes}
      </div>
      ${semVendedor
        ? `<div style="display:inline-flex;align-items:center;gap:4px;background:var(--red-dim);color:var(--brand);font-size:9px;font-weight:700;padding:3px 8px;border-radius:5px;margin-bottom:6px">⚠ Não atribuído</div>`
        : (isG && !st.filtroVend ? `<div style="font-size:10px;color:var(--text3);margin-bottom:6px">${DB.vendedores.find(v=>v.id===lead.vendedor)?.nome || '—'}</div>` : '')}
      <span class="chip" style="background:${origCores.bg};color:${origCores.cor};font-size:9px">${origemLabel(lead.origem)}</span>
      ${lead.valorCredito ? `<div style="font-size:16px;font-weight:800;font-family:var(--mono);color:#1A1D24;margin-top:8px">${fmt(lead.valorCredito)}</div>` : ''}
      ${lead.etapa === 'venda' ? `<div style="font-size:15px;font-weight:800;font-family:var(--mono);color:#27500A;margin-top:6px">${fmt(lead.valorVenda)}</div>` : ''}
      ${lead.etapa === 'contato' ? `<div onclick="event.stopPropagation()" style="display:flex;align-items:center;justify-content:space-between;margin-top:9px;padding-top:9px;border-top:1px solid #F0F2F5;gap:4px">
        <span style="font-size:11px;font-family:var(--mono);font-weight:700;color:${(lead.tentativas||0)>=6?'var(--brand)':'#9CA3AF'}">${lead.tentativas||0}/6 tentativas</span>
        <button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px" onclick="incrementarTentativaFunil('${lead.id}')">+1</button>
      </div>` : ''}
      ${semVendedor
        ? `<div onclick="event.stopPropagation()" style="margin-top:9px"><button class="btn btn-primary btn-sm" style="width:100%;font-size:11px;padding:6px" onclick="abrirRedistribuirLeadFunil('${lead.id}')">Atribuir a um vendedor</button></div>`
        : (lead.etapa === 'reuniao1' || lead.etapa === 'reuniao2')
          ? `<div onclick="event.stopPropagation()" style="margin-top:9px;padding-top:9px;border-top:1px solid #F0F2F5;display:flex;justify-content:space-between;align-items:center;gap:4px">
              <span style="font-size:10px;color:#9CA3AF">Marcar na Agenda ↗</span>
              <button class="btn btn-ghost btn-sm" style="color:var(--brand);font-size:11px;padding:3px 8px" onclick="marcarPerdidoFunil('${lead.id}')">✕</button>
            </div>`
          : (proxima ? `<div onclick="event.stopPropagation()" style="display:flex;gap:5px;margin-top:9px">
        <button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px;padding:6px" onclick="moverEtapaFunil('${lead.id}','${proxima}')">→ ${FUNIL_ETAPAS.find(e=>e.key===proxima)?.label}</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--brand);font-size:11px;padding:6px 9px" onclick="marcarPerdidoFunil('${lead.id}')">✕</button>
      </div>` : '')}
    </div>`;
  }

  function montarColuna(etapaKey, label, leads) {
    const corEtapa = FUNIL_CORES_ETAPA[etapaKey] || { bg: 'var(--ink3)', borda: 'var(--line)' };
    const valorTotal = etapaKey === 'venda'
      ? leads.reduce((a,l) => a + (l.valorVenda||0), 0)
      : leads.reduce((a,l) => a + (l.valorCredito||0), 0);

    if (leads.length === 0) {
      const aberta = !!st.colunasAbertas[etapaKey];
      if (!aberta) {
        return `<div onclick="AppState.modulo.funil.colunasAbertas['${etapaKey}']=true;rerenderModule('funil')" style="background:var(--ink4);border:1px dashed var(--line2);border-radius:8px;padding:8px 4px;min-width:34px;max-width:34px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;cursor:pointer" title="${label} · 0 leads — clique pra abrir">
          <div style="font-size:9px;font-weight:700;color:var(--text3);writing-mode:vertical-rl;text-orientation:mixed;margin-top:6px;white-space:nowrap">${label}</div>
          <div style="font-size:9px;color:var(--text3);margin-top:6px;font-family:var(--mono)">0</div>
        </div>`;
      }
    }

    return `<div style="background:${corEtapa.bg};border:1px solid ${corEtapa.borda}40;border-radius:10px;padding:10px;min-width:190px;flex-shrink:0">
      <div onclick="${leads.length===0 ? `AppState.modulo.funil.colunasAbertas['${etapaKey}']=false;rerenderModule('funil')` : ''}" style="background:#fff;border-bottom:3px solid ${corEtapa.borda};border-radius:8px 8px 0 0;padding:12px 14px;margin:-10px -10px 10px;${leads.length===0?'cursor:pointer':''}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase">${label}</span>
          <span style="font-size:11px;font-weight:700;color:${corEtapa.borda};font-family:var(--mono)">${leads.length} lead${leads.length===1?'':'s'}</span>
        </div>
        <div style="font-size:17px;font-weight:800;font-family:var(--mono);color:#1A1D24;margin-top:4px">${fmt(valorTotal)}</div>
      </div>
      ${leads.map(montarCard).join('') || '<div style="font-size:11px;color:var(--text3);text-align:center;padding:10px 0">—</div>'}
    </div>`;
  }

  const pipelineHtml = FUNIL_ETAPAS.map(et => montarColuna(et.key, et.label, colunaLeads(et.key))).join('')
    + montarColuna('desqualificado', 'Desqualificado', colunaLeads('desqualificado'));

  return `
<div class="page-header">
  <div>
    <div class="page-title">Funil de Atendimento</div>
    <div class="page-sub">// pipeline de leads · ${mesLabel(st.mesSel)}</div>
  </div>
  <div class="page-actions">
    ${isG ? `<button class="btn btn-ghost btn-sm" onclick="abrirImportarLeads()">📤 Importar leads</button>` : ''}
    <button class="btn btn-primary btn-sm" onclick="abrirModalNovoLeadFunil()">+ Novo Lead</button>
  </div>
</div>

${vendorTabsFunil}
${mesNavFunil}

${!isG ? `
<div class="card">
  <div style="display:flex;gap:10px;align-items:flex-end;padding:14px 16px;flex-wrap:wrap">
    <div class="form-group" style="flex:1;min-width:180px;margin-bottom:0">
      <label>Ligações realizadas hoje (${fmtDate(today())})</label>
      <input type="number" min="0" id="funil-ligacoes-input" placeholder="Ex: 8">
    </div>
    <button class="btn btn-ghost btn-sm" onclick="salvarLigacoesFunil()">+ Adicionar</button>
    <div style="font-size:11px;color:var(--text3)">Total hoje: <strong style="color:var(--text);font-family:var(--mono)">${(DB.funilLigacoes[u.id]||{})[today()]||0}</strong></div>
  </div>
</div>` : ''}

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px">
  <div class="card" style="margin-bottom:0">
    <div class="card-body">
      <div class="stat-label">Reuniões · Vendas (mês)</div>
      <div style="display:flex;gap:20px;margin-top:6px">
        <div>
          <div style="font-size:17px;font-weight:800;font-family:var(--mono)">${totalReunioes}<span style="font-size:11px;color:var(--text3)">/${metaReunioes}</span></div>
          <div class="progress-wrap" style="margin-top:4px;width:70px"><div class="progress-bar" style="width:${Math.min(totalReunioes/metaReunioes*100,100)}%;background:#EF9F27"></div></div>
        </div>
        <div>
          <div style="font-size:17px;font-weight:800;font-family:var(--mono)">${totalVendas}<span style="font-size:11px;color:var(--text3)">/${metaVendas}</span></div>
          <div class="progress-wrap" style="margin-top:4px;width:70px"><div class="progress-bar" style="width:${Math.min(totalVendas/metaVendas*100,100)}%;background:var(--brand)"></div></div>
        </div>
      </div>
      ${isG ? `<div style="margin-top:8px"><button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 8px" onclick="abrirEditarLigacoesFunil()">✏️ Corrigir registros de ligação</button></div>` : ''}
    </div>
  </div>
  <div class="card" style="margin-bottom:0">
    <div class="card-body">
      <div class="stat-label">Ticket médio</div>
      <div style="font-size:17px;font-weight:800;font-family:var(--mono);margin-top:6px">${fmt(ticketMedio)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">${leadsAtivosMes.length} lead(s) ativo(s)</div>
    </div>
  </div>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px">
  <div class="card" style="margin-bottom:0">
    <div class="card-body">
      <div class="stat-label">Conversão geral</div>
      <div style="font-size:20px;font-weight:800;font-family:var(--mono);margin-top:6px">${conversaoGeral.toFixed(1)}%</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">lead → venda</div>
    </div>
  </div>
  <div class="card" style="margin-bottom:0;${taxaComparecimento < 70 && qtdAgendCascata > 0 ? 'border:1px solid var(--brand)' : ''}">
    <div class="card-body">
      <div class="stat-label" style="${taxaComparecimento < 70 && qtdAgendCascata > 0 ? 'color:var(--brand)' : ''}">Taxa de comparecimento</div>
      <div style="font-size:20px;font-weight:800;font-family:var(--mono);margin-top:6px;${taxaComparecimento < 70 && qtdAgendCascata > 0 ? 'color:var(--brand)' : ''}">${taxaComparecimento.toFixed(0)}%</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">agendou → compareceu</div>
    </div>
  </div>
  <div class="card" style="margin-bottom:0">
    <div class="card-body">
      <div class="stat-label">Taxa de fechamento</div>
      <div style="font-size:20px;font-weight:800;font-family:var(--mono);margin-top:6px">${taxaFechamento.toFixed(0)}%</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">2ª reunião → venda (com pagamento)</div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-body">
    <div class="stat-label" style="margin-bottom:12px">Funil em cascata — onde está o gargalo</div>
    ${(() => {
      const etapasCascata = [
        ['Leads', qtdLeadsCascata, '#0C447C'],
        ['Qualific.', qtdQualifCascata, '#0C447C'],
        ['Agendado', qtdAgendCascata, '#EF9F27'],
        ['Reunião', qtdReuniaoCascata, '#EF9F27'],
        ['2ª Reunião', qtdReuniao2Cascata, '#C8392B'],
        ['Venda', qtdVendaCascata, '#639922'],
      ];
      const maxQtd = Math.max(qtdLeadsCascata, 1);
      return etapasCascata.map(([label, qtd, cor], i) => {
        const larguraPct = Math.max((qtd/maxQtd)*100, qtd > 0 ? 6 : 2);
        const anterior = i > 0 ? etapasCascata[i-1][1] : null;
        const queda = anterior && anterior > 0 ? Math.round((1 - qtd/anterior)*100) : null;
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <div style="width:64px;font-size:10px;color:var(--text3);flex-shrink:0">${label}</div>
          <div style="background:${cor};height:22px;border-radius:4px;width:${larguraPct}%;display:flex;align-items:center;padding-left:8px;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;min-width:34px">
            ${qtd}${queda != null && queda > 25 ? `<span style="opacity:0.75;margin-left:6px;font-weight:500">← queda de ${queda}%</span>` : ''}
          </div>
        </div>`;
      }).join('');
    })()}
  </div>
</div>

<div class="card">
  <div class="card-body">
    <div class="stat-label" style="margin-bottom:12px">Vida útil do lead — tempo até fechar</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px">
      <div style="background:var(--ink3);border-radius:10px;padding:12px">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase">Do cadastro até fechar</div>
        <div style="font-size:20px;font-weight:800;font-family:var(--mono);margin-top:4px">${vidaUtilCadastro != null ? vidaUtilCadastro+' dias' : '—'}</div>
      </div>
      <div style="background:var(--ink3);border-radius:10px;padding:12px">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase">Do 1º contato até fechar</div>
        <div style="font-size:20px;font-weight:800;font-family:var(--mono);margin-top:4px">${vidaUtilContato != null ? vidaUtilContato+' dias' : '—'}</div>
      </div>
      <div style="background:var(--ink3);border-radius:10px;padding:12px">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase">Mais rápido · Mais lento</div>
        <div style="font-size:14px;font-weight:700;margin-top:6px">${vidaUtilMin != null ? vidaUtilMin+'d' : '—'} <span style="color:var(--text3);font-weight:400">·</span> ${vidaUtilMax != null ? vidaUtilMax+'d' : '—'}</div>
      </div>
    </div>
    ${qtdVendaCascata > 0 ? `
    <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-bottom:8px">Distribuição por faixa de tempo (desde o cadastro)</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${(() => {
        const maxFaixa = Math.max(...faixasVidaUtil.map(f => f[1]), 1);
        const coresFaixa = ['#639922','#639922','#EF9F27','#C8392B'];
        return faixasVidaUtil.map(([label, qtd], i) => {
          const larguraPct = Math.max((qtd/maxFaixa)*100, qtd > 0 ? 8 : 2);
          return `<div style="display:flex;align-items:center;gap:8px">
            <div style="width:70px;font-size:10px;color:var(--text3);flex-shrink:0">${label}</div>
            <div style="background:${coresFaixa[i]};height:18px;border-radius:4px;width:${larguraPct}%;display:flex;align-items:center;padding-left:6px;color:#fff;font-size:10px;font-weight:700;min-width:22px">${qtd}</div>
          </div>`;
        }).join('');
      })()}
    </div>` : `<div style="font-size:11px;color:var(--text3)">Sem vendas fechadas nesse período ainda</div>`}
  </div>
</div>

<div class="card" style="background:#EAF3DE;border:1px solid #97C459">
  <div class="card-body">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:6px">
      <div class="form-divider" style="color:#27500A;margin-bottom:0">Projeção de fechamento</div>
      <div style="font-size:10px;color:#3B6D11">10% do prospectado + 1 venda a cada 5 reuniões</div>
    </div>
    <div style="display:flex;align-items:baseline;gap:24px;flex-wrap:wrap">
      <div><span style="font-size:24px;font-weight:800;font-family:var(--mono);color:#173404">${fmt(projecaoMedia)}</span><span style="font-size:11px;color:#3B6D11;margin-left:6px">projeção combinada</span></div>
      <div style="height:26px;width:1px;background:#97C45970"></div>
      <div><span style="font-size:14px;font-weight:700;font-family:var(--mono);color:#3B6D11">${fmt(valorVendasTotal)}</span><span style="font-size:11px;color:#3B6D11;margin-left:6px">já fechado (${pctProjRealizada.toFixed(0)}%)</span></div>
    </div>
  </div>
</div>

<div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 10px;gap:10px;flex-wrap:wrap">
  <div class="form-divider" style="margin-bottom:0">Pipeline</div>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <div style="font-size:11px;color:var(--text3)">${leadsPipeline.filter(l=>l.etapa!=='desqualificado').length} lead(s) ativo(s) · ${fmt(leadsPipeline.filter(l=>l.etapa!=='desqualificado').reduce((a,l)=>a+(l.valorCredito||0),0))} em negociação</div>
    <select class="form-input" style="width:auto;height:30px;padding:0 8px;font-size:11px" onchange="AppState.modulo.funil.filtroMesPipeline=this.value||null;rerenderModule('funil')">
      <option value=""${!st.filtroMesPipeline ? ' selected' : ''}>Todos os meses</option>
      ${mesesDisp.map(m => `<option value="${m}"${st.filtroMesPipeline===m?' selected':''}>${mesLabel(m)}</option>`).join('')}
    </select>
    <div style="display:flex;gap:4px;background:var(--ink2);border:1px solid var(--line);border-radius:8px;padding:3px">
      <div onclick="rolarPipelineFunil(-1)" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:var(--text);font-size:14px;font-weight:700;border-radius:6px;cursor:pointer">‹</div>
      <div onclick="rolarPipelineFunil(1)" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:var(--text);font-size:14px;font-weight:700;border-radius:6px;cursor:pointer">›</div>
    </div>
  </div>
</div>
<div style="background:var(--ink3);border-radius:6px;height:4px;margin-bottom:10px;overflow:hidden">
  <div id="pipeline-scroll-bar" style="background:var(--brand);height:100%;width:20%;border-radius:6px;transition:width .1s"></div>
</div>
<div id="pipeline-scroll-container" onscroll="atualizarBarraPipelineFunil()" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px">${pipelineHtml}</div>


${renderModaisFunil()}
`;
}

function rolarPipelineFunil(direcao) {
  const el = document.getElementById('pipeline-scroll-container');
  if (!el) return;
  el.scrollBy({ left: direcao * 300, behavior: 'smooth' });
}

function atualizarBarraPipelineFunil() {
  const el = document.getElementById('pipeline-scroll-container');
  const barra = document.getElementById('pipeline-scroll-bar');
  if (!el || !barra) return;
  const maxScroll = el.scrollWidth - el.clientWidth;
  const pct = maxScroll > 0 ? (el.scrollLeft / maxScroll) * 100 : 0;
  const larguraVisivel = Math.max((el.clientWidth / el.scrollWidth) * 100, 8);
  barra.style.width = larguraVisivel + '%';
  barra.style.marginLeft = (pct * (100 - larguraVisivel) / 100) + '%';
}

function toggleFunilDetalhe(idBase) {
  const detalhe = document.getElementById(idBase + '-detalhe');
  const seta = document.getElementById(idBase + '-seta');
  if (!detalhe || !seta) return;
  const aberto = detalhe.style.display === 'block';
  detalhe.style.display = aberto ? 'none' : 'block';
  seta.textContent = aberto ? '▾' : '▴';
  seta.style.background = aberto ? '#fff' : '#1A1D24';
  seta.style.color = aberto ? '#6B7280' : '#fff';
  seta.style.borderColor = aberto ? '#E8EAF0' : '#1A1D24';
}

function renderPainelExecutivoFunil() {
  const leads = leadsFunilDaUnidade();
  const hojeStr = today();
  const mesAtualStr = todayMes();

  function dataUltimaEtapa(lead, etapaAlvo) {
    const evento = [...(lead.historico||[])].reverse().find(h => h.etapa === etapaAlvo);
    return evento ? evento.data : null;
  }
  function diasDesde(dataStr) {
    const d1 = new Date(dataStr + 'T00:00:00');
    const d2 = new Date(hojeStr + 'T00:00:00');
    return Math.round((d2 - d1) / 86400000);
  }
  function inicioSemana() {
    const d = new Date(hojeStr + 'T00:00:00');
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  }

  const leadsAtivos = leads.filter(l => l.etapa !== 'venda' && l.etapa !== 'desqualificado');
  const leadsGeradosHoje = leads.filter(l => l.criadoEm === hojeStr).length;
  const leadsAguardandoContato = leads.filter(l => l.etapa === 'lead').length;
  const leadsParados3dias = leadsAtivos.filter(l => {
    const ultimaData = l.historico && l.historico.length ? l.historico[l.historico.length-1].data : null;
    return ultimaData && diasDesde(ultimaData) > 3;
  });
  const reunioesEmAndamento = leads.filter(l => l.etapa === 'reuniao1' || l.etapa === 'reuniao2').length;

  const valorEmNegociacao = leadsAtivos
    .filter(l => ['reuniao2','analisando','aguardPagamento'].includes(l.etapa))
    .reduce((a,l) => a + (l.valorCredito||0), 0);

  const semanaInicioStr = inicioSemana();
  const volumeVendidoHoje = leads.filter(l => dataUltimaEtapa(l,'venda') === hojeStr).reduce((a,l) => a+(l.valorVenda||0), 0);
  const volumeVendidoSemana = leads.filter(l => { const d = dataUltimaEtapa(l,'venda'); return d && d >= semanaInicioStr; }).reduce((a,l) => a+(l.valorVenda||0), 0);
  const volumeVendidoMes = leads.filter(l => { const d = dataUltimaEtapa(l,'venda'); return d && d.substring(0,7) === mesAtualStr; }).reduce((a,l) => a+(l.valorVenda||0), 0);

  const totalVendasMes = leads.filter(l => { const d = dataUltimaEtapa(l,'venda'); return d && d.substring(0,7) === mesAtualStr; }).length;
  const metaVendasEquipe = FUNIL_META.vendas * Math.max(vendedoresNaUnidade().length, 1);
  const metaAtingidaPct = Math.min((totalVendasMes/metaVendasEquipe)*100, 999);

  const funilCaptacao = ['lead','contato','qualificacao','agendamento','reuniao1'].map(k => ({
    key: k, label: FUNIL_ETAPAS.find(e => e.key === k).label, qtd: emEtapaOuDepoisFunil(leads, k),
  }));
  const funilFechamento = ['reuniao2','analisando','aguardPagamento','venda'].map(k => ({
    key: k, label: FUNIL_ETAPAS.find(e => e.key === k).label, qtd: emEtapaOuDepoisFunil(leads, k),
  }));

  // NOVO: Diagnóstico do funil — acha a etapa com PIOR conversão (gargalo) e a
  // com MELHOR conversão (ponto forte), olhando as transições dos dois funis
  function transicoesDoFunil(etapas, nomeFunil) {
    const trans = [];
    for (let i = 1; i < etapas.length; i++) {
      if (etapas[i-1].qtd > 0) {
        trans.push({
          de: etapas[i-1].label, para: etapas[i].label, funil: nomeFunil,
          pct: Math.round((etapas[i].qtd/etapas[i-1].qtd)*100),
          qtdDe: etapas[i-1].qtd, qtdPara: etapas[i].qtd,
        });
      }
    }
    return trans;
  }
  const todasTransicoes = [...transicoesDoFunil(funilCaptacao, 'Captação'), ...transicoesDoFunil(funilFechamento, 'Fechamento')];
  const gargalo = todasTransicoes.length > 0 ? todasTransicoes.reduce((pior, t) => t.pct < pior.pct ? t : pior) : null;
  const pontoForte = todasTransicoes.length > 0 ? todasTransicoes.reduce((melhor, t) => t.pct > melhor.pct ? t : melhor) : null;

  function montarFunilHtml(etapas, corBase, idFunil) {
    const topo = Math.max(etapas[0].qtd, 1);
    const cores = corBase === 'azul'
      ? ['#378ADD','#185FA5','#0C447C','#042C53']
      : ['#97C459','#639922','#3B6D11','#27500A'];
    const textoClaro = corBase === 'azul' ? '#E6F1FB' : '#EAF3DE';
    return etapas.map((et, i) => {
      const largura = Math.max(Math.round((et.qtd/topo)*260), 48);
      const anterior = i > 0 ? etapas[i-1].qtd : null;
      const pctAnterior = anterior && anterior > 0 ? Math.round((et.qtd/anterior)*100) : null;
      const pctTopo = Math.round((et.qtd/topo)*100);
      const ultimo = i === etapas.length-1;
      const clip = ultimo ? '' : `clip-path:polygon(0 0,100% 0,${94-i*2}% 100%,${6+i*2}% 100%);`;
      const radius = ultimo ? 'border-radius:0 0 6px 6px;' : '';
      const idBase = `funil-${idFunil}-${i}`;
      const corPct = pctAnterior === null ? '#6B7280' : pctAnterior >= 70 ? '#639922' : pctAnterior >= 40 ? '#BA7517' : '#C8392B';
      return `
        <div style="width:${largura}px;${clip}${radius}background:${cores[i]};padding:10px 4px;text-align:center;margin:0 auto;overflow:hidden">
          <div style="font-size:8px;color:${textoClaro};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${et.label}</div>
          <div style="font-size:18px;font-weight:700;font-family:'DM Mono',monospace;color:#fff">${et.qtd}</div>
        </div>
        ${!ultimo ? `
        <div id="${idBase}-seta" onclick="toggleFunilDetalhe('${idBase}')" style="width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid #E8EAF0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#6B7280;margin:2px auto;cursor:pointer;user-select:none">▾</div>
        <div id="${idBase}-detalhe" style="display:none;gap:6px;margin:4px auto 6px;background:#fff;border:1px solid #E8EAF0;border-radius:6px;padding:8px 10px;width:160px">
          <div style="display:flex;gap:6px">
            <div style="text-align:center;flex:1;border-right:1px solid #E8EAF0;padding-right:6px">
              <div style="font-size:14px;font-weight:800;font-family:'DM Mono',monospace;color:${corPct}">${pctAnterior!==null ? pctAnterior+'%' : '—'}</div>
              <div style="font-size:7px;color:#6B7280;text-transform:uppercase;letter-spacing:0.3px;margin-top:1px">da etapa<br>anterior</div>
            </div>
            <div style="text-align:center;flex:1;padding-left:2px">
              <div style="font-size:14px;font-weight:800;font-family:'DM Mono',monospace;color:#1A1D24">${pctTopo}%</div>
              <div style="font-size:7px;color:#6B7280;text-transform:uppercase;letter-spacing:0.3px;margin-top:1px">desde a<br>entrada</div>
            </div>
          </div>
        </div>` : ''}
      `;
    }).join('');
  }

  // Tempo pro 1º contato
  const leadsComTempoResposta = leads.filter(l => l.criadoEmTs && l.primeiroContatoTs);
  const temposResposta = leadsComTempoResposta.map(l => (new Date(l.primeiroContatoTs) - new Date(l.criadoEmTs)) / 60000);
  const buckets = {
    ate15min: temposResposta.filter(m => m <= 15).length,
    ate1h:    temposResposta.filter(m => m > 15 && m <= 60).length,
    ate24h:   temposResposta.filter(m => m > 60 && m <= 1440).length,
    mais24h:  temposResposta.filter(m => m > 1440).length,
  };
  const tempoMedio = temposResposta.length > 0 ? temposResposta.reduce((a,m)=>a+m,0)/temposResposta.length : null;
  function formatarMinutos(min) {
    if (min == null) return '—';
    if (min < 60) return `${min.toFixed(0)} min`;
    if (min < 1440) return `${(min/60).toFixed(1)} h`;
    return `${(min/1440).toFixed(1)} dias`;
  }
  const leadsEsperando = leads.filter(l => l.etapa === 'lead' && l.criadoEmTs)
    .map(l => ({ ...l, minutosEsperando: (new Date() - new Date(l.criadoEmTs))/60000 }));

  return `
<div class="page-header">
  <div>
    <div class="page-title">Painel Executivo</div>
    <div class="page-sub">// foto em tempo real da equipe toda — Funil de Atendimento</div>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Leads gerados hoje</div>
    <div class="stat-value">${leadsGeradosHoje}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Aguard. 1º contato</div>
    <div class="stat-value">${leadsAguardandoContato}</div>
  </div>
  <div class="stat-card ${leadsParados3dias.length>0?'red':''}">
    <div class="stat-label">Parados +3 dias</div>
    <div class="stat-value">${leadsParados3dias.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Reuniões em andamento</div>
    <div class="stat-value">${reunioesEmAndamento}</div>
  </div>
</div>

${leadsParados3dias.length > 0 ? `
<div class="card" style="background:var(--red-dim);border:1px solid var(--brand-border)">
  <div class="card-body">
    <div style="font-size:11px;color:var(--brand);margin-bottom:8px;font-weight:600">⚠ ${leadsParados3dias.length} lead(s) parado(s) +3 dias — considere redistribuir</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${leadsParados3dias.map(l => {
        const vend = DB.vendedores.find(v => v.id === l.vendedor);
        return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--ink2);border-radius:6px;padding:6px 10px">
          <span style="font-size:12px">${l.nome} <span style="color:var(--text3)">(${vend?.nome||'—'})</span></span>
          <button class="btn btn-ghost btn-sm" onclick="abrirRedistribuirLeadFunil('${l.id}')">Redistribuir agora</button>
        </div>`;
      }).join('')}
    </div>
  </div>
</div>` : ''}

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Valor em negociação</div>
    <div class="stat-value" style="font-size:15px">${fmt(valorEmNegociacao)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Vendido hoje</div>
    <div class="stat-value" style="font-size:15px">${fmt(volumeVendidoHoje)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Vendido na semana</div>
    <div class="stat-value" style="font-size:15px">${fmt(volumeVendidoSemana)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Vendido no mês</div>
    <div class="stat-value" style="font-size:15px">${fmt(volumeVendidoMes)}</div>
  </div>
</div>

<div class="card">
  <div class="card-body">
    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">
      <span style="color:var(--text2)">Meta do mês atingida</span>
      <span style="font-family:var(--mono)">${totalVendasMes}/${metaVendasEquipe} · ${metaAtingidaPct.toFixed(0)}%</span>
    </div>
    <div class="progress-wrap"><div class="progress-bar" style="width:${Math.min(metaAtingidaPct,100)}%;background:${metaAtingidaPct>=100?'var(--green)':'var(--brand)'}"></div></div>
  </div>
</div>

<div class="card">
  <div class="card-body">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
      <div class="form-divider" style="margin:0">Tempo pro 1º contato</div>
      <div style="font-size:10px;color:var(--text3)">Menor tempo, maior conversão</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px">
      <div style="background:var(--ink3);border-radius:6px;padding:8px;text-align:center">
        <div style="font-size:15px;font-weight:600;font-family:var(--mono);color:var(--green)">${buckets.ate15min}</div>
        <div style="font-size:8px;color:var(--text3);margin-top:2px">até 15min</div>
      </div>
      <div style="background:var(--ink3);border-radius:6px;padding:8px;text-align:center">
        <div style="font-size:15px;font-weight:600;font-family:var(--mono)">${buckets.ate1h}</div>
        <div style="font-size:8px;color:var(--text3);margin-top:2px">até 1h</div>
      </div>
      <div style="background:var(--ink3);border-radius:6px;padding:8px;text-align:center">
        <div style="font-size:15px;font-weight:600;font-family:var(--mono)">${buckets.ate24h}</div>
        <div style="font-size:8px;color:var(--text3);margin-top:2px">até 24h</div>
      </div>
      <div style="background:var(--ink3);border-radius:6px;padding:8px;text-align:center">
        <div style="font-size:15px;font-weight:600;font-family:var(--mono);color:var(--brand)">${buckets.mais24h}</div>
        <div style="font-size:8px;color:var(--text3);margin-top:2px">+24h</div>
      </div>
    </div>
    <div style="font-size:10px;color:var(--text3)">Média da equipe: <strong style="color:var(--text);font-family:var(--mono)">${formatarMinutos(tempoMedio)}</strong></div>
    ${leadsEsperando.length>0 ? `<div style="margin-top:8px;font-size:10px;color:var(--brand)">${leadsEsperando.length} lead(s) aguardando 1º contato agora — o mais antigo espera há ${formatarMinutos(Math.max(...leadsEsperando.map(l=>l.minutosEsperando)))}</div>` : ''}
  </div>
</div>

<div class="card">
  <div class="card-body">
    <div class="form-divider">Conversão do funil (leads ativos, contagem acumulada por etapa)</div>
    <div style="font-size:9px;color:#9CA3AF;margin-bottom:10px">Clique na seta ▾ entre as etapas pra ver o percentual de conversão</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;padding:8px 0">
      <div style="flex:1;min-width:220px;max-width:280px">
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px;text-align:center">Funil de captação</div>
        ${montarFunilHtml(funilCaptacao, 'azul', 'captacao')}
      </div>
      <div style="flex:1;min-width:220px;max-width:280px">
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px;text-align:center">Funil de fechamento</div>
        ${montarFunilHtml(funilFechamento, 'verde', 'fechamento')}
      </div>
    </div>
  </div>
</div>

${gargalo && pontoForte ? `
<div class="card">
  <div class="card-body">
    <div class="form-divider">Diagnóstico do funil</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
      <div style="background:#FCEBEB;border:1px solid #E24B4A;border-radius:8px;padding:14px">
        <div style="font-size:9px;font-weight:700;color:#C8392B;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">⚠ Gargalo — pior conversão</div>
        <div style="font-size:13px;color:#1A1D24;margin-bottom:4px"><strong>${gargalo.funil}:</strong> ${gargalo.de} → ${gargalo.para}</div>
        <div style="font-size:20px;font-weight:800;font-family:'DM Mono',monospace;color:#C8392B">${gargalo.pct}%</div>
        <div style="font-size:10px;color:#9CA3AF;margin-top:2px">${gargalo.qtdPara} de ${gargalo.qtdDe} avançaram — é aqui que mais se perde lead</div>
      </div>
      <div style="background:#EAF3DE;border:1px solid #639922;border-radius:8px;padding:14px">
        <div style="font-size:9px;font-weight:700;color:#639922;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">✓ Ponto forte — melhor conversão</div>
        <div style="font-size:13px;color:#1A1D24;margin-bottom:4px"><strong>${pontoForte.funil}:</strong> ${pontoForte.de} → ${pontoForte.para}</div>
        <div style="font-size:20px;font-weight:800;font-family:'DM Mono',monospace;color:#639922">${pontoForte.pct}%</div>
        <div style="font-size:10px;color:#9CA3AF;margin-top:2px">${pontoForte.qtdPara} de ${pontoForte.qtdDe} avançaram — etapa mais eficiente do funil</div>
      </div>
    </div>
  </div>
</div>` : ''}
`;
}

// NOVO: leads do funil já filtrados pela unidade em foco — usado nas telas
// exclusivas de gestor (Agenda, Painel Executivo, Painel de Leads) que não
// usam o filtro de vendedor do módulo Funil, só a unidade
function leadsFunilDaUnidade() {
  const unidade = unidadeEscopoAtual();
  return unidade ? DB.leadsFunil.filter(l => l.unidade === unidade) : DB.leadsFunil;
}

function agendaOrdenadaFunil() {
  const lista = [];
  leadsFunilDaUnidade().forEach(l => {
    const vend = DB.vendedores.find(v => v.id === l.vendedor);
    if (l.dataReuniao1) lista.push({ leadId: l.id, tipoKey: 'reuniao1', tipo: '1ª Reunião', nome: l.nome, vendedor: vend?.nome || '—', data: l.dataReuniao1, hora: l.horaReuniao1 || '--:--', requerGestor: !!l.requerGestorReuniao1, requerSupervisor: !!l.requerSupervisorReuniao1, status: l.statusReuniao1 || null });
    if (l.dataReuniao2) lista.push({ leadId: l.id, tipoKey: 'reuniao2', tipo: '2ª Reunião', nome: l.nome, vendedor: vend?.nome || '—', data: l.dataReuniao2, hora: l.horaReuniao2 || '--:--', requerGestor: !!l.requerGestorReuniao2, requerSupervisor: !!l.requerSupervisorReuniao2, status: l.statusReuniao2 || null });
  });
  lista.sort((a,b) => (a.data+a.hora).localeCompare(b.data+b.hora));
  return lista;
}

function montarGridCalendarioFunil(mesKeyCal) {
  const [ano, mes] = mesKeyCal.split('-').map(Number);
  const primeiroDia = new Date(ano, mes-1, 1);
  const offsetInicial = primeiroDia.getDay();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const celulas = [];
  for (let i=0; i<offsetInicial; i++) celulas.push(null);
  for (let d=1; d<=diasNoMes; d++) celulas.push(`${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  while (celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

function renderAgendaFunil() {
  const st = AppState.modulo.agendaFunil;
  if (!st.mesCalendario) st.mesCalendario = todayMes();
  const eventos = agendaOrdenadaFunil();
  const grid = montarGridCalendarioFunil(st.mesCalendario);
  const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const hojeStr = today();
  const CORES = { '1ª Reunião': { bg:'#E6F1FB', cor:'#0C447C' }, '2ª Reunião': { bg:'#EEEDFE', cor:'#26215C' } };

  const celulasHtml = grid.map(dataStr => {
    if (!dataStr) return `<div style="background:var(--ink3);min-height:88px"></div>`;
    const evDia = eventos.filter(e => e.data === dataStr).sort((a,b) => a.hora.localeCompare(b.hora));
    const ehHoje = dataStr === hojeStr;
    const diaNum = parseInt(dataStr.split('-')[2], 10);
    return `<div onclick="abrirDiaAgendaFunil('${dataStr}')" style="background:var(--ink2);min-height:88px;padding:4px;display:flex;flex-direction:column;gap:2px;cursor:pointer">
      <div style="font-size:10px;font-weight:${ehHoje?700:500};color:${ehHoje?'#fff':'var(--text2)'};background:${ehHoje?'var(--brand)':'transparent'};width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center">${diaNum}</div>
      ${evDia.slice(0,3).map(ev => {
        const cor = CORES[ev.tipo] || { bg:'var(--ink3)', cor:'var(--text2)' };
        return `<div title="${ev.hora} · ${ev.nome} · ${ev.tipo} · ${ev.vendedor}" style="background:${cor.bg};color:${cor.cor};font-size:8.5px;padding:1px 4px;border-radius:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis"><strong>${ev.hora}</strong> ${ev.nome}${ev.requerGestor?' 🔒G':''}${ev.requerSupervisor?' 🔒S':''}</div>`;
      }).join('')}
      ${evDia.length>3 ? `<div style="font-size:8px;color:var(--text3);padding-left:2px">+${evDia.length-3} mais</div>` : ''}
    </div>`;
  }).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">Agenda</div>
    <div class="page-sub">// reuniões da equipe toda</div>
  </div>
  <div class="page-actions">
    <button class="btn btn-ghost btn-sm btn-icon" onclick="mudarMesAgendaFunil(-1)">‹</button>
    <span style="font-size:13px;font-weight:600;min-width:130px;text-align:center;display:inline-block">${mesLabel(st.mesCalendario)}</span>
    <button class="btn btn-ghost btn-sm btn-icon" onclick="mudarMesAgendaFunil(1)">›</button>
    <button class="btn btn-ghost btn-sm" onclick="AppState.modulo.agendaFunil.mesCalendario=todayMes();rerenderModule('agendaFunil')">Hoje</button>
  </div>
</div>

<div class="card">
  <div class="card-body">
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden">
      ${diasSemana.map(d => `<div style="background:var(--ink3);padding:6px;font-size:9px;font-weight:700;color:var(--text3);text-align:center;text-transform:uppercase">${d}</div>`).join('')}
      ${celulasHtml}
    </div>
    <div style="display:flex;gap:14px;margin-top:12px;font-size:10px;color:var(--text3);flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#E6F1FB;display:inline-block"></span> 1ª Reunião</div>
      <div style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#EEEDFE;display:inline-block"></span> 2ª Reunião</div>
      <div>🔒G = precisa do Gestor · 🔒S = precisa do líder de equipe</div>
    </div>
  </div>
</div>

<div class="overlay" id="m-agenda-dia">
  <div class="modal" style="max-width:380px">
    <button class="modal-close" onclick="closeModal('m-agenda-dia')">✕</button>
    <div id="mad-conteudo"></div>
  </div>
</div>

<div class="overlay" id="m-editar-horario-reuniao" style="z-index:600">
  <div class="modal" style="max-width:340px">
    <button class="modal-close" onclick="closeModal('m-editar-horario-reuniao')">✕</button>
    <div class="modal-title">Reagendar reunião</div>
    <div class="modal-sub" id="meh-sub"></div>
    <div class="form-group"><label>Nova data</label><input type="date" id="meh-data"></div>
    <div class="form-group"><label>Novo horário</label><input type="time" id="meh-hora"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-editar-horario-reuniao')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarEdicaoHorarioReuniaoFunil()">Salvar novo horário</button>
    </div>
  </div>
</div>
`;
}

function mudarMesAgendaFunil(delta) {
  const st = AppState.modulo.agendaFunil;
  const [ano, mes] = st.mesCalendario.split('-').map(Number);
  const d = new Date(ano, mes-1+delta, 1);
  st.mesCalendario = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  rerenderModule('agendaFunil');
}

let _diaAgendaAtual = null;
function abrirDiaAgendaFunil(dataStr) {
  _diaAgendaAtual = dataStr;
  const eventos = agendaOrdenadaFunil().filter(e => e.data === dataStr).sort((a,b) => a.hora.localeCompare(b.hora));
  const CORES = { '1ª Reunião': { bg:'#E6F1FB', cor:'#0C447C' }, '2ª Reunião': { bg:'#EEEDFE', cor:'#26215C' } };
  document.getElementById('mad-conteudo').innerHTML = `
    <div style="font-size:15px;font-weight:700;margin-bottom:2px">${dataStr.split('-').reverse().join('/')}</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:14px">${eventos.length} reunião(ões) marcada(s)</div>
    ${eventos.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Nenhuma reunião nesse dia</div>` : `
    <div style="display:flex;flex-direction:column;gap:6px">
      ${eventos.map((ev, idx) => {
        const cor = CORES[ev.tipo] || { bg:'var(--ink3)', cor:'var(--text2)' };
        const compareceu = ev.status === 'compareceu';
        const naoCompareceu = ev.status === 'nao_compareceu';
        const riscado = naoCompareceu ? 'text-decoration:line-through;text-decoration-color:var(--brand)' : '';
        const bolinha = compareceu
          ? `<div style="width:26px;height:26px;border-radius:50%;background:var(--green-dim,#EAF3DE);color:#27500A;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">✓</div>`
          : naoCompareceu
            ? `<div style="width:26px;height:26px;border-radius:50%;background:var(--red-dim);color:var(--brand);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">✕</div>`
            : `<div style="width:26px;height:26px;border-radius:50%;background:var(--ink3);border:2px dashed var(--line2);flex-shrink:0"></div>`;
        return `<div style="display:flex;align-items:center;gap:10px;background:var(--ink3);border-radius:8px;padding:8px 10px;${naoCompareceu?'opacity:0.7':''}">
          ${bolinha}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;${riscado}">${ev.nome}</div>
            <div style="font-size:10px;color:var(--text3);${riscado}">
              <span style="background:${cor.bg};color:${cor.cor};padding:1px 6px;border-radius:4px;margin-right:4px">${ev.tipo}</span>
              ${ev.hora} · ${ev.vendedor}${ev.requerGestor?' 🔒Gestor':''}${ev.requerSupervisor?' 🔒Líder':''}
            </div>
          </div>
          <div style="display:flex;gap:5px;align-items:center;flex-shrink:0">
            ${!ev.status ? `
              <button class="btn btn-ghost btn-sm" style="padding:5px 8px;font-size:11px;background:var(--green-dim,#EAF3DE);color:#27500A;border-color:#97C459" onclick="marcarComparecimentoFunil('${ev.leadId}','${ev.tipoKey}','compareceu')">✓</button>
              <button class="btn btn-ghost btn-sm" style="padding:5px 8px;font-size:11px;background:var(--red-dim);color:var(--brand);border-color:#E24B4A" onclick="marcarComparecimentoFunil('${ev.leadId}','${ev.tipoKey}','nao_compareceu')">✕</button>
            ` : `<span style="font-size:9px;color:${compareceu?'#27500A':'var(--brand)'}">${compareceu?'compareceu':'não veio · reagendar'}</span>`}
            <button class="btn btn-ghost btn-sm btn-icon" style="padding:5px 7px" onclick="abrirEditarHorarioReuniaoFunil('${ev.leadId}','${ev.tipoKey}')" title="Editar data/horário">✎</button>
          </div>
        </div>`;
      }).join('')}
    </div>`}
  `;
  openModal('m-agenda-dia');
}

async function marcarComparecimentoFunil(leadId, tipoKey, status) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const campoStatus = tipoKey === 'reuniao1' ? 'status_reuniao1' : 'status_reuniao2';
  const novaEtapa = status === 'compareceu'
    ? (tipoKey === 'reuniao1' ? 'reuniaoFeita' : 'analisando')
    : 'agendamento';
  const nota = status === 'compareceu'
    ? `${tipoKey === 'reuniao1' ? '1ª' : '2ª'} reunião — compareceu`
    : `${tipoKey === 'reuniao1' ? '1ª' : '2ª'} reunião — não compareceu, voltou pra agendamento`;
  const historico = [...(lead.historico||[]), { etapa: novaEtapa, data: today(), nota }];
  await Servicos.atualizarLeadFunil(leadId, { [campoStatus]: status, etapa: novaEtapa, historico_etapas: historico });
  await carregarDadosIniciais();
  if (_diaAgendaAtual) abrirDiaAgendaFunil(_diaAgendaAtual);
  rerenderModule('agendaFunil');
}

let _editarHorarioTarget = null;
function abrirEditarHorarioReuniaoFunil(leadId, tipoKey) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  _editarHorarioTarget = { leadId, tipoKey };
  const data = tipoKey === 'reuniao1' ? lead.dataReuniao1 : lead.dataReuniao2;
  const hora = tipoKey === 'reuniao1' ? lead.horaReuniao1 : lead.horaReuniao2;
  document.getElementById('meh-sub').textContent = `${lead.nome} · ${tipoKey === 'reuniao1' ? '1ª Reunião' : '2ª Reunião'}`;
  document.getElementById('meh-data').value = data || '';
  document.getElementById('meh-hora').value = hora || '';
  openModal('m-editar-horario-reuniao');
}

async function salvarEdicaoHorarioReuniaoFunil() {
  const { leadId, tipoKey } = _editarHorarioTarget || {};
  if (!leadId) return;
  const data = document.getElementById('meh-data').value;
  const hora = document.getElementById('meh-hora').value;
  if (!data || !hora) { Dialog.alert('Campos obrigatórios', ['Preencha data e horário.']); return; }
  const campos = tipoKey === 'reuniao1'
    ? { data_reuniao1: data, hora_reuniao1: hora }
    : { data_reuniao2: data, hora_reuniao2: hora };
  await Servicos.atualizarLeadFunil(leadId, campos);
  closeModal('m-editar-horario-reuniao');
  await carregarDadosIniciais();
  if (_diaAgendaAtual) abrirDiaAgendaFunil(_diaAgendaAtual);
  rerenderModule('agendaFunil');
}

// NOVO: relatório de transferências entre unidades — só o gestor master
// (sem unidadeEscopo) consegue ver essa duplicidade/rastro. Pra unidade de
// destino, o lead aparece normal, sem indicar de onde veio.
function renderTransferenciasUnidade() {
  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  if (!isG || u.unidadeEscopo) {
    return `<div class="page-header"><div class="page-title">Acesso restrito</div></div>`;
  }

  const leadsTransferidos = DB.leadsFunil.filter(l => (l.transferenciasUnidade||[]).length > 0);
  const nomeUnidade = un => un === 'blumenau' ? 'Blumenau' : 'Brusque';

  const rows = leadsTransferidos.map(l => {
    const vendAtual = DB.vendedores.find(v => v.id === l.vendedor)?.nome || '—';
    const ultimaTransf = l.transferenciasUnidade[l.transferenciasUnidade.length-1];
    return `<tr onclick="verDetalheLeadFunil('${l.id}')" style="cursor:pointer">
      <td style="font-weight:600">${l.nome}</td>
      <td><span class="chip" style="font-size:9px">${nomeUnidade(l.unidadeOrigem)}</span></td>
      <td><span class="chip" style="background:#EEEDFE;color:#26215C;font-size:9px">${nomeUnidade(l.unidade)}</span></td>
      <td class="td-mono">${fmt(l.valorCredito||0)}</td>
      <td>${vendAtual}</td>
      <td style="font-size:10px;color:var(--text3)">${(l.transferenciasUnidade||[]).map(t=>`${fmtDate(t.data)}: ${nomeUnidade(t.de)}→${nomeUnidade(t.para)} (${t.por})`).join('; ')}</td>
    </tr>`;
  }).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">Transferências entre Unidades</div>
    <div class="page-sub">// visível só pro gestor master · ${leadsTransferidos.length} lead(s) transferido(s)</div>
  </div>
</div>

<div class="card">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Lead</th><th>Unidade origem</th><th>Unidade atual</th><th>Crédito</th><th>Vendedor atual</th><th>Histórico</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="td-center" style="padding:40px;color:var(--text3)">Nenhuma transferência entre unidades ainda</td></tr>`}</tbody>
    </table>
  </div>
</div>
`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MÓDULO: TREINAMENTOS — scripts e vídeos da equipe
   ═══════════════════════════════════════════════════════════════════════════ */
const TREINAMENTO_CATEGORIAS = [
  { key: 'sistema',      label: 'Sistema',      cor: '#791F1F', bg: '#FCEBEB' },
  { key: 'abordagem',    label: 'Abordagem',    cor: '#0C447C', bg: '#E6F1FB' },
  { key: 'qualificacao', label: 'Qualificação', cor: '#26215C', bg: '#EEEDFE' },
  { key: 'followup',     label: 'Follow-up',    cor: '#7A4A0A', bg: '#FFF8E8' },
  { key: 'fechamento',   label: 'Fechamento',   cor: '#27500A', bg: '#EAF3DE' },
];
function treinamentoCategoriaInfo(key) {
  return TREINAMENTO_CATEGORIAS.find(c => c.key === key) || { label: key, cor: 'var(--text2)', bg: 'var(--ink3)' };
}
// Extrai o id de vídeo do YouTube ou Vimeo de qualquer formato de link comum
function extrairEmbedVideo(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { tipo: 'youtube', src: `https://www.youtube.com/embed/${yt[1]}`, thumb: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { tipo: 'vimeo', src: `https://player.vimeo.com/video/${vm[1]}`, thumb: null };
  return null;
}
// Só o Abiel pode gerenciar (adicionar/excluir) conteúdo — por enquanto
function podeGerenciarTreinamentos() {
  const u = AppState.user;
  return u && (u.role === 'gestor' || u.role === 'adm'); // qualquer gestor de Londrina
}

// NOVO: durante a remodelagem das tabelas de comissionamento, só o Abiel
// consegue ver a aba Tabelas — ninguém mais (nem outros gestores).
function podeAcessarTabelas() {
  return true; // Londrina não está em remodelagem — liberado pra qualquer gestor
}

// NOVO: durante a remodelagem das tabelas de comissionamento, ninguém
// consegue cadastrar venda nova — evita gerar comissão com tabela
// desatualizada no meio da troca. Só o Abiel.
function podeCadastrarVenda() {
  return true; // Londrina não está em remodelagem — cadastro liberado normalmente
}

/* ═══════════════════════════════════════════════════════════════════════════
   MÓDULO: MINHA META DIÁRIA — checklist de metas com % e período
   ═══════════════════════════════════════════════════════════════════════════ */
function diasUteisEntre(inicioStr, fimStr) {
  let count = 0;
  const d = new Date(inicioStr + 'T00:00:00');
  const fimD = new Date(fimStr + 'T00:00:00');
  while (d <= fimD) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function periodoMetaDiaria(periodo) {
  const hoje = today();
  const hojeD = new Date(hoje + 'T00:00:00');
  let inicio;
  if (periodo === 'hoje') {
    inicio = hoje;
  } else if (periodo === 'semana') {
    const dow = hojeD.getDay();
    const diasDesdeSegunda = dow === 0 ? 6 : dow - 1;
    const seg = new Date(hojeD); seg.setDate(hojeD.getDate() - diasDesdeSegunda);
    inicio = seg.toISOString().substring(0, 10);
  } else if (periodo === 'mes') {
    inicio = hoje.substring(0, 7) + '-01';
  } else if (periodo === 'trimestre') {
    const mesInicio = Math.floor(hojeD.getMonth() / 3) * 3;
    inicio = new Date(hojeD.getFullYear(), mesInicio, 1).toISOString().substring(0, 10);
  } else if (periodo === 'semestre') {
    const mesInicio = hojeD.getMonth() < 6 ? 0 : 6;
    inicio = new Date(hojeD.getFullYear(), mesInicio, 1).toISOString().substring(0, 10);
  } else if (periodo === 'ano') {
    inicio = `${hojeD.getFullYear()}-01-01`;
  } else {
    inicio = '2020-01-01'; // total
  }
  const diasUteis = periodo === 'total' ? null : Math.max(diasUteisEntre(inicio, hoje), 1);
  return { inicio, fim: hoje, diasUteis };
}

const PERIODOS_META = [
  ['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'],
  ['trimestre', 'Trimestre'], ['semestre', 'Semestre'], ['ano', 'Ano'], ['total', 'Total'],
];

// Calcula os 6 números (valores alcançados + metas escaladas) de um vendedor
// num período. Ligações/Conversadas são manuais (3C); o resto é automático,
// tirado do histórico de etapas dos leads do funil.
function calcMetricasMetaDiaria(vendedorId, periodo) {
  const { inicio, fim, diasUteis } = periodoMetaDiaria(periodo);

  const porDiaLig  = DB.funilLigacoes[vendedorId] || {};
  const porDiaConv = DB.funilConversadas[vendedorId] || {};
  const ligacoes    = Object.entries(porDiaLig).filter(([d]) => d >= inicio && d <= fim).reduce((a, [, v]) => a + v, 0);
  const conversadas = Object.entries(porDiaConv).filter(([d]) => d >= inicio && d <= fim).reduce((a, [, v]) => a + v, 0);

  const leadsDoVend = DB.leadsFunil.filter(l => l.vendedor === vendedorId);
  let interessados = 0, agendamentos = 0, reunioes = 0;
  const leadsComMovimento = new Set();

  leadsDoVend.forEach(l => {
    (l.historico || []).forEach(h => {
      if (!h.data || h.data < inicio || h.data > fim) return;
      leadsComMovimento.add(l.id);
      if (h.etapa === 'qualificacao') interessados++;
      if (h.etapa === 'agendamento') agendamentos++;
      if (h.nota && h.nota.includes('compareceu') && !h.nota.includes('não compareceu')) reunioes++;
    });
  });

  const credito = leadsDoVend
    .filter(l => leadsComMovimento.has(l.id))
    .reduce((a, l) => a + (l.valorCredito || 0), 0);

  const meta = DB.metaDiariaConfig || META_DIARIA;
  const mult = periodo === 'total' ? null : diasUteis;
  const metas = periodo === 'total' ? null : {
    ligacoes:    meta.ligacoes * mult,
    conversadas: meta.conversadas * mult,
    interessados: meta.interessados * mult,
    agendamentos: meta.agendamentos * mult,
    reunioes:    meta.reunioes * mult,
    credito:     meta.credito * mult,
  };

  return { valores: { ligacoes, conversadas, interessados, agendamentos, reunioes, credito }, metas };
}

function corPercentual(pct) {
  if (pct >= 100) return { bg: '#EAF3DE', cor: '#27500A' };
  if (pct >= 60)  return { bg: '#FFF8E8', cor: '#7A4A0A' };
  return { bg: '#FCEBEB', cor: '#C8392B' };
}

function renderMetaDiaria() {
  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const st = AppState.modulo.metaDiaria;
  const periodo = st.periodo || 'hoje';
  const { inicio, fim } = periodoMetaDiaria(periodo);

  // NOVO: crédito primeiro (resumo geral), depois segue a ordem natural do
  // funil — ligação → conversa → interesse → agendamento → reunião
  const METRICAS = [
    ['credito',      'Volume Crédito Prospectado', 'auto'],
    ['ligacoes',     'Ligações',    'manual'],
    ['conversadas',  'Conversadas', 'manual'],
    ['interessados', 'Interessados','auto'],
    ['agendamentos', 'Agendamentos','auto'],
    ['reunioes',     'Reuniões (presencial/online)', 'auto'],
  ];

  const pillsPeriodo = PERIODOS_META.map(([key, label]) => `
    <div onclick="AppState.modulo.metaDiaria.periodo='${key}';rerenderModule('metaDiaria')"
      style="padding:7px 12px;font-size:11px;font-weight:${periodo===key?'700':'600'};color:${periodo===key?'#fff':'var(--text2)'};background:${periodo===key?'var(--brand)':'transparent'};border-radius:7px;cursor:pointer">${label}</div>
  `).join('');

  // NOVO: card com o valor em destaque (grande, por extenso) + barra embaixo
  // — em vez do número pequeno/apagado que tinha antes
  function montarCardMetrica(vendedorId, key, label, tipo, metricas, editavel) {
    const valor = metricas.valores[key];
    const meta = metricas.metas ? metricas.metas[key] : null;
    const pct = meta ? Math.round((valor / meta) * 100) : null;
    const cor = pct != null ? corPercentual(pct) : { bg: 'var(--ink3)', cor: 'var(--text2)' };
    const bateu = pct != null && pct >= 100;
    const valorFmt = key === 'credito' ? fmt(valor) : valor;
    const metaFmt = meta ? (key === 'credito' ? fmt(meta) : Math.round(meta)) : '—';

    const valorPrincipal = (editavel && tipo === 'manual')
      ? `<input type="number" value="${valor}" onchange="salvarMetricaManualDia('${vendedorId}','${key}',this.value)"
           style="width:110px;font-size:20px;font-weight:800;font-family:var(--mono);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 8px;background:var(--ink3)">`
      : `<span style="font-size:20px;font-weight:800;font-family:var(--mono);color:var(--text)">${valorFmt}</span>`;

    return `<div style="background:var(--ink2);border-radius:12px;padding:16px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);${bateu?'border:1px solid #97C459':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <span style="font-size:13px;font-weight:700">${label}
          <span style="background:${tipo==='manual'?'#E6F1FB':'#EAF3DE'};color:${tipo==='manual'?'#0C447C':'#27500A'};font-size:8px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:4px">${tipo==='manual'?'3C · MANUAL':'AUTOMÁTICO'}</span>
        </span>
        ${pct != null ? `<span style="background:${cor.bg};color:${cor.cor};font-size:12px;font-weight:800;padding:2px 9px;border-radius:10px;font-family:var(--mono)">${bateu?'✓ ':''}${pct}%</span>` : ''}
      </div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:10px;flex-wrap:wrap">
        ${valorPrincipal}
        ${meta ? `<span style="font-size:13px;color:var(--text3);font-family:var(--mono)">/ ${metaFmt}</span>` : ''}
      </div>
      ${pct != null ? `<div style="background:var(--ink3);border-radius:6px;height:8px;overflow:hidden">
        <div style="background:${cor.cor};height:8px;width:${Math.min(pct,100)}%;border-radius:6px"></div>
      </div>` : ''}
    </div>`;
  }

  function mediaGeral(metricas) {
    if (!metricas.metas) return null;
    const pcts = Object.keys(metricas.metas).map(k => (metricas.valores[k] / metricas.metas[k]) * 100);
    return Math.round(pcts.reduce((a, p) => a + p, 0) / pcts.length);
  }

  // NOVO: círculo de progresso geral (SVG), mais intuitivo que só um número
  function montarCirculoProgresso(media, batidas, total) {
    if (media == null) return '';
    const raio = 47, circ = 2 * Math.PI * raio;
    const cor = corPercentual(media).cor;
    const offset = circ * (1 - Math.min(media, 100) / 100);
    return `<div class="card" style="margin-bottom:16px">
      <div class="card-body" style="text-align:center;padding:20px">
        <div style="position:relative;width:110px;height:110px;margin:0 auto 8px">
          <svg width="110" height="110" viewBox="0 0 110 110" style="transform:rotate(-90deg)">
            <circle cx="55" cy="55" r="${raio}" fill="none" stroke="var(--ink3)" stroke-width="11"/>
            <circle cx="55" cy="55" r="${raio}" fill="none" stroke="${cor}" stroke-width="11" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column">
            <div style="font-size:24px;font-weight:800;color:var(--text)">${media}%</div>
            <div style="font-size:9px;color:var(--text3)">do período</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text2)">${batidas} de ${total} metas batidas</div>
      </div>
    </div>`;
  }

  let conteudo;

  if (isG && st.vendedorSelecionado) {
    // Gestor clicou (ou selecionou) num vendedor específico — mostra o
    // painel individual dele (valores reais, igual o que o próprio vê)
    const vendSel = DB.vendedores.find(v => v.id === st.vendedorSelecionado);
    const metricas = calcMetricasMetaDiaria(st.vendedorSelecionado, periodo);
    const media = mediaGeral(metricas);
    const batidas = metricas.metas ? METRICAS.filter(([key]) => (metricas.valores[key]/metricas.metas[key])*100 >= 100).length : 0;

    conteudo = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <button class="btn btn-ghost btn-sm" onclick="AppState.modulo.metaDiaria.vendedorSelecionado=null;rerenderModule('metaDiaria')">← Voltar</button>
      <span style="font-size:13px;font-weight:700">${vendSel?.nome || '—'}</span>
    </div>
    ${montarCirculoProgresso(media, batidas, METRICAS.length)}
    ${METRICAS.map(([key,label,tipo]) => montarCardMetrica(st.vendedorSelecionado, key, label, tipo, metricas, false)).join('')}
    `;
  } else if (isG) {
    const abaGestor = st.abaGestor || 'geral';
    const equipe = vendedoresNaUnidade();
    const linhas = equipe.map(v => {
      const m = calcMetricasMetaDiaria(v.id, periodo);
      const media = mediaGeral(m);
      return { vend: v, metricas: m, media };
    }).sort((a, b) => (b.media||0) - (a.media||0));
    const melhorMedia = linhas[0]?.media;

    const abas = `<div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn ${abaGestor==='geral'?'btn-primary':'btn-ghost'} btn-sm" onclick="AppState.modulo.metaDiaria.abaGestor='geral';rerenderModule('metaDiaria')">🌐 Visão Geral (time somado)</button>
      <button class="btn ${abaGestor==='comparativo'?'btn-primary':'btn-ghost'} btn-sm" onclick="AppState.modulo.metaDiaria.abaGestor='comparativo';rerenderModule('metaDiaria')">📊 Comparativo</button>
      <div style="flex:1"></div>
      <button class="btn btn-ghost btn-sm" onclick="abrirEditarMetaDiaria()">✎ Editar metas</button>
    </div>`;

    if (abaGestor === 'geral') {
      // NOVO: soma de TODO o time — mesmo formato de card que o vendedor
      // individual vê, só que os valores e metas são a soma da equipe inteira
      const valoresSomados = {}, metasSomadas = {};
      METRICAS.forEach(([key]) => {
        valoresSomados[key] = linhas.reduce((a, l) => a + (l.metricas.valores[key]||0), 0);
        metasSomadas[key] = periodo === 'total' ? null : linhas.reduce((a, l) => a + (l.metricas.metas ? l.metricas.metas[key] : 0), 0);
      });
      const metricasTime = { valores: valoresSomados, metas: periodo === 'total' ? null : metasSomadas };
      const mediaTime = mediaGeral(metricasTime);
      const batidasTime = metricasTime.metas ? METRICAS.filter(([key]) => (metricasTime.valores[key]/metricasTime.metas[key])*100 >= 100).length : 0;

      conteudo = `${abas}
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">Somando ${linhas.length} vendedor(es) · meta do time = meta individual × ${linhas.length}</div>
      ${montarCirculoProgresso(mediaTime, batidasTime, METRICAS.length)}
      ${METRICAS.map(([key,label,tipo]) => montarCardMetrica(null, key, label, tipo, metricasTime, false)).join('')}
      `;
    } else {
      // NOVO: tabela comparativa com valor real + % + barra em cada célula,
      // seletor de vendedor, botão de PDF, e análise automática embaixo
      const seletorVend = `<select class="form-input" style="width:auto;height:32px;padding:0 10px;font-size:12px"
          onchange="if(this.value){AppState.modulo.metaDiaria.vendedorSelecionado=this.value;rerenderModule('metaDiaria');}">
        <option value="">Ver vendedor específico...</option>
        ${equipe.map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
      </select>`;

      function celulaComparativo(metricas, key) {
        const valor = metricas.valores[key];
        const meta = metricas.metas ? metricas.metas[key] : null;
        const pct = meta ? Math.round((valor/meta)*100) : null;
        const cor = pct != null ? corPercentual(pct).cor : 'var(--text3)';
        const valorFmt = key === 'credito' ? fmt(valor).replace(',00','') : valor;
        const metaFmt = meta ? (key === 'credito' ? fmt(meta).replace(',00','') : Math.round(meta)) : null;
        if (pct == null) return `<td style="text-align:center;color:var(--text3)">—</td>`;
        return `<td style="padding:8px 10px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;font-family:var(--mono);font-size:10px;margin-bottom:3px;gap:6px">
            <span style="font-weight:700;white-space:nowrap">${valorFmt}<span style="color:var(--text3);font-weight:400"> / ${metaFmt}</span></span>
            <span style="color:${cor};font-weight:800;white-space:nowrap">${pct}%</span>
          </div>
          <div style="background:var(--ink3);border-radius:4px;height:5px;overflow:hidden">
            <div style="background:${cor};height:5px;width:${Math.min(pct,100)}%"></div>
          </div>
        </td>`;
      }

      // Análise automática: qual métrica está mais perto/longe da meta (somando o time)
      const somaValores = {}, somaMetas = {};
      METRICAS.forEach(([key]) => {
        somaValores[key] = linhas.reduce((a,l) => a + (l.metricas.valores[key]||0), 0);
        somaMetas[key] = linhas.reduce((a,l) => a + (l.metricas.metas ? l.metricas.metas[key] : 0), 0);
      });
      const pctPorMetrica = METRICAS.map(([key,label]) => ({ key, label, pct: somaMetas[key] ? Math.round((somaValores[key]/somaMetas[key])*100) : 0 }))
        .filter(m => m.key !== 'credito' || somaMetas.credito); // evita quebrar se meta=0
      const melhorMetrica = [...pctPorMetrica].sort((a,b) => b.pct - a.pct)[0];
      const piorMetrica = [...pctPorMetrica].sort((a,b) => a.pct - b.pct)[0];

      // Pontos por vendedor: melhor e pior métrica de cada um
      const pontosPorVendedor = linhas.map(({vend, metricas}) => {
        const pcts = METRICAS.map(([key,label]) => {
          const meta = metricas.metas ? metricas.metas[key] : null;
          const pct = meta ? Math.round((metricas.valores[key]/meta)*100) : 0;
          return { label, pct };
        });
        const melhor = [...pcts].sort((a,b) => b.pct - a.pct)[0];
        const pior = [...pcts].sort((a,b) => a.pct - b.pct)[0];
        const media = mediaGeral(metricas);
        const emoji = media >= 80 ? '🟢' : media >= 50 ? '🟡' : '🔴';
        return `<div style="font-size:12px;color:var(--text);margin-bottom:6px">${emoji} <strong>${vend.nome}</strong> — destaque em ${melhor.label} (${melhor.pct}%), ${pior.pct < 60 ? `dificuldade em ${pior.label} (${pior.pct}%)` : 'sem pontos críticos'}</div>`;
      }).join('');

      conteudo = `${abas}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap">
        <div style="font-size:11px;color:var(--text3)">${linhas.length} vendedor(es) no período</div>
        <div style="display:flex;gap:8px;align-items:center">
          ${seletorVend}
          <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 Gerar PDF</button>
        </div>
      </div>
      <div class="card print-paisagem">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Vendedor</th>
              ${METRICAS.map(([,label]) => `<th style="text-align:center">${label.split(' ')[0]}</th>`).join('')}
              <th style="text-align:right">Média</th>
            </tr></thead>
            <tbody>
              ${linhas.map(({vend, metricas, media}) => `<tr>
                <td style="font-weight:600;cursor:pointer;color:var(--brand)" onclick="AppState.modulo.metaDiaria.vendedorSelecionado='${vend.id}';rerenderModule('metaDiaria')">${vend.nome}${media===melhorMedia && media>0 ? ' 🏆' : ''}</td>
                ${METRICAS.map(([key]) => celulaComparativo(metricas, key)).join('')}
                <td style="text-align:right;font-family:var(--mono);font-weight:800">${media!=null?media+'%':'—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin:20px 0 10px">Análise do período</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:12px">
        ${melhorMetrica ? `<div style="background:var(--green-dim,#EAF3DE);border-radius:10px;padding:14px;border-left:3px solid #639922">
          <div style="font-size:10px;font-weight:700;color:#27500A;text-transform:uppercase;margin-bottom:4px">✓ Evoluindo melhor</div>
          <div style="font-size:12px;color:#27500A"><strong>${melhorMetrica.label}</strong> é a meta mais próxima de bater no time (${melhorMetrica.pct}% da meta somada)</div>
        </div>` : ''}
        ${piorMetrica ? `<div style="background:var(--red-dim);border-radius:10px;padding:14px;border-left:3px solid var(--brand)">
          <div style="font-size:10px;font-weight:700;color:#791F1F;text-transform:uppercase;margin-bottom:4px">⚠ Precisa de atenção</div>
          <div style="font-size:12px;color:#791F1F"><strong>${piorMetrica.label}</strong> é a meta mais distante (só ${piorMetrica.pct}% da meta somada do time)</div>
        </div>` : ''}
      </div>
      <div class="card">
        <div class="card-body">
          <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px">Pontos por vendedor</div>
          ${pontosPorVendedor}
        </div>
      </div>
      `;
    }
  } else {
    const metricas = calcMetricasMetaDiaria(u.id, periodo);
    const media = mediaGeral(metricas);
    const batidas = metricas.metas ? METRICAS.filter(([key]) => (metricas.valores[key]/metricas.metas[key])*100 >= 100).length : 0;
    const editavel = periodo === 'hoje';

    conteudo = `
    ${montarCirculoProgresso(media, batidas, METRICAS.length)}
    ${METRICAS.map(([key,label,tipo]) => montarCardMetrica(u.id, key, label, tipo, metricas, editavel)).join('')}
    `;
  }

  return `
<div class="page-header">
  <div>
    <div class="page-title">Minha Meta Diária</div>
    <div class="page-sub">// ${mesLabel(fim.substring(0,7))} · ${fmtDate(inicio)} a ${fmtDate(fim)}</div>
  </div>
</div>

<div style="display:flex;gap:4px;background:var(--ink2);border-radius:10px;padding:4px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);flex-wrap:wrap">${pillsPeriodo}</div>

${conteudo}

<div class="overlay" id="m-editar-meta-diaria">
  <div class="modal" style="max-width:420px">
    <button class="modal-close" onclick="closeModal('m-editar-meta-diaria')">✕</button>
    <div class="modal-title">Editar metas diárias</div>
    <div class="modal-sub">Vale pra todo o time — qualquer gestor pode ajustar</div>

    <div class="form-group"><label>Volume Crédito Prospectado (R$)</label><input type="number" id="med-credito"></div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Ligações</label><input type="number" id="med-ligacoes"></div>
      <div class="form-group"><label>Conversadas</label><input type="number" id="med-conversadas"></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Interessados</label><input type="number" id="med-interessados"></div>
      <div class="form-group"><label>Agendamentos</label><input type="number" id="med-agendamentos"></div>
    </div>
    <div class="form-group"><label>Reuniões</label><input type="number" id="med-reunioes"></div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-editar-meta-diaria')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarEdicaoMetaDiaria()">Salvar</button>
    </div>
  </div>
</div>
`;
}

function abrirEditarMetaDiaria() {
  const u = AppState.user;
  if (u.role !== 'gestor' && u.role !== 'adm') return;
  const meta = DB.metaDiariaConfig || META_DIARIA;
  document.getElementById('med-credito').value = meta.credito;
  document.getElementById('med-ligacoes').value = meta.ligacoes;
  document.getElementById('med-conversadas').value = meta.conversadas;
  document.getElementById('med-interessados').value = meta.interessados;
  document.getElementById('med-agendamentos').value = meta.agendamentos;
  document.getElementById('med-reunioes').value = meta.reunioes;
  openModal('m-editar-meta-diaria');
}

async function salvarEdicaoMetaDiaria() {
  const u = AppState.user;
  if (u.role !== 'gestor' && u.role !== 'adm') return;
  const config = {
    credito: parseFloat(document.getElementById('med-credito').value) || 0,
    ligacoes: parseInt(document.getElementById('med-ligacoes').value) || 0,
    conversadas: parseInt(document.getElementById('med-conversadas').value) || 0,
    interessados: parseInt(document.getElementById('med-interessados').value) || 0,
    agendamentos: parseInt(document.getElementById('med-agendamentos').value) || 0,
    reunioes: parseInt(document.getElementById('med-reunioes').value) || 0,
  };
  const sucesso = await Servicos.salvarMetaDiariaConfig(config);
  if (!sucesso) { Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco de dados.']); return; }
  DB.metaDiariaConfig = config;
  closeModal('m-editar-meta-diaria');
  Dialog.success('Metas atualizadas', ['As novas metas já valem pra todo o time.']);
  rerenderModule('metaDiaria');
}

async function salvarMetricaManualDia(vendedorId, key, valor) {
  const num = parseInt(valor, 10) || 0;
  const hoje = today();
  const ligacoesAtuais = (DB.funilLigacoes[vendedorId]||{})[hoje] || 0;
  const conversadasAtuais = (DB.funilConversadas[vendedorId]||{})[hoje] || 0;
  const novasLigacoes = key === 'ligacoes' ? num : ligacoesAtuais;
  const novasConversadas = key === 'conversadas' ? num : conversadasAtuais;

  const sucesso = await Servicos.salvarLigacoesConversadasDia(vendedorId, hoje, novasLigacoes, novasConversadas);
  if (!sucesso) { Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco de dados.']); return; }

  if (!DB.funilLigacoes[vendedorId]) DB.funilLigacoes[vendedorId] = {};
  if (!DB.funilConversadas[vendedorId]) DB.funilConversadas[vendedorId] = {};
  DB.funilLigacoes[vendedorId][hoje] = novasLigacoes;
  DB.funilConversadas[vendedorId][hoje] = novasConversadas;
  rerenderModule('metaDiaria');
}

function renderTreinamentos() {
  const st = AppState.modulo.treinamentos;
  const podeGerenciar = podeGerenciarTreinamentos();

  const lista = st.filtroCategoria === 'all' ? DB.treinamentos : DB.treinamentos.filter(t => t.categoria === st.filtroCategoria);

  const pills = [
    ['all', 'Todos', DB.treinamentos.length],
    ...TREINAMENTO_CATEGORIAS.map(c => [c.key, c.label, DB.treinamentos.filter(t => t.categoria === c.key).length]),
  ].map(([key, label, cnt]) => `
    <div onclick="AppState.modulo.treinamentos.filtroCategoria='${key}';rerenderModule('treinamentos')"
      style="background:${st.filtroCategoria===key?'#1A1D24':'#fff'};color:${st.filtroCategoria===key?'#fff':'var(--text2)'};border:1px solid ${st.filtroCategoria===key?'#1A1D24':'var(--line)'};font-size:12px;font-weight:600;padding:7px 14px;border-radius:20px;cursor:pointer;white-space:nowrap">${label} (${cnt})</div>
  `).join('');

  const cards = lista.map(t => {
    const cat = treinamentoCategoriaInfo(t.categoria);
    const embed = t.tipo === 'video' ? extrairEmbedVideo(t.urlVideo) : null;
    const thumbHtml = t.tipo === 'video'
      ? `<div style="position:relative;background:#1A1D24;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background-size:cover;background-position:center;${embed?.thumb ? `background-image:url('${embed.thumb}')` : ''}">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--brand);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px">▶</div>
        </div>`
      : t.tipo === 'html'
      ? `<div style="background:linear-gradient(135deg,var(--brand),#8a251b);aspect-ratio:16/9;display:flex;align-items:center;justify-content:center"><div style="width:44px;height:44px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:18px">⚡</div></div>`
      : `<div style="background:var(--ink3);aspect-ratio:16/9;display:flex;align-items:center;justify-content:center"><div style="width:44px;height:44px;border-radius:12px;background:var(--green-dim,#EAF3DE);display:flex;align-items:center;justify-content:center;font-size:18px">📄</div></div>`;
    const tipoLabel = t.tipo === 'video' ? 'Vídeo' : t.tipo === 'html' ? 'Interativo' : 'Texto';
    return `<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);cursor:pointer" onclick="abrirDetalheTreinamento('${t.id}')">
      ${thumbHtml}
      <div style="padding:12px 14px">
        <span style="background:${cat.bg};color:${cat.cor};font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px">${cat.label.toUpperCase()}</span>
        <div style="font-size:13px;font-weight:700;margin-top:8px">${t.titulo}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${tipoLabel} · ${fmtDate((t.criadoEm||'').substring(0,10))}</div>
      </div>
    </div>`;
  }).join('');

  return `
<div class="page-header">
  <div>
    <div class="page-title">Treinamentos</div>
    <div class="page-sub">// scripts e vídeos da equipe</div>
  </div>
  <div class="page-actions">
    ${podeGerenciar ? `<button class="btn btn-primary btn-sm" onclick="abrirNovoTreinamento()">+ Novo conteúdo</button>` : ''}
  </div>
</div>

<div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap">${pills}</div>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
  ${cards || `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎓</div><div class="empty-title">Nenhum conteúdo ainda</div><div class="empty-sub">${podeGerenciar ? 'Clique em "+ Novo conteúdo" pra começar' : 'Em breve teremos materiais aqui'}</div></div>`}
</div>

<!-- Modal de detalhe -->
<div class="overlay" id="m-treinamento-ver">
  <div class="modal" id="m-treinamento-ver-box" style="width:680px">
    <button class="modal-close" onclick="closeModal('m-treinamento-ver')">✕</button>
    <div id="mtv-conteudo"></div>
  </div>
</div>

<!-- Modal de novo conteúdo -->
<div class="overlay" id="m-treinamento-novo">
  <div class="modal" style="max-width:520px">
    <button class="modal-close" onclick="closeModal('m-treinamento-novo')">✕</button>
    <div class="modal-title">Novo conteúdo</div>
    <div class="modal-sub">Cadastre um script ou vídeo de treinamento</div>

    <div class="form-group"><label>Título *</label><input id="mtn-titulo" placeholder="Ex: Como abrir a primeira ligação"></div>

    <div class="form-row cols-2">
      <div class="form-group"><label>Categoria</label>
        <select id="mtn-categoria">
          ${TREINAMENTO_CATEGORIAS.map(c => `<option value="${c.key}">${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Tipo</label>
        <select id="mtn-tipo" onchange="toggleTipoTreinamento()">
          <option value="video">Vídeo (YouTube/Vimeo)</option>
          <option value="texto">Texto / Script</option>
          <option value="html">HTML interativo</option>
        </select>
      </div>
    </div>

    <div id="mtn-wrap-video" class="form-group"><label>Link do vídeo</label><input id="mtn-url" placeholder="https://youtube.com/watch?v=..."></div>
    <div id="mtn-wrap-texto" class="form-group" style="display:none"><label>Conteúdo do script</label><textarea id="mtn-conteudo" rows="6" placeholder="Cole o script aqui..."></textarea></div>
    <div id="mtn-wrap-html" class="form-group" style="display:none">
      <label>Código HTML completo</label>
      <textarea id="mtn-html" rows="6" placeholder="Cole o HTML completo (com <html>, <style>, <script>...) aqui..." style="font-family:var(--mono);font-size:11px"></textarea>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">Cole o arquivo HTML inteiro — ele roda isolado, com toda a interatividade (cliques, checklist, etc.) funcionando normalmente.</div>
    </div>

    <div class="form-group"><label>Público-alvo</label>
      <select id="mtn-publico">
        <option value="todos">Todos</option>
        <option value="vendedor">Vendedores</option>
        <option value="lider">Líderes de equipe</option>
        <option value="gestor">Gestores</option>
      </select>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-treinamento-novo')">Cancelar</button>
      <button class="btn btn-primary" onclick="salvarNovoTreinamento()">Salvar</button>
    </div>
  </div>
</div>
`;
}

function toggleTipoTreinamento() {
  const tipo = document.getElementById('mtn-tipo').value;
  document.getElementById('mtn-wrap-video').style.display = tipo === 'video' ? 'block' : 'none';
  document.getElementById('mtn-wrap-texto').style.display = tipo === 'texto' ? 'block' : 'none';
  document.getElementById('mtn-wrap-html').style.display = tipo === 'html' ? 'block' : 'none';
}

function abrirNovoTreinamento() {
  if (!podeGerenciarTreinamentos()) return;
  document.getElementById('mtn-titulo').value = '';
  document.getElementById('mtn-url').value = '';
  document.getElementById('mtn-conteudo').value = '';
  document.getElementById('mtn-html').value = '';
  document.getElementById('mtn-tipo').value = 'video';
  toggleTipoTreinamento();
  openModal('m-treinamento-novo');
}

async function salvarNovoTreinamento() {
  const titulo = document.getElementById('mtn-titulo').value.trim();
  const categoria = document.getElementById('mtn-categoria').value;
  const tipo = document.getElementById('mtn-tipo').value;
  const url = document.getElementById('mtn-url').value.trim();
  const conteudo = document.getElementById('mtn-conteudo').value.trim();
  const html = document.getElementById('mtn-html').value.trim();
  const publico = document.getElementById('mtn-publico').value;

  if (!titulo) { Dialog.alert('Campo obrigatório', ['Informe o título.']); return; }
  if (tipo === 'video' && !url) { Dialog.alert('Campo obrigatório', ['Cole o link do vídeo.']); return; }
  if (tipo === 'texto' && !conteudo) { Dialog.alert('Campo obrigatório', ['Escreva o conteúdo do script.']); return; }
  if (tipo === 'html' && !html) { Dialog.alert('Campo obrigatório', ['Cole o código HTML.']); return; }
  if (tipo === 'video' && !extrairEmbedVideo(url)) { Dialog.alert('Link inválido', ['Não reconheci esse link como YouTube ou Vimeo. Confira e tente de novo.']); return; }

  const btn = document.querySelector('#m-treinamento-novo .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    const conteudoFinal = tipo === 'texto' ? conteudo : (tipo === 'html' ? html : null);
    const payload = {
      titulo, categoria, tipo,
      url_video: tipo === 'video' ? url : null,
      conteudo: conteudoFinal,
      publico_alvo: publico,
      criado_por: AppState.user.nome,
    };
    const data = await Servicos.salvarTreinamento(payload);
    if (!data) throw new Error('Não foi possível salvar.');
    DB.treinamentos.unshift({
      id: data.id, titulo, categoria, tipo, urlVideo: payload.url_video||'', conteudo: payload.conteudo||'',
      publicoAlvo: publico, criadoPor: AppState.user.nome, criadoEm: data.criado_em || new Date().toISOString(),
    });
    closeModal('m-treinamento-novo');
    rerenderModule('treinamentos');
  } catch(e) {
    console.error('Erro ao salvar treinamento:', e);
    Dialog.alert('Erro ao salvar', ['Não foi possível salvar no banco de dados.']);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
}

function abrirDetalheTreinamento(id) {
  const t = DB.treinamentos.find(x => x.id === id);
  if (!t) return;
  const cat = treinamentoCategoriaInfo(t.categoria);
  const embed = t.tipo === 'video' ? extrairEmbedVideo(t.urlVideo) : null;
  const podeGerenciar = podeGerenciarTreinamentos();

  const box = document.getElementById('m-treinamento-ver-box');
  if (box) box.style.width = t.tipo === 'html' ? '95vw' : '680px';
  if (box) box.style.maxWidth = t.tipo === 'html' ? '1100px' : '680px';

  const corpo = t.tipo === 'video'
    ? (embed
        ? `<div style="border-radius:10px;overflow:hidden;background:#000"><iframe src="${embed.src}" style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen allow="autoplay; encrypted-media"></iframe></div>`
        : `<div class="alert alert-amber">Não consegui identificar esse link de vídeo.</div>`)
    : t.tipo === 'html'
    ? `<div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn-ghost btn-sm" onclick="telaCheiaTreinamento()">⛶ Tela cheia</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirTreinamentoNovaAba('${t.id}')">↗ Abrir em nova aba</button>
      </div>
      <div style="border-radius:10px;overflow:hidden;border:1px solid var(--line)"><iframe id="mtv-iframe-html" style="width:100%;height:75vh;border:0;display:block" sandbox="allow-scripts allow-same-origin" allowfullscreen></iframe></div>`
    : `<div style="background:var(--ink3);border-radius:10px;padding:16px;font-size:13px;line-height:1.7;white-space:pre-wrap">${t.conteudo}</div>`;

  document.getElementById('mtv-conteudo').innerHTML = `
    <span class="chip" style="background:${cat.bg};color:${cat.cor};font-size:9px;font-weight:700">${cat.label.toUpperCase()}</span>
    <div style="font-size:17px;font-weight:800;margin-top:8px">${t.titulo}</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:14px">Adicionado por ${t.criadoPor||'—'} · ${fmtDate((t.criadoEm||'').substring(0,10))}</div>
    ${corpo}
    ${podeGerenciar ? `<div class="modal-actions"><button class="btn btn-ghost" style="color:var(--brand)" onclick="excluirTreinamentoUI('${t.id}')">✕ Excluir</button></div>` : ''}
  `;
  openModal('m-treinamento-ver');

  // NOVO: o HTML precisa ser injetado via srcdoc DEPOIS do iframe existir no
  // DOM — roda isolado (sandbox), com toda a interatividade original intacta
  if (t.tipo === 'html') {
    const iframe = document.getElementById('mtv-iframe-html');
    if (iframe) iframe.srcdoc = t.conteudo || '<p style="font-family:sans-serif;padding:20px">Conteúdo vazio.</p>';
  }
}

// NOVO: pede pro navegador colocar o iframe (o conteúdo do treinamento) em
// tela cheia de verdade — funciona igual o F11, mas só daquele elemento
function telaCheiaTreinamento() {
  const iframe = document.getElementById('mtv-iframe-html');
  if (!iframe) return;
  if (iframe.requestFullscreen) iframe.requestFullscreen();
  else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
  else if (iframe.msRequestFullscreen) iframe.msRequestFullscreen();
  else Dialog.alert('Não suportado', ['Seu navegador não suporta tela cheia. Tente "Abrir em nova aba" em vez disso.']);
}

// NOVO: abre o conteúdo numa aba nova do navegador — útil em celular (onde
// tela cheia de iframe às vezes não funciona bem) ou quem prefere assim
function abrirTreinamentoNovaAba(id) {
  const t = DB.treinamentos.find(x => x.id === id);
  if (!t || !t.conteudo) return;
  const blob = new Blob([t.conteudo], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

async function excluirTreinamentoUI(id) {
  const _ok = await Dialog.danger('Excluir conteúdo', ['Esta ação não pode ser desfeita.']);
  if (!_ok) return;
  const sucesso = await Servicos.excluirTreinamento(id);
  if (!sucesso) { Dialog.alert('Erro ao excluir', ['Não foi possível excluir no banco de dados.']); return; }
  DB.treinamentos = DB.treinamentos.filter(t => t.id !== id);
  closeModal('m-treinamento-ver');
  rerenderModule('treinamentos');
}

function renderLeadsPainelFunil() {
  const st = AppState.modulo.leadsPainel;
  if (!st.mesSel) st.mesSel = todayMes();
  const mesesDisp = Array.from(new Set([...leadsFunilDaUnidade().map(l => (l.criadoEm||'').substring(0,7)).filter(Boolean), st.mesSel])).sort();
  const mesNav = renderMesNav(mesesDisp, st.mesSel, "AppState.modulo.leadsPainel.mesSel", 'leadsPainel');

  const leadsDoMes = leadsFunilDaUnidade().filter(l => (l.criadoEm||'').substring(0,7) === st.mesSel);
  const recebidos     = leadsDoMes.length;
  const trabalhados   = leadsDoMes.filter(l => l.etapa !== 'lead').length;
  const convertidos   = leadsDoMes.filter(l => l.etapa === 'venda').length;
  const perdidos       = leadsDoMes.filter(l => l.etapa === 'desqualificado').length;
  const semResposta    = leadsDoMes.filter(l => l.etapa === 'contato' && (l.tentativas||0) >= 6).length;
  const followup       = leadsDoMes.filter(l => l.etapa === 'followup').length;
  const redistribuidos = leadsDoMes.filter(l => (l.vezesRedistribuido||0) > 0).length;
  const leadsPago      = leadsDoMes.filter(l => l.origem === 'trafego').length;
  const leadsDiscadora = leadsDoMes.filter(l => l.origem === 'discadora').length;
  const leadsPessoal   = leadsDoMes.filter(l => l.origem === 'pessoal').length;

  const cards = [
    ['Recebidos', recebidos, 'var(--text)'],
    ['Trabalhados', trabalhados, 'var(--text)'],
    ['Convertidos', convertidos, 'var(--green)'],
    ['Perdidos/Descartados', perdidos, 'var(--brand)'],
    ['Sem resposta (6+ tent.)', semResposta, 'var(--amber)'],
    ['Follow-up', followup, 'var(--text)'],
    ['Redistribuídos', redistribuidos, 'var(--amber)'],
  ];

  return `
<div class="page-header">
  <div>
    <div class="page-title">Indicadores de Leads</div>
    <div class="page-sub">// equipe toda · ${mesLabel(st.mesSel)}</div>
  </div>
  <div class="page-actions">
    <button class="btn btn-primary btn-sm" onclick="abrirImportarLeads()">📤 Importar leads</button>
  </div>
</div>

${mesNav}

<div class="stats-grid">
  ${cards.map(([label,valor,cor]) => `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value" style="color:${cor}">${valor}</div>
  </div>`).join('')}
</div>

<div class="card">
  <div class="card-body">
    <div class="form-divider">Origem do lead</div>
    <div style="display:flex;gap:10px">
      <div style="flex:1;background:#E6F1FB;border-radius:6px;padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:600;font-family:var(--mono);color:#0C447C">${leadsPago}</div>
        <div style="font-size:10px;color:#0C447C">Tráfego</div>
      </div>
      <div style="flex:1;background:var(--ink3);border-radius:6px;padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:600;font-family:var(--mono);color:var(--text2)">${leadsDiscadora}</div>
        <div style="font-size:10px;color:var(--text2)">Discadora/IA</div>
      </div>
      <div style="flex:1;background:#F3EEFB;border-radius:6px;padding:10px;text-align:center">
        <div style="font-size:16px;font-weight:600;font-family:var(--mono);color:#5B21B6">${leadsPessoal}</div>
        <div style="font-size:10px;color:#5B21B6">Pessoal</div>
      </div>
    </div>
  </div>
</div>

<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;margin:24px 0 10px">Relatório do pipeline — ${mesLabel(st.mesSel)}</div>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap">
  <div style="display:flex;gap:10px;flex:1;min-width:280px">
    <div class="card" style="flex:1;margin-bottom:0">
      <div class="card-body">
        <div class="stat-label">Total de leads no mês</div>
        <div style="font-size:20px;font-weight:800;font-family:var(--mono);margin-top:4px">${leadsDoMes.length}</div>
      </div>
    </div>
    <div class="card" style="flex:1;margin-bottom:0">
      <div class="card-body">
        <div class="stat-label">Crédito total em negociação</div>
        <div style="font-size:20px;font-weight:800;font-family:var(--mono);margin-top:4px">${fmt(leadsDoMes.filter(l=>l.etapa!=='desqualificado').reduce((a,l)=>a+(l.valorCredito||0),0))}</div>
      </div>
    </div>
  </div>
  <button class="btn btn-ghost btn-sm no-print" onclick="window.print()">🖨 Imprimir / Exportar PDF</button>
</div>

<div class="card print-paisagem">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Lead</th><th>Origem</th><th>Data cadastro</th><th>Crédito</th><th>Vendedor atual</th>
        <th>Redistribuído</th><th>Etapa atual</th><th>Evolução</th><th>Dias</th>
      </tr></thead>
      <tbody>
        ${leadsDoMes.map(l => {
          const origemTxt = l.origem === 'redistribuicao_sistema' ? 'Redistribuição Sistema' : l.origem === 'trafego' ? `Tráfego${l.anuncioOrigem ? ' · '+l.anuncioOrigem : ''}` : l.origem === 'pessoal' ? 'Pessoal' : 'Discadora/IA';
          const origemCor = l.origem === 'trafego' ? 'background:#E6F1FB;color:#0C447C' : l.origem === 'pessoal' ? 'background:#F3EEFB;color:#5B21B6' : 'background:var(--ink3);color:var(--text2)';
          const vendAtual = DB.vendedores.find(v => v.id === l.vendedor)?.nome || '—';
          const vendAnterior = l.vendedorAnterior ? DB.vendedores.find(v => v.id === l.vendedorAnterior)?.nome : null;
          const redistribuido = (l.vezesRedistribuido||0) > 0;
          const corEtapaAtual = l.etapa === 'desqualificado' ? FUNIL_CORES_ETAPA.desqualificado : (FUNIL_CORES_ETAPA[l.etapa] || { bg:'var(--ink3)', borda:'var(--text3)' });
          const etapaLabel = l.etapa === 'desqualificado' ? 'Desqualificado' : (FUNIL_ETAPAS.find(e=>e.key===l.etapa)?.label || l.etapa);
          const evolucao = (l.historico||[]).map(h => h.etapa === 'desqualificado' ? 'Desqualificado' : (FUNIL_ETAPAS.find(e=>e.key===h.etapa)?.label || h.etapa)).join(' → ') || etapaLabel;
          const dias = diasAtras ? diasAtras(l.criadoEm) : Math.round((new Date(today()+'T00:00:00') - new Date((l.criadoEm||today())+'T00:00:00'))/86400000);
          return `<tr onclick="verDetalheLeadFunil('${l.id}')" style="cursor:pointer">
            <td style="font-weight:600">${l.nome}</td>
            <td><span class="chip" style="${origemCor};font-size:9px">${origemTxt}</span></td>
            <td class="td-mono" style="font-size:11px">${fmtDate(l.criadoEm)}</td>
            <td class="td-mono">${fmt(l.valorCredito||0)}</td>
            <td>${vendAtual}${redistribuido && vendAnterior ? ` <span style="font-size:9px;color:var(--text3)">(era ${vendAnterior})</span>` : ''}</td>
            <td>${redistribuido ? `<span class="chip" style="background:var(--red-dim);color:var(--brand);font-weight:700;font-size:9px">Sim · ${l.vezesRedistribuido}x</span>` : `<span class="chip" style="font-size:9px">Não</span>`}</td>
            <td><span class="chip" style="background:${corEtapaAtual.bg};color:${corEtapaAtual.borda};font-weight:700;font-size:9px">${etapaLabel}</span></td>
            <td style="font-size:10px;color:var(--text3)">${evolucao}</td>
            <td class="td-mono" style="${dias>10?'color:var(--brand);font-weight:700':''}">${dias}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="9" class="td-center" style="padding:40px;color:var(--text3)">Nenhum lead neste mês</td></tr>`}
      </tbody>
    </table>
  </div>
</div>
`;
}

function renderConteudoComissaoSupervisor(supervisorId) {
  const supervisor = DB.vendedores.find(v => v.id === supervisorId);
  if (!supervisor) return `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text3)">Líder de equipe não encontrado.</div></div>`;

  const st = AppState.modulo.comissaoSupervisor;
  const mesesSet = new Set();
  DB.vendas.forEach(v => { if (v.status !== 'cancelado') calcParcelas(v).forEach(p => { if (p.ativa) mesesSet.add(p.mesRecebimento); }); });
  const mesesDisp = [...mesesSet].sort();
  if (!mesesDisp.includes(todayMes())) mesesDisp.push(todayMes());
  mesesDisp.sort();
  if (!st.mesSel || !mesesDisp.includes(st.mesSel)) st.mesSel = mesesDisp[mesesDisp.length-1] || todayMes();

  const itens = calcComissaoSupervisorMes(supervisorId, st.mesSel);
  const total = itens.reduce((a,i) => a+i.valor, 0);
  const idsEquipe = DB.vendedores.filter(v => v.liderId === supervisorId).map(v => v.id);
  const equipe = DB.vendedores.filter(v => idsEquipe.includes(v.id));

  const rows = itens.map(i => `<tr>
    <td>${i.cliente}</td><td>${i.contrato||'—'}</td><td>${i.tabelaNome}</td>
    <td><span class="chip">${i.n}ª</span></td>
    <td class="td-mono">${i.pct}%</td>
    <td class="td-mono td-right">${fmt(i.valor)}</td>
  </tr>`).join('');

  return `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
  <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase">
    Override sobre a equipe de ${supervisor.nome}
  </div>
  ${itens.length > 0 ? `<button class="btn btn-ghost btn-sm" onclick="verDemonstrativoSupervisorLideranca('${supervisorId}','${st.mesSel}')">👁 Demonstrativo</button>` : ''}
</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Equipe</div>
    <div class="stat-value">${equipe.length}</div>
    <div class="stat-meta">${equipe.map(v=>v.nome.split(' ')[0]).join(', ') || '—'}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Vendas com comissão no mês</div>
    <div class="stat-value">${itens.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Total a receber</div>
    <div class="stat-value" style="color:var(--brand)">${fmt(total)}</div>
  </div>
</div>

<div class="card">
  <div class="card-header"><span class="card-title">Detalhamento</span></div>
  <div class="table-wrap"><table>
    <thead><tr><th>Cliente</th><th>Contrato</th><th>Tabela</th><th>Parc.</th><th>%</th><th class="td-right">Valor</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" class="td-center" style="padding:40px;color:var(--text3)">Nenhuma comissão de supervisão neste mês</td></tr>`}</tbody>
  </table></div>
</div>

<div class="overlay" id="m-demo-sup">
  <div class="modal" style="width:620px">
    <button class="modal-close no-print" onclick="closeModal('m-demo-sup')">✕</button>
    <div class="modal-title" id="mds-title">Demonstrativo — Supervisão</div>
    <div class="modal-sub" id="mds-sub"></div>
    <div id="mds-body"></div>
    <div class="modal-actions no-print">
      <button class="btn btn-ghost" onclick="closeModal('m-demo-sup')">Fechar</button>
      <button class="btn btn-ghost" onclick="window.print()">🖨 Imprimir</button>
    </div>
  </div>
</div>
`;
}

function verDemonstrativoSupervisorLideranca(supervisorId, mes) {
  const supervisor = DB.vendedores.find(v => v.id === supervisorId);
  if (!supervisor) return;
  const itens = calcComissaoSupervisorMes(supervisorId, mes);
  const total = itens.reduce((a,i) => a+i.valor, 0);

  const termoDemo = termoLiderEquipeDoVendedor(supervisorId);
  document.getElementById('mds-title').textContent = `Demonstrativo — ${termoDemo === 'Closer' ? 'Closer' : 'Supervisão'} · ${mesLabel(mes)}`;
  document.getElementById('mds-sub').textContent = `Override sobre a equipe de ${supervisor.nome} — base de cálculo`;

  const rows = itens.map(i => `<tr style="border-bottom:1px solid var(--line)">
    <td style="padding:8px 10px;font-size:12px;font-weight:600">${i.cliente}</td>
    <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text2)">${i.contrato||'—'}</td>
    <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${i.tabelaNome}</td>
    <td style="padding:8px 10px;text-align:center">
      <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green);background:var(--green-dim);border:1px solid var(--green-glow);border-radius:5px;padding:2px 8px;white-space:nowrap">${i.n}ª</span>
    </td>
    <td style="padding:8px 10px;font-size:11px;color:var(--text2)">${vendorName(i.vendedor).split(' ')[0]}</td>
    <td style="padding:8px 10px;font-family:var(--mono);font-size:11px;color:var(--text3);text-align:right">${i.pct}%</td>
    <td style="padding:8px 10px;font-family:var(--mono);font-size:13px;font-weight:700;color:var(--brand);text-align:right">${fmt(i.valor)}</td>
  </tr>`).join('');

  const totalLinhas = itens.length;
  document.getElementById('mds-body').classList.toggle('compact-print', totalLinhas > 10);

  document.getElementById('mds-body').innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:14px 16px;background:var(--ink3);border-radius:10px;border:1px solid var(--line);margin-bottom:14px">
    <div style="font-size:11px;color:var(--text3);font-family:var(--mono);line-height:1.8">
      WCON System · Mundo do Consórcio<br>
      CNPJ: 00.000.000/0001-00<br>
      Emissão: ${fmtDate(today())}
    </div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:800;color:var(--brand);letter-spacing:-0.5px">DEMONSTRATIVO SUPERVISÃO</div>
      <div style="font-size:12px;color:var(--text2);font-family:var(--mono);margin-top:2px">${mesLabel(mes)} · ${supervisor.nome}</div>
    </div>
  </div>

  <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden">
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--ink4)">
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Cliente</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Contrato</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Tabela</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:center">Parcela</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:left">Vendedor</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right">%</th>
            <th style="padding:7px 10px;font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;text-align:right">Comissão</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="background:var(--ink3);border-top:2px solid var(--line2)">
            <td colspan="6" style="padding:10px;font-size:12px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:1px">Total a receber</td>
            <td style="padding:10px;font-family:var(--mono);font-size:16px;font-weight:800;color:var(--brand);text-align:right">${fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  `;
  openModal('m-demo-sup');
}

function renderComissaoLideranca() {
  const u = AppState.user;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const isSup = u.role === 'supervisor';
  if (!isG && !isSup) return `<div class="page-header"><div class="page-title">Acesso restrito</div></div>`;

  const st = AppState.modulo.comissaoLideranca;
  const supervisores = DB.vendedores.filter(v => DB.vendedores.some(x => x.liderId === v.id));

  // Mês único, compartilhado entre o resumo e os detalhes
  const mesesSet = new Set();
  DB.vendas.forEach(v => { if (v.status !== 'cancelado') calcParcelas(v).forEach(p => { if (p.ativa) mesesSet.add(p.mesRecebimento); }); });
  const mesesDisp = [...mesesSet].sort();
  if (!mesesDisp.includes(todayMes())) mesesDisp.push(todayMes());
  mesesDisp.sort();
  if (!st.mesSel || !mesesDisp.includes(st.mesSel)) st.mesSel = mesesDisp[mesesDisp.length - 1] || todayMes();

  // Sincroniza o mesmo mês nas telas internas de detalhe (WCON / Supervisor)
  AppState.modulo.remuneracao.mesSel = st.mesSel;
  AppState.modulo.comissaoSupervisor.mesSel = st.mesSel;

  const mesNav = renderMesNav(mesesDisp, st.mesSel, "AppState.modulo.comissaoLideranca.mesSel", 'comissaoLideranca');

  // Monta os cards do resumo: WCON (só gestor) + um por líder de equipe
  const cards = [];
  if (isG) {
    const { producao, recorrencia } = calcRemuneracaoMes(st.mesSel);
    const totalWcon = aplicarTravaGestor(st.mesSel, producao, recorrencia).vLiqFinal;
    cards.push({ key: 'wcon', label: 'WCON (Gestor)', total: totalWcon, meta: `${producao.length + recorrencia.length} contrato(s) com comissão` });
  }
  const listaSup = isG ? supervisores : supervisores.filter(s => s.id === u.id);
  listaSup.forEach(s => {
    const itensOverride = calcComissaoSupervisorMes(s.id, st.mesSel);
    const totalOverride = itensOverride.reduce((a, i) => a + i.valor, 0);
    const { producao: prodPessoal, recorrencia: recPessoal } = calcComissaoPessoalLider(s.id, st.mesSel);
    const totalPessoal = prodPessoal.reduce((a,i)=>a+i.valor,0) + recPessoal.reduce((a,i)=>a+i.valor,0);
    const total = totalOverride + totalPessoal;
    const equipe = DB.vendedores.filter(v => v.liderId === s.id).map(v => v.nome.split(' ')[0]).join(', ');
    const termo = termoLiderEquipeDoVendedor(s.id);
    cards.push({ key: 'sup_' + s.id, label: `${s.nome} (${termo === 'Closer' ? 'Closer' : 'Supervisão'})`, total, meta: `${itensOverride.length} contrato(s) equipe + ${prodPessoal.length+recPessoal.length} pessoal(is) · equipe: ${equipe || '—'}` });
  });

  if (!st.selecionado || !cards.some(c => c.key === st.selecionado)) {
    st.selecionado = cards[0]?.key || null;
  }

  const cardsHtml = cards.map(c => {
    const ativo = st.selecionado === c.key;
    return `<div onclick="AppState.modulo.comissaoLideranca.selecionado='${c.key}';rerenderModule('comissaoLideranca')"
      style="cursor:pointer;position:relative;border-radius:10px;padding:16px;transition:.15s;
      ${ativo ? 'background:var(--ink1);border:2px solid var(--brand)' : 'background:var(--ink2);border:1px solid var(--line)'}">
      <div style="font-size:10px;font-weight:700;color:${ativo ? 'var(--brand)' : 'var(--text3)'};letter-spacing:1px;text-transform:uppercase">${c.label}</div>
      <div style="font-size:22px;font-weight:800;font-family:var(--mono);color:${ativo ? '#fff' : 'var(--text)'};margin-top:6px">${fmt(c.total)}</div>
      <div style="font-size:10px;color:${ativo ? 'var(--text3)' : 'var(--text3)'};margin-top:4px">${c.meta}</div>
      <div style="position:absolute;top:14px;right:14px;font-size:16px;color:${ativo ? 'var(--brand)' : 'var(--text3)'}">${ativo ? '▴' : '▾'}</div>
    </div>`;
  }).join('');

  let detalhe = '';
  if (st.selecionado === 'wcon') {
    detalhe = renderRemuneracao();
  } else if (st.selecionado) {
    detalhe = renderConteudoComissaoSupervisor(st.selecionado.replace('sup_', ''));
  }

  return `
<div class="page-header">
  <div>
    <div class="page-title">Comissão Liderança</div>
    <div class="page-sub">// override de gerência e supervisão sobre a produção da equipe</div>
  </div>
</div>

${mesNav}

<div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.2px;text-transform:uppercase;margin:16px 0 8px">Resumo do mês</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px">
  ${cardsHtml || '<div style="color:var(--text3);font-size:12px;grid-column:1/-1">Nenhum líder de equipe cadastrado ainda.</div>'}
</div>

${detalhe}
`;
}

function renderModaisFunil() {
  const _isGestorModal = (AppState.user?.role === 'gestor' || AppState.user?.role === 'adm');
  return `
<div class="overlay" id="m-funil-novo">
  <div class="modal" style="max-width:560px">
    <button class="modal-close" onclick="closeModal('m-funil-novo')">✕</button>
    <div class="modal-title">Novo lead</div>

    <div class="tabs" style="margin-bottom:14px">
      ${_isGestorModal ? `<div class="tab active" id="mfn-tab-trafego" onclick="trocarAbaLeadFunil('trafego')">Tráfego</div>` : ''}
      <div class="tab ${_isGestorModal?'':'active'}" id="mfn-tab-discadora" onclick="trocarAbaLeadFunil('discadora')">Discadora/IA</div>
      <div class="tab" id="mfn-tab-pessoal" onclick="trocarAbaLeadFunil('pessoal')">Pessoal</div>
    </div>

    <div class="modal-sub" id="mfn-sub"></div>
    <div id="mfn-vendedor-wrap" class="form-group" style="display:none">
      <label>Vendedor</label>
      <select id="mfn-vendedor-select">
        ${vendedoresNaUnidade().map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
      </select>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Nome *</label><input id="mfn-nome" placeholder="Nome do lead"></div>
      <div class="form-group"><label>E-mail</label><input id="mfn-email" placeholder="email@exemplo.com"></div>
    </div>
    <div class="form-group"><label>Celular</label><input id="mfn-celular" placeholder="(00) 00000-0000"></div>

    <div class="form-group"><label>Interesse</label>
      <div id="mfn-interesse" style="display:flex;gap:6px;flex-wrap:wrap">
        ${FUNIL_INTERESSES.map(op => `<span class="chip" data-val="${op}" onclick="toggleInteresseFunil('${op}')" style="cursor:pointer">${op}</span>`).join('')}
      </div>
    </div>
    <div class="form-group"><label>Valor do crédito</label><input type="text" inputmode="numeric" id="mfn-valorcredito" placeholder="R$ 0,00" oninput="aplicarMascaraMoeda(this, event)"></div>

    <div id="mfn-campos-trafego" style="display:block">
      <div class="form-group"><label>Qual anúncio veio</label>
        <div id="mfn-anuncio" style="display:flex;gap:6px;flex-wrap:wrap">
          ${FUNIL_ANUNCIOS.map(op => `<span class="chip" data-val="${op}" onclick="selecionarAnuncioFunil('${op}')" style="cursor:pointer">${op}</span>`).join('')}
        </div>
      </div>
    </div>

    <div id="mfn-campos-ligacao" style="display:none">
      <div class="form-row cols-3">
        <div class="form-group"><label>Renda familiar</label><input type="number" id="mfn-renda" placeholder="8000"></div>
        <div class="form-group"><label>Decide a compra</label>
          <select id="mfn-decide">
            <option value="">Selecione...</option>
            <option value="sozinho">Decide sozinho(a)</option>
            <option value="com_conjuge">Decide com cônjuge/família</option>
            <option value="nao_decide">Não decide (influenciador)</option>
          </select>
        </div>
        <div class="form-group"><label>Parcela ideal</label><input type="number" id="mfn-parcela" placeholder="1500"></div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>Recurso próprio</label><input type="number" id="mfn-recurso" placeholder="0"></div>
        <div class="form-group"><label>Paga aluguel/financiamento</label>
          <div style="display:flex;gap:8px">
            <select id="mfn-aluguel" style="flex:0 0 90px" onchange="document.getElementById('mfn-aluguel-valor').style.display=this.value==='sim'?'block':'none'">
              <option value="nao">Não</option><option value="sim">Sim</option>
            </select>
            <input type="number" id="mfn-aluguel-valor" placeholder="Valor" style="display:none">
          </div>
        </div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>FGTS</label>
          <div style="display:flex;gap:8px">
            <select id="mfn-fgts" style="flex:0 0 90px" onchange="document.getElementById('mfn-fgts-valor').style.display=this.value==='sim'?'block':'none'">
              <option value="nao">Não</option><option value="sim">Sim</option>
            </select>
            <input type="number" id="mfn-fgts-valor" placeholder="Valor" style="display:none">
          </div>
        </div>
      </div>
      <div class="form-row cols-3">
        <div class="form-group"><label>Cidade</label>
          <select id="mfn-cidade"><option value="">Selecione...</option>${FUNIL_CIDADES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Origem da prospecção</label>
          <select id="mfn-origemprosp"><option value="">Selecione...</option>${FUNIL_ORIGENS_PROSPECCAO.map(o=>`<option value="${o}">${o}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Profissão</label><input id="mfn-profissao" placeholder="Profissão"></div>
      </div>
      <div class="form-group"><label>Histórico / Observação</label><textarea id="mfn-obs" placeholder="Anotações sobre a conversa..."></textarea></div>
    </div>
    <div id="mfn-erro" class="alert alert-red" style="display:none"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-funil-novo')">Cancelar</button>
      <button class="btn btn-primary" id="mfn-btn-salvar" onclick="salvarNovoLeadFunil()">Criar lead</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-funil-perfil">
  <div class="modal" style="max-width:420px">
    <div class="modal-title">Avaliar perfil</div>
    <div class="modal-sub" id="mfp-sub"></div>
    <div id="mfp-dados" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:14px"></div>
    <div id="mfp-sugestao" style="font-size:11px;font-weight:600;padding:10px;border-radius:8px;margin-bottom:16px"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-funil-perfil')">Cancelar</button>
      <button class="btn btn-danger" onclick="confirmarPerfilFunil(false)">✕ Sem perfil</button>
      <button class="btn btn-primary" onclick="confirmarPerfilFunil(true)">✓ Tem perfil</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-funil-venda">
  <div class="modal" style="max-width:320px">
    <div class="modal-title">Valor da venda</div>
    <div class="form-group"><label>Valor (R$)</label><input type="number" id="mfv-valor" placeholder="250000"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-funil-venda')">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmarVendaFunil()">Confirmar venda</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-funil-agenda">
  <div class="modal" style="max-width:360px">
    <div class="modal-title" id="mfa-titulo">Agendar reunião</div>
    <div class="modal-sub">Entra na Agenda compartilhada da equipe.</div>
    <div class="form-row cols-2">
      <div class="form-group"><label>Data</label><input type="date" id="mfa-data" onchange="atualizarConflitoAgendaFunil()"></div>
      <div class="form-group"><label>Hora</label><input type="time" id="mfa-hora" onchange="atualizarConflitoAgendaFunil()"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-bottom:8px">
      <input type="checkbox" id="mfa-gestor" onchange="atualizarConflitoAgendaFunil()"> Precisa que o Gestor participe
    </label>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-bottom:14px">
      <input type="checkbox" id="mfa-supervisor" onchange="atualizarConflitoAgendaFunil()"> Precisa que o líder de equipe participe
    </label>
    <div id="mfa-conflito" class="alert alert-red" style="display:none"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-funil-agenda')">Cancelar</button>
      <button class="btn btn-primary" id="mfa-btn-confirmar" onclick="confirmarAgendamentoFunil()">Confirmar agendamento</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-funil-redistribuir" style="z-index:600">
  <div class="modal" style="max-width:380px">
    <div class="modal-title" id="mfr-title">Redistribuir lead</div>
    <div class="modal-sub" id="mfr-sub"></div>
    <div class="form-group">
      <label>Vendedor</label>
      <select id="mfr-vendedor-select"></select>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-funil-redistribuir')">Cancelar</button>
      <button class="btn btn-primary" id="mfr-btn-confirmar" onclick="confirmarRedistribuicaoManual()">Redistribuir</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-funil-ligacoes">
  <div class="modal" style="max-width:420px">
    <button class="modal-close" onclick="closeModal('m-funil-ligacoes')">✕</button>
    <div class="modal-title">Corrigir registros de ligações</div>
    <div class="form-group">
      <label>Vendedor</label>
      <select id="mfl-vendedor-select" onchange="carregarLigacoesDoVendedor()">
        ${vendedoresNaUnidade().map(v => `<option value="${v.id}">${v.nome}</option>`).join('')}
      </select>
    </div>
    <div id="mfl-lista" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-top:10px"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('m-funil-ligacoes')">Fechar</button>
    </div>
  </div>
</div>

<div class="overlay" id="m-funil-detalhe">
  <div class="modal" style="max-width:460px">
    <button class="modal-close" onclick="closeModal('m-funil-detalhe')">✕</button>
    <div id="mfd-conteudo"></div>
  </div>
</div>`;
}

let _funilLeadTipo = 'trafego';
let _funilInteresseSel = [];
let _funilAnuncioSel = '';
let _funilLeadPerfilTarget = null;
let _funilLeadVendaTarget = null;

function abrirModalNovoLeadFunil() {
  _funilInteresseSel = [];
  _funilAnuncioSel = '';
  ['mfn-nome','mfn-email','mfn-celular','mfn-valorcredito','mfn-renda','mfn-parcela','mfn-recurso','mfn-aluguel-valor','mfn-fgts-valor','mfn-profissao','mfn-obs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('#mfn-interesse .chip, #mfn-anuncio .chip').forEach(c => {
    c.style.background = ''; c.style.color = ''; c.style.borderColor = ''; c.style.fontWeight = '';
  });
  document.getElementById('mfn-decide').value = '';
  document.getElementById('mfn-aluguel').value = 'nao';
  document.getElementById('mfn-fgts').value = 'nao';
  document.getElementById('mfn-cidade').value = '';
  document.getElementById('mfn-origemprosp').value = '';
  document.getElementById('mfn-aluguel-valor').style.display = 'none';
  document.getElementById('mfn-fgts-valor').style.display = 'none';
  document.getElementById('mfn-erro').style.display = 'none';
  const _isGestorAbrir = (AppState.user?.role === 'gestor' || AppState.user?.role === 'adm');
  trocarAbaLeadFunil(_isGestorAbrir ? 'trafego' : 'discadora');
  openModal('m-funil-novo');
}

function trocarAbaLeadFunil(tipo) {
  _funilLeadTipo = tipo;
  const isG = (AppState.user.role === 'gestor' || AppState.user.role === 'adm');
  ['trafego','discadora','pessoal'].forEach(t => {
    document.getElementById('mfn-tab-' + t)?.classList.toggle('active', t === tipo);
  });
  document.getElementById('mfn-campos-trafego').style.display = tipo === 'trafego' ? 'block' : 'none';
  document.getElementById('mfn-campos-ligacao').style.display = tipo !== 'trafego' ? 'block' : 'none';
  // NOVO: tráfego não tem escolha de vendedor — sempre entra "Não atribuído",
  // a distribuição acontece depois, separadamente (redistribuir/atribuir)
  document.getElementById('mfn-vendedor-wrap').style.display = (isG && tipo !== 'trafego') ? 'block' : 'none';
  const _mfnSubEl = document.getElementById('mfn-sub');
  _mfnSubEl.style.fontFamily = 'var(--font)';
  _mfnSubEl.textContent = tipo === 'trafego'
    ? 'Entra como "Não atribuído". Nome, contato e qual anúncio trouxe o lead — a distribuição pro vendedor é feita depois.'
    : tipo === 'discadora'
      ? (isG ? 'Escolha o vendedor. Preencha o que ele conseguiu com o lead vindo da discadora/IA.' : 'Atribuído a você. Preencha o que conseguiu com o lead vindo da discadora/IA.')
      : (isG ? 'Escolha o vendedor. Lead trazido pessoalmente (rede/indicação).' : 'Atribuído a você. Lead trazido pessoalmente (rede/indicação).');
}

function selecionarAnuncioFunil(valor) {
  _funilAnuncioSel = valor;
  document.querySelectorAll('#mfn-anuncio .chip').forEach(c => {
    const sel = c.dataset.val === valor;
    c.style.background = sel ? 'var(--brand)' : '';
    c.style.color = sel ? '#fff' : '';
    c.style.borderColor = sel ? 'var(--brand)' : '';
    c.style.fontWeight = sel ? '700' : '400';
  });
}

function toggleInteresseFunil(valor) {
  const idx = _funilInteresseSel.indexOf(valor);
  if (idx >= 0) _funilInteresseSel.splice(idx, 1); else _funilInteresseSel.push(valor);
  document.querySelectorAll('#mfn-interesse .chip').forEach(c => {
    const selecionado = _funilInteresseSel.includes(c.dataset.val);
    c.style.background = selecionado ? 'var(--brand)' : '';
    c.style.color = selecionado ? '#fff' : '';
    c.style.borderColor = selecionado ? 'var(--brand)' : '';
    c.style.fontWeight = selecionado ? '700' : '400';
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTAÇÃO DE LEADS EM MASSA (planilha) — só gestor
   ═══════════════════════════════════════════════════════════════════════════ */
let _importLeads = { linhas: [], cabecalhos: [], mapeamento: {}, passo: 1 };

const CAMPOS_IMPORT_LEAD = [
  ['nome', 'Nome do lead *'],
  ['telefone', 'Telefone'],
  ['valor_credito', 'Valor de crédito'],
  ['interesse', 'Interesse'],
  ['ignorar', 'Ignorar coluna'],
];

function abrirImportarLeads() {
  const u = AppState.user;
  if (u.role !== 'gestor' && u.role !== 'adm') return;
  _importLeads = { linhas: [], cabecalhos: [], mapeamento: {}, passo: 1 };

  // NOVO: injeta o modal no container fixo (fora dos módulos) — assim
  // funciona igual vindo do Funil ou da tela de Leads, sem duplicar IDs
  const container = document.getElementById('modal-importar-leads-container');
  if (container && !document.getElementById('m-importar-leads')) {
    container.innerHTML = `
      <div class="overlay" id="m-importar-leads">
        <div class="modal" style="max-width:640px">
          <button class="modal-close" onclick="closeModal('m-importar-leads')">✕</button>
          <div class="modal-title">Importar leads de uma planilha</div>
          <div id="import-leads-conteudo"></div>
        </div>
      </div>`;
  }

  renderPassoImportLeads();
  openModal('m-importar-leads');
}

function renderPassoImportLeads() {
  const el = document.getElementById('import-leads-conteudo');
  if (!el) return;
  const p = _importLeads.passo;

  if (p === 1) {
    el.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:16px">Passo 1 — Enviar arquivo</div>
      <label for="import-leads-input" style="display:block;background:var(--ink3);border:2px dashed var(--line2);border-radius:12px;padding:50px 20px;text-align:center;cursor:pointer">
        <div style="font-size:32px;margin-bottom:10px">📄</div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">Clique pra escolher a planilha</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Aceita .xlsx, .xls ou .csv</div>
      </label>
      <input type="file" id="import-leads-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="processarArquivoImportacaoLeads(this)">
      <div id="import-leads-erro" style="color:var(--brand);font-size:12px;margin-top:10px"></div>
    `;
  } else if (p === 2) {
    el.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Passo 2 — Mapear colunas</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:16px">Encontramos ${_importLeads.cabecalhos.length} coluna(s) na sua planilha (${_importLeads.linhas.length} linha(s) de dados). Diz pra gente o que cada uma significa:</div>
      ${_importLeads.cabecalhos.map((_, i) => {
        const amostra = (_importLeads.linhas[0] && _importLeads.linhas[0][i] != null) ? String(_importLeads.linhas[0][i]) : '(vazio)';
        return `<div style="background:var(--ink3);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <div style="font-size:9px;color:var(--text3)">COLUNA ${i+1} — EX:</div>
            <div style="font-size:12px;font-weight:700">${amostra}</div>
          </div>
          <div style="font-size:14px;color:var(--text3)">→</div>
          <select style="flex:1;min-width:160px" onchange="AppState._importMapTmp=AppState._importMapTmp||{};_importLeads.mapeamento[${i}]=this.value">
            ${CAMPOS_IMPORT_LEAD.map(([val,lbl]) => `<option value="${val}"${(_importLeads.mapeamento[i]===val || (!_importLeads.mapeamento[i] && val==='ignorar')) ? ' selected':''}>${lbl}</option>`).join('')}
          </select>
        </div>`;
      }).join('')}
      <div id="import-leads-erro" style="color:var(--brand);font-size:12px;margin:10px 0"></div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" onclick="_importLeads.passo=1;renderPassoImportLeads()">← Voltar</button>
        <button class="btn btn-primary" style="flex:1" onclick="avancarConferenciaImportLeads()">Continuar →</button>
      </div>
    `;
  } else {
    const total = _importLeads.linhas.length;
    const amostra = _importLeads.linhas.slice(0, 5);
    const idxNome = Object.keys(_importLeads.mapeamento).find(i => _importLeads.mapeamento[i] === 'nome');
    const idxTel = Object.keys(_importLeads.mapeamento).find(i => _importLeads.mapeamento[i] === 'telefone');
    const idxCred = Object.keys(_importLeads.mapeamento).find(i => _importLeads.mapeamento[i] === 'valor_credito');
    const idxInt = Object.keys(_importLeads.mapeamento).find(i => _importLeads.mapeamento[i] === 'interesse');

    el.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:16px">Passo 3 — Conferir antes de importar</div>
      <div style="background:var(--green-dim,#EAF3DE);border-radius:10px;padding:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:12px;font-weight:700;color:#27500A">${total} lead(s) prontos pra importar</div>
          <div style="font-size:10px;color:#3B6D11">Entram sem vendedor atribuído — vocês distribuem depois</div>
        </div>
        <div style="font-size:24px">✅</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Telefone</th><th style="text-align:right">Crédito</th><th>Interesse</th></tr></thead>
          <tbody>
            ${amostra.map(linha => `<tr>
              <td>${idxNome!=null ? (linha[idxNome]||'—') : '—'}</td>
              <td>${idxTel!=null ? (linha[idxTel]||'—') : '—'}</td>
              <td style="text-align:right">${idxCred!=null && linha[idxCred] ? fmt(parseFloat(String(linha[idxCred]).replace(/[^\d.,]/g,'').replace(',','.'))||0) : '—'}</td>
              <td>${idxInt!=null ? (linha[idxInt]||'—') : '—'}</td>
            </tr>`).join('')}
            ${total > 5 ? `<tr><td colspan="4" style="text-align:center;color:var(--text3)">... mais ${total-5} linha(s)</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost" onclick="_importLeads.passo=2;renderPassoImportLeads()">← Voltar</button>
        <button class="btn btn-primary" style="flex:1" id="btn-confirmar-import" onclick="confirmarImportacaoLeads()">✓ Importar ${total} lead(s)</button>
      </div>
    `;
  }
}

function processarArquivoImportacaoLeads(input) {
  const arquivo = input.files?.[0];
  const erroEl = document.getElementById('import-leads-erro');
  if (!arquivo) return;
  if (typeof XLSX === 'undefined') { if (erroEl) erroEl.textContent = 'Não consegui carregar o leitor de planilhas. Recarregue a página e tente de novo.'; return; }

  const leitor = new FileReader();
  leitor.onload = (e) => {
    try {
      const dados = new Uint8Array(e.target.result);
      const wb = XLSX.read(dados, { type: 'array' });
      const primeiraAba = wb.SheetNames[0];
      const linhasCompletas = XLSX.utils.sheet_to_json(wb.Sheets[primeiraAba], { header: 1, defval: '' });
      const linhasFiltradas = linhasCompletas.filter(l => l.some(c => String(c).trim() !== ''));
      if (linhasFiltradas.length === 0) { if (erroEl) erroEl.textContent = 'Não encontrei nenhuma linha com dado nessa planilha.'; return; }

      const qtdColunas = Math.max(...linhasFiltradas.map(l => l.length));
      _importLeads.cabecalhos = Array.from({length: qtdColunas}, (_, i) => `Coluna ${i+1}`);
      _importLeads.linhas = linhasFiltradas;

      // Tenta adivinhar o mapeamento automaticamente pelo conteúdo da 1ª linha
      const amostra = linhasFiltradas[0];
      _importLeads.mapeamento = {};
      amostra.forEach((val, i) => {
        const s = String(val).trim();
        if (/^\+?\d[\d\s()-]{7,}$/.test(s)) _importLeads.mapeamento[i] = 'telefone';
        else if (/^r?\$?\s?[\d.,]+$/.test(s) && /\d/.test(s)) _importLeads.mapeamento[i] = 'valor_credito';
        else if (!_importLeads.mapeamento[0] && isNaN(parseFloat(s))) _importLeads.mapeamento[i] = i === 0 ? 'nome' : 'ignorar';
      });
      if (!Object.values(_importLeads.mapeamento).includes('nome')) _importLeads.mapeamento[0] = 'nome';

      _importLeads.passo = 2;
      renderPassoImportLeads();
    } catch (err) {
      console.error('Erro ao ler planilha:', err);
      if (erroEl) erroEl.textContent = 'Não consegui ler esse arquivo. Confira se é um Excel (.xlsx/.xls) ou CSV válido.';
    }
  };
  leitor.readAsArrayBuffer(arquivo);
}

function avancarConferenciaImportLeads() {
  const temNome = Object.values(_importLeads.mapeamento).includes('nome');
  const erroEl = document.getElementById('import-leads-erro');
  if (!temNome) { if (erroEl) erroEl.textContent = 'Marque qual coluna é o "Nome do lead" — esse campo é obrigatório.'; return; }
  _importLeads.passo = 3;
  renderPassoImportLeads();
}

function valorMoedaParaNumeroTexto(s) {
  if (s == null || s === '') return null;
  if (typeof s === 'number') return s;
  const limpo = String(s).replace(/[^\d.,]/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
}

async function confirmarImportacaoLeads() {
  const u = AppState.user;
  const unidade = unidadeEscopoAtual() || 'brusque';
  const idxNome = Object.keys(_importLeads.mapeamento).find(i => _importLeads.mapeamento[i] === 'nome');
  const idxTel = Object.keys(_importLeads.mapeamento).find(i => _importLeads.mapeamento[i] === 'telefone');
  const idxCred = Object.keys(_importLeads.mapeamento).find(i => _importLeads.mapeamento[i] === 'valor_credito');
  const idxInt = Object.keys(_importLeads.mapeamento).find(i => _importLeads.mapeamento[i] === 'interesse');

  const hojeStr = today();
  const leadsParaInserir = _importLeads.linhas
    .filter(linha => idxNome != null && String(linha[idxNome]||'').trim())
    .map(linha => ({
      nome: String(linha[idxNome]).trim(),
      celular: idxTel != null ? String(linha[idxTel]||'').trim() || null : null,
      valor_credito: idxCred != null ? valorMoedaParaNumeroTexto(linha[idxCred]) : null,
      interesse: idxInt != null ? String(linha[idxInt]||'').trim() || null : null,
      // NOVO: origem especial — só a gestão sabe que já foi trabalhado antes
      origem: 'redistribuicao_sistema',
      vendedor_id: null,
      etapa: 'lead',
      tentativas: 0,
      unidade,
      historico_etapas: [{ etapa: 'lead', data: hojeStr }],
      criado_em: hojeStr,
    }));

  if (leadsParaInserir.length === 0) { Dialog.alert('Nada pra importar', ['Nenhuma linha válida encontrada com o mapeamento atual.']); return; }

  const btn = document.getElementById('btn-confirmar-import');
  if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }

  try {
    const resultado = await Servicos.criarLeadsFunilEmMassa(leadsParaInserir);
    if (!resultado) throw new Error('Falha na importação.');
    await carregarDadosIniciais();
    closeModal('m-importar-leads');
    Dialog.success('Importação concluída', [{ tipo:'destaque', label:'Leads importados', valor: String(resultado.length) }]);
    rerenderModule('leadsPainel');
  } catch (e) {
    console.error('Erro ao importar leads:', e);
    Dialog.alert('Erro na importação', ['Não foi possível importar os leads. Tente novamente ou confira sua conexão.']);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = `✓ Importar ${leadsParaInserir.length} lead(s)`; }
  }
}

async function salvarNovoLeadFunil() {
  const nome = document.getElementById('mfn-nome').value.trim();
  if (!nome) { const e = document.getElementById('mfn-erro'); e.textContent = 'Digite o nome do lead.'; e.style.display = 'block'; return; }
  const u = AppState.user;
  const btn = document.getElementById('mfn-btn-salvar');
  btn.disabled = true; btn.textContent = 'Salvando...';

  const base = {
    nome, email: document.getElementById('mfn-email').value.trim(), celular: document.getElementById('mfn-celular').value.trim(),
  };

  let payload;
  const isG = (u.role === 'gestor' || u.role === 'adm');
  const vendedorEscolhido = isG ? document.getElementById('mfn-vendedor-select').value : u.id;
  if (isG && !vendedorEscolhido) { const e = document.getElementById('mfn-erro'); e.textContent = 'Cadastre pelo menos um vendedor antes.'; e.style.display='block'; btn.disabled=false; btn.textContent='Criar lead'; return; }

  if (_funilLeadTipo === 'trafego') {
    const unidadeLead = unidadeEscopoAtual() || 'brusque';
    payload = { ...base, origem: 'trafego', anuncio_origem: _funilAnuncioSel, vendedor_id: null, etapa: 'lead', tentativas: 0, unidade: unidadeLead,
      interesse: _funilInteresseSel, valor_credito: valorMoedaParaNumero(document.getElementById('mfn-valorcredito').value),
      historico_etapas: [{ etapa:'lead', data: today() }] };
  } else {
    const agoraIso = new Date().toISOString();
    const unidadeLead = DB.vendedores.find(v => v.id === vendedorEscolhido)?.unidade || unidadeEscopoAtual() || 'brusque';
    payload = {
      ...base, origem: _funilLeadTipo, vendedor_id: vendedorEscolhido, etapa: 'contato', tentativas: 1, unidade: unidadeLead,
      primeiro_contato_ts: agoraIso,
      interesse: _funilInteresseSel, valor_credito: valorMoedaParaNumero(document.getElementById('mfn-valorcredito').value),
      renda_familiar: parseFloat(document.getElementById('mfn-renda').value)||0,
      decide_compra: document.getElementById('mfn-decide').value,
      parcela_ideal: parseFloat(document.getElementById('mfn-parcela').value)||0,
      recurso_proprio: parseFloat(document.getElementById('mfn-recurso').value)||0,
      paga_aluguel: document.getElementById('mfn-aluguel').value,
      paga_aluguel_valor: parseFloat(document.getElementById('mfn-aluguel-valor').value)||0,
      fgts: document.getElementById('mfn-fgts').value,
      fgts_valor: parseFloat(document.getElementById('mfn-fgts-valor').value)||0,
      cidade: document.getElementById('mfn-cidade').value,
      origem_prospeccao: document.getElementById('mfn-origemprosp').value,
      profissao: document.getElementById('mfn-profissao').value.trim(),
      observacoes: document.getElementById('mfn-obs').value.trim(),
      historico_etapas: [{ etapa:'contato', data: today() }],
    };
  }

  const criado = await Servicos.criarLeadFunil(payload);
  btn.disabled = false; btn.textContent = 'Criar lead';
  if (!criado) { Dialog.alert('Erro ao salvar', ['Não foi possível criar o lead. Verifique sua conexão.']); return; }

  closeModal('m-funil-novo');
  await carregarDadosIniciais();
  rerenderModule('funil');
}

async function moverEtapaFunil(leadId, novaEtapa) {
  if (novaEtapa === 'venda') {
    const lead = DB.leadsFunil.find(l => l.id === leadId);
    const nomeLead = lead?.nome || 'esse lead';
    const ok = await Dialog.confirm('Cadastrar a venda agora?', [
      `Pra gerar comissão, ${nomeLead} precisa virar uma venda de verdade no Relatório.`,
      'Quer cadastrar agora, com os dados já preenchidos?',
    ]);
    if (ok) abrirNovaVendaDoLead(leadId);
    // Se escolher "Depois": não muda a etapa do lead ainda — ele só entra em
    // "Venda" de verdade quando a venda for realmente cadastrada. Assim não
    // fica um card em "Venda" sem comissão vinculada, esquecido.
    return;
  }
  if (novaEtapa === 'reuniao1' || novaEtapa === 'reuniao2') {
    abrirModalAgendaFunil(leadId, novaEtapa);
    return;
  }
  if (novaEtapa === 'qualificacao') {
    const lead = DB.leadsFunil.find(l => l.id === leadId);
    abrirModalPerfilFunil(lead);
    return;
  }
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const historico = [...(lead.historico||[]), { etapa: novaEtapa, data: today() }];
  const patch = { etapa: novaEtapa, historico_etapas: historico };
  if (novaEtapa === 'contato') {
    patch.tentativas = (lead.tentativas||0) + 1;
    if (!lead.primeiroContatoTs) patch.primeiro_contato_ts = new Date().toISOString();
  }
  const ok = await Servicos.atualizarLeadFunil(leadId, patch);
  if (!ok) { Dialog.alert('Erro', ['Não foi possível atualizar o lead.']); return; }
  await carregarDadosIniciais();
  rerenderModule('funil');
}

function abrirModalPerfilFunil(lead) {
  _funilLeadPerfilTarget = lead.id;
  document.getElementById('mfp-sub').textContent = lead.nome;
  document.getElementById('mfp-dados').innerHTML = `
    <div><span style="color:var(--text3)">Crédito:</span> ${fmt(lead.valorCredito)}</div>
    <div><span style="color:var(--text3)">Renda:</span> ${fmt(lead.rendaFamiliar)}</div>
    <div><span style="color:var(--text3)">Parcela ideal:</span> ${fmt(lead.parcelaIdeal)}</div>
    <div><span style="color:var(--text3)">Recurso próprio:</span> ${fmt(lead.recursoProprio)}</div>
    <div><span style="color:var(--text3)">Decide compra:</span> ${lead.decideCompra||'—'}</div>
    <div><span style="color:var(--text3)">Profissão:</span> ${lead.profissao||'—'}</div>`;
  const renda = lead.rendaFamiliar||0, parcela = lead.parcelaIdeal||0;
  let sug;
  if (renda <= 0) sug = { bg:'var(--amber-dim)', cor:'var(--amber)', texto:'Sem dados de renda suficientes — avaliar com cuidado' };
  else {
    const ratio = parcela/renda;
    if (ratio > 0 && ratio <= 0.3) sug = { bg:'var(--green-dim)', cor:'var(--green)', texto:`Parcela é ${(ratio*100).toFixed(0)}% da renda — perfil provável` };
    else if (ratio <= 0.5) sug = { bg:'var(--amber-dim)', cor:'var(--amber)', texto:`Parcela é ${(ratio*100).toFixed(0)}% da renda — atenção, avaliar` };
    else sug = { bg:'var(--red-dim)', cor:'var(--red)', texto:`Parcela é ${(ratio*100).toFixed(0)}% da renda — provável sem perfil` };
  }
  const sugEl = document.getElementById('mfp-sugestao');
  sugEl.style.background = sug.bg; sugEl.style.color = sug.cor;
  sugEl.textContent = `Sugestão automática: ${sug.texto}. A decisão final é sua.`;
  openModal('m-funil-perfil');
}

async function confirmarPerfilFunil(temPerfil) {
  const leadId = _funilLeadPerfilTarget;
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const novaEtapa = temPerfil ? 'qualificacao' : 'desqualificado';
  const historico = [...(lead.historico||[]), { etapa: novaEtapa, data: today() }];
  const patch = { etapa: novaEtapa, perfil: temPerfil, historico_etapas: historico };
  if (!temPerfil) patch.motivo_perdido = 'Sem perfil';
  await Servicos.atualizarLeadFunil(leadId, patch);
  closeModal('m-funil-perfil');
  await carregarDadosIniciais();
  rerenderModule('funil');
}

async function confirmarVendaFunil() {
  const leadId = _funilLeadVendaTarget;
  const valor = parseFloat(document.getElementById('mfv-valor').value) || 0;
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const historico = [...(lead.historico||[]), { etapa:'venda', data: today() }];
  await Servicos.atualizarLeadFunil(leadId, { etapa:'venda', valor_venda: valor, historico_etapas: historico });
  closeModal('m-funil-venda');
  await carregarDadosIniciais();
  rerenderModule('funil');
}

let _funilAgendaTarget = null; // { leadId, novaEtapa }

function abrirModalAgendaFunil(leadId, novaEtapa) {
  _funilAgendaTarget = { leadId, novaEtapa };
  document.getElementById('mfa-titulo').textContent = 'Agendar ' + (novaEtapa === 'reuniao1' ? '1ª Reunião' : '2ª Reunião');
  document.getElementById('mfa-data').value = today();
  document.getElementById('mfa-hora').value = '14:00';
  document.getElementById('mfa-gestor').checked = false;
  document.getElementById('mfa-supervisor').checked = false;
  atualizarConflitoAgendaFunil();
  openModal('m-funil-agenda');
}

function checarConflitoAgendaFunil(data, hora, reqGestor, reqSupervisor, leadIdAtual) {
  if (!data || !hora || (!reqGestor && !reqSupervisor)) return [];
  const conflitos = [];
  DB.leadsFunil.forEach(l => {
    if (l.id === leadIdAtual) return;
    if (l.dataReuniao1 === data && l.horaReuniao1 === hora && ((reqGestor && l.requerGestorReuniao1) || (reqSupervisor && l.requerSupervisorReuniao1))) {
      conflitos.push({ nome: l.nome, tipo: '1ª Reunião' });
    }
    if (l.dataReuniao2 === data && l.horaReuniao2 === hora && ((reqGestor && l.requerGestorReuniao2) || (reqSupervisor && l.requerSupervisorReuniao2))) {
      conflitos.push({ nome: l.nome, tipo: '2ª Reunião' });
    }
  });
  return conflitos;
}

function atualizarConflitoAgendaFunil() {
  const data = document.getElementById('mfa-data').value;
  const hora = document.getElementById('mfa-hora').value;
  const reqGestor = document.getElementById('mfa-gestor').checked;
  const reqSupervisor = document.getElementById('mfa-supervisor').checked;
  const conflitos = checarConflitoAgendaFunil(data, hora, reqGestor, reqSupervisor, _funilAgendaTarget?.leadId);
  const el = document.getElementById('mfa-conflito');
  const btn = document.getElementById('mfa-btn-confirmar');
  if (conflitos.length > 0) {
    el.style.display = 'block';
    el.textContent = `⚠ Conflito de horário: ${conflitos.map(c => `${c.nome} (${c.tipo})`).join(', ')} já reservou esse mesmo horário.`;
    btn.textContent = 'Confirmar mesmo assim';
  } else {
    el.style.display = 'none';
    btn.textContent = 'Confirmar agendamento';
  }
}

async function confirmarAgendamentoFunil() {
  const { leadId, novaEtapa } = _funilAgendaTarget;
  const data = document.getElementById('mfa-data').value;
  const hora = document.getElementById('mfa-hora').value;
  if (!data || !hora) return;
  const reqGestor = document.getElementById('mfa-gestor').checked;
  const reqSupervisor = document.getElementById('mfa-supervisor').checked;
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  const historico = [...(lead.historico||[]), { etapa: novaEtapa, data: today() }];
  const campoData = novaEtapa === 'reuniao1' ? 'data_reuniao1' : 'data_reuniao2';
  const campoHora = novaEtapa === 'reuniao1' ? 'hora_reuniao1' : 'hora_reuniao2';
  const campoGestor = novaEtapa === 'reuniao1' ? 'requer_gestor_reuniao1' : 'requer_gestor_reuniao2';
  const campoSupervisor = novaEtapa === 'reuniao1' ? 'requer_supervisor_reuniao1' : 'requer_supervisor_reuniao2';
  await Servicos.atualizarLeadFunil(leadId, {
    etapa: novaEtapa, [campoData]: data, [campoHora]: hora,
    [campoGestor]: reqGestor, [campoSupervisor]: reqSupervisor,
    historico_etapas: historico,
  });
  closeModal('m-funil-agenda');
  await carregarDadosIniciais();
  rerenderModule('funil');
}

async function marcarPerdidoFunil(leadId) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const historico = [...(lead.historico||[]), { etapa:'desqualificado', data: today() }];
  await Servicos.atualizarLeadFunil(leadId, { etapa:'desqualificado', motivo_perdido: lead.motivoPerdido || 'Descartado', historico_etapas: historico });
  await carregarDadosIniciais();
  rerenderModule('funil');
}

async function incrementarTentativaFunil(leadId) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  await Servicos.atualizarLeadFunil(leadId, { tentativas: (lead.tentativas||0) + 1 });
  await carregarDadosIniciais();
  rerenderModule('funil');
}

async function salvarLigacoesFunil() {
  const n = parseInt(document.getElementById('funil-ligacoes-input').value) || 0;
  if (n <= 0) return;
  await Servicos.registrarLigacao(AppState.user.id, today(), n);
  await carregarDadosIniciais();
  rerenderModule('funil');
}

let _funilRedistribuirTarget = null;

function abrirRedistribuirLeadFunil(leadId) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  _funilRedistribuirTarget = leadId;
  const mes = (lead.criadoEm||today()).substring(0,7);
  const vendAtual = DB.vendedores.find(v => v.id === lead.vendedor);
  const semVendedor = !lead.vendedor;

  // NOVO: gerente de unidade só redistribui dentro da própria equipe/unidade;
  // gestor master pode mandar pra qualquer unidade (transferência entre times)
  const unidadeEscopo = unidadeEscopoAtual();
  const opcoesBase = (unidadeEscopo ? DB.vendedores.filter(v => v.unidade === unidadeEscopo) : DB.vendedores)
    .filter(v => v.id !== lead.vendedor);
  const sugestao = melhorPerformanceFunil(lead.vendedor, mes);

  document.getElementById('mfr-title').textContent = semVendedor ? 'Atribuir a um vendedor' : 'Redistribuir lead';
  document.getElementById('mfr-btn-confirmar').textContent = semVendedor ? 'Atribuir' : 'Redistribuir';
  document.getElementById('mfr-sub').textContent = semVendedor ? `${lead.nome} — ainda não atribuído` : `${lead.nome} — atualmente com ${vendAtual?.nome || '—'}`;
  const select = document.getElementById('mfr-vendedor-select');
  if (unidadeEscopo) {
    select.innerHTML = opcoesBase.map(v => `<option value="${v.id}" ${v.id===sugestao?'selected':''}>${v.nome}${v.id===sugestao?' (melhor performance no mês)':''}</option>`).join('');
  } else {
    // Gestor master vê agrupado por unidade, deixando claro quando é transferência
    const porUnidade = { brusque: [], blumenau: [] };
    opcoesBase.forEach(v => (porUnidade[v.unidade || 'brusque'] || (porUnidade[v.unidade]=[])).push(v));
    select.innerHTML = Object.entries(porUnidade).filter(([,l])=>l.length>0).map(([un,lista]) => `
      <optgroup label="${un === 'blumenau' ? 'Blumenau' : 'Brusque'}">
        ${lista.map(v => `<option value="${v.id}" ${v.id===sugestao?'selected':''}>${v.nome}${v.id===sugestao?' (melhor performance no mês)':''}</option>`).join('')}
      </optgroup>`).join('');
  }
  openModal('m-funil-redistribuir');
}

async function confirmarRedistribuicaoManual() {
  const leadId = _funilRedistribuirTarget;
  const novoVendedor = document.getElementById('mfr-vendedor-select').value;
  if (!novoVendedor) return;
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const vendNovo = DB.vendedores.find(v => v.id === novoVendedor);
  const unidadeNova = vendNovo?.unidade || 'brusque';
  const unidadeAtualLead = lead.unidade || 'brusque';
  const ehTransferenciaUnidade = unidadeNova !== unidadeAtualLead;

  const historico = [...(lead.historico||[]), { etapa: lead.etapa, data: today(), nota: 'Redistribuído manualmente pelo gestor' }];
  const patch = {
    vendedor_anterior_id: lead.vendedor, vendedor_id: novoVendedor, tentativas: 0,
    vezes_redistribuido: (lead.vezesRedistribuido||0) + 1, historico_etapas: historico,
  };

  // NOVO: se a redistribuição muda de unidade, registra o rastro (só o
  // gestor master consegue ver isso depois — pro time de destino, o lead só
  // aparece normal, como se fosse nativo da unidade dele)
  if (ehTransferenciaUnidade) {
    patch.unidade = unidadeNova;
    if (!lead.unidadeOrigem) patch.unidade_origem = unidadeAtualLead;
    const transferencias = [...(lead.transferenciasUnidade||[]), { de: unidadeAtualLead, para: unidadeNova, data: today(), por: AppState.user.nome }];
    patch.transferencias_unidade = transferencias;
  }

  await Servicos.atualizarLeadFunil(leadId, patch);
  closeModal('m-funil-redistribuir');
  closeModal('m-funil-detalhe');
  await carregarDadosIniciais();
  rerenderModule('funil');
}

function abrirEditarLigacoesFunil() {
  const st = AppState.modulo.funil;
  const select = document.getElementById('mfl-vendedor-select');
  if (st.filtroVend) select.value = st.filtroVend;
  openModal('m-funil-ligacoes');
  carregarLigacoesDoVendedor();
}

function carregarLigacoesDoVendedor() {
  const vendId = document.getElementById('mfl-vendedor-select').value;
  const st = AppState.modulo.funil;
  const porDia = DB.funilLigacoes[vendId] || {};
  const dias = Object.entries(porDia)
    .filter(([d]) => d.substring(0,7) === st.mesSel)
    .sort((a,b) => b[0].localeCompare(a[0]));

  document.getElementById('mfl-lista').innerHTML = dias.length ? dias.map(([data, qtd]) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--ink3);border-radius:6px;padding:8px 10px">
      <span style="font-size:12px;flex:1">${fmtDate(data)}</span>
      <input type="number" min="0" value="${qtd}" id="mfl-qtd-${data}" style="width:70px;padding:4px 6px;font-size:12px">
      <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 8px" onclick="salvarEdicaoLigacaoFunil('${vendId}','${data}')">Salvar</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--brand);font-size:11px;padding:4px 8px" onclick="excluirLigacaoFunilUI('${vendId}','${data}')">✕</button>
    </div>
  `).join('') : `<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px 0">Nenhum registro de ligação nesse mês</div>`;
}

async function salvarEdicaoLigacaoFunil(vendId, data) {
  const novaQtd = parseInt(document.getElementById(`mfl-qtd-${data}`).value) || 0;
  await Servicos.editarQuantidadeLigacao(vendId, data, novaQtd);
  await carregarDadosIniciais();
  carregarLigacoesDoVendedor();
  rerenderModule('funil');
}

async function excluirLigacaoFunilUI(vendId, data) {
  const ok = await Dialog.confirm('Excluir registro', [`Excluir o registro de ligações do dia ${fmtDate(data)}?`]);
  if (!ok) return;
  await Servicos.excluirLigacao(vendId, data);
  await carregarDadosIniciais();
  carregarLigacoesDoVendedor();
  rerenderModule('funil');
}

// NOVO: Redistribuição automática — roda uma vez ao carregar o app. Pega
// todo lead ativo parado há mais de 3 dias (que ninguém redistribuiu
// manualmente ainda hoje) e manda pro vendedor com melhor performance do mês.
async function verificarRedistribuicaoAutomaticaFunil() {
  if (!DB.vendedores || DB.vendedores.length === 0) return; // sem vendedor, não tem pra quem redistribuir
  const hojeStr = today();
  const pendentes = DB.leadsFunil.filter(l => {
    if (l.etapa === 'venda' || l.etapa === 'desqualificado') return false;
    if (l.autoRedistribuidoEm === hojeStr) return false; // já rodou hoje pra esse lead
    const ultimaData = l.historico && l.historico.length ? l.historico[l.historico.length-1].data : null;
    if (!ultimaData) return false;
    const dias = Math.round((new Date(hojeStr+'T00:00:00') - new Date(ultimaData+'T00:00:00')) / 86400000);
    return dias > 3;
  });
  if (pendentes.length === 0) return;

  for (const lead of pendentes) {
    const mes = (lead.criadoEm||hojeStr).substring(0,7);
    const novoVendedor = melhorPerformanceFunil(lead.vendedor, mes);
    const historico = [...(lead.historico||[]), { etapa: lead.etapa, data: hojeStr, nota: 'Redistribuído automaticamente (parado 3+ dias)' }];
    await Servicos.atualizarLeadFunil(lead.id, {
      vendedor_anterior_id: lead.vendedor, vendedor_id: novoVendedor, tentativas: 0,
      vezes_redistribuido: (lead.vezesRedistribuido||0) + 1,
      auto_redistribuido_em: hojeStr, historico_etapas: historico,
    });
  }
  await carregarDadosIniciais();
  console.log(`🔄 Redistribuição automática: ${pendentes.length} lead(s) parado(s) redistribuído(s).`);
}

let _funilDetalheInteresseSel = [];

function verDetalheLeadFunil(leadId) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const vend = DB.vendedores.find(v => v.id === lead.vendedor);
  const isG = (AppState.user.role === 'gestor' || AppState.user.role === 'adm');
  const etapaLabel = lead.etapa === 'desqualificado' ? 'Desqualificado' : (FUNIL_ETAPAS.find(e=>e.key===lead.etapa)?.label || lead.etapa);
  const origemTexto = lead.origem === 'redistribuicao_sistema' ? (isG ? 'Redistribuição Sistema' : 'Pessoal') : lead.origem === 'trafego' ? `Tráfego${lead.anuncioOrigem ? ' ('+lead.anuncioOrigem+')' : ''}` : lead.origem === 'pessoal' ? 'Pessoal' : 'Discadora/IA';
  _funilDetalheInteresseSel = [...(lead.interesse || [])];

  document.getElementById('mfd-conteudo').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:10px">
      <div style="flex:1">
        <input id="mfd-nome" value="${lead.nome}" style="font-size:16px;font-weight:800;border:none;border-bottom:1px dashed var(--line2);background:transparent;padding:2px 0;width:100%" title="Clique pra editar o nome">
        <div style="font-size:11px;color:var(--text3)">Entrou via ${origemTexto} · ${fmtDate(lead.criadoEm)} <span style="color:var(--text2);font-weight:600">(${mesLabel((lead.criadoEm||'').substring(0,7))})</span></div>
      </div>
      <select id="mfd-etapa-select" onchange="moverEtapaDiretoFunil('${lead.id}', this.value)" style="width:auto;font-size:11px;padding:4px 8px;flex-shrink:0">
        ${FUNIL_ETAPAS.map(e => `<option value="${e.key}" ${lead.etapa===e.key?'selected':''}>${e.label}</option>`).join('')}
        <option value="desqualificado" ${lead.etapa==='desqualificado'?'selected':''}>Desqualificado</option>
      </select>
    </div>

    <div class="form-row cols-2" style="margin-top:12px">
      <div class="form-group"><label>E-mail</label><input id="mfd-email" value="${lead.email||''}"></div>
      <div class="form-group"><label>Celular</label><input id="mfd-celular" value="${lead.celular||''}"></div>
    </div>

    <div class="form-group"><label>Interesse</label>
      <div id="mfd-interesse" style="display:flex;gap:6px;flex-wrap:wrap">
        ${FUNIL_INTERESSES.map(op => {
          const sel = _funilDetalheInteresseSel.includes(op);
          return `<span class="chip" data-val="${op}" onclick="toggleInteresseDetalheFunil('${op}')" style="cursor:pointer;${sel ? 'background:var(--brand);color:#fff;border-color:var(--brand);font-weight:700' : ''}">${op}</span>`;
        }).join('')}
      </div>
    </div>

    <div class="form-row cols-2">
      <div class="form-group"><label>Valor do crédito</label><input type="text" inputmode="numeric" id="mfd-valorcredito" value="${formatarValorMoedaInicial(lead.valorCredito)}" data-raw="${lead.valorCredito ? Math.round(lead.valorCredito) : ''}" oninput="aplicarMascaraMoeda(this, event)"></div>
      <div class="form-group"><label>Renda familiar</label><input type="number" id="mfd-renda" value="${lead.rendaFamiliar||''}" oninput="atualizarQualificacaoBoxFunil()"></div>
    </div>

    <div class="form-row cols-3">
      <div class="form-group"><label>Decide a compra</label>
        <select id="mfd-decide">
          <option value="" ${!lead.decideCompra?'selected':''}>Selecione...</option>
          <option value="sozinho" ${lead.decideCompra==='sozinho'?'selected':''}>Decide sozinho(a)</option>
          <option value="com_conjuge" ${lead.decideCompra==='com_conjuge'?'selected':''}>Decide com cônjuge/família</option>
          <option value="nao_decide" ${lead.decideCompra==='nao_decide'?'selected':''}>Não decide (influenciador)</option>
        </select>
      </div>
      <div class="form-group"><label>Parcela ideal</label><input type="number" id="mfd-parcela" value="${lead.parcelaIdeal||''}" oninput="atualizarQualificacaoBoxFunil()"></div>
      <div class="form-group"><label>Recurso próprio</label><input type="number" id="mfd-recurso" value="${lead.recursoProprio||''}"></div>
    </div>

    <div class="form-row cols-2">
      <div class="form-group"><label>Paga aluguel/financiamento</label>
        <div style="display:flex;gap:8px">
          <select id="mfd-aluguel" style="flex:0 0 90px" onchange="document.getElementById('mfd-aluguel-valor').style.display=this.value==='sim'?'block':'none'">
            <option value="nao" ${lead.pagaAluguel!=='sim'?'selected':''}>Não</option>
            <option value="sim" ${lead.pagaAluguel==='sim'?'selected':''}>Sim</option>
          </select>
          <input type="number" id="mfd-aluguel-valor" value="${lead.pagaAluguelValor||''}" style="display:${lead.pagaAluguel==='sim'?'block':'none'}">
        </div>
      </div>
      <div class="form-group"><label>FGTS</label>
        <div style="display:flex;gap:8px">
          <select id="mfd-fgts" style="flex:0 0 90px" onchange="document.getElementById('mfd-fgts-valor').style.display=this.value==='sim'?'block':'none'">
            <option value="nao" ${lead.fgts!=='sim'?'selected':''}>Não</option>
            <option value="sim" ${lead.fgts==='sim'?'selected':''}>Sim</option>
          </select>
          <input type="number" id="mfd-fgts-valor" value="${lead.fgtsValor||''}" style="display:${lead.fgts==='sim'?'block':'none'}">
        </div>
      </div>
    </div>

    <div class="form-row cols-3">
      <div class="form-group"><label>Cidade</label>
        <select id="mfd-cidade">
          <option value="">Selecione...</option>
          ${FUNIL_CIDADES.map(c=>`<option value="${c}" ${lead.cidade===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Origem da prospecção</label>
        <select id="mfd-origemprosp">
          <option value="">Selecione...</option>
          ${FUNIL_ORIGENS_PROSPECCAO.map(o=>`<option value="${o}" ${lead.origemProspeccao===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Profissão</label><input id="mfd-profissao" value="${lead.profissao||''}"></div>
    </div>

    <div style="font-size:10px;color:var(--text3);margin:6px 0 14px">Vendedor: ${vend?.nome||'—'}${lead.motivoPerdido?` · Motivo: ${lead.motivoPerdido}`:''}${(lead.vezesRedistribuido||0)>0?` · Redistribuído ${lead.vezesRedistribuido}x`:''}</div>

    <div style="border-top:1px solid var(--line);padding-top:14px">
      <label style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px">Qualificação</label>
      <div id="mfd-qualificacao-box" style="margin-top:8px"></div>
    </div>

    <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:14px">
      <label style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px">Feedback / observações da conversa</label>
      <div style="display:flex;gap:6px;margin-top:6px;margin-bottom:12px">
        <input id="mfd-novofeedback" placeholder="Escreva uma nota sobre a conversa...">
        <button class="btn btn-ghost btn-sm" style="white-space:nowrap" onclick="adicionarFeedbackLeadFunil('${lead.id}')">+ Adicionar</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:180px;overflow-y:auto">
        ${(lead.feedbacks||[]).slice().reverse().map(f => `<div style="background:var(--ink3);border-radius:8px;padding:8px 10px">
          <div style="font-size:9px;color:var(--text3);margin-bottom:3px">${f.data} · ${f.autor||'—'}</div>
          <div style="font-size:12px">${f.texto}</div>
        </div>`).join('') || `<div style="font-size:11px;color:var(--text3);text-align:center;padding:12px 0">Nenhum feedback registrado ainda</div>`}
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:14px;margin-top:16px">
      ${isG && lead.etapa !== 'venda' && lead.etapa !== 'desqualificado' ? `<button class="btn btn-ghost btn-sm" style="color:var(--brand)" onclick="abrirRedistribuirLeadFunil('${lead.id}')">Redistribuir</button>` : ''}
      ${isG && lead.etapa === 'desqualificado' ? `<button class="btn btn-ghost btn-sm" style="color:var(--brand)" onclick="excluirLeadFunilUI('${lead.id}')">🗑 Excluir lead</button>` : ''}
      <div style="display:flex;gap:8px;margin-left:auto">
        <button class="btn btn-ghost btn-sm" onclick="closeModal('m-funil-detalhe')">Fechar</button>
        <button class="btn btn-primary btn-sm" onclick="salvarEdicaoLeadFunil('${lead.id}')">Salvar alterações</button>
      </div>
    </div>
  `;
  openModal('m-funil-detalhe');
  atualizarQualificacaoBoxFunil();
}

function atualizarQualificacaoBoxFunil() {
  const box = document.getElementById('mfd-qualificacao-box');
  if (!box) return;
  const renda = parseFloat(document.getElementById('mfd-renda')?.value) || 0;
  const parcela = parseFloat(document.getElementById('mfd-parcela')?.value) || 0;

  if (renda <= 0 || parcela <= 0) {
    box.innerHTML = `<div style="font-size:11px;color:var(--text3);background:var(--ink3);border-radius:8px;padding:10px 12px">Preencha renda familiar e parcela ideal pra ver a sugestão de qualificação.</div>`;
    return;
  }

  const ratio = parcela / renda;
  let sug;
  if (ratio <= 0.3) sug = { bg:'var(--green-dim)', borda:'#97C459', cor:'#27500A', texto:'Parcela é ' + (ratio*100).toFixed(0) + '% da renda — perfil provável' };
  else if (ratio <= 0.5) sug = { bg:'#FFF8E8', borda:'#EF9F27', cor:'#633806', texto:'Parcela é ' + (ratio*100).toFixed(0) + '% da renda — atenção, avaliar com cuidado' };
  else sug = { bg:'var(--red-dim)', borda:'#E24B4A', cor:'var(--brand)', texto:'Parcela é ' + (ratio*100).toFixed(0) + '% da renda — provável sem perfil' };

  box.innerHTML = `<div style="background:${sug.bg};border:1px solid ${sug.borda};border-radius:8px;padding:10px 12px">
    <div style="font-size:12px;font-weight:700;color:${sug.cor}">${sug.texto}</div>
    <div style="font-size:10px;color:${sug.cor};margin-top:2px;opacity:0.85">Sugestão automática — a decisão final é sua, pode ajustar renda/parcela acima que ela recalcula.</div>
  </div>`;
}

async function excluirLeadFunilUI(leadId) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const ok = await Dialog.confirm('Excluir lead', [`Tem certeza que quer excluir "${lead.nome}" de vez? Essa ação não pode ser desfeita.`]);
  if (!ok) return;
  const sucesso = await Servicos.excluirLeadFunil(leadId);
  if (!sucesso) { Dialog.alert('Erro', ['Não foi possível excluir o lead.']); return; }
  closeModal('m-funil-detalhe');
  await carregarDadosIniciais();
  rerenderModule('funil');
}

function toggleInteresseDetalheFunil(valor) {
  const idx = _funilDetalheInteresseSel.indexOf(valor);
  if (idx >= 0) _funilDetalheInteresseSel.splice(idx, 1); else _funilDetalheInteresseSel.push(valor);
  document.querySelectorAll('#mfd-interesse .chip').forEach(c => {
    const sel = _funilDetalheInteresseSel.includes(c.dataset.val);
    c.style.background = sel ? 'var(--brand)' : '';
    c.style.color = sel ? '#fff' : '';
    c.style.borderColor = sel ? 'var(--brand)' : '';
    c.style.fontWeight = sel ? '700' : '400';
  });
}

async function adicionarFeedbackLeadFunil(leadId) {
  const input = document.getElementById('mfd-novofeedback');
  const texto = input.value.trim();
  if (!texto) return;
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const novoFeedback = { texto, data: fmtDate(today()) + ' às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}), autor: AppState.user.nome };
  const feedbacks = [...(lead.feedbacks || []), novoFeedback];
  await Servicos.atualizarLeadFunil(leadId, { feedbacks });
  await carregarDadosIniciais();
  verDetalheLeadFunil(leadId); // reabre já atualizado, sem perder o resto do que foi editado ainda não salvo
}

// NOVO: correção manual de etapa — move pra QUALQUER etapa (pra frente ou pra
// trás), sem passar pelos modais de agendamento/venda. Só pro gestor, pra
// corrigir engano (ex: lead que foi pro Follow-up por engano, volta pra Venda).
async function moverEtapaDiretoFunil(leadId, novaEtapa) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const historico = [...(lead.historico||[]), { etapa: novaEtapa, data: today(), nota: 'Ajustado manualmente pelo gestor' }];
  await Servicos.atualizarLeadFunil(leadId, { etapa: novaEtapa, historico_etapas: historico });
  await carregarDadosIniciais();
  verDetalheLeadFunil(leadId);
  rerenderModule('funil');
}

async function salvarEdicaoLeadFunil(leadId) {
  const lead = DB.leadsFunil.find(l => l.id === leadId);
  if (!lead) return;
  const novoNome = document.getElementById('mfd-nome').value.trim();
  if (!novoNome) { Dialog.alert('Nome obrigatório', ['O nome do lead não pode ficar vazio.']); return; }
  await Servicos.atualizarLeadFunil(leadId, {
    nome: novoNome,
    email: document.getElementById('mfd-email').value.trim(),
    celular: document.getElementById('mfd-celular').value.trim(),
    interesse: _funilDetalheInteresseSel,
    valor_credito: valorMoedaParaNumero(document.getElementById('mfd-valorcredito').value),
    renda_familiar: parseFloat(document.getElementById('mfd-renda').value) || 0,
    decide_compra: document.getElementById('mfd-decide').value,
    parcela_ideal: parseFloat(document.getElementById('mfd-parcela').value) || 0,
    recurso_proprio: parseFloat(document.getElementById('mfd-recurso').value) || 0,
    paga_aluguel: document.getElementById('mfd-aluguel').value,
    paga_aluguel_valor: parseFloat(document.getElementById('mfd-aluguel-valor').value) || 0,
    fgts: document.getElementById('mfd-fgts').value,
    fgts_valor: parseFloat(document.getElementById('mfd-fgts-valor').value) || 0,
    cidade: document.getElementById('mfd-cidade').value,
    origem_prospeccao: document.getElementById('mfd-origemprosp').value,
    profissao: document.getElementById('mfd-profissao').value.trim(),
  });
  closeModal('m-funil-detalhe');
  await carregarDadosIniciais();
  rerenderModule('funil');
}

function rerenderModule(id) {

  const modId = id || AppState.currentModule;
  const el    = document.getElementById('mod-' + modId);
  if (!el || !Router.modules[modId]) return;
  el.innerHTML = Router.modules[modId].render();
  initModuleEvents(modId);
  const buscaEl = el.querySelector('#relatorio-busca, #clientes-busca, [id$="-busca"]');
  if (buscaEl && document.activeElement?.id === buscaEl.id) {
    buscaEl.focus();
    const len = buscaEl.value.length;
    buscaEl.setSelectionRange(len, len);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   19. TEMA — Claro / Escuro
   ═══════════════════════════════════════════════════════════════════════════ */
function toggleTheme() {
  const body = document.body;
  const btn  = document.getElementById('btn-theme');
  const isDark = body.classList.toggle('theme-dark');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('wcon-theme', isDark ? 'dark' : 'light');
}

function initTheme() {
  const saved = localStorage.getItem('wcon-theme');
  const btn   = document.getElementById('btn-theme');
  if (saved === 'dark') {
    document.body.classList.add('theme-dark');
    if (btn) btn.textContent = '☀️';
  } else {
    document.body.classList.remove('theme-dark');
    if (btn) btn.textContent = '🌙';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   20. INICIALIZAÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();

  // NOVO: detecta quando alguém chega pelo link de "esqueci minha senha".
  // Sem isso, o link só fazia login direto (sem pedir senha nova) — por
  // isso parecia que "não abria nada" ao clicar no link do e-mail.
  Supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _isRecoveryFlow = true;
      const user = resolveUserByEmail(session?.user);
      if (user) AppState.user = user;
      document.getElementById('login')?.classList.add('hidden');
      document.getElementById('primeiro-acesso')?.classList.remove('hidden');
      const sub = document.querySelector('#primeiro-acesso .login-split-form-sub, #primeiro-acesso .modal-sub');
      if (sub) sub.textContent = 'Defina sua nova senha de acesso.';
    }
  });

  await carregarDadosIniciais();
  // NOVO: redistribuição automática desativada por pedido — o lead fica
  // sempre com quem cadastrou/está com ele, só muda de mão se o gestor
  // decidir manualmente (modal de redistribuir). Se precisar reativar no
  // futuro, é só descomentar a linha abaixo.
  // await verificarRedistribuicaoAutomaticaFunil();

  await tentarSessaoSalva();

  document.getElementById('lp')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('pa-senha2')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') salvarNovaSenha();
  });

  document.getElementById('btn-toggle-sb')?.addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mobile-overlay');
    sb.classList.toggle('mobile-open');
    ov.classList.toggle('show');
  });

  document.getElementById('mobile-overlay')?.addEventListener('click', closeMobileSidebar);

  document.addEventListener('click', e => {
    if (e.target.classList.contains('overlay')) {
      e.target.classList.remove('open');
    }
  });

  function initEsqueciSenha() {
    var linkEsqueci    = document.getElementById('link-esqueci-senha');
    var modal          = document.getElementById('modal-esqueci-senha');
    var inputEmail     = document.getElementById('input-recuperar-email');
    var btnEnviar      = document.getElementById('btn-enviar-recuperacao');
    var btnFechar      = document.getElementById('btn-fechar-recuperacao');
    var msgRecuperacao = document.getElementById('msg-recuperacao');

    if (!linkEsqueci || !modal) return;

    linkEsqueci.addEventListener('click', function (e) {
      e.preventDefault();
      // NOVO: reseta o botão sempre que abre (corrige ficar travado em
      // "Enviado!" depois do primeiro envio, impedindo reenviar)
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar link de recuperação';
      msgRecuperacao.textContent = '';
      modal.style.display = 'flex';
      inputEmail.focus();
    });

    function fecharModal() {
      modal.style.display = 'none';
      inputEmail.value = '';
      msgRecuperacao.textContent = '';
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar link de recuperação';
    }

    btnFechar.addEventListener('click', fecharModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) fecharModal();
    });

    btnEnviar.addEventListener('click', async function () {
      var email = inputEmail.value.trim();
      if (!email) {
        msgRecuperacao.textContent = 'Digite seu e-mail.';
        msgRecuperacao.style.color = '#E74C3C';
        return;
      }
      btnEnviar.textContent = 'Enviando...';
      btnEnviar.disabled = true;
      try {
        var { error } = await Supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://brusque.wcons.com.br'
        });
        if (error) throw error;
        msgRecuperacao.textContent = '✓ Link enviado! Verifique seu e-mail.';
        msgRecuperacao.style.color = '#27AE60';
        btnEnviar.textContent = 'Enviado!';
        setTimeout(fecharModal, 3000);
      } catch (err) {
        msgRecuperacao.textContent = 'Erro ao enviar. Verifique o e-mail.';
        msgRecuperacao.style.color = '#E74C3C';
        btnEnviar.textContent = 'Enviar link de recuperação';
        btnEnviar.disabled = false;
      }
    });

    inputEmail.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') btnEnviar.click();
    });
  }

  initEsqueciSenha();
});
