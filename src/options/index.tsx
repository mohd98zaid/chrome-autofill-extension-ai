import React from 'react';
import ReactDOM from 'react-dom/client';
import { Options } from './Options';
import '../styles/index.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>
  );
}
