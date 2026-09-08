import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/theme.css';

// NOTE: intentionally no StrictMode — engines consume the seeded RNG inside
// state transitions and double-invoked effects in dev would skew sequences.
createRoot(document.getElementById('root')!).render(<App />);
