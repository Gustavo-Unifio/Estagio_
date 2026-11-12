import type { Atribuicao } from "../types";

// Formata horas conforme as convenções numéricas do português brasileiro.
export function formatHours(hours: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(hours);
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
