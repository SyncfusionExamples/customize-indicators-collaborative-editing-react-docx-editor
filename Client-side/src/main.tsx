import ReactDOM from 'react-dom/client';
import './index.css';
import './layout.css';
import App from './App';
import { registerLicense } from '@syncfusion/ej2-base';

// Register Syncfusion license key
registerLicense('');

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
    <App />
);


