import type { Atribuicao } from "../types";
import { formatDate, formatHours, getPreviousRejections } from "../utils/format";
import StatusBadge from "./StatusBadge";

// Exibe atribuições e as ações disponíveis para cada perfil e estado.
export default function AssignmentTable({
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
