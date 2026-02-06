import jsPDF from 'jspdf';

interface PlanData {
  name: string;
  price: number;
  annualPrice: number;
  targetAudience: string;
  limits: {
    users: number;
    aiConversations: number;
    audioMinutes: number;
    whatsappConnections: number;
    aiAgents: number;
    workspaces: number;
  };
  differentials: string[];
  isFeatured?: boolean;
}

const PLANS: PlanData[] = [
  {
    name: 'PRIME',
    price: 97.90,
    annualPrice: 97.90 * 11,
    targetAudience: 'Profissionais solo (advogados, médicos, consultores)',
    limits: {
      users: 1,
      aiConversations: 150,
      audioMinutes: 10,
      whatsappConnections: 1,
      aiAgents: 1,
      workspaces: 1,
    },
    differentials: [
      'Entrada acessível para profissionais individuais',
      'Automação essencial de atendimento',
      'Ideal para quem atende pessoalmente e quer automatizar o primeiro contato',
      'Perfeito para testar a plataforma',
    ],
  },
  {
    name: 'BASIC',
    price: 197.00,
    annualPrice: 197.00 * 11,
    targetAudience: 'Pequenos negócios iniciando automação',
    limits: {
      users: 2,
      aiConversations: 200,
      audioMinutes: 15,
      whatsappConnections: 1,
      aiAgents: 1,
      workspaces: 1,
    },
    differentials: [
      'Suporte para pequena equipe (2 pessoas)',
      'Mensagens rápidas e respostas automáticas',
      'Templates de mensagem para agilidade',
      'Colaboração entre atendentes',
    ],
  },
  {
    name: 'STARTER',
    price: 497.00,
    annualPrice: 497.00 * 11,
    targetAudience: 'Empresas em crescimento',
    limits: {
      users: 3,
      aiConversations: 300,
      audioMinutes: 25,
      whatsappConnections: 2,
      aiAgents: 2,
      workspaces: 1,
    },
    differentials: [
      'Transcrição de áudio e imagens',
      'Mensagens agendadas',
      'Múltiplos números de WhatsApp',
      '2 agentes de IA para diferentes contextos',
      'Base de conhecimento integrada',
    ],
  },
  {
    name: 'PROFESSIONAL',
    price: 897.00,
    annualPrice: 897.00 * 11,
    targetAudience: 'Empresas em crescimento com maior volume',
    limits: {
      users: 4,
      aiConversations: 400,
      audioMinutes: 40,
      whatsappConnections: 4,
      aiAgents: 4,
      workspaces: 1,
    },
    differentials: [
      'IA avançada para conversação',
      '4 números de WhatsApp para setores diferentes',
      'Maior capacidade operacional',
      'Ideal para equipes de vendas e suporte',
      'Agenda Pro para agendamentos',
    ],
    isFeatured: true,
  },
  {
    name: 'ENTERPRISE',
    price: 1297.00,
    annualPrice: 1297.00 * 11,
    targetAudience: 'Operações maiores e alto volume',
    limits: {
      users: 8,
      aiConversations: 1000,
      audioMinutes: 60,
      whatsappConnections: 6,
      aiAgents: 10,
      workspaces: 1,
    },
    differentials: [
      'Onboarding assistido personalizado',
      'SLA e suporte prioritário',
      'Modelo flexível de consumo',
      'Configuração de IA personalizada (API própria)',
      'Integração com n8n para automações avançadas',
      'Relatórios avançados e analytics',
    ],
  },
];

