import type { Atribuicao, Status } from "../types";
import { formatHours } from "../utils/format";

type RodapeTotalHorasProps = {
  assignments: Atribuicao[];
  visibleAssignments: Atribuicao[];
  statusFilter: Status | "Todas";
};

// Soma as horas com precisão de duas casas para evitar erros de ponto flutuante.
function sumHours(assignments: Atribuicao[]) {
  const total = assignments.reduce(
    (sum, assignment) => sum + assignment.horasSolicitadas,
    0,
  );
  return Math.round(total * 100) / 100;
}

// Exibe os totais da sede fora da área rolável da tabela.
export default function RodapeTotalHoras({
  assignments,
  visibleAssignments,
  statusFilter,
}: RodapeTotalHorasProps) {
  const totalHours = sumHours(assignments);
  const visibleHours = sumHours(visibleAssignments);
  const showFilteredTotal =
    statusFilter !== "Todas" && visibleHours !== totalHours;

  return (
    <div className="hours-summary" aria-live="polite">
      <strong>Total de horas da sede: {formatHours(totalHours)}h</strong>
      {showFilteredTotal && (
        <span>
          Total exibido com os filtros: {formatHours(visibleHours)}h (
          {visibleAssignments.length} atribuições)
        </span>
      )}
    </div>
  );
}
