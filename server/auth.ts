import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db";

export type Perfil = "ADMIN" | "SECRETARIA";

export type UsuarioAutenticado = {
  id: number;
  email: string;
  nome: string;
  perfil: Perfil;
  sede: string | null;
};

export type RequisicaoAutenticada = Request & {
  usuario?: UsuarioAutenticado;
  sessaoId?: number;
};

export const cookieName = "carga_docente_session";
export const sessionDurationMs = 8 * 60 * 60 * 1000;

// Armazena somente o resumo do token para evitar persistir credenciais de sessão.
function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Recupera um cookie pelo nome sem depender de bibliotecas externas.
function readCookie(req: Request, name: string) {
  const cookies = req.headers.cookie?.split(";") ?? [];
  const cookie = cookies
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

// Mantém a configuração Secure consistente ao gravar e limpar o cookie.
function shouldUseSecureCookie() {
  return (
    process.env.SESSION_COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" &&
      process.env.SESSION_COOKIE_SECURE !== "false")
  );
}

// Emite o cookie HTTP-only que identifica a sessão autenticada.
export function writeSessionCookie(res: Response, token: string, expiresAt: Date) {
  const attributes = [
    `${cookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (shouldUseSecureCookie()) attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

// Expira o cookie de sessão no navegador.
export function clearSessionCookie(res: Response) {
  const attributes = [
    `${cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];

  if (shouldUseSecureCookie()) attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

// Cria uma sessão com token aleatório e persiste apenas o hash do token.
export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  const session = await prisma.sessao.create({
    data: {
      tokenHash: hashSessionToken(token),
      usuarioId: userId,
      expiraEm: expiresAt,
    },
  });

  return { token, expiresAt, sessionId: session.id };
}

// Valida a sessão e associa a conta autenticada à requisição Express.
export async function authenticate(
  req: RequisicaoAutenticada,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = readCookie(req, cookieName);
    if (!token) {
      res.status(401).json({ error: "Entre com seu e-mail e senha." });
      return;
    }

    const session = await prisma.sessao.findFirst({
      where: {
        tokenHash: hashSessionToken(token),
        expiraEm: { gt: new Date() },
        usuario: { ativo: true },
      },
      include: { usuario: { include: { permissaoSede: true } } },
    });

    if (!session) {
      res.status(401).json({ error: "Sua sessão expirou. Entre novamente." });
      return;
    }
    if (
      session.usuario.perfil !== "ADMIN" &&
      session.usuario.perfil !== "SECRETARIA"
    ) {
      res.status(403).json({ error: "A conta possui um perfil inválido." });
      return;
    }

    req.usuario = {
      id: session.usuario.id,
      email: session.usuario.email,
      nome: session.usuario.nome,
      perfil: session.usuario.perfil,
      sede: session.usuario.permissaoSede?.sedeNome ?? null,
    };
    req.sessaoId = session.id;
    next();
  } catch (error) {
    next(error);
  }
}

// Restringe a rota ao perfil informado.
export function requireRole(perfil: Perfil) {
  return (req: RequisicaoAutenticada, res: Response, next: NextFunction) => {
    if (!req.usuario || req.usuario.perfil !== perfil) {
      res.status(403).json({ error: "Você não tem permissão para esta ação." });
      return;
    }

    next();
  };
}