interface FeatureSection {
  icon: string;
  title: string;
  features: string[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    icon: '📊',
    title: 'Dashboard',
    features: [
      'Visão geral de métricas em tempo real',
      'Filtros por período (hoje, 7 dias, 30 dias, personalizado)',
      'Gráficos de evolução de conversas e clientes',
      'Cards de status personalizáveis',
      'Métricas de mensagens (enviadas, recebidas, tempo de resposta)',
      'Performance de atendentes em tabela detalhada',
      'Origem das conversas por canal',
      'Mapa de clientes por estado (DDD)',
      'Onboarding guiado com progresso',
    ],
  },
  {
    icon: '💬',
    title: 'Conversas',
    features: [
      'Inbox unificado para todas as conversas',
      'Abas: Fila, IA, Chat, Todos, Arquivados',
      'Busca por nome, telefone ou conteúdo',
      'Filtros avançados (status, responsável, tags, departamento)',
      'Modo áudio IA por conversa',
      'Mensagens internas (visíveis só para equipe)',
      'Modo pontual (intervir sem mudar responsável)',
      'Resposta com citação (reply)',
      'Templates de mensagem rápida (/atalho)',
      'Envio de imagens, vídeos, áudios e documentos',
      'Assinatura automática nas mensagens',
      'Painel lateral com detalhes do cliente',
      'Tags e status personalizáveis por cliente',
      'Agendamento de follow-ups',
      'Geração de resumo por IA',
      'Arquivamento com motivo',
      'Troca de instância WhatsApp',
    ],
  },
  {
    icon: '📋',
    title: 'Kanban',
    features: [
      'Visualização em colunas arrastáveis',
      'Agrupamento por: Departamento, Status, Responsável, Conexão',
      'Drag & drop para mover conversas',
      'Busca e filtros rápidos',
      'Painel de chat integrado',
      'Criação de contatos diretamente',
    ],
  },
  {
    icon: '👥',
    title: 'Contatos',
    features: [
      'Lista completa de contatos/clientes',
      'Importação em massa via Excel/CSV',
      'Criação manual de contatos',
      'Associação com status e departamento',
      'Histórico de interações',
    ],
  },
  {
    icon: '🔗',
    title: 'Conexões WhatsApp',
    features: [
      'Gerenciamento de instâncias WhatsApp',
      'Conexão via QR Code',
      'Status em tempo real (conectado, desconectado)',
      'Configuração de departamento padrão',
      'Configuração de status padrão para novos leads',
      'Atribuição automática de IA ou atendente',
      'Rejeição automática de chamadas (opcional)',
      'Múltiplas conexões por empresa',
    ],
  },
  {
    icon: '🤖',
    title: 'Agentes de IA',
    features: [
      'Criação de múltiplos agentes especializados',
      'Prompt personalizado com menções dinâmicas',
      'Organizados em pastas coloridas',
      'Configuração de delay de resposta',
      'Associação com instância ou departamento',
      'Base de conhecimento integrada',
      'Voz IA (áudio automático)',
      'Notificação ao transferir para humano',
      'Agendamento automático (Agenda Pro)',
      'Templates de agentes prontos',
      'Reordenação por drag & drop',
      'Controle de versão do prompt',
    ],
  },
  {
    icon: '📚',
    title: 'Base de Conhecimento',
    features: [
      'Criação de itens de texto',
      'Upload de documentos (PDF, Word, etc.)',
      'Categorias: Legal, Procedimentos, FAQ, Políticas, Templates',
      'Vinculação a agentes específicos',
      'Busca rápida por conteúdo',
    ],
  },
  {
    icon: '🎤',
    title: 'Voz IA',
    features: [
      'Respostas em áudio geradas por IA',
      'Múltiplas vozes disponíveis',
      'Preview de áudio antes de ativar',
      'Ativação por conversa ou global',
      'Configuração de velocidade e tom',
    ],
  },
  {
    icon: '📅',
    title: 'Agenda Pro',
    features: [
      'Calendário visual (dia, semana, mês)',
      'Lista de agendamentos',
      'Cadastro de serviços (nome, duração, preço)',
      'Cadastro de profissionais com horários',
      'Cadastro de clientes da agenda',
      'Link público para agendamento online',
      'Mensagens automáticas de confirmação',
      'Lembretes por WhatsApp',
      'Relatórios e métricas de agendamentos',
      'Configurações de horário de funcionamento',
      'Bloqueio de feriados',
    ],
  },
  {
    icon: '✅',
    title: 'Tarefas',
    features: [
      'Kanban de tarefas da equipe',
      'Visualização em lista e calendário',
      'Dashboard de produtividade',
      'Filtros por status, prioridade, categoria, responsável',
      'Categorias coloridas personalizáveis',
      'Múltiplos responsáveis por tarefa',
      'Alertas de vencimento',
      'Comentários e histórico de atividades',
    ],
  },
  {
    icon: '⚙️',
    title: 'Configurações',
    features: [
      'Status personalizados com cores',
      'Tags para categorização de clientes',
      'Departamentos com ordem customizada',
      'Templates de mensagens rápidas',
      'Templates com mídia (imagem, vídeo, áudio)',
      'Atalhos de comando (/saudacao)',
      'Convite de membros por email',
      'Papéis: Admin, Gerente, Supervisor, Atendente',
      'Acesso por departamento',
      'Integração com Agenda Pro',
      'Integração com Tray Chat (e-commerce)',
      'Configuração de horário de funcionamento',
      'Logo e identidade visual da empresa',
      'Logs de auditoria',
      'Histórico de ações',
      'Preferências de notificação',
    ],
  },
  {
    icon: '💳',
    title: 'Meu Plano',
    features: [
      'Visualização do plano atual',
      'Consumo de IA e áudio em tempo real',
      'Demonstrativo de faturamento em PDF',
      'Gerenciar assinatura via Stripe',
      'Solicitar upgrade de plano',
      'Contratar adicionais (usuários, instâncias)',
    ],
  },
  {
    icon: '📞',
    title: 'Suporte',
    features: [
      'Chat de suporte integrado',
      'Acesso rápido para dúvidas',
      'Base de conhecimento de ajuda',
    ],
  },
  {
    icon: '🎓',
    title: 'Tutoriais',
    features: [
      'Vídeos de treinamento',
      'Guias passo a passo',
      'Documentação completa',
    ],
  },
];

