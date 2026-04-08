import type { FormEvent, RefObject } from 'react';

import {
  WorkspaceAddCatPanel,
  type WorkspaceAddCatPanelProps,
} from '../../../shared/renderer/components/AddCatPanel.js';
import type { ChatCat } from '../../api/contracts';
import type { CatFormState } from '../chatUtils';
import { ProviderModelFields } from './ProviderModelFields';

export interface AddCatPanelProps extends Omit<
  WorkspaceAddCatPanelProps,
  'ProviderModelFieldsComponent'
> {
  panelRef?: RefObject<HTMLDivElement>;
  selectableCats: ChatCat[];
  catForm: CatFormState;
  onCreateCat: (event: FormEvent<HTMLFormElement>) => void;
}

export function AddCatPanel({
  ...props
}: AddCatPanelProps) {
  return <WorkspaceAddCatPanel {...props} ProviderModelFieldsComponent={ProviderModelFields} />;
}
