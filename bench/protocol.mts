export const READY_PREFIX = 'BENCH_READY ';
export const RESULT_PREFIX = 'BENCH_RESULT ';

export interface ReadyMessage {
  port: number;
  importMs: number;
  appInitMs: number;
}
