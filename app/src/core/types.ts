/** `publicar` é turma-wide (0/1) para avaliações; null para faltas/resultado. */
export type Publicar = 0 | 1 | null;

/** Item do snapshot: só o hash (nunca a nota real) + o flag publicar. */
export interface Item {
  hash: string;
  publicar: Publicar;
}

export type Items = Record<string, Item>;
export type Labels = Record<string, string>;

/** Uma disciplina retornada por /rest/turmas. */
export interface Turma {
  id: number;
  matricula_id: number;
  codigo: string;
  turma: string;
  disciplina: string;
  resultado: string | null;
  faltas: number | null;
  limite_faltas?: number | null;
  tem_notas: boolean;
}

/** Uma avaliação dentro de /rest/notas. */
export interface Avaliacao {
  nome: string; // A1, A2, AR...
  valor: number | string | null;
  publicar: boolean;
}

export interface Notas {
  notas: Avaliacao[];
}
