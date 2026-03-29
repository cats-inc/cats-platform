import type { WorkTemplate } from '../../templates/types.js';

export interface TemplatePickerProps {
  templates: WorkTemplate[];
  selectedId: string;
  loading: boolean;
  onSelect: (templateId: string) => void;
}

export function TemplatePicker({
  templates,
  selectedId,
  loading,
  onSelect,
}: TemplatePickerProps) {
  if (loading) {
    return <div className="work-intake-templates-loading">Loading templates...</div>;
  }

  if (templates.length === 0) {
    return <div className="work-intake-templates-empty">No templates available.</div>;
  }

  return (
    <div className="work-intake-templates">
      <label className="work-intake-label">Team Template</label>
      <div className="work-intake-template-list">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`work-intake-template-card${
              selectedId === template.id ? ' work-intake-template-card--selected' : ''
            }`}
            onClick={() => onSelect(template.id)}
          >
            <span className="work-intake-template-card-label">{template.label}</span>
            <span className="work-intake-template-card-desc">{template.description}</span>
            <span className="work-intake-template-card-meta">
              {template.roles.length} roles &middot; {template.taskBlueprints.length} stages
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
