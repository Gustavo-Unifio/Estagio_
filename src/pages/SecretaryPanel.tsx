import type { Dispatch, FormEvent, SetStateAction } from "react";
import AssignmentFilters from "../components/AssignmentFilters";
import AssignmentTable from "../components/AssignmentTable";
import Brand from "../components/Brand";
import Footer from "../components/Footer";
import SummaryMetric from "../components/SummaryMetric";
import type { Atribuicao, RevisaoAtribuicao, Status, Usuario } from "../types";
import { formatHours } from "../utils/format";

type SecretaryPanelProps = {
  user: Usuario;
  assignments: Atribuicao[];
  pendingCount: number;
  approvedCount: number;
  visibleAssignments: Atribuicao[];
  secretaryStatusFilter: Status | "Todas";
  busy: boolean;
  error: string;
  feedback: string;
  review: RevisaoAtribuicao | null;
  observation: string;
  onSignOut: () => void;
  onStatusChange: (status: Status | "Todas") => void;
  onReview: (assignment: Atribuicao, status: "Aprovado" | "Rejeitado") => void;
  onSaveReview: (event: FormEvent<HTMLFormElement>) => void;
  onObservationChange: (value: string) => void;
  setReview: Dispatch<SetStateAction<RevisaoAtribuicao | null>>;
};

// Renderiza o painel de validação da secretaria.
export default function SecretaryPanel({
  user,
  assignments,
  pendingCount,
  approvedCount,
  visibleAssignments,
  secretaryStatusFilter,
  busy,
  error,
  feedback,
  review,
  observation,
  onSignOut,
  onStatusChange,
  onReview,
  onSaveReview,
  onObservationChange,
  setReview,
}: SecretaryPanelProps) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <Brand />
          <div className="account">
            <div className="account__details">
              <span className="account__name">{user.nome}</span>
              <span className="account__email">
                {user.sede}
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
          <span>Validação da unidade</span>
        </nav>
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
          onStatusChange={onStatusChange}
          onClear={() => onStatusChange("Todas")}
        />
        <p className="filter-result-count" aria-live="polite">
          Exibindo {visibleAssignments.length} de {assignments.length} atribuições.
        </p>
        <AssignmentTable
          assignments={visibleAssignments}
          onReview={onReview}
        />
        <p className="hours-note">
          Limite de referência por atribuição: <strong>40 horas semanais</strong>.
        </p>
        {error && <p className="feedback feedback--error" role="alert">{error}</p>}
        {feedback && <p className="feedback" role="status">{feedback}</p>}
      </main>
      <Footer />

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
            <form className="form-stack" onSubmit={onSaveReview}>
              {review.status === "Rejeitado" && (
                <label className="field">
                  <span>
                    Observação <span className="required-mark">*</span>
                  </span>
                  <textarea
                    value={observation}
                    onChange={(event) => onObservationChange(event.currentTarget.value)}
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
    </div>
  );
}
