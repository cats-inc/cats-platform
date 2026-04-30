import { createWorkspaceProductApp } from '../../shared/renderer/WorkspaceProductApp.js';
import { AppRoutes } from './AppRoutes';
import { Sidebar } from './components/Sidebar';
import { BootShell } from './chatUtils';
import './styles.css';

export default createWorkspaceProductApp({
  productName: 'Chat',
  shellSurface: 'chat',
  supportsStructuredDraftModes: true,
  BootShell,
  AppRoutesComponent: AppRoutes,
  renderSidebar: (props) => (
    <Sidebar
      {...props}
      onStartNewGroupChat={props.onStartNewGroupChat ?? props.onStartNewChat}
      onStartNewParallelChat={props.onStartNewParallelChat ?? props.onStartNewChat}
    />
  ),
});
