import { useCallback, useEffect, useState } from 'react';

import type { WorkTemplate } from '../../templates/types.js';
import type { WorkIntakePlanProjection } from '../../api/intakeProjection.js';
import {
  fetchWorkTemplates,
  submitWorkIntake,
} from '../api/intake.js';

export interface IntakeFormState {
  title: string;
  brief: string;
  desiredOutcome: string;
  repoPath: string;
  deadline: string;
  priority: 'low' | 'medium' | 'high' | '';
  templateId: string;
}

export interface UseIntakeFormResult {
  form: IntakeFormState;
  templates: WorkTemplate[];
  templatesLoading: boolean;
  submitting: boolean;
  error: string | null;
  result: WorkIntakePlanProjection | null;
  setField: <K extends keyof IntakeFormState>(key: K, value: IntakeFormState[K]) => void;
  submit: () => void;
  reset: () => void;
}

const INITIAL_FORM: IntakeFormState = {
  title: '',
  brief: '',
  desiredOutcome: '',
  repoPath: '',
  deadline: '',
  priority: '',
  templateId: 'software_delivery',
};

export function useIntakeForm(): UseIntakeFormResult {
  const [form, setForm] = useState<IntakeFormState>(INITIAL_FORM);
  const [templates, setTemplates] = useState<WorkTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkIntakePlanProjection | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchWorkTemplates(controller.signal)
      .then((loaded) => {
        setTemplates(loaded);
        setTemplatesLoading(false);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load templates');
          setTemplatesLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const setField = useCallback(<K extends keyof IntakeFormState>(
    key: K,
    value: IntakeFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const submit = useCallback(() => {
    if (submitting) {
      return;
    }

    const title = form.title.trim();
    const brief = form.brief.trim();
    const desiredOutcome = form.desiredOutcome.trim();
    if (!title || !brief || !desiredOutcome || !form.templateId) {
      setError('Title, brief, desired outcome, and template are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    submitWorkIntake({
      title,
      brief,
      desiredOutcome,
      repoPath: form.repoPath.trim() || null,
      deadline: form.deadline.trim() || null,
      priority: form.priority || null,
      templateId: form.templateId,
    })
      .then((projection) => {
        setResult(projection);
        setSubmitting(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to submit intake');
        setSubmitting(false);
      });
  }, [form, submitting]);

  const reset = useCallback(() => {
    setForm(INITIAL_FORM);
    setError(null);
    setResult(null);
  }, []);

  return {
    form,
    templates,
    templatesLoading,
    submitting,
    error,
    result,
    setField,
    submit,
    reset,
  };
}
