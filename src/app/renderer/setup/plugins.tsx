import { ProviderModelFields } from './ProviderModelFields.js';
import type { ConditionalStepProps, ProductSetupPlugin } from './types.js';

function ChatBossCatStep({
  provider,
  instance,
  model,
  modelSelection,
  catName,
  runtimeReachable,
  onTargetChange,
  onCatNameChange,
}: ConditionalStepProps) {
  return (
    <>
      <label className="fieldLabel">
        <span>Boss Cat name</span>
        <input
          className="textInput"
          value={catName}
          onChange={(e) => onCatNameChange(e.target.value)}
          placeholder="Boss Cat"
          autoFocus
        />
        <span className="fieldHint">
          Your personal AI agent that manages tasks and coordinates other cats.
        </span>
      </label>
      <ProviderModelFields
        provider={provider}
        instance={instance}
        model={model}
        modelSelection={modelSelection}
        onTargetChange={onTargetChange}
      />
      <div className="setupRuntimeStatus">
        <span
          className={
            runtimeReachable
              ? 'statusChip statusChipReady'
              : 'statusChip statusChipWarm'
          }
        >
          {runtimeReachable
            ? 'Cats Runtime connected'
            : 'Cats Runtime not detected'}
        </span>
      </div>
    </>
  );
}

export function getSuiteSetupPlugins(): ProductSetupPlugin[] {
  return [
    {
      surface: 'chat',
      label: 'Cats Chat',
      description: 'AI companion chat \u2014 talk to your personal cat agents',
      enabled: true,
      hasConditionalStep: true,
      renderConditionalStep: (props) => <ChatBossCatStep {...props} />,
      validateConditionalStep: (state) => Boolean(state.model.trim()),
    },
    {
      surface: 'work',
      label: 'Cats Work',
      description: 'Project dashboard and task management',
      enabled: false,
      disabledReason: 'Coming soon',
      hasConditionalStep: false,
    },
    {
      surface: 'code',
      label: 'Cats Code',
      description: 'Code workspace and reviews',
      enabled: false,
      disabledReason: 'Coming soon',
      hasConditionalStep: false,
    },
  ];
}
