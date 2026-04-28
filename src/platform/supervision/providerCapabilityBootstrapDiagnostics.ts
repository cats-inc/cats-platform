import type { SupervisionDiagnosticRecord } from './contracts.js';

export interface ProviderCapabilityBootstrapDiagnosticSink {
  emit(record: SupervisionDiagnosticRecord): void;
  list(): SupervisionDiagnosticRecord[];
}

export function createProviderCapabilityBootstrapDiagnosticSink(
  initialRecords: SupervisionDiagnosticRecord[] = [],
): ProviderCapabilityBootstrapDiagnosticSink {
  const records = [...initialRecords];

  return {
    emit(record) {
      records.push(record);
    },
    list() {
      return [...records];
    },
  };
}
