import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import EditorPageWrapper from './DocumentEditor';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Default entry — opens the collaborative editor with the default document. */}
                <Route path="/" element={<EditorPageWrapper />} />

                {/* Allow direct access via /editor as well (e.g. shared link). */}
                <Route path="/editor" element={<EditorPageWrapper />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
