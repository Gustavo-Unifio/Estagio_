import type { Status } from "../types";
import type { CriterioOrdenacao, DirecaoOrdenacao } from "../utils/format";

// Adapta o texto da direção ao tipo de dado que está sendo ordenado.
function getDirectionLabel(
  criterion: CriterioOrdenacao,
  direction: DirecaoOrdenacao,
) {
  if (criterion === "horas") {
    return direction === "asc" ? "Menor → maior" : "Maior → menor";
  }
  if (criterion === "dataValidacao") {
    return direction === "asc"
      ? "Mais antiga → mais recente"
      : "Mais recente → mais antiga";
  }
  if (criterion === "status") {
    return direction === "asc"
      ? "Pendente → Aprovado → Rejeitado"
      : "Rejeitado → Aprovado → Pendente";
  }
  return direction === "asc" ? "A → Z" : "Z → A";
}

// Permite combinar filtros de sede e status, com limpeza em uma única ação.
export default function AssignmentFilters({
  sede,
  onSedeChange,
  status,
  onStatusChange,
  sedes,
  onClear,
  sortCriterion,
  sortDirection,
  onSortCriterionChange,
  onSortDirectionChange,
  showSeatSort = false,
}: {
  sede?: string;
  onSedeChange?: (sede: string) => void;
  status: Status | "Todas";
  onStatusChange: (status: Status | "Todas") => void;
  sedes?: string[];
  onClear: () => void;
  sortCriterion: CriterioOrdenacao;
  sortDirection: DirecaoOrdenacao;
  onSortCriterionChange: (criterion: CriterioOrdenacao) => void;
  onSortDirectionChange: () => void;
  showSeatSort?: boolean;
}) {
  const activeFilters = Number(Boolean(sede)) + Number(status !== "Todas");
  const effectiveCriterion =
    !showSeatSort && sortCriterion === "sede" ? "docente" : sortCriterion;

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
      <label className="field filter-field">
        <span>Ordenar por</span>
        <select
          value={effectiveCriterion}
          onChange={(event) =>
            onSortCriterionChange(event.currentTarget.value as CriterioOrdenacao)
          }
        >
          <option value="docente">Docente</option>
          <option value="matricula">Matrícula</option>
          <option value="horas">Horas solicitadas</option>
          <option value="status">Status</option>
          {showSeatSort && <option value="sede">Sede</option>}
          <option value="dataValidacao">Data da validação</option>
        </select>
      </label>
      <button
        className="button button--outline filters-clear"
        type="button"
        onClick={onSortDirectionChange}
        aria-label={`Alternar direção da ordenação: ${sortDirection === "asc" ? "crescente" : "decrescente"}`}
      >
        {getDirectionLabel(effectiveCriterion, sortDirection)}
      </button>
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
