import { createRoot } from 'react-dom/client';
import './styles.css';
import './engine/shape-lab';
import App from './App';

const root = document.getElementById('root');

if (!root) throw new Error('Missing #root element');

createRoot(root).render(<App />);
