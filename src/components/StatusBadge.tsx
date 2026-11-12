import type { Status } from "../types";

// Apresenta visualmente o estado de validação de uma atribuição.
export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`status status--${status.toLowerCase()}`}>{status}</span>;
}
