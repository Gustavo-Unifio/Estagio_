import type { Dispatch, FormEvent, SetStateAction } from "react";
import AssignmentFilters from "../components/AssignmentFilters";
import AssignmentTable from "../components/AssignmentTable";
import Brand from "../components/Brand";
import Footer from "../components/Footer";
import SummaryMetric from "../components/SummaryMetric";
import type { CriterioOrdenacao, DirecaoOrdenacao } from "../utils/format";
import type {
  Administrador,
  Atribuicao,
  FormularioAdministrador,
  FormularioSecretaria,
  Secretaria,
  Status,
  Usuario,
} from "../types";

type AdminPanelProps = {
  user: Usuario;
  assignments: Atribuicao[];
  secretarias: Secretaria[];
  administradores: Administrador[];
  worksheetName: string;
  selectedFile: File | null;
  adminSedeFilter: string;
  adminStatusFilter: Status | "Todas";
  sortCriterion: CriterioOrdenacao;
  sortDirection: DirecaoOrdenacao;
  exporting: boolean;
  secretaryImportFile: File | null;
  visibleAssignments: Atribuicao[];
  availableSedes: string[];
  pendingCount: number;
  unitsCount: number;
  busy: boolean;
  error: string;
  feedback: string;
  spreadsheetError: string;
  resetConfirmation: boolean;
  reopenAssignment: Atribuicao | null;
  reopenHours: string;
  editingSecretaryId: number | null;
  deletingSecretary: Secretaria | null;
  editingAdministratorId: number | null;
  deletingAdministrator: Administrador | null;
  secretaryForm: FormularioSecretaria;
  administratorForm: FormularioAdministrador;
  setWorksheetName: (value: string) => void;
  setSelectedFile: (value: File | null) => void;
  setAdminSedeFilter: (value: string) => void;
  setAdminStatusFilter: (value: Status | "Todas") => void;
  onSortCriterionChange: (criterion: CriterioOrdenacao) => void;
  onSortDirectionChange: () => void;
  onExportAll: () => void;
  onExportSeat: () => void;
  setSecretaryImportFile: (value: File | null) => void;
  onImportSecretaryFile: (event: FormEvent<HTMLFormElement>) => void;
  onDownloadSecretaryTemplate: () => void;
  setResetConfirmation: (value: boolean) => void;
  setSpreadsheetError: (value: string) => void;
  setReopenAssignment: Dispatch<SetStateAction<Atribuicao | null>>;
  setReopenHours: (value: string) => void;
  setDeletingSecretary: Dispatch<SetStateAction<Secretaria | null>>;
  setDeletingAdministrator: Dispatch<SetStateAction<Administrador | null>>;
  setSecretaryForm: Dispatch<SetStateAction<FormularioSecretaria>>;
  setAdministratorForm: Dispatch<SetStateAction<FormularioAdministrador>>;
  onSignOut: () => void;
  onImportFile: (event: FormEvent<HTMLFormElement>) => void;
  onSaveSecretary: (event: FormEvent<HTMLFormElement>) => void;
  onEditSecretary: (secretaria: Secretaria) => void;
  onCancelSecretaryEdit: () => void;
  onDeleteSecretary: () => void;
  onSaveAdministrator: (event: FormEvent<HTMLFormElement>) => void;
  onEditAdministrator: (administrator: Administrador) => void;
  onCancelAdministratorEdit: () => void;
  onDeleteAdministrator: () => void;
  onReopenAssignment: (assignment: Atribuicao) => void;
  onReopenRejectedAssignment: (event: FormEvent<HTMLFormElement>) => void;
  onResetBase: () => void;
};

