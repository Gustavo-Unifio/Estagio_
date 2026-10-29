import { useCallback, useEffect, useMemo, useState } from "react";

// Define os perfis e estados aceitos pela interface.
type Perfil = "ADMIN" | "SECRETARIA";
type Status = "Pendente" | "Aprovado" | "Rejeitado";

// Representa a conta autenticada retornada pela API.
type Usuario = {
  id: number;
  email: string;
  nome: string;
  perfil: Perfil;
  sede: string | null;
};

// Representa uma decisão já registrada no histórico de validações.
type HistoricoValidacao = {
  id: number;
  status: Status;
  totalHoras: number;
  observacao: string | null;
  dataHora: string;
  usuarioValidador: string | null;
};

// Representa uma atribuição e os dados necessários para exibi-la.
type Atribuicao = {
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
type Secretaria = {
  id: number;
  email: string;
  nome: string;
  sede: string;
  ativo: boolean;
  criadaEm: string;
};

// Representa uma conta ADMIN com as mesmas permissões administrativas.
type Administrador = {
  id: number;
  email: string;
  nome: string;
  ativo: boolean;
  criadaEm: string;
};

// Mantém a forma do formulário uniforme entre criação, edição e cancelamento.
type FormularioSecretaria = {
  nome: string;
  email: string;
  sede: string;
  password: string;
};

// Mantém os campos comuns de criação e edição de administradores.
type FormularioAdministrador = {
  nome: string;
  email: string;
  password: string;
};

// Representa a atribuição e a decisão abertas no diálogo de validação.
type RevisaoAtribuicao = {
  assignment: Atribuicao;
  status: "Aprovado" | "Rejeitado";
};

// Cria um formulário vazio sem compartilhar referências entre atualizações.
function createEmptySecretaryForm(): FormularioSecretaria {
  return { nome: "", email: "", sede: "", password: "" };
}

// Cria um formulário vazio para novos administradores.
function createEmptyAdministratorForm(): FormularioAdministrador {
  return { nome: "", email: "", password: "" };
}

// Resume falhas de importação e orienta a correção e o novo envio do arquivo.
function getSpreadsheetErrorMessage(cause: unknown) {
  const reason =
    cause instanceof Error ? cause.message : "Não foi possível processar o arquivo.";
  const conciseReason = reason
    .replace(/^A importação foi cancelada\.\s*/i, "")
    .replace(/^Corrija os dados:\s*/i, "")
    .split(";")[0]
    .trim()
    .replace(/[.!?]+$/, "");
  const briefReason =
    conciseReason.length > 180
      ? `${conciseReason.slice(0, 177).trimEnd()}...`
      : conciseReason;

  return `A planilha não foi importada. Motivo: ${briefReason}. Edite a planilha e envie novamente.`;
}

// Padroniza erros da API para apresentar mensagens e status ao usuário.
class ApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.status = status;
  }
}

// Realiza chamadas autenticadas à API e interpreta respostas e erros HTTP.
async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers:
        init?.body instanceof FormData
          ? init.headers
          : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      "Não foi possível conectar à aplicação. Confirme se o servidor está em execução.",
      0,
    );
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Não foi possível concluir a operação.";
    throw new ApiError(message, response.status);
  }

  return body as T;
}

// Exibe a marca institucional e o nome do sistema.
function Brand() {
  return (
    <a className="brand" href="#" aria-label="Centro Paula Souza — Carga Docente">
      <img
        className="brand__logo"
        src="https://bkpsitecpsnew.blob.core.windows.net/uploadsitecps/sites/1/2022/09/logo-cps-2022.svg"
        alt="Centro Paula Souza"
      />
      <span className="brand__divider" aria-hidden="true" />
      <span className="brand__product">Carga Docente</span>
    </a>
  );
}

// Apresenta visualmente o estado de validação de uma atribuição.
function StatusBadge({ status }: { status: Status }) {
  return <span className={`status status--${status.toLowerCase()}`}>{status}</span>;
}

// Formata horas conforme as convenções numéricas do português brasileiro.
function formatHours(hours: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(hours);
}

// Formata datas e horários para apresentação ao usuário.
function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

// Separa decisões rejeitadas anteriores da rejeição atualmente exibida.
function getPreviousRejections(assignment: Atribuicao) {
  const rejections = assignment.historicoValidacoes.filter(
    (entry) => entry.status === "Rejeitado",
  );
  return assignment.status === "Rejeitado" ? rejections.slice(0, -1) : rejections;
}

