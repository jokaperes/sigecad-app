export type Publicar = 0 | 1 | null;


export interface Item {
  hash: string;
  publicar: Publicar;
}

export type Items = Record<string, Item>;
export type Labels = Record<string, string>;


export interface Turma {
  id: number;
  matricula_id: number;
  codigo: string;
  turma: string;
  disciplina: string;
  resultado: string | null;
  faltas: number | null;
  limite_faltas?: number | null;
  ch_total?: number | null;
  tem_notas: boolean;
}


export interface Avaliacao {
  nome: string;
  valor: number | string | null;
  publicar: boolean;
}

export interface Notas {
  media_aprovacao?: number | string | null;
  nota_fechada?: boolean;
  formula?: string | null;
  nota_final?: number | string | null;
  notas: Avaliacao[];
}