const PRIMARY_COLOR = '#E11D48';
const SECONDARY_COLOR = '#1E293B';
const LIGHT_GRAY = '#F1F5F9';
const DARK_GRAY = '#64748B';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function addHeader(doc: jsPDF, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header background
  doc.setFillColor(225, 29, 72); // #E11D48
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 15, 16);
  
  // Logo text
  doc.setFontSize(12);
  doc.text('MiauChat', pageWidth - 15, 16, { align: 'right' });
}

function addFooter(doc: jsPDF, pageNumber: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setDrawColor(200);
  doc.line(15, pageHeight - 20, pageWidth - 15, pageHeight - 20);
  
  doc.setTextColor(100);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  doc.text('MiauChat - Plataforma de Atendimento Inteligente', 15, pageHeight - 12);
  doc.text('contato@miauchat.com.br | www.miauchat.com.br', 15, pageHeight - 7);
  doc.text(`Página ${pageNumber}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
}

function addCoverPage(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Background gradient effect
  doc.setFillColor(225, 29, 72);
  doc.rect(0, 0, pageWidth, pageHeight * 0.4, 'F');
  
  // Logo circle
  doc.setFillColor(255, 255, 255);
  doc.circle(pageWidth / 2, 60, 30, 'F');
  
  // Logo text
  doc.setTextColor(225, 29, 72);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('🐱', pageWidth / 2 - 8, 68);
  
  // Main title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('MiauChat', pageWidth / 2, 110, { align: 'center' });
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.text('Plataforma de Atendimento Inteligente', pageWidth / 2, 125, { align: 'center' });
  
  // Subtitle
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Apresentação Comercial', pageWidth / 2, 175, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Catálogo de Planos e Funcionalidades', pageWidth / 2, 190, { align: 'center' });
  
  // Features highlight boxes
  const boxY = 220;
  const boxWidth = 50;
  const boxGap = 10;
  const startX = (pageWidth - (boxWidth * 3 + boxGap * 2)) / 2;
  
  const highlights = [
    { icon: '🤖', text: 'IA Avançada' },
    { icon: '💬', text: 'Multi-canal' },
    { icon: '📊', text: 'Analytics' },
  ];
  
  highlights.forEach((item, index) => {
    const x = startX + (boxWidth + boxGap) * index;
    
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(x, boxY, boxWidth, 40, 3, 3, 'F');
    
    doc.setFontSize(20);
    doc.text(item.icon, x + boxWidth / 2 - 5, boxY + 18);
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(item.text, x + boxWidth / 2, boxY + 32, { align: 'center' });
  });
  
  // Date
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const date = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  doc.text(`Documento gerado em ${date}`, pageWidth / 2, pageHeight - 30, { align: 'center' });
  
  // Footer info
  doc.setFontSize(9);
  doc.text('CNPJ: 54.440.907/0001-02 | contato@miauchat.com.br', pageWidth / 2, pageHeight - 20, { align: 'center' });
}

function addPlansOverview(doc: jsPDF) {
  addHeader(doc, 'Visão Geral dos Planos');
  
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 40;
  
  // Intro text
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Escolha o plano ideal para o seu negócio. Todos os planos incluem suporte', 15, yPos);
  yPos += 6;
  doc.text('técnico, atualizações automáticas e 7 dias de teste gratuito.', 15, yPos);
  yPos += 15;
  
  // Plans comparison table header
  const colWidths = [35, 28, 28, 28, 28, 28];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = (pageWidth - tableWidth) / 2;
  
  // Header row
  doc.setFillColor(225, 29, 72);
  doc.rect(startX, yPos, tableWidth, 12, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  
  let xPos = startX + 3;
  doc.text('Recurso', xPos, yPos + 8);
  xPos += colWidths[0];
  
  PLANS.forEach((plan, index) => {
    const label = plan.isFeatured ? `${plan.name} ⭐` : plan.name;
    doc.text(label, xPos + colWidths[index + 1] / 2, yPos + 8, { align: 'center' });
    xPos += colWidths[index + 1];
  });
  
  yPos += 12;
  
  // Table rows
  const rows = [
    { label: 'Preço/mês', values: PLANS.map(p => formatCurrency(p.price)) },
    { label: 'Preço/ano', values: PLANS.map(p => formatCurrency(p.annualPrice)) },
    { label: 'Usuários', values: PLANS.map(p => String(p.limits.users)) },
    { label: 'Conversas IA', values: PLANS.map(p => `${p.limits.aiConversations}/mês`) },
    { label: 'Áudio IA', values: PLANS.map(p => `${p.limits.audioMinutes} min`) },
    { label: 'WhatsApps', values: PLANS.map(p => String(p.limits.whatsappConnections)) },
    { label: 'Agentes IA', values: PLANS.map(p => String(p.limits.aiAgents)) },
  ];
  
  rows.forEach((row, rowIndex) => {
    const isEven = rowIndex % 2 === 0;
    if (isEven) {
      doc.setFillColor(248, 250, 252);
      doc.rect(startX, yPos, tableWidth, 10, 'F');
    }
    
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', rowIndex < 2 ? 'bold' : 'normal');
    doc.setFontSize(7);
    
    xPos = startX + 3;
    doc.text(row.label, xPos, yPos + 7);
    xPos += colWidths[0];
    
    row.values.forEach((value, index) => {
      doc.text(value, xPos + colWidths[index + 1] / 2, yPos + 7, { align: 'center' });
      xPos += colWidths[index + 1];
    });
    
    yPos += 10;
  });
  
  // Border
  doc.setDrawColor(200);
  doc.rect(startX, 55, tableWidth, yPos - 55);
  
  yPos += 15;
  
  // Note about annual discount
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(15, yPos, pageWidth - 30, 20, 3, 3, 'F');
  
  doc.setTextColor(146, 64, 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('💡 Economia no plano anual:', 20, yPos + 8);
  doc.setFont('helvetica', 'normal');
  doc.text('Pague 11 meses e ganhe 1 mês grátis! Economia de 8,33%.', 20, yPos + 15);
  
  addFooter(doc, 2);
}

function addPlanDetails(doc: jsPDF, plan: PlanData, pageNumber: number) {
  addHeader(doc, `Plano ${plan.name}${plan.isFeatured ? ' ⭐ Mais Escolhido' : ''}`);
  
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 40;
  
  // Plan header with price
  doc.setFillColor(plan.isFeatured ? 225 : 241, plan.isFeatured ? 29 : 245, plan.isFeatured ? 72 : 249);
  doc.roundedRect(15, yPos, pageWidth - 30, 45, 5, 5, 'F');
  
  doc.setTextColor(plan.isFeatured ? 255 : 30, plan.isFeatured ? 255 : 41, plan.isFeatured ? 255 : 59);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(plan.price), 25, yPos + 20);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('/mês', 25 + doc.getTextWidth(formatCurrency(plan.price)) + 2, yPos + 20);
  
  doc.setFontSize(10);
  doc.text(`ou ${formatCurrency(plan.annualPrice)}/ano (11 meses)`, 25, yPos + 32);
  
  // Target audience
  doc.setTextColor(plan.isFeatured ? 255 : 100, plan.isFeatured ? 255 : 116, plan.isFeatured ? 255 : 139);
  doc.setFontSize(9);
  doc.text(`Ideal para: ${plan.targetAudience}`, 25, yPos + 40);
  
  yPos += 55;
  
  // Limits section
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('📦 Recursos Inclusos', 15, yPos);
  yPos += 10;
  
  const limits = [
    { icon: '👥', label: 'Usuários', value: String(plan.limits.users) },
    { icon: '🤖', label: 'Conversas com IA', value: `${plan.limits.aiConversations}/mês` },
    { icon: '🎤', label: 'Minutos de Áudio IA', value: `${plan.limits.audioMinutes} min` },
    { icon: '📱', label: 'WhatsApps Conectados', value: String(plan.limits.whatsappConnections) },
    { icon: '🧠', label: 'Agentes de IA', value: String(plan.limits.aiAgents) },
    { icon: '🏢', label: 'Workspaces', value: String(plan.limits.workspaces) },
  ];
  
  const colWidth = (pageWidth - 30) / 3;
  limits.forEach((limit, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 15 + col * colWidth;
    const y = yPos + row * 20;
    
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, colWidth - 5, 16, 2, 2, 'F');
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${limit.icon} ${limit.label}`, x + 5, y + 6);
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(limit.value, x + 5, y + 13);
  });
  
  yPos += 50;
  
  // Differentials section
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('✨ Diferenciais do Plano', 15, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  plan.differentials.forEach((differential) => {
    doc.setTextColor(225, 29, 72);
    doc.text('✓', 20, yPos);
    doc.setTextColor(30, 41, 59);
    doc.text(differential, 30, yPos);
    yPos += 8;
  });
  
  yPos += 15;
  
  // All plans include section
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(15, yPos, pageWidth - 30, 50, 3, 3, 'F');
  
  doc.setTextColor(6, 95, 70);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('🎁 Todos os planos incluem:', 20, yPos + 10);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const included = [
    '7 dias de teste gratuito',
    'Suporte técnico',
    'Atualizações automáticas',
    'Criptografia de dados',
    'Dashboard completo',
    'Importação de contatos',
  ];
  
  const incColWidth = (pageWidth - 40) / 2;
  included.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 25 + col * incColWidth;
    const y = yPos + 18 + row * 10;
    
    doc.text(`• ${item}`, x, y);
  });
  
  addFooter(doc, pageNumber);
}

