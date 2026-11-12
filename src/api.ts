// Padroniza erros da API para apresentar mensagens e status ao usuário.
export class ApiError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.status = status;
  }
}

// Realiza chamadas autenticadas à API e interpreta respostas e erros HTTP.
export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers:
        init?.body instanceof FormData
          ? init.headers
          : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      "Não foi possível conectar à aplicação. Confirme se o servidor está em execução.",
      0,
    );
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Não foi possível concluir a operação.";
    throw new ApiError(message, response.status);
  }

  return body as T;
}

// Resume falhas de importação e orienta a correção e o novo envio do arquivo.
export function getSpreadsheetErrorMessage(cause: unknown) {
  const reason =
    cause instanceof Error ? cause.message : "Não foi possível processar o arquivo.";
  const conciseReason = reason
    .replace(/^A importação foi cancelada\.\s*/i, "")
    .replace(/^Corrija os dados:\s*/i, "")
    .split(";")[0]
    .trim()
    .replace(/[.!?]+$/, "");
  const briefReason =
    conciseReason.length > 180
      ? `${conciseReason.slice(0, 177).trimEnd()}...`
      : conciseReason;

  return `A planilha não foi importada. Motivo: ${briefReason}. Edite a planilha e envie novamente.`;
}
