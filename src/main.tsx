import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './state/AppContext';
import { UiProvider } from './state/UiContext';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </AppProvider>
  </StrictMode>,
);
