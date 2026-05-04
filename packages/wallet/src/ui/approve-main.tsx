import '@/lib/buffer-shim';
import { createRoot } from 'react-dom/client';
import { Approve } from './pages/Approve';
import './styles.css';

createRoot(document.getElementById('root')!).render(<Approve />);
