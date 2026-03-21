import { Route, Routes } from 'react-router-dom';

import ChatApp from '../../products/chat/renderer/App';
import WorkApp from '../../products/work/renderer/App';
import CodeApp from '../../products/code/renderer/App';
import { SUITE_SURFACE_ROUTES } from './routeMap';

export default function SuiteApp() {
  return (
    <Routes>
      <Route path={`${SUITE_SURFACE_ROUTES.work.routePrefix}/*`} element={<WorkApp />} />
      <Route path={`${SUITE_SURFACE_ROUTES.code.routePrefix}/*`} element={<CodeApp />} />
      <Route path="*" element={<ChatApp />} />
    </Routes>
  );
}
