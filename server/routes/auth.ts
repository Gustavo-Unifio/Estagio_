import { compare } from "bcryptjs";
import express from "express";
import { rateLimit } from "express-rate-limit";
import {
  authenticate,
  clearSessionCookie,
  createSession,
  writeSessionCookie,
  type RequisicaoAutenticada,
} from "../auth";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { listAssignmentsForUser } from "../services/atribuicoes";
import { getAuthenticatedUser, normalizeAndValidateEmail } from "../utils";

const router = express.Router();

// Limita tentativas de autenticação para reduzir abuso da rota de login.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." },
});

// Confirma que a API está disponível para verificações operacionais.
router.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Autentica a conta, verifica seu perfil e cria uma sessão protegida.
router.post("/api/auth/login", loginLimiter, async (req, res) => {
  const email = normalizeAndValidateEmail(req.body?.email);
  const password = req.body?.password;
  if (typeof password !== "string" || password.length === 0 || password.length > 200) {
    throw new ApiError("E-mail ou senha inválidos.", 401);
  }

  const user = await prisma.usuario.findUnique({
    where: { email },
    include: { permissaoSede: true },
  });
  const passwordMatches = user ? await compare(password, user.senhaHash) : false;
  if (!user || !user.ativo || !passwordMatches) {
    throw new ApiError("E-mail ou senha inválidos.", 401);
  }

  // Aceita apenas os perfis reconhecidos pelas rotas protegidas.
  if (user.perfil !== "ADMIN" && user.perfil !== "SECRETARIA") {
    throw new ApiError("A conta possui um perfil inválido.", 403);
  }
  if (
    (user.perfil === "ADMIN" && user.permissaoSede) ||
    (user.perfil === "SECRETARIA" && !user.permissaoSede)
  ) {
    throw new ApiError("A conta está sem uma permissão válida. Contate o administrador.", 403);
  }

  // Remove sessões expiradas antes de criar a nova sessão autenticada.
  await prisma.sessao.deleteMany({ where: { expiraEm: { lt: new Date() } } });
  const session = await createSession(user.id);
  writeSessionCookie(res, session.token, session.expiresAt);
  res.json({
    usuario: {
      id: user.id,
      email: user.email,
      nome: user.nome,
      perfil: user.perfil,
      sede: user.permissaoSede?.sedeNome ?? null,
    },
  });
});

// Retorna os dados da sessão autenticada atual.
router.get("/api/auth/me", authenticate, (req: RequisicaoAutenticada, res) => {
  res.json({ usuario: getAuthenticatedUser(req) });
});

// Revoga a sessão atual e remove o cookie do navegador.
router.post("/api/auth/logout", authenticate, async (req: RequisicaoAutenticada, res) => {
  if (req.sessaoId) {
    await prisma.sessao.delete({ where: { id: req.sessaoId } });
  }
  clearSessionCookie(res);
  res.status(204).end();
});

// Entrega atribuições permitidas para o perfil da sessão.
router.get(
  "/api/atribuicoes",
  authenticate,
  async (req: RequisicaoAutenticada, res) => {
    res.json({ atribuicoes: await listAssignmentsForUser(req) });
  },
);

export default router;
