import * as XLSX from "@e965/xlsx";
import * as codepages from "@e965/xlsx/dist/cpexcel";
import { parse as parseCsv } from "csv-parse/sync";
import { extname } from "node:path";

export type LinhaImportada = {
  sede: string;
  docente: string;
  matricula: string;
  email: string;
  totalHoras: number;
};

export type LinhaExportada = {
  id: number;
  sede: string;
  docente: string;
  matricula: string;
  email: string;
  totalHoras: number;
  status: string;
  observacao: string | null;
  dataHoraValidacao: Date | null;
  usuarioValidador: string | null;
};

// Limita o volume importado e as linhas examinadas em busca do cabeçalho.
const maxRows = 5000;
const headerSearchRows = 30;

// Define a ordem e os nomes apresentados para as cinco colunas obrigatórias.
const expectedHeaders = ["sede", "docente", "matricula", "email", "totalhoras"];
const headerLabels = ["Sede", "Docente", "Matrícula", "EMAIL", "Total Horas"];

XLSX.set_cptable(codepages);

const assignmentExportCollator = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

// Mantém textos exportados como células de texto, inclusive os que começam com "=".
function textCell(value: string) {
  return { t: "s" as const, v: value };
}

// Cria uma célula numérica para preservar horas como número na planilha.
function numberCell(value: number) {
  return { t: "n" as const, v: value };
}

// Formata datas de validação no padrão legível usado no arquivo exportado.
function formatExportDate(value: Date | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Gera as abas de atribuições e resumo para o arquivo administrativo.
export function createAssignmentsWorkbook(assignments: LinhaExportada[]) {
  const orderedAssignments = [...assignments].sort((first, second) => {
    const seatResult = assignmentExportCollator.compare(first.sede, second.sede);
    if (seatResult !== 0) return seatResult;
    const teacherResult = assignmentExportCollator.compare(first.docente, second.docente);
    if (teacherResult !== 0) return teacherResult;
    const enrollmentResult = assignmentExportCollator.compare(
      first.matricula,
      second.matricula,
    );
    return enrollmentResult || first.id - second.id;
  });

  const assignmentRows = [
    [
      textCell("Sede"),
      textCell("Docente"),
      textCell("Matrícula"),
      textCell("E-mail"),
      textCell("Horas solicitadas"),
      textCell("Status"),
      textCell("Observação"),
      textCell("Validada em"),
      textCell("Validada por"),
    ],
    ...orderedAssignments.map((assignment) => [
      textCell(assignment.sede),
      textCell(assignment.docente),
      textCell(assignment.matricula),
      textCell(assignment.email),
      numberCell(assignment.totalHoras),
      textCell(assignment.status),
      textCell(assignment.observacao ?? ""),
      textCell(formatExportDate(assignment.dataHoraValidacao)),
      textCell(assignment.usuarioValidador ?? ""),
    ]),
  ];

  const summaryBySeat = new Map<
    string,
    { pendingCount: number; pendingHours: number; approvedCount: number; approvedHours: number; rejectedCount: number; rejectedHours: number }
  >();
  for (const assignment of orderedAssignments) {
    const summary = summaryBySeat.get(assignment.sede) ?? {
      pendingCount: 0,
      pendingHours: 0,
      approvedCount: 0,
      approvedHours: 0,
      rejectedCount: 0,
      rejectedHours: 0,
    };
    if (assignment.status === "Pendente") {
      summary.pendingCount += 1;
      summary.pendingHours += assignment.totalHoras;
    } else if (assignment.status === "Aprovado") {
      summary.approvedCount += 1;
      summary.approvedHours += assignment.totalHoras;
    } else if (assignment.status === "Rejeitado") {
      summary.rejectedCount += 1;
      summary.rejectedHours += assignment.totalHoras;
    }
    summaryBySeat.set(assignment.sede, summary);
  }

  const summaryRows = [
    [
      textCell("Sede"),
      textCell("Pendentes (qtd.)"),
      textCell("Pendentes (horas)"),
      textCell("Aprovadas (qtd.)"),
      textCell("Aprovadas (horas)"),
      textCell("Rejeitadas (qtd.)"),
      textCell("Rejeitadas (horas)"),
    ],
    ...[...summaryBySeat.entries()].map(([sede, summary]) => [
      textCell(sede),
      numberCell(summary.pendingCount),
      numberCell(summary.pendingHours),
      numberCell(summary.approvedCount),
      numberCell(summary.approvedHours),
      numberCell(summary.rejectedCount),
      numberCell(summary.rejectedHours),
    ]),
  ];
  const total = [...summaryBySeat.values()].reduce(
    (result, summary) => ({
      pendingCount: result.pendingCount + summary.pendingCount,
      pendingHours: result.pendingHours + summary.pendingHours,
      approvedCount: result.approvedCount + summary.approvedCount,
      approvedHours: result.approvedHours + summary.approvedHours,
      rejectedCount: result.rejectedCount + summary.rejectedCount,
      rejectedHours: result.rejectedHours + summary.rejectedHours,
    }),
    {
      pendingCount: 0,
      pendingHours: 0,
      approvedCount: 0,
      approvedHours: 0,
      rejectedCount: 0,
      rejectedHours: 0,
    },
  );
  summaryRows.push([
    textCell("Total geral"),
    numberCell(total.pendingCount),
    numberCell(total.pendingHours),
    numberCell(total.approvedCount),
    numberCell(total.approvedHours),
    numberCell(total.rejectedCount),
    numberCell(total.rejectedHours),
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(assignmentRows), "Atribuições");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "Resumo");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// Guarda uma aba que contém cabeçalho válido e as posições das colunas.
type HeaderCandidate = {
  name: string;
  rows: unknown[][];
  headerRow: number;
  indexes: number[];
};

// Normaliza cabeçalhos para ignorar diferenças de acento, caixa e separadores.
export function normalizeColumnHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "")
    .trim();
}

