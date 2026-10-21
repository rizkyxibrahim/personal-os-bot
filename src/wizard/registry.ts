import type { Flow } from "./types";

const flows = new Map<string, Flow>();

export function registerFlow(flow: Flow): void {
  flows.set(flow.id, flow);
}

export function getFlow(id: string): Flow | undefined {
  return flows.get(id);
}