// Coordena sessão, carregamento de dados, ações e telas dos perfis do sistema.
function App() {
  // Mantém a sessão, os dados carregados e os estados temporários da interface.
  const [user, setUser] = useState<Usuario | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [assignments, setAssignments] = useState<Atribuicao[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [administradores, setAdministradores] = useState<Administrador[]>([]);
  const [worksheetName, setWorksheetName] = useState("");
  const [adminSedeFilter, setAdminSedeFilter] = useState("");
  const [adminStatusFilter, setAdminStatusFilter] = useState<Status | "Todas">("Todas");
  const [secretaryStatusFilter, setSecretaryStatusFilter] = useState<Status | "Todas">("Todas");
  const [loginError, setLoginError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [spreadsheetError, setSpreadsheetError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<RevisaoAtribuicao | null>(null);
  const [reopenAssignment, setReopenAssignment] = useState<Atribuicao | null>(null);
  const [reopenHours, setReopenHours] = useState("");
  const [observation, setObservation] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const [editingSecretaryId, setEditingSecretaryId] = useState<number | null>(null);
  const [deletingSecretary, setDeletingSecretary] = useState<Secretaria | null>(null);
  const [editingAdministratorId, setEditingAdministratorId] = useState<number | null>(null);
  const [deletingAdministrator, setDeletingAdministrator] = useState<Administrador | null>(null);
  const [secretaryForm, setSecretaryForm] = useState<FormularioSecretaria>(
    createEmptySecretaryForm,
  );
  const [administratorForm, setAdministratorForm] = useState<FormularioAdministrador>(
    createEmptyAdministratorForm,
  );

  // Carrega atribuições e, somente para o administrador, acessos das secretarias.
  const loadDashboard = useCallback(async (perfil: Perfil) => {
    const assignmentsResponse =
      await api<{ atribuicoes: Atribuicao[] }>("/api/atribuicoes");
    setAssignments(assignmentsResponse.atribuicoes);
    if (perfil === "ADMIN") {
      const [usersResponse, administratorsResponse] = await Promise.all([
        api<{ secretarias: Secretaria[] }>("/api/admin/secretarias"),
        api<{ administradores: Administrador[] }>("/api/admin/administradores"),
      ]);
      setSecretarias(usersResponse.secretarias);
      setAdministradores(administratorsResponse.administradores);
    } else {
      setSecretarias([]);
      setAdministradores([]);
    }
  }, []);

  // Restaura a sessão do navegador ao abrir ou atualizar a aplicação.
  useEffect(() => {
    let isMounted = true;
    void api<{ usuario: Usuario }>("/api/auth/me")
      .then(async ({ usuario: authenticatedUser }) => {
        if (!isMounted) return;
        setUser(authenticatedUser);
        await loadDashboard(authenticatedUser.perfil);
      })
      .catch((cause: unknown) => {
        if (isMounted && cause instanceof ApiError && cause.status !== 401) {
          setError(cause.message);
        }
      })
      .finally(() => {
        if (isMounted) setSessionLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [loadDashboard]);

  // Calcula os indicadores apresentados nos painéis.
  const pendingCount = useMemo(
    () => assignments.filter((assignment) => assignment.status === "Pendente").length,
    [assignments],
  );
  const approvedCount = useMemo(
    () => assignments.filter((assignment) => assignment.status === "Aprovado").length,
    [assignments],
  );
  const availableSedes = useMemo(
    () =>
      [...new Set(assignments.map((assignment) => assignment.sede))].sort(
        (firstSeat, secondSeat) => firstSeat.localeCompare(secondSeat, "pt-BR"),
      ),
    [assignments],
  );
  const unitsCount = availableSedes.length;
  const visibleAssignments = useMemo(() => {
    if (user?.perfil === "ADMIN") {
      return assignments.filter(
        (assignment) =>
          (!adminSedeFilter || assignment.sede === adminSedeFilter) &&
          (adminStatusFilter === "Todas" || assignment.status === adminStatusFilter),
      );
    }

    return assignments.filter(
      (assignment) =>
        secretaryStatusFilter === "Todas" ||
        assignment.status === secretaryStatusFilter,
    );
  }, [adminSedeFilter, adminStatusFilter, assignments, secretaryStatusFilter, user]);

  // Autentica o usuário e carrega os dados do perfil retornado pela API.
  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await api<{ usuario: Usuario }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
      setUser(response.usuario);
      setLoginError("");
      try {
        await loadDashboard(response.usuario.perfil);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar os dados da conta.",
        );
      }
    } catch (cause) {
      setLoginError(
        cause instanceof Error ? cause.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Encerra a sessão e limpa os dados locais associados à conta.
  async function signOut() {
    setBusy(true);
    try {
      await api<void>("/api/auth/logout", { method: "POST" });
      setUser(null);
      setAssignments([]);
      setSecretarias([]);
      setAdministradores([]);
      setFeedback("");
      setError("");
      setSpreadsheetError("");
      setLoginError("");
      setSelectedFile(null);
      setReview(null);
      setObservation("");
      setAdminSedeFilter("");
      setAdminStatusFilter("Todas");
      setSecretaryStatusFilter("Todas");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível sair.");
    } finally {
      setBusy(false);
    }
  }

  // Atualiza os dados do painel após uma operação bem-sucedida.
  async function reloadData() {
    if (!user) return;
    await loadDashboard(user.perfil);
  }

  // Envia uma planilha para validação e substituição da base atual.
  async function importFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!selectedFile) {
      setError("Selecione um arquivo antes de importar.");
      return;
    }

    setBusy(true);
    setError("");
    setFeedback("");
    setSpreadsheetError("");
    try {
      const formData = new FormData();
      formData.append("arquivo", selectedFile);
      if (worksheetName.trim()) formData.append("aba", worksheetName.trim());
      let response: { mensagem: string };
      try {
        response = await api<{ mensagem: string }>(
          "/api/admin/atribuicoes/importar",
          { method: "POST", body: formData },
        );
      } catch (cause) {
        setSpreadsheetError(getSpreadsheetErrorMessage(cause));
        return;
      }

      setSelectedFile(null);
      formElement.reset();
      setFeedback(response.mensagem);
      await reloadData();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `A importação foi concluída, mas não foi possível atualizar a lista: ${cause.message}`
          : "A importação foi concluída, mas os dados não puderam ser atualizados.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Cria ou atualiza a conta de secretaria que está no formulário.
  async function saveSecretary(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await api<{ secretaria: { email: string } }>(
        editingSecretaryId
          ? `/api/admin/secretarias/${editingSecretaryId}`
          : "/api/admin/secretarias",
        {
          method: editingSecretaryId ? "PUT" : "POST",
          body: JSON.stringify(secretaryForm),
        },
      );
      setSecretaryForm(createEmptySecretaryForm());
      setEditingSecretaryId(null);
      await reloadData();
      setFeedback(
        editingSecretaryId
          ? `Acesso atualizado para ${response.secretaria.email}. A secretaria deverá entrar novamente.`
          : `Acesso criado para ${response.secretaria.email}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  // Preenche o formulário com os dados do acesso selecionado.
  function editSecretary(secretaria: Secretaria) {
    setEditingSecretaryId(secretaria.id);
    setSecretaryForm({
      nome: secretaria.nome,
      email: secretaria.email,
      sede: secretaria.sede,
      password: "",
    });
    setError("");
    setFeedback("");
  }

  // Abandona a edição e limpa os dados do formulário de acesso.
  function cancelSecretaryEdit() {
    setEditingSecretaryId(null);
    setSecretaryForm(createEmptySecretaryForm());
  }

  // Exclui o acesso selecionado sem remover atribuições já registradas.
  async function deleteSecretary() {
    if (!deletingSecretary) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await api<void>(`/api/admin/secretarias/${deletingSecretary.id}`, {
        method: "DELETE",
      });
      setDeletingSecretary(null);
      if (editingSecretaryId === deletingSecretary.id) cancelSecretaryEdit();
      await reloadData();
      setFeedback(`O acesso de ${deletingSecretary.email} foi excluído.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o acesso.");
    } finally {
      setBusy(false);
    }
  }

  // Cria ou atualiza uma conta administrativa com privilégios completos.
  async function saveAdministrator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await api<{ administrador: Administrador }>(
        editingAdministratorId
          ? `/api/admin/administradores/${editingAdministratorId}`
          : "/api/admin/administradores",
        {
          method: editingAdministratorId ? "PUT" : "POST",
          body: JSON.stringify(administratorForm),
        },
      );
      setAdministratorForm(createEmptyAdministratorForm());
      setEditingAdministratorId(null);
      await reloadData();
      setFeedback(
        editingAdministratorId
          ? `Administrador ${response.administrador.email} atualizado. A pessoa deverá entrar novamente.`
          : `Acesso administrativo criado para ${response.administrador.email}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o administrador.");
    } finally {
      setBusy(false);
    }
  }

  // Carrega os dados do administrador selecionado no formulário.
  function editAdministrator(administrator: Administrador) {
    setEditingAdministratorId(administrator.id);
    setAdministratorForm({
      nome: administrator.nome,
      email: administrator.email,
      password: "",
    });
    setError("");
    setFeedback("");
  }

  // Cancela a edição de administrador e limpa o formulário.
  function cancelAdministratorEdit() {
    setEditingAdministratorId(null);
    setAdministratorForm(createEmptyAdministratorForm());
  }

  // Exclui outra conta ADMIN sem apagar o histórico de importações.
  async function deleteAdministrator() {
    if (!deletingAdministrator) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await api<void>(`/api/admin/administradores/${deletingAdministrator.id}`, {
        method: "DELETE",
      });
      setDeletingAdministrator(null);
      if (editingAdministratorId === deletingAdministrator.id) {
        cancelAdministratorEdit();
      }
      await reloadData();
      setFeedback(`O acesso administrativo de ${deletingAdministrator.email} foi excluído.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o administrador.");
    } finally {
      setBusy(false);
    }
  }

  // Atualiza as horas de uma rejeição e a devolve à secretaria para nova decisão.
  async function reopenRejectedAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reopenAssignment) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await api<{ mensagem: string }>(
        `/api/admin/atribuicoes/${reopenAssignment.id}/reabrir`,
        {
          method: "PUT",
          body: JSON.stringify({ totalHoras: Number(reopenHours) }),
        },
      );
      await reloadData();
      setReopenAssignment(null);
      setReopenHours("");
      setFeedback(response.mensagem);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível reenviar a atribuição.");
    } finally {
      setBusy(false);
    }
  }

  // Remove as atribuições ativas após confirmação do administrador.
  async function resetBase() {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await api<{ mensagem: string }>(
        "/api/admin/atribuicoes/reset",
        { method: "POST" },
      );
      await reloadData();
      setResetConfirmation(false);
      setFeedback(response.mensagem);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível esvaziar a base.");
    } finally {
      setBusy(false);
    }
  }

  // Registra a decisão da secretaria e exige justificativa ao rejeitar.
  async function saveReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await api(`/api/secretaria/atribuicoes/${review.assignment.id}/validacao`, {
        method: "PUT",
        body: JSON.stringify({
          status: review.status,
          observacao: observation,
        }),
      });
      await reloadData();
      setReview(null);
      setObservation("");
      setFeedback(
        review.status === "Aprovado"
          ? "A atribuição foi aprovada."
          : "A atribuição foi rejeitada e a observação foi registrada.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a validação.");
    } finally {
      setBusy(false);
    }
  }

  // Abre a validação e inicia uma observação limpa para a decisão selecionada.
  function beginAssignmentReview(
    assignment: Atribuicao,
    status: "Aprovado" | "Rejeitado",
  ) {
    setReview({ assignment, status });
    setObservation("");
    setError("");
  }

  // Abre o ajuste de horas com o valor atual da atribuição rejeitada.
  function beginAssignmentReopen(assignment: Atribuicao) {
    setReopenAssignment(assignment);
    setReopenHours(String(assignment.horasSolicitadas));
    setError("");
    setFeedback("");
  }

  // Mantém a marca visível enquanto a aplicação verifica a sessão.
  if (sessionLoading) {
    return (
      <div className="app-shell app-shell--login">
        <header className="site-header">
          <div className="site-header__inner"><Brand /></div>
        </header>
        <main className="login-loading" role="status">Verificando seu acesso…</main>
      </div>
    );
  }

  // Apresenta a tela de autenticação quando não há conta ativa.
  if (!user) {
    return (
      <div className="app-shell app-shell--login">
        <header className="site-header">
          <div className="site-header__inner">
            <Brand />
            <span className="header-caption">Sistema de gestão acadêmica</span>
          </div>
        </header>
        <main className="login-layout">
          <section className="login-intro" aria-labelledby="login-title">
            <span className="eyebrow">GESTÃO ACADÊMICA</span>
            <h1 id="login-title">Atribuição e validação de carga horária</h1>
            <p>
              Consulte as atribuições docentes e valide a disponibilidade de
              carga horária semanal da sua unidade.
            </p>
            <div className="login-rule">
              <span className="login-rule__number">40h</span>
              <span className="login-rule__copy">
                Limite de carga horária semanal por atribuição
              </span>
            </div>
          </section>
          <section className="login-card" aria-labelledby="form-title">
            <span className="eyebrow">ACESSO AO SISTEMA</span>
            <h2 id="form-title">Entrar</h2>
            <p className="muted-copy">
              Use o e-mail e a senha cadastrados para o seu perfil.
            </p>
            <form className="form-stack" onSubmit={signIn}>
              <label className="field">
                <span>E-mail institucional</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="nome@cps.sp.gov.br"
                  required
                />
              </label>
              <label className="field">
                <span>Senha</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              {loginError && <p className="form-error" role="alert">{loginError}</p>}
              <button
                className="button button--primary button--full"
                type="submit"
                disabled={busy}
              >
                {busy ? "Verificando…" : "Acessar sistema"}
              </button>
            </form>
            <p className="prototype-note">
              O perfil e a unidade são associados à sua conta pelo administrador.
            </p>
            {error && <p className="form-error" role="alert">{error}</p>}
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  // Renderiza o painel apropriado ao perfil já autenticado.
  const isAdmin = user.perfil === "ADMIN";

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Brand />
          <div className="account">
            <div className="account__details">
              <span className="account__name">{user.nome}</span>
              <span className="account__email">
                {isAdmin ? "Administrador" : user.sede}
                {" · "}
                {user.email}
              </span>
            </div>
            <button
              className="button button--text"
              type="button"
              onClick={() => void signOut()}
              disabled={busy}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="page-container dashboard">
        <nav className="breadcrumb" aria-label="Navegação estrutural">
          <span>Início</span>
          <span aria-hidden="true">/</span>
          <span>{isAdmin ? "Administração" : "Validação da unidade"}</span>
        </nav>

        {isAdmin ? (
          <>
            {/* Ferramentas de importação, consulta de atribuições e contas de secretaria. */}
            <div className="page-heading">
              <div>
                <span className="eyebrow">ADMINISTRAÇÃO</span>
                <h1>Base de atribuições</h1>
                <p>Importe as solicitações e gerencie os acessos das unidades.</p>
              </div>
              <button
                className="button button--outline"
                type="button"
                onClick={() => setResetConfirmation(true)}
                disabled={busy}
              >
                Esvaziar base
              </button>
            </div>

            <section className="upload-panel" aria-labelledby="upload-title">
              <div className="upload-panel__content">
                <span className="eyebrow">IMPORTAÇÃO DA BASE</span>
                <h2 id="upload-title">Enviar planilha de atribuições</h2>
                <p>
                  A importação localiza automaticamente uma aba com as colunas
                  Sede, Docente, Matrícula, EMAIL e Total Horas, valida as linhas e
                  substitui a base atual.
                </p>
                <p className="field__hint">
                  Aceita .xls, .xlsx, .ods e .csv (até 5 MB e 5.000 registros).
                  Quando houver mais de uma aba de dados diferente, informe o nome
                  abaixo. Valores importados iniciam como pendentes.
                </p>
                <label className="field worksheet-field">
                  <span>Aba da planilha (opcional)</span>
                  <input
                    value={worksheetName}
                    onChange={(event) => setWorksheetName(event.currentTarget.value)}
                    maxLength={100}
                    placeholder="Ex.: Banco de dados"
                    disabled={busy}
                  />
                </label>
                {selectedFile && (
                  <p className="file-selected">Arquivo: {selectedFile.name}</p>
                )}
              </div>
              <form className="upload-form" onSubmit={(event) => void importFile(event)}>
                <label className="field field--file">
                  <span className="visually-hidden">Arquivo de atribuições</span>
                  <input
                    type="file"
                    accept=".xls,.xlsx,.ods,.csv"
                    onChange={(event) =>
                      setSelectedFile(event.currentTarget.files?.[0] ?? null)
                    }
                    disabled={busy}
                    required
                  />
                </label>
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={!selectedFile || busy}
                >
                  {busy ? "Processando…" : "Enviar e processar"}
                </button>
              </form>
            </section>

            <section className="metric-grid" aria-label="Resumo da base">
              <SummaryMetric label="Atribuições na base" value={assignments.length} />
              <SummaryMetric label="Aguardando validação" value={pendingCount} />
              <SummaryMetric label="Unidades" value={unitsCount} />
            </section>

            <div className="section-heading">
              <div>
                <h2>Solicitações importadas</h2>
                <p>Consulte as atribuições e o resultado da validação de cada sede.</p>
              </div>
            </div>
            <AssignmentFilters
              sede={adminSedeFilter}
              onSedeChange={setAdminSedeFilter}
              status={adminStatusFilter}
              onStatusChange={setAdminStatusFilter}
              sedes={availableSedes}
              onClear={() => {
                setAdminSedeFilter("");
                setAdminStatusFilter("Todas");
              }}
            />
            <p className="filter-result-count" aria-live="polite">
              Exibindo {visibleAssignments.length} de {assignments.length} atribuições.
            </p>
            <AssignmentTable
              assignments={visibleAssignments}
              admin
              onReopen={beginAssignmentReopen}
            />

            <section className="account-panel" aria-labelledby="account-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">ACESSO POR UNIDADE</span>
                  <h2 id="account-title">
                    {editingSecretaryId ? "Editar acesso da secretaria" : "Cadastrar secretaria"}
                  </h2>
                  <p>
                    Cada conta de secretaria fica vinculada a uma única sede.
                  </p>
                </div>
              </div>
              <form className="account-form" onSubmit={(event) => void saveSecretary(event)}>
                <label className="field">
                  <span>Nome</span>
                  <input
                    value={secretaryForm.nome}
                    onChange={(event) =>
                      setSecretaryForm({ ...secretaryForm, nome: event.currentTarget.value })
                    }
                    maxLength={120}
                    required
                  />
                </label>
                <label className="field">
                  <span>E-mail de acesso</span>
                  <input
                    type="email"
                    value={secretaryForm.email}
                    onChange={(event) =>
                      setSecretaryForm({ ...secretaryForm, email: event.currentTarget.value })
                    }
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="field">
                  <span>Sede autorizada</span>
                  <input
                    value={secretaryForm.sede}
                    onChange={(event) =>
                      setSecretaryForm({ ...secretaryForm, sede: event.currentTarget.value })
                    }
                    maxLength={160}
                    required
                  />
                </label>
                <label className="field">
                  <span>
                    {editingSecretaryId
                      ? "Redefinir senha (opcional, mínimo 12 caracteres)"
                      : "Senha inicial (mínimo 12 caracteres)"}
                  </span>
                  <input
                    type="password"
                    value={secretaryForm.password}
                    onChange={(event) =>
                      setSecretaryForm({
                        ...secretaryForm,
                        password: event.currentTarget.value,
                      })
                    }
                    minLength={12}
                    maxLength={200}
                    autoComplete="new-password"
                    required={!editingSecretaryId}
                  />
                </label>
                <button className="button button--primary" type="submit" disabled={busy}>
                  {editingSecretaryId ? "Salvar alterações" : "Criar acesso da secretaria"}
                </button>
                {editingSecretaryId && (
                  <button
                    className="button button--text"
                    type="button"
                    onClick={cancelSecretaryEdit}
                    disabled={busy}
                  >
                    Cancelar edição
                  </button>
                )}
              </form>
              <div className="table-card account-table">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Secretaria</th>
                        <th scope="col">E-mail de acesso</th>
                        <th scope="col">Sede autorizada</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secretarias.map((secretaria) => (
                        <tr key={secretaria.id}>
                          <td>{secretaria.nome}</td>
                          <td>{secretaria.email}</td>
                          <td>{secretaria.sede}</td>
                          <td>{secretaria.ativo ? "Ativa" : "Inativa"}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="button button--small button--outline"
                                type="button"
                                onClick={() => editSecretary(secretaria)}
                                disabled={busy}
                              >
                                Editar
                              </button>
                              <button
                                className="button button--small button--reject"
                                type="button"
                                onClick={() => setDeletingSecretary(secretaria)}
                                disabled={busy}
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!secretarias.length && (
                        <tr><td className="empty-state" colSpan={5}>Nenhuma secretaria cadastrada.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="field__hint">
                Compartilhe a senha inicial por um canal privado. O e-mail e o
                perfil não podem ser escolhidos na tela de login.
              </p>
            </section>

            <section className="account-panel" aria-labelledby="administrator-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">ACESSO ADMINISTRATIVO</span>
                  <h2 id="administrator-title">
                    {editingAdministratorId
                      ? "Editar acesso administrativo"
                      : "Cadastrar administrador"}
                  </h2>
                  <p>
                    Todas as contas ADMIN têm as mesmas permissões para gerenciar
                    atribuições e acessos do sistema.
                  </p>
                </div>
              </div>
              <form
                className="account-form"
                onSubmit={(event) => void saveAdministrator(event)}
              >
                <label className="field">
                  <span>Nome</span>
                  <input
                    value={administratorForm.nome}
                    onChange={(event) =>
                      setAdministratorForm({
                        ...administratorForm,
                        nome: event.currentTarget.value,
                      })
                    }
                    maxLength={120}
                    required
                  />
                </label>
                <label className="field">
                  <span>E-mail de acesso</span>
                  <input
                    type="email"
                    value={administratorForm.email}
                    onChange={(event) =>
                      setAdministratorForm({
                        ...administratorForm,
                        email: event.currentTarget.value,
                      })
                    }
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="field">
                  <span>
                    {editingAdministratorId
                      ? "Redefinir senha (opcional, mínimo 12 caracteres)"
                      : "Senha inicial (mínimo 12 caracteres)"}
                  </span>
                  <input
                    type="password"
                    value={administratorForm.password}
                    onChange={(event) =>
                      setAdministratorForm({
                        ...administratorForm,
                        password: event.currentTarget.value,
                      })
                    }
                    minLength={12}
                    maxLength={200}
                    autoComplete="new-password"
                    required={!editingAdministratorId}
                  />
                </label>
                <button className="button button--primary" type="submit" disabled={busy}>
                  {editingAdministratorId
                    ? "Salvar alterações"
                    : "Criar acesso administrativo"}
                </button>
                {editingAdministratorId && (
                  <button
                    className="button button--text"
                    type="button"
                    onClick={cancelAdministratorEdit}
                    disabled={busy}
                  >
                    Cancelar edição
                  </button>
                )}
              </form>
              <div className="table-card account-table">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Administrador</th>
                        <th scope="col">E-mail de acesso</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {administradores.map((administrator) => {
                        const isCurrentAdministrator = administrator.id === user.id;
                        return (
                          <tr key={administrator.id}>
                            <td>{administrator.nome}</td>
                            <td>{administrator.email}</td>
                            <td>{administrator.ativo ? "Ativa" : "Inativa"}</td>
                            <td>
                              {isCurrentAdministrator ? (
                                <span className="table-secondary">Sessão atual</span>
                              ) : (
                                <div className="row-actions">
                                  <button
                                    className="button button--small button--outline"
                                    type="button"
                                    onClick={() => editAdministrator(administrator)}
                                    disabled={busy}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    className="button button--small button--reject"
                                    type="button"
                                    onClick={() => setDeletingAdministrator(administrator)}
                                    disabled={busy}
                                  >
                                    Excluir
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!administradores.length && (
                        <tr>
                          <td className="empty-state" colSpan={4}>
                            Nenhum administrador cadastrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="field__hint">
                Por segurança, não é possível editar ou excluir a conta usada nesta
                sessão. O sistema também impede excluir o último administrador ativo.
              </p>
            </section>
          </>
        ) : (
          <>
            {/* Consulta e validação das atribuições limitadas à unidade autenticada. */}
            <div className="page-heading">
              <div>
                <span className="eyebrow">VALIDAÇÃO DE CARGA HORÁRIA</span>
                <h1>Docentes da unidade</h1>
                <p>
                  Atribuições vinculadas exclusivamente a{" "}
                  <strong>{user.sede}</strong>.
                </p>
              </div>
              <div className="unit-label">
                <span className="unit-label__caption">SUA UNIDADE</span>
                <span className="unit-label__name">{user.sede}</span>
              </div>
            </div>
            <section className="metric-grid" aria-label="Resumo das atribuições">
              <SummaryMetric label="Atribuições da unidade" value={assignments.length} />
              <SummaryMetric label="Aguardando validação" value={pendingCount} />
              <SummaryMetric label="Aprovadas" value={approvedCount} />
            </section>
            <div className="section-heading">
              <div>
                <h2>Atribuições recebidas</h2>
                <p>Revise a carga horária solicitada e registre a validação da unidade.</p>
              </div>
            </div>
            <AssignmentFilters
              status={secretaryStatusFilter}
              onStatusChange={setSecretaryStatusFilter}
              onClear={() => setSecretaryStatusFilter("Todas")}
            />
            <p className="filter-result-count" aria-live="polite">
              Exibindo {visibleAssignments.length} de {assignments.length} atribuições.
            </p>
            <AssignmentTable
              assignments={visibleAssignments}
              onReview={beginAssignmentReview}
            />
            <p className="hours-note">
              Limite de referência por atribuição: <strong>40 horas semanais</strong>.
            </p>
          </>
        )}

        {error && <p className="feedback feedback--error" role="alert">{error}</p>}
        {feedback && <p className="feedback" role="status">{feedback}</p>}
      </main>
      <Footer />

      {/* Explica falhas de planilha e orienta o usuário a corrigir e reenviar. */}
      {spreadsheetError && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="spreadsheet-error-title"
            aria-describedby="spreadsheet-error-description"
          >
            <span className="eyebrow">IMPORTAÇÃO NÃO CONCLUÍDA</span>
            <h2 id="spreadsheet-error-title">Erro na planilha</h2>
            <p id="spreadsheet-error-description">{spreadsheetError}</p>
            <div className="modal__actions">
              <button
                className="button button--primary"
                type="button"
                onClick={() => setSpreadsheetError("")}
              >
                Entendi
              </button>
            </div>
          </section>
        </div>
      )}

      {/* A rejeição exige observação; a API também aplica essa regra. */}
      {review && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <button
              className="modal__close"
              type="button"
              aria-label="Fechar"
              onClick={() => setReview(null)}
              disabled={busy}
            >
              ×
            </button>
            <span className="eyebrow">VALIDAÇÃO DA UNIDADE</span>
            <h2 id="review-title">
              {review.status === "Aprovado" ? "Confirmar atribuição" : "Recusar atribuição"}
            </h2>
            <p>
              <strong>{review.assignment.docente}</strong> ·{" "}
              {formatHours(review.assignment.horasSolicitadas)}h solicitadas.
            </p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <form className="form-stack" onSubmit={(event) => void saveReview(event)}>
              {review.status === "Rejeitado" && (
                <label className="field">
                  <span>
                    Observação <span className="required-mark">*</span>
                  </span>
                  <textarea
                    value={observation}
                    onChange={(event) => setObservation(event.currentTarget.value)}
                    required
                    rows={4}
                    maxLength={500}
                    placeholder="Informe o motivo da recusa."
                  />
                  <span className="field__hint">Obrigatória para registrar a rejeição.</span>
                </label>
              )}
              <div className="modal__actions">
                <button
                  className="button button--outline"
                  type="button"
                  onClick={() => setReview(null)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button className="button button--primary" type="submit" disabled={busy}>
                  {busy ? "Salvando…" : `Confirmar ${review.status === "Aprovado" ? "aprovação" : "rejeição"}`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Confirmação explícita antes da exclusão da base ativa. */}
      {resetConfirmation && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <button
              className="modal__close"
              type="button"
              aria-label="Fechar"
              onClick={() => setResetConfirmation(false)}
              disabled={busy}
            >
              ×
            </button>
            <span className="eyebrow">BASE DE ATRIBUIÇÕES</span>
            <h2 id="reset-title">Esvaziar a base atual?</h2>
            <p>
              As atribuições e observações de validação serão removidas
              permanentemente. Contas de acesso e histórico de importação serão
              preservados.
            </p>
            <div className="modal__actions">
              <button
                className="button button--outline"
                type="button"
                onClick={() => setResetConfirmation(false)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => void resetBase()}
                disabled={busy}
              >
                {busy ? "Esvaziando…" : "Esvaziar base"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Edição de horas e reenvio de uma atribuição rejeitada. */}
      {reopenAssignment && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reopen-title">
            <button
              className="modal__close"
              type="button"
              aria-label="Fechar"
              onClick={() => setReopenAssignment(null)}
              disabled={busy}
            >
              ×
            </button>
            <span className="eyebrow">AJUSTE DE ATRIBUIÇÃO</span>
            <h2 id="reopen-title">Editar horas e reenviar</h2>
            <p>
              <strong>{reopenAssignment.docente}</strong> · {reopenAssignment.sede}
            </p>
            {reopenAssignment.observacao && (
              <p className="rejection-note">
                Motivo registrado pela secretaria: {reopenAssignment.observacao}
              </p>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <form className="form-stack" onSubmit={(event) => void reopenRejectedAssignment(event)}>
              <label className="field">
                <span>Nova quantidade de horas solicitadas</span>
                <input
                  type="number"
                  min="0.01"
                  max="40"
                  step="0.01"
                  value={reopenHours}
                  onChange={(event) => setReopenHours(event.currentTarget.value)}
                  required
                />
                <span className="field__hint">
                  Após o reenvio, a atribuição volta como pendente para a secretaria validar.
                </span>
              </label>
              <div className="modal__actions">
                <button
                  className="button button--outline"
                  type="button"
                  onClick={() => setReopenAssignment(null)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button className="button button--primary" type="submit" disabled={busy}>
                  {busy ? "Reenviando…" : "Salvar e reenviar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Confirmação antes de remover o acesso de uma secretaria. */}
      {deletingSecretary && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-secretary-title">
            <button
              className="modal__close"
              type="button"
              aria-label="Fechar"
              onClick={() => setDeletingSecretary(null)}
              disabled={busy}
            >
              ×
            </button>
            <span className="eyebrow">ACESSO POR UNIDADE</span>
            <h2 id="delete-secretary-title">Excluir acesso da secretaria?</h2>
            <p>
              O acesso de <strong>{deletingSecretary.nome}</strong> ({deletingSecretary.email})
              será removido. A pessoa perderá o acesso à unidade {deletingSecretary.sede}.
              Essa ação não remove as atribuições já registradas.
            </p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal__actions">
              <button
                className="button button--outline"
                type="button"
                onClick={() => setDeletingSecretary(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="button button--reject"
                type="button"
                onClick={() => void deleteSecretary()}
                disabled={busy}
              >
                {busy ? "Excluindo…" : "Excluir acesso"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Confirmação de exclusão de outra conta administrativa. */}
      {deletingAdministrator && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-administrator-title"
          >
            <button
              className="modal__close"
              type="button"
              aria-label="Fechar"
              onClick={() => setDeletingAdministrator(null)}
              disabled={busy}
            >
              ×
            </button>
            <span className="eyebrow">ACESSO ADMINISTRATIVO</span>
            <h2 id="delete-administrator-title">Excluir administrador?</h2>
            <p>
              O acesso de <strong>{deletingAdministrator.nome}</strong>{" "}
              ({deletingAdministrator.email}) será removido. As importações
              realizadas por essa conta permanecerão no histórico.
            </p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal__actions">
              <button
                className="button button--outline"
                type="button"
                onClick={() => setDeletingAdministrator(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="button button--reject"
                type="button"
                onClick={() => void deleteAdministrator()}
                disabled={busy}
              >
                {busy ? "Excluindo…" : "Excluir administrador"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Apresenta um indicador agregado dos dados do painel.
function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric">
      <span className="metric__label">{label}</span>
      <strong className="metric__value">{value}</strong>
    </article>
  );
}

// Permite combinar filtros de sede e status, com limpeza em uma única ação.
function AssignmentFilters({
  sede,
  onSedeChange,
  status,
  onStatusChange,
  sedes,
  onClear,
}: {
  sede?: string;
  onSedeChange?: (sede: string) => void;
  status: Status | "Todas";
  onStatusChange: (status: Status | "Todas") => void;
  sedes?: string[];
  onClear: () => void;
}) {
  const activeFilters = Number(Boolean(sede)) + Number(status !== "Todas");

  return (
    <section className="filters-panel" aria-label="Filtros de atribuições">
      {onSedeChange && (
        <label className="field filter-field">
          <span>Filtrar por sede</span>
          <select
            value={sede}
            onChange={(event) => onSedeChange(event.currentTarget.value)}
          >
            <option value="">Todas as sedes</option>
            {sedes?.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field filter-field">
        <span>Status da validação</span>
        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.currentTarget.value as Status | "Todas")
          }
        >
          <option value="Todas">Todos os status</option>
          <option value="Pendente">Pendente</option>
          <option value="Aprovado">Aprovado</option>
          <option value="Rejeitado">Rejeitado</option>
        </select>
      </label>
      {activeFilters > 0 && (
        <button className="button button--text filters-clear" type="button" onClick={onClear}>
          Limpar filtros
        </button>
      )}
      <span className="filter-count" aria-live="polite">
        {activeFilters
          ? `${activeFilters} filtro${activeFilters > 1 ? "s" : ""} ativo${activeFilters > 1 ? "s" : ""}`
          : "Sem filtros ativos"}
      </span>
    </section>
  );
}

// Exibe atribuições e as ações disponíveis para cada perfil e estado.
function AssignmentTable({
  assignments,
  admin = false,
  onReview,
  onReopen,
}: {
  assignments: Atribuicao[];
  admin?: boolean;
  onReview?: (assignment: Atribuicao, status: "Aprovado" | "Rejeitado") => void;
  onReopen?: (assignment: Atribuicao) => void;
}) {
  const columnCount = admin ? 8 + Number(Boolean(onReopen)) : 4 + (onReview ? 1 : 0);

  return (
    <div className="table-card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {admin && <th scope="col">Sede</th>}
              <th scope="col">Docente</th>
              <th scope="col">Matrícula</th>
              {admin && <th scope="col">E-mail</th>}
              <th scope="col" className="table-cell--hours">Horas solicitadas</th>
              <th scope="col">Validação</th>
              {admin && <th scope="col">Observação da secretaria</th>}
              {admin && <th scope="col">Validada em / por</th>}
              {onReopen && <th scope="col">Ações</th>}
              {onReview && <th scope="col">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => {
              const previousRejections = getPreviousRejections(assignment);
              const hasRejectionHistory = assignment.historicoValidacoes.some(
                (entry) => entry.status === "Rejeitado",
              );

              return (
                <tr key={assignment.id}>
                  {admin && <td>{assignment.sede}</td>}
                  <td>
                    <span className="table-primary">{assignment.docente}</span>
                    <span className="table-secondary">Matrícula {assignment.matricula}</span>
                  </td>
                  <td>{assignment.matricula}</td>
                  {admin && <td>{assignment.email}</td>}
                  <td className="table-cell--hours">
                    <span className="hours-value">
                      {formatHours(assignment.horasSolicitadas)}h
                    </span>
                    <span className="table-secondary">solicitadas</span>
                  </td>
                  <td><StatusBadge status={assignment.status} /></td>
                  {admin && (
                    <td className="observation-cell">
                      {assignment.status === "Rejeitado" && assignment.observacao && (
                        <span className="rejection-note">
                          Rejeição atual: {assignment.observacao}
                        </span>
                      )}
                      {previousRejections.map((entry) => (
                        <span
                          className="rejection-note rejection-note--history"
                          key={entry.id}
                        >
                          Rejeição anterior ({formatHours(entry.totalHoras)}h):{" "}
                          {entry.observacao || "Sem observação."}
                        </span>
                      ))}
                      {assignment.status !== "Rejeitado" &&
                        !hasRejectionHistory && (
                          <span className="table-secondary">—</span>
                        )}
                    </td>
                  )}
                  {admin && (
                    <td>
                      {assignment.dataHoraValidacao ? (
                        <>
                          <span>{formatDate(assignment.dataHoraValidacao)}</span>
                          <span className="table-secondary">
                            {assignment.usuarioValidador}
                          </span>
                        </>
                      ) : (
                        <span className="table-secondary">—</span>
                      )}
                    </td>
                  )}
                  {onReopen && (
                    <td>
                      {assignment.status === "Rejeitado" ? (
                        <button
                          className="button button--small button--outline"
                          type="button"
                          onClick={() => onReopen(assignment)}
                        >
                          Editar horas e reenviar
                        </button>
                      ) : (
                        <span className="table-secondary">—</span>
                      )}
                    </td>
                  )}
                  {onReview && (
                    <td>
                      {assignment.status === "Pendente" ? (
                        <div className="row-actions">
                          <button
                            className="button button--small button--approve"
                            type="button"
                            onClick={() => onReview(assignment, "Aprovado")}
                          >
                            Pode assumir
                          </button>
                          <button
                            className="button button--small button--reject"
                            type="button"
                            onClick={() => onReview(assignment, "Rejeitado")}
                          >
                            Não pode assumir
                          </button>
                        </div>
                      ) : (
                        <span className="table-secondary">Validação registrada</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!assignments.length && (
              <tr>
                <td className="empty-state" colSpan={columnCount}>
                  Nenhuma atribuição encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Mantém a identificação institucional e o contexto do sistema no rodapé.
function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-container">
        Centro Paula Souza <span aria-hidden="true">·</span> Gestão de carga horária
        docente
      </div>
    </footer>
  );
}

export default App;