// Localiza as colunas obrigatórias nas primeiras linhas da planilha.
function findRequiredHeader(rows: unknown[][]): { headerRow: number; indexes: number[] } | null {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, headerSearchRows); rowIndex++) {
    const header = rows[rowIndex].map(normalizeColumnHeader);
    const indexes = expectedHeaders.map((expected) => header.indexOf(expected));
    if (indexes.every((index) => index >= 0)) {
      return { headerRow: rowIndex, indexes };
    }
  }
  return null;
}

// Ignora linhas vazias e preserva a numeração original para mensagens de erro.
function getNonEmptyDataRows(candidate: HeaderCandidate) {
  return candidate.rows
    .slice(candidate.headerRow + 1)
    .map((row, index) => ({
      row,
      rowNumber: candidate.headerRow + index + 2,
    }))
    .filter(({ row }) => row.some((value) => String(value ?? "").trim() !== ""));
}

// Gera uma assinatura das linhas relevantes para detectar abas duplicadas.
function createSheetDataFingerprint(candidate: HeaderCandidate) {
  return JSON.stringify(
    getNonEmptyDataRows(candidate).map(({ row }) =>
      candidate.indexes.map((index) => String(row[index] ?? "").trim()),
    ),
  );
}

// Seleciona a aba compatível, deduplicando dados idênticos quando necessário.
function selectWorkbookDataSheet(
  workbook: XLSX.WorkBook,
  requestedSheet?: string,
): HeaderCandidate {
  const candidates: HeaderCandidate[] = [];

  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    });
    const header = findRequiredHeader(rows);
    if (header) candidates.push({ name, rows, ...header });
  }

  if (requestedSheet?.trim()) {
    const requested = candidates.find(
      (candidate) =>
        candidate.name.trim().toLocaleLowerCase("pt-BR") ===
        requestedSheet.trim().toLocaleLowerCase("pt-BR"),
    );
    if (!requested) {
      const available = candidates.map((candidate) => candidate.name).join(", ");
      throw new Error(
        available
          ? `A aba "${requestedSheet.trim()}" não contém as cinco colunas obrigatórias. Abas compatíveis: ${available}.`
          : "Nenhuma aba contém as colunas obrigatórias: Sede, Docente, Matrícula, EMAIL e Total Horas.",
      );
    }
    return requested;
  }

  if (!candidates.length) {
    throw new Error(
      "Nenhuma aba contém as colunas obrigatórias: Sede, Docente, Matrícula, EMAIL e Total Horas.",
    );
  }

  const uniqueData = new Map<string, HeaderCandidate>();
  for (const candidate of candidates) {
    const key = createSheetDataFingerprint(candidate);
    if (!uniqueData.has(key)) uniqueData.set(key, candidate);
  }

  if (uniqueData.size > 1) {
    throw new Error(
      `O arquivo tem várias abas de dados diferentes (${candidates.map((candidate) => candidate.name).join(", ")}). Informe o nome da aba desejada.`,
    );
  }

  return candidates[0];
}

