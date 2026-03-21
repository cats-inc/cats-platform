import { Route, Routes } from 'react-router-dom';

import ChatApp from '../../products/chat/renderer/App';
import WorkApp from '../../products/work/renderer/App';
import CodeApp from '../../products/code/renderer/App';

export default function SuiteApp() {
  return (
    <Routes>
      <Route path="/work/*" element={<WorkApp />} />
      <Route path="/code/*" element={<CodeApp />} />
      <Route path="*" element={<ChatApp />} />
    </Routes>
  );
}
