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

// Limita o volume importado e as linhas examinadas em busca do cabeçalho.
const maxRows = 5000;
const headerSearchRows = 30;

// Define a ordem e os nomes apresentados para as cinco colunas obrigatórias.
const expectedHeaders = ["sede", "docente", "matricula", "email", "totalhoras"];
const headerLabels = ["Sede", "Docente", "Matrícula", "EMAIL", "Total Horas"];

XLSX.set_cptable(codepages);

// Guarda uma aba que contém cabeçalho válido e as posições das colunas.
type HeaderCandidate = {
  name: string;
  rows: unknown[][];
  headerRow: number;
  indexes: number[];
};

// Normaliza cabeçalhos para ignorar diferenças de acento, caixa e separadores.
function normalizeColumnHeader(value: unknown) {
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
