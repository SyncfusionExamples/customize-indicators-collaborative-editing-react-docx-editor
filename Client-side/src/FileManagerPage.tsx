import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileManagerComponent,
  Inject,
  NavigationPane,
  DetailsView,
  Toolbar,
} from '@syncfusion/ej2-react-filemanager';
import { dataService } from './data-service.ts';

const SERVICE_URL = 'http://localhost:5212/';
const FILE_OPS_URL = SERVICE_URL + 'AzureDocumentStorage/ManageDocument';

// ── Error Boundary ───────────────────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}
class FileManagerErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (msg: string) => void },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error?.message || 'Unknown error');
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function FileManagerPage() {
  const navigate = useNavigate();

  const [serverOnline, setServerOnline] = React.useState<boolean | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Probe the backend before mounting FileManager to avoid internal Ajax crashes.
  React.useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    async function probe() {
      try {
        // Any HTTP response => server reachable.
        // Using a minimal "read" payload to hit the same endpoint FileManager uses.
        await fetch(FILE_OPS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'read', path: '/', data: [] }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        if (!mounted) return;
        setServerOnline(true);
        setServerError(null);
      } catch (err: any) {
        clearTimeout(timeout);
        if (!mounted) return;

        const isAbort = err?.name === 'AbortError';
        setServerOnline(false);
        setServerError(
          isAbort
            ? 'Connection timed out. Make sure the .NET API is running on http://localhost:5212.'
            : 'Backend server is not reachable. Make sure the .NET API is running on http://localhost:5212.'
        );
      }
    }

    probe();

    return () => {
      mounted = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const retry = () => {
    setServerOnline(null);
    setServerError(null);
    window.location.reload();
  };

  const generateRandomRoomId = () => 'RoomID_' + Math.random().toString(32).slice(2, 8);


  const onFileSelect = (args: any) => {
    if (!args?.fileDetails) return;
    if (args.action && args.action !== 'select') return;

    const fileDetail = Array.isArray(args.fileDetails) ? args.fileDetails[0] : args.fileDetails;

    if (!fileDetail?.isFile) return;

    const fileName: string = fileDetail.name || '';
    if (!fileName) return;

    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext !== 'doc' && ext !== 'docx') return;

    const roomId = generateRandomRoomId();

    dataService.setIsAuthorOpened(true);

    navigate(`/editor/${encodeURIComponent(fileName)}/${roomId}`);
  };

  const setError = (msg: string) => {
    setServerOnline(false);
    setServerError(msg);
  };

  return (
    <div className="file-manager-wrapper">
      <div className="file-manager-header">
        <span className="file-manager-title">
          📁 Azure Blob Storage — Select a document to edit collaboratively
        </span>
      </div>

      {/* Probing */}
      {serverOnline === null && (
        <div className="fm-checking-banner">
          <span className="fm-spinner" />
          Connecting to server…
        </div>
      )}

      {/* Server unreachable */}
      {serverOnline === false && (
        <div className="fm-error-banner">
          <span className="fm-error-icon">⚠️</span>
          <div>
            <strong>Backend unavailable</strong>
            <p>{serverError}</p>
            <p style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
              Start the .NET API project, then{' '}
              <button className="fm-retry-btn" onClick={retry}>
                retry
              </button>
              .
            </p>
          </div>
        </div>
      )}

      {/* File Manager — only after probe succeeds */}
      {serverOnline === true && (
        <FileManagerErrorBoundary onError={setError}>
          <FileManagerComponent
            id="file-manager"
            ajaxSettings={{ url: FILE_OPS_URL }}
            height="calc(100vh - 52px)"
            view="Details"
            fileSelect={onFileSelect}   
          >
            <Inject services={[NavigationPane, DetailsView, Toolbar]} />
          </FileManagerComponent>
        </FileManagerErrorBoundary>
      )}
    </div>
  );
}