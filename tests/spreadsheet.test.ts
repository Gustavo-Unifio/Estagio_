import { describe, expect, it } from "vitest";
import { parseSpreadsheet } from "../server/spreadsheet";

function csv(content: string) {
  return Buffer.from(content, "utf8");
}

describe("parseSpreadsheet", () => {
  it("aceita cabeçalhos com acento e caixa diferentes", () => {
    const rows = parseSpreadsheet(
      csv(
        "sEdE;DOCENTE;MATRÍCULA;email;TOTAL HORAS\n" +
          "Sede Centro;Ana Souza;123;ana@example.com;20",
      ),
      "dados.csv",
    );

    expect(rows).toEqual([
      {
        sede: "Sede Centro",
        docente: "Ana Souza",
        matricula: "123",
        email: "ana@example.com",
        totalHoras: 20,
      },
    ]);
  });

  it("localiza o cabeçalho fora da primeira linha", () => {
    const rows = parseSpreadsheet(
      csv(
        "Relatório de atribuições;;;;\n" +
          "Gerado em 2026;;;;\n" +
          "Sede,Docente,Matrícula,EMAIL,Total Horas\n" +
          "Sede Norte,Carlos Lima,456,carlos@example.com,18",
      ),
      "dados.csv",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.docente).toBe("Carlos Lima");
  });

  it("rejeita matrícula duplicada na mesma sede", () => {
    expect(() =>
      parseSpreadsheet(
        csv(
          "Sede,Docente,Matrícula,EMAIL,Total Horas\n" +
            "Sede A,Ana,123,ana@example.com,20\n" +
            "Sede A,Bruno,123,bruno@example.com,18",
        ),
        "dados.csv",
      ),
    ).toThrow(/Matrícula duplicada na mesma sede/);
  });

  it("rejeita e-mail inválido", () => {
    expect(() =>
      parseSpreadsheet(
        csv("Sede,Docente,Matrícula,EMAIL,Total Horas\nSede A,Ana,123,invalido,20"),
        "dados.csv",
      ),
    ).toThrow(/"EMAIL" inválido/);
  });

  it("rejeita horas inválidas", () => {
    expect(() =>
      parseSpreadsheet(
        csv("Sede,Docente,Matrícula,EMAIL,Total Horas\nSede A,Ana,123,ana@example.com,0"),
        "dados.csv",
      ),
    ).toThrow(/"Total Horas" inválido/);
  });

  it("rejeita mais de 5.000 linhas", () => {
    const header = "Sede,Docente,Matrícula,EMAIL,Total Horas\n";
    const data = Array.from(
      { length: 5001 },
      (_, index) => `Sede,Docente ${index},${index},docente${index}@example.com,10`,
    ).join("\n");

    expect(() => parseSpreadsheet(csv(header + data), "dados.csv")).toThrow(
      "A planilha ultrapassa o limite de 5000 linhas.",
    );
  });

  it("aceita CSV separado por vírgula", () => {
    const rows = parseSpreadsheet(
      csv("Sede,Docente,Matrícula,EMAIL,Total Horas\nSede A,Ana,123,ana@example.com,12.5"),
      "dados.csv",
    );

    expect(rows[0]?.totalHoras).toBe(12.5);
  });

  it("aceita CSV separado por ponto e vírgula", () => {
    const rows = parseSpreadsheet(
      csv("Sede;Docente;Matrícula;EMAIL;Total Horas\nSede A;Ana;123;ana@example.com;12.5"),
      "dados.csv",
    );

    expect(rows[0]?.totalHoras).toBe(12.5);
  });
});