// Aceita apenas cargas numéricas maiores que zero e limitadas a 40 horas.
function parseRequestedHours(value: unknown): number | null {
  const text = String(value ?? "")
    .trim()
    .replace(/\s*h(?:oras?)?$/i, "")
    .replace(",", ".");
  const hours = Number(text);

  return Number.isFinite(hours) && hours > 0 && hours <= 40 ? hours : null;
}

// Resume erros por coluna e limita a lista de linhas exibida por categoria.
function formatRowErrors(errors: Map<string, number[]>) {
  return [...errors.entries()]
    .map(([label, rowNumbers]) => {
      const rows = rowNumbers.slice(0, 5).join(", ");
      const more = rowNumbers.length > 5 ? "…" : "";
      return `${label}: ${rowNumbers.length} ocorrência(s), linhas ${rows}${more}`;
    })
    .join("; ");
}

// Lê CSV ou planilha, valida cada registro e só retorna dados totalmente válidos.
export function parseSpreadsheet(
  buffer: Buffer,
  fileName: string,
  requestedSheet?: string,
): LinhaImportada[] {
  let candidate: HeaderCandidate;
  if (extname(fileName).toLowerCase() === ".csv") {
    let rows: unknown[][];
    try {
      rows = parseCsv(buffer, {
        bom: true,
        delimiter: [",", ";", "\t"],
        skip_empty_lines: true,
        trim: true,
        max_record_size: 10_000,
      }) as unknown[][];
    } catch {
      throw new Error("Não foi possível ler o CSV. Verifique a codificação e os separadores.");
    }

    const header = findRequiredHeader(rows);
    if (!header) {
      throw new Error(
        "O CSV não contém as colunas obrigatórias: Sede, Docente, Matrícula, EMAIL e Total Horas.",
      );
    }
    candidate = { name: fileName, rows, ...header };
  } else {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, {
        type: "buffer",
        cellDates: false,
        dense: false,
      });
    } catch {
      throw new Error("Não foi possível ler o arquivo. Verifique o formato e tente novamente.");
    }
    candidate = selectWorkbookDataSheet(workbook, requestedSheet);
  }

  const entries = getNonEmptyDataRows(candidate);
  if (entries.length === 0) {
    throw new Error("A aba de dados não contém linhas para importar.");
  }
  if (entries.length > maxRows) {
    throw new Error(`A planilha ultrapassa o limite de ${maxRows} linhas.`);
  }

  const errors = new Map<string, number[]>();
  const addError = (label: string, rowNumber: number) => {
    const rowNumbers = errors.get(label) ?? [];
    rowNumbers.push(rowNumber);
    errors.set(label, rowNumbers);
  };
  const seen = new Map<string, number>();
  const result: LinhaImportada[] = [];

  for (const { row, rowNumber } of entries) {
    const values = candidate.indexes.map((index) => String(row[index] ?? "").trim());
    const [sede, docente, matricula, rawEmail, rawHours] = values;
    let isValidRow = true;

    // Os quatro campos de identificação precisam estar preenchidos.
    values.slice(0, 4).forEach((value, index) => {
      if (!value) {
        addError(`"${headerLabels[index]}" vazio`, rowNumber);
        isValidRow = false;
      }
    });

    // Normaliza o e-mail e impede que valores malformados entrem na base.
    const email = rawEmail.toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addError('"EMAIL" inválido', rowNumber);
      isValidRow = false;
    }

    // Cada carga solicitada deve respeitar o limite semanal do sistema.
    const totalHoras = parseRequestedHours(rawHours);
    if (totalHoras === null) {
      addError('"Total Horas" inválido (use valor maior que 0 e até 40)', rowNumber);
      isValidRow = false;
    }

    // A matrícula precisa ser única dentro da mesma sede.
    if (sede && matricula) {
      const key = `${sede.normalize("NFC").toLowerCase()}|${matricula}`;
      const firstRow = seen.get(key);
      if (firstRow !== undefined) {
        addError(`Matrícula duplicada na mesma sede (primeira ocorrência: linha ${firstRow})`, rowNumber);
        isValidRow = false;
      } else {
        seen.set(key, rowNumber);
      }
    }

    if (isValidRow && totalHoras !== null) {
      result.push({ sede, docente, matricula, email, totalHoras });
    }
  }

  // Cancela a importação inteira se qualquer linha tiver inconsistências.
  if (errors.size) {
    throw new Error(`A importação foi cancelada. Corrija os dados: ${formatRowErrors(errors)}.`);
  }

  return result;
}
