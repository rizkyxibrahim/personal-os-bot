import type { Env } from "../env";

export type Data = Record<string, unknown>;

export interface FlowCtx {
  env: Env;
  db: D1Database;
  userId: number;
}

export interface Option {
  label: string;
  value: string; // dipakai sebagai callback_data (jaga tetap pendek, tanpa ":")
}

export type Parsed =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export interface Step {
  key: string; // nama kolom tempat jawaban disimpan
  ask: (fc: FlowCtx, data: Data) => string | Promise<string>;
  options?: (fc: FlowCtx, data: Data) => Option[] | Promise<Option[]>;
  // Dipakai untuk jawaban ketikan DAN nilai tombol
  parse: (input: string, fc: FlowCtx, data: Data) => Parsed | Promise<Parsed>;
  optional?: boolean; // menambah tombol Lewati (jawabannya jadi null)
  when?: (fc: FlowCtx, data: Data) => boolean | Promise<boolean>; // false = langkah dilewati
}

export interface Flow {
  id: string;
  title: string;
  steps: Step[];
  summary: (fc: FlowCtx, data: Data) => string | Promise<string>;
  finish: (fc: FlowCtx, data: Data) => Promise<string>;
}
