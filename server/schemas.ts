import { z } from "zod";

const invalidEmailMessage = "Informe um e-mail válido.";
const invalidSecretaryNameOrSeatMessage =
  "Informe o nome da pessoa e o nome da unidade.";
const invalidAdministratorNameMessage = "Informe o nome do administrador.";
const creationPasswordMessage = "A senha deve conter entre 12 e 200 caracteres.";
const updatePasswordMessage =
  "A nova senha deve conter entre 12 e 200 caracteres.";
const observationRequiredMessage =
  "A observação é obrigatória para rejeitar a atribuição.";
const observationLengthMessage =
  "A observação deve ter no máximo 500 caracteres.";
const invalidStatusMessage = "Escolha uma decisão válida para a atribuição.";
const invalidHoursMessage =
  "Informe uma carga solicitada maior que 0 e até 40 horas.";

const emailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z
    .string({ error: invalidEmailMessage })
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { error: invalidEmailMessage })
    .max(254, { error: invalidEmailMessage }),
);

const secretaryNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z
    .string({ error: invalidSecretaryNameOrSeatMessage })
    .min(1, { error: invalidSecretaryNameOrSeatMessage })
    .max(120, { error: invalidSecretaryNameOrSeatMessage }),
);

const secretarySeatSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z
    .string({ error: invalidSecretaryNameOrSeatMessage })
    .min(1, { error: invalidSecretaryNameOrSeatMessage })
    .max(160, { error: invalidSecretaryNameOrSeatMessage }),
);

const administratorNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z
    .string({ error: invalidAdministratorNameMessage })
    .min(1, { error: invalidAdministratorNameMessage })
    .max(120, { error: invalidAdministratorNameMessage }),
);

const creationPasswordSchema = z.string({ error: creationPasswordMessage })
  .min(12, { error: creationPasswordMessage })
  .max(200, { error: creationPasswordMessage });

const updatePasswordSchema = z.preprocess(
  (value, context) => {
    if (value === undefined || value === "") return value;
    if (
      typeof value !== "string" ||
      value.length < 12 ||
      value.length > 200
    ) {
      context.addIssue({
        code: "custom",
        message: updatePasswordMessage,
      });
      return z.NEVER;
    }
    return value;
  },
  z.string().optional(),
);

const hoursSchema = z.coerce.number()
  .refine(Number.isFinite, { error: invalidHoursMessage })
  .gt(0, { error: invalidHoursMessage })
  .lte(40, { error: invalidHoursMessage });

const observationSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string().max(500, { error: observationLengthMessage }),
);

// Valida o e-mail do login; a senha permanece com a regra HTTP 401 da rota.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.unknown(),
});

// Valida os dados de criação de uma secretaria.
export const createSecretarySchema = z.object({
  email: emailSchema,
  nome: secretaryNameSchema,
  sede: secretarySeatSchema,
  password: creationPasswordSchema,
});

// Valida os dados de edição de uma secretaria.
export const updateSecretarySchema = z.object({
  email: emailSchema,
  nome: secretaryNameSchema,
  sede: secretarySeatSchema,
  password: updatePasswordSchema,
});

// Valida os dados de criação de um administrador.
export const createAdministratorSchema = z.object({
  email: emailSchema,
  nome: administratorNameSchema,
  password: creationPasswordSchema,
});

// Valida os dados de edição de um administrador.
export const updateAdministratorSchema = z.object({
  email: emailSchema,
  nome: administratorNameSchema,
  password: updatePasswordSchema,
});

// Valida a decisão e a observação da secretaria.
export const validationSchema = z
  .object({
    status: z.enum(["Aprovado", "Rejeitado"], { error: invalidStatusMessage }),
    observacao: observationSchema,
  })
  .superRefine((value, context) => {
    if (value.status === "Rejeitado" && !value.observacao) {
      context.addIssue({
        code: "custom",
        path: ["observacao"],
        message: observationRequiredMessage,
      });
    }
  });

// Valida a nova carga horária de uma atribuição reaberta.
export const reopenSchema = z.object({
  totalHoras: hoursSchema,
});

// Valida o identificador de uma conta ADMIN.
export const administratorIdSchema = z.coerce.number().refine(
  (value) => Number.isSafeInteger(value) && value >= 1,
  { error: "Identificador de administrador inválido." },
);

// Valida o identificador de uma conta de secretaria.
export const secretaryIdSchema = z.coerce.number().refine(
  (value) => Number.isSafeInteger(value) && value >= 1,
  { error: "Identificador de secretaria inválido." },
);

// Valida o identificador de uma atribuição.
export const assignmentIdSchema = z.coerce.number().refine(
  (value) => Number.isSafeInteger(value) && value >= 1,
  { error: "Identificador de atribuição inválido." },
);

// Valida a sede opcional usada na exportação administrativa.
export const exportSedeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string({ error: "Informe uma sede válida." })
    .min(1, { error: "Informe uma sede válida." })
    .max(160, { error: "A sede deve ter no máximo 160 caracteres." })
    .optional(),
);
