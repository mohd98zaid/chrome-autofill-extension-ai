import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReviewPanel } from './ReviewPanel';
import '../styles/index.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ReviewPanel />
    </React.StrictMode>
  );
}
