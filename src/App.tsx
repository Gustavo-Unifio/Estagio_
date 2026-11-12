import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, getSpreadsheetErrorMessage } from "./api";
import type {
  Administrador,
  Atribuicao,
  FormularioAdministrador,
  FormularioSecretaria,
  Perfil,
  RevisaoAtribuicao,
  Secretaria,
  Status,
  Usuario,
} from "./types";
import Brand from "./components/Brand";
import AdminPanel from "./pages/AdminPanel";
import LoginPage from "./pages/LoginPage";
import SecretaryPanel from "./pages/SecretaryPanel";

// Cria um formulário vazio sem compartilhar referências entre atualizações.
function createEmptySecretaryForm(): FormularioSecretaria {
  return { nome: "", email: "", sede: "", password: "" };
}

// Cria um formulário vazio para novos administradores.
function createEmptyAdministratorForm(): FormularioAdministrador {
  return { nome: "", email: "", password: "" };
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
      <LoginPage
        busy={busy}
        loginError={loginError}
        error={error}
        onSubmit={signIn}
      />
    );
  }

  // Renderiza o painel apropriado ao perfil já autenticado.
  const isAdmin = user.perfil === "ADMIN";

  return isAdmin ? (
    <AdminPanel
      user={user}
      assignments={assignments}
      secretarias={secretarias}
      administradores={administradores}
      worksheetName={worksheetName}
      selectedFile={selectedFile}
      adminSedeFilter={adminSedeFilter}
      adminStatusFilter={adminStatusFilter}
      visibleAssignments={visibleAssignments}
      availableSedes={availableSedes}
      pendingCount={pendingCount}
      unitsCount={unitsCount}
      busy={busy}
      error={error}
      feedback={feedback}
      spreadsheetError={spreadsheetError}
      resetConfirmation={resetConfirmation}
      reopenAssignment={reopenAssignment}
      reopenHours={reopenHours}
      editingSecretaryId={editingSecretaryId}
      deletingSecretary={deletingSecretary}
      editingAdministratorId={editingAdministratorId}
      deletingAdministrator={deletingAdministrator}
      secretaryForm={secretaryForm}
      administratorForm={administratorForm}
      setWorksheetName={setWorksheetName}
      setSelectedFile={setSelectedFile}
      setAdminSedeFilter={setAdminSedeFilter}
      setAdminStatusFilter={setAdminStatusFilter}
      setResetConfirmation={setResetConfirmation}
      setSpreadsheetError={setSpreadsheetError}
      setReopenAssignment={setReopenAssignment}
      setReopenHours={setReopenHours}
      setDeletingSecretary={setDeletingSecretary}
      setDeletingAdministrator={setDeletingAdministrator}
      setSecretaryForm={setSecretaryForm}
      setAdministratorForm={setAdministratorForm}
      onSignOut={signOut}
      onImportFile={importFile}
      onSaveSecretary={saveSecretary}
      onEditSecretary={editSecretary}
      onCancelSecretaryEdit={cancelSecretaryEdit}
      onDeleteSecretary={deleteSecretary}
      onSaveAdministrator={saveAdministrator}
      onEditAdministrator={editAdministrator}
      onCancelAdministratorEdit={cancelAdministratorEdit}
      onDeleteAdministrator={deleteAdministrator}
      onReopenAssignment={beginAssignmentReopen}
      onReopenRejectedAssignment={reopenRejectedAssignment}
      onResetBase={resetBase}
    />
  ) : (
    <SecretaryPanel
      user={user}
      assignments={assignments}
      pendingCount={pendingCount}
      approvedCount={approvedCount}
      visibleAssignments={visibleAssignments}
      secretaryStatusFilter={secretaryStatusFilter}
      busy={busy}
      error={error}
      feedback={feedback}
      review={review}
      observation={observation}
      onSignOut={signOut}
      onStatusChange={setSecretaryStatusFilter}
      onReview={beginAssignmentReview}
      onSaveReview={saveReview}
      onObservationChange={setObservation}
      setReview={setReview}
    />
  );
}

export default App;
