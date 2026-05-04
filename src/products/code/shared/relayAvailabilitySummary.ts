export type CodeRelayAvailabilitySummary =
  | { kind: 'runtime_config_unavailable' }
  | { kind: 'provider_path_missing'; providerLabel: string }
  | { kind: 'instance_unavailable'; providerLabel: string; instance: string }
  | { kind: 'runtime_ready_via'; target: string }
  | { kind: 'provider_path_ready'; providerLabel: string };

