import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { WorkExternalBindingDialog } from "../WorkExternalBindingDialog";
import { PROJECTS_QUERY_KEY } from "../../state/queries/projectsQuery.js";
import { WORK_GRAPH_QUERY_KEY } from "../../state/queries/workGraphQuery.js";

interface ProjectExternalBindingDialogProps {
  projectId: string;
  onClose: () => void;
}

export function ProjectExternalBindingDialog({
  projectId,
  onClose,
}: ProjectExternalBindingDialogProps): JSX.Element {
  const { t } = useI18n();

  return (
    <WorkExternalBindingDialog
      localKind="project"
      localId={projectId}
      defaultExternalType="project"
      errorFallback={t("workExternalLinkError")}
      invalidateQueryKeys={[PROJECTS_QUERY_KEY, WORK_GRAPH_QUERY_KEY]}
      onClose={onClose}
      title={t("workExternalLinkDialogTitle")}
    />
  );
}
