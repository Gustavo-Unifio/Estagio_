import type { Status } from "../types";

// Permite combinar filtros de sede e status, com limpeza em uma única ação.
export default function AssignmentFilters({
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
