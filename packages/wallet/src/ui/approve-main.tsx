import '@/lib/buffer-shim';
import { createRoot } from 'react-dom/client';
import { Approve } from './pages/Approve';
import { ExperimentalBanner } from './tx/ExperimentalBanner';
import './styles.css';

if (window.top !== window) {
  window.close();
} else {
  createRoot(document.getElementById('root')!).render(
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ExperimentalBanner />
      <Approve />
    </div>,
  );
}