// Renderiza o painel administrativo e seus diálogos de confirmação.
export default function AdminPanel({
  user,
  assignments,
  secretarias,
  administradores,
  worksheetName,
  selectedFile,
  adminSedeFilter,
  adminStatusFilter,
  sortCriterion,
  sortDirection,
  exporting,
  secretaryImportFile,
  visibleAssignments,
  availableSedes,
  pendingCount,
  unitsCount,
  busy,
  error,
  feedback,
  spreadsheetError,
  resetConfirmation,
  reopenAssignment,
  reopenHours,
  editingSecretaryId,
  deletingSecretary,
  editingAdministratorId,
  deletingAdministrator,
  secretaryForm,
  administratorForm,
  setWorksheetName,
  setSelectedFile,
  setAdminSedeFilter,
  setAdminStatusFilter,
  onSortCriterionChange,
  onSortDirectionChange,
  onExportAll,
  onExportSeat,
  setSecretaryImportFile,
  onImportSecretaryFile,
  onDownloadSecretaryTemplate,
  setResetConfirmation,
  setSpreadsheetError,
  setReopenAssignment,
  setReopenHours,
  setDeletingSecretary,
  setDeletingAdministrator,
  setSecretaryForm,
  setAdministratorForm,
  onSignOut,
  onImportFile,
  onSaveSecretary,
  onEditSecretary,
  onCancelSecretaryEdit,
  onDeleteSecretary,
  onSaveAdministrator,
  onEditAdministrator,
  onCancelAdministratorEdit,
  onDeleteAdministrator,
  onReopenAssignment,
  onReopenRejectedAssignment,
  onResetBase,
}: AdminPanelProps) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Brand />
          <div className="account">
            <div className="account__details">
              <span className="account__name">{user.nome}</span>
              <span className="account__email">
                Administrador
                {" · "}
                {user.email}
              </span>
            </div>
            <button
              className="button button--text"
              type="button"
              onClick={() => void onSignOut()}
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
          <span>Administração</span>
        </nav>
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
          <form className="upload-form" onSubmit={(event) => onImportFile(event)}>
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
          sortCriterion={sortCriterion}
          sortDirection={sortDirection}
          onSortCriterionChange={onSortCriterionChange}
          onSortDirectionChange={onSortDirectionChange}
          showSeatSort
        />
        <div className="export-actions" aria-label="Exportação de atribuições">
          <button
            className="button button--outline"
            type="button"
            onClick={onExportAll}
            disabled={busy || exporting}
          >
            {exporting ? "Exportando…" : "Exportar todas as sedes"}
          </button>
          <button
            className="button button--outline"
            type="button"
            onClick={onExportSeat}
            disabled={!adminSedeFilter || busy || exporting}
            title={
              adminSedeFilter
                ? `Exportar sede: ${adminSedeFilter}`
                : "Selecione uma sede para exportar"
            }
          >
            {exporting
              ? "Exportando…"
              : adminSedeFilter
                ? `Exportar sede: ${adminSedeFilter}`
                : "Exportar sede selecionada"}
          </button>
        </div>
        <p className="filter-result-count" aria-live="polite">
          Exibindo {visibleAssignments.length} de {assignments.length} atribuições.
        </p>
        <AssignmentTable
          assignments={visibleAssignments}
          admin
          onReopen={onReopenAssignment}
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
          <form className="account-form" onSubmit={(event) => onSaveSecretary(event)}>
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
                onClick={onCancelSecretaryEdit}
                disabled={busy}
              >
                Cancelar edição
              </button>
            )}
          </form>
          <section
            className="secretary-import-panel"
            aria-labelledby="secretary-import-title"
          >
            <div>
              <span className="eyebrow">IMPORTAÇÃO EM LOTE</span>
              <h3 id="secretary-import-title">Importar secretarias por planilha</h3>
              <p>
                Use as colunas Nome, E-mail, Sede e Senha. O limite é de 100
                contas por arquivo.
              </p>
              <p className="field__hint">
                O arquivo contém senhas. Apague-o depois de importar.
              </p>
            </div>
            <form
              className="upload-form"
              onSubmit={(event) => onImportSecretaryFile(event)}
            >
              <label className="field field--file">
                <span className="visually-hidden">Arquivo de secretarias</span>
                <input
                  type="file"
                  accept=".xls,.xlsx,.ods,.csv"
                  onChange={(event) =>
                    setSecretaryImportFile(event.currentTarget.files?.[0] ?? null)
                  }
                  disabled={busy}
                  required
                />
              </label>
              <button
                className="button button--primary"
                type="submit"
                disabled={!secretaryImportFile || busy}
              >
                {busy ? "Importando…" : "Importar"}
              </button>
              <button
                className="button button--text"
                type="button"
                onClick={onDownloadSecretaryTemplate}
                disabled={busy}
              >
                Baixar modelo
              </button>
            </form>
          </section>
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
                            onClick={() => onEditSecretary(secretaria)}
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
            onSubmit={(event) => onSaveAdministrator(event)}
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
                onClick={onCancelAdministratorEdit}
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
                                onClick={() => onEditAdministrator(administrator)}
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
                onClick={() => void onResetBase()}
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
            <form className="form-stack" onSubmit={onReopenRejectedAssignment}>
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
                onClick={() => void onDeleteSecretary()}
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
                onClick={() => void onDeleteAdministrator()}
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
