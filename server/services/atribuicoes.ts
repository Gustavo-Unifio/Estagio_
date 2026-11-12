import { prisma } from "../db";
import type { RequisicaoAutenticada } from "../auth";
import { getAuthenticatedUser } from "../utils";

// Lista atribuições do administrador ou restringe os resultados à sede da secretaria.
export async function listAssignmentsForUser(req: RequisicaoAutenticada) {
  const user = getAuthenticatedUser(req);
  const where =
    user.perfil === "SECRETARIA"
      ? { sede: user.sede ?? "" }
      : undefined;
  const assignments = await prisma.professoresAtribuicoes.findMany({
    where,
    include: {
      historicoValidacoes: {
        orderBy: [{ dataHora: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sede: "asc" }, { docente: "asc" }],
  });

  return assignments.map((assignment) => ({
    id: assignment.id,
    sede: assignment.sede,
    docente: assignment.docente,
    matricula: assignment.matricula,
    email: assignment.email,
    horasSolicitadas: assignment.totalHoras,
    status: assignment.statusValidacao,
    observacao: assignment.observacao,
    dataHoraInsercao: assignment.dataHoraInsercao,
    dataHoraValidacao: assignment.dataHoraValidacao,
    usuarioValidador: assignment.usuarioValidador,
    historicoValidacoes:
      user.perfil === "ADMIN" ? assignment.historicoValidacoes : [],
  }));
}
