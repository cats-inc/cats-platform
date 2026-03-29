import { useNavigate } from 'react-router-dom';

import { useIntakeForm } from '../hooks/useIntakeForm.js';
import { TemplatePicker } from './TemplatePicker.js';

export function IntakeForm() {
  const navigate = useNavigate();
  const {
    form,
    templates,
    templatesLoading,
    submitting,
    error,
    result,
    setField,
    submit,
    reset,
  } = useIntakeForm();

  // After successful intake, navigate to plan review
  if (result) {
    const projectId = result.project.id;
    return (
      <div className="work-intake-success">
        <h2 className="work-intake-success-title">Work intake created</h2>
        <p className="work-intake-success-desc">
          &ldquo;{result.project.title}&rdquo; with {result.tasks.length} tasks generated.
        </p>
        <div className="work-intake-success-actions">
          <button
            type="button"
            className="work-intake-btn work-intake-btn--primary"
            onClick={() => navigate(`/work/intake/${projectId}`)}
          >
            Review Plan
          </button>
          <button
            type="button"
            className="work-intake-btn work-intake-btn--secondary"
            onClick={reset}
          >
            Start Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="work-intake-form">
      <h2 className="work-intake-heading">Start Work</h2>

      <div className="work-intake-field">
        <label className="work-intake-label" htmlFor="intake-title">Title</label>
        <input
          id="intake-title"
          className="work-intake-input"
          type="text"
          placeholder="What are you working on?"
          value={form.title}
          onChange={(e) => setField('title', e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="work-intake-field">
        <label className="work-intake-label" htmlFor="intake-brief">Brief</label>
        <textarea
          id="intake-brief"
          className="work-intake-textarea"
          placeholder="Describe the initiative..."
          rows={3}
          value={form.brief}
          onChange={(e) => setField('brief', e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="work-intake-field">
        <label className="work-intake-label" htmlFor="intake-outcome">Desired Outcome</label>
        <textarea
          id="intake-outcome"
          className="work-intake-textarea"
          placeholder="What does success look like?"
          rows={2}
          value={form.desiredOutcome}
          onChange={(e) => setField('desiredOutcome', e.target.value)}
          disabled={submitting}
        />
      </div>

      <TemplatePicker
        templates={templates}
        selectedId={form.templateId}
        loading={templatesLoading}
        onSelect={(id) => setField('templateId', id)}
      />

      <div className="work-intake-row">
        <div className="work-intake-field work-intake-field--half">
          <label className="work-intake-label" htmlFor="intake-repo">Repository Path</label>
          <input
            id="intake-repo"
            className="work-intake-input"
            type="text"
            placeholder="/path/to/repo (optional)"
            value={form.repoPath}
            onChange={(e) => setField('repoPath', e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="work-intake-field work-intake-field--quarter">
          <label className="work-intake-label" htmlFor="intake-priority">Priority</label>
          <select
            id="intake-priority"
            className="work-intake-select"
            value={form.priority}
            onChange={(e) => setField('priority', e.target.value as 'low' | 'medium' | 'high' | '')}
            disabled={submitting}
          >
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="work-intake-field work-intake-field--quarter">
          <label className="work-intake-label" htmlFor="intake-deadline">Deadline</label>
          <input
            id="intake-deadline"
            className="work-intake-input"
            type="date"
            value={form.deadline}
            onChange={(e) => setField('deadline', e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      {error ? (
        <div className="work-intake-error">{error}</div>
      ) : null}

      <div className="work-intake-actions">
        <button
          type="button"
          className="work-intake-btn work-intake-btn--primary"
          onClick={submit}
          disabled={submitting || !form.title.trim() || !form.brief.trim() || !form.desiredOutcome.trim()}
        >
          {submitting ? 'Creating...' : 'Generate Plan'}
        </button>
      </div>
    </div>
  );
}