function addFeaturesPages(doc: jsPDF, startPage: number): number {
  let pageNumber = startPage;
  let yPos = 40;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.addPage();
  addHeader(doc, 'Funcionalidades do Sistema');
  
  // Intro
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('O MiauChat oferece um conjunto completo de ferramentas para transformar', 15, yPos);
  yPos += 6;
  doc.text('o atendimento da sua empresa com inteligência artificial e automação.', 15, yPos);
  yPos += 15;
  
  FEATURE_SECTIONS.forEach((section) => {
    // Check if we need a new page
    const sectionHeight = 20 + section.features.length * 7;
    if (yPos + sectionHeight > pageHeight - 40) {
      addFooter(doc, pageNumber);
      pageNumber++;
      doc.addPage();
      addHeader(doc, 'Funcionalidades do Sistema (continuação)');
      yPos = 40;
    }
    
    // Section header
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(15, yPos, pageWidth - 30, 14, 2, 2, 'F');
    
    doc.setTextColor(225, 29, 72);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${section.icon} ${section.title}`, 20, yPos + 10);
    
    yPos += 18;
    
    // Features list (2 columns)
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    const colWidth = (pageWidth - 40) / 2;
    const midPoint = Math.ceil(section.features.length / 2);
    
    section.features.forEach((feature, index) => {
      const col = index < midPoint ? 0 : 1;
      const row = index < midPoint ? index : index - midPoint;
      const x = 20 + col * colWidth;
      const y = yPos + row * 7;
      
      // Check page break for each feature
      if (y > pageHeight - 40) {
        addFooter(doc, pageNumber);
        pageNumber++;
        doc.addPage();
        addHeader(doc, 'Funcionalidades do Sistema (continuação)');
        yPos = 40;
        return;
      }
      
      doc.setTextColor(225, 29, 72);
      doc.text('•', x, y);
      doc.setTextColor(30, 41, 59);
      
      // Truncate if too long
      const maxWidth = colWidth - 10;
      let text = feature;
      while (doc.getTextWidth(text) > maxWidth && text.length > 0) {
        text = text.slice(0, -1);
      }
      if (text !== feature) text += '...';
      
      doc.text(text, x + 5, y);
    });
    
    yPos += Math.ceil(section.features.length / 2) * 7 + 10;
  });
  
  addFooter(doc, pageNumber);
  return pageNumber;
}

function addContactPage(doc: jsPDF, pageNumber: number) {
  doc.addPage();
  addHeader(doc, 'Entre em Contato');
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 60;
  
  // Main CTA
  doc.setFillColor(225, 29, 72);
  doc.roundedRect(15, yPos, pageWidth - 30, 50, 5, 5, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Pronto para transformar seu atendimento?', pageWidth / 2, yPos + 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Comece agora com 7 dias grátis!', pageWidth / 2, yPos + 35, { align: 'center' });
  
  yPos += 70;
  
  // Contact methods
  const contacts = [
    { icon: '🌐', label: 'Website', value: 'www.miauchat.com.br' },
    { icon: '📧', label: 'Email', value: 'contato@miauchat.com.br' },
    { icon: '📱', label: 'WhatsApp', value: '(11) 99999-9999' },
  ];
  
  contacts.forEach((contact) => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15, yPos, pageWidth - 30, 25, 3, 3, 'F');
    
    doc.setFontSize(14);
    doc.text(contact.icon, 25, yPos + 16);
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(contact.label, 45, yPos + 12);
    
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(contact.value, 45, yPos + 20);
    
    yPos += 30;
  });
  
  yPos += 20;
  
  // Legal info
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('MiauChat Tecnologia LTDA', pageWidth / 2, yPos, { align: 'center' });
  doc.text('CNPJ: 54.440.907/0001-02', pageWidth / 2, yPos + 10, { align: 'center' });
  
  yPos += 30;
  
  // QR Code placeholder
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pageWidth / 2 - 40, yPos, 80, 80, 5, 5, 'F');
  
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text('Escaneie para acessar', pageWidth / 2, yPos + 35, { align: 'center' });
  doc.text('www.miauchat.com.br', pageWidth / 2, yPos + 50, { align: 'center' });
  
  addFooter(doc, pageNumber);
}

export function generateCommercialPDF(): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  
  // Page 1: Cover
  addCoverPage(doc);
  
  // Page 2: Plans overview
  doc.addPage();
  addPlansOverview(doc);
  
  // Pages 3-7: Plan details
  let pageNum = 3;
  PLANS.forEach((plan) => {
    doc.addPage();
    addPlanDetails(doc, plan, pageNum);
    pageNum++;
  });
  
  // Pages 8+: Features
  pageNum = addFeaturesPages(doc, pageNum);
  
  // Last page: Contact
  addContactPage(doc, pageNum + 1);
  
  // Save
  const date = new Date().toISOString().split('T')[0];
  doc.save(`MiauChat-Apresentacao-Comercial-${date}.pdf`);
}

export { PLANS, FEATURE_SECTIONS };
