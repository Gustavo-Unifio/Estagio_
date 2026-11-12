// Apresenta um indicador agregado dos dados do painel.
export default function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric">
      <span className="metric__label">{label}</span>
      <strong className="metric__value">{value}</strong>
    </article>
  );
}
