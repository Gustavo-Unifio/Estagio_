import type { RequisicaoAutenticada } from "./auth";
import { ApiError } from "./errors";

// Valida a origem das operações que podem alterar dados.
export function isAllowedRequestOrigin(origin: string, host: string | undefined) {
  try {
    const requestOrigin = new URL(origin).origin;
    const configuredOrigin = process.env.APP_ORIGIN;
    const allowedOrigins = configuredOrigin
      ? [new URL(configuredOrigin).origin]
      : process.env.NODE_ENV === "production"
        ? []
        : ["http://127.0.0.1:5173", "http://localhost:5173"];

    return allowedOrigins.length
      ? allowedOrigins.includes(requestOrigin)
      : new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Obtém a conta autenticada ou encerra a operação com erro de autorização.
export function getAuthenticatedUser(req: RequisicaoAutenticada) {
  if (!req.usuario) throw new ApiError("Sessão não autenticada.", 401);
  return req.usuario;
}

// Normaliza e valida e-mails recebidos de formulários e endpoints.
export function normalizeAndValidateEmail(value: unknown): string {
  if (typeof value !== "string") throw new ApiError("Informe um e-mail válido.", 400);
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError("Informe um e-mail válido.", 400);
  }
  return email;
}
