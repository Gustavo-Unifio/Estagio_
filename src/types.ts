// Define os perfis e estados aceitos pela interface.
export type Perfil = "ADMIN" | "SECRETARIA";
export type Status = "Pendente" | "Aprovado" | "Rejeitado";

// Representa a conta autenticada retornada pela API.
export type Usuario = {
  id: number;
  email: string;
  nome: string;
  perfil: Perfil;
  sede: string | null;
};

// Representa uma decisão já registrada no histórico de validações.
export type HistoricoValidacao = {
  id: number;
  status: Status;
  totalHoras: number;
  observacao: string | null;
  dataHora: string;
  usuarioValidador: string | null;
};

// Representa uma atribuição e os dados necessários para exibi-la.
export type Atribuicao = {
  id: number;
  sede: string;
  docente: string;
  matricula: string;
  email: string;
  horasSolicitadas: number;
  status: Status;
  observacao: string | null;
  dataHoraInsercao: string;
  dataHoraValidacao: string | null;
  usuarioValidador: string | null;
  historicoValidacoes: HistoricoValidacao[];
};

// Representa o acesso de uma secretaria vinculado a uma unidade.
export type Secretaria = {
  id: number;
  email: string;
  nome: string;
  sede: string;
  ativo: boolean;
  criadaEm: string;
};

// Representa uma conta ADMIN com as mesmas permissões administrativas.
export type Administrador = {
  id: number;
  email: string;
  nome: string;
  ativo: boolean;
  criadaEm: string;
};

// Mantém a forma do formulário uniforme entre criação, edição e cancelamento.
export type FormularioSecretaria = {
  nome: string;
  email: string;
  sede: string;
  password: string;
};

// Mantém os campos comuns de criação e edição de administradores.
export type FormularioAdministrador = {
  nome: string;
  email: string;
  password: string;
};

// Representa a atribuição e a decisão abertas no diálogo de validação.
export type RevisaoAtribuicao = {
  assignment: Atribuicao;
  status: "Aprovado" | "Rejeitado";
};
