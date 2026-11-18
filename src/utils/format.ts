import type { Atribuicao } from "../types";

export type CriterioOrdenacao =
  | "docente"
  | "matricula"
  | "horas"
  | "status"
  | "sede"
  | "dataValidacao";
export type DirecaoOrdenacao = "asc" | "desc";

const assignmentCollator = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});
const statusOrder: Record<Atribuicao["status"], number> = {
  Pendente: 0,
  Aprovado: 1,
  Rejeitado: 2,
};

// Formata horas conforme as convenções numéricas do português brasileiro.
export function formatHours(hours: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(hours);
}

// Ordena atribuições sem alterar a lista original e com desempates determinísticos.
export function ordenarAtribuicoes(
  lista: Atribuicao[],
  criterio: CriterioOrdenacao,
  direcao: DirecaoOrdenacao,
) {
  const directionMultiplier = direcao === "asc" ? 1 : -1;
  const compareText = (first: string, second: string) =>
    assignmentCollator.compare(first, second) * directionMultiplier;
  const compareNumber = (first: number, second: number) =>
    (first - second) * directionMultiplier;

  return [...lista].sort((first, second) => {
    let result = 0;
    if (criterio === "dataValidacao") {
      if (!first.dataHoraValidacao && second.dataHoraValidacao) return 1;
      if (first.dataHoraValidacao && !second.dataHoraValidacao) return -1;
      if (first.dataHoraValidacao && second.dataHoraValidacao) {
        result = compareNumber(
          new Date(first.dataHoraValidacao).getTime(),
          new Date(second.dataHoraValidacao).getTime(),
        );
      }
    } else if (criterio === "horas") {
      result = compareNumber(first.horasSolicitadas, second.horasSolicitadas);
    } else if (criterio === "status") {
      result = compareNumber(statusOrder[first.status], statusOrder[second.status]);
    } else if (criterio === "matricula") {
      result = compareText(first.matricula, second.matricula);
    } else if (criterio === "sede") {
      result = compareText(first.sede, second.sede);
    } else {
      result = compareText(first.docente, second.docente);
    }

    if (result !== 0) return result;
    result = compareText(first.docente, second.docente);
    if (result !== 0) return result;
    result = compareText(first.matricula, second.matricula);
    if (result !== 0) return result;
    return compareNumber(first.id, second.id);
  });
}

// Formata datas e horários para apresentação ao usuário.
export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

// Separa decisões rejeitadas anteriores da rejeição atualmente exibida.
export function getPreviousRejections(assignment: Atribuicao) {
  const rejections = assignment.historicoValidacoes.filter(
    (entry) => entry.status === "Rejeitado",
  );
  return assignment.status === "Rejeitado" ? rejections.slice(0, -1) : rejections;
}
