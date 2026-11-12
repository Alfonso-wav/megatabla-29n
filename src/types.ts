export interface Materia {
  id: string;
  nombre: string;
  grupo: string;
}

export interface Partido {
  id: string;
  nombre: string;
  siglas: string;
  estado: "publicado" | "pendiente";
  titulo?: string;
  fechaPublicacion?: string;
  idioma?: "es" | "ca" | "gl";
  url?: string;
  archivo?: string;
  sha256?: string;
  nota?: string;
  paginas?: number | null;
  copiaLocal?: boolean;
}

/** null = el programa no menciona la materia (NS/NC). */
export type Celda = {
  postura: string;
  medidas: string[];
  paginas: number[];
} | null;

export interface Tabla {
  eleccion: string;
  fechaCorte: string;
  materias: Materia[];
  partidos: Partido[];
  celdas: Record<string, Record<string, Celda>>;
}
