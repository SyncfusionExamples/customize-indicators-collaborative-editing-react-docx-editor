import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FileManagerPage from './FileManagerPage';
import EditorPageWrapper from './DocumentEditor';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* File picker – landing page */}
                <Route path="/" element={<FileManagerPage />} />

                {/* Collaborative editor – opened from File Manager */}
                <Route path="/editor/:fileName/:roomId" element={<EditorPageWrapper />} />

                {/* Shared-link flow: /editor (no file/room) – falls back to ?id= query param */}
                <Route path="/editor" element={<EditorPageWrapper />} />

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
