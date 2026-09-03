import * as React from 'react';
import { useNavigate, useParams, type NavigateFunction } from 'react-router-dom';


import {
  DocumentEditorContainerComponent,
  Ribbon,
  CollaborativeEditingHandler,
  type ContainerContentChangeEventArgs,
  type Operation,
  Inject,
  DocumentEditor,
} from '@syncfusion/ej2-react-documenteditor';

import {
  HubConnectionBuilder,
  HttpTransportType,
  HubConnectionState,
  HubConnection,
  LogLevel,
} from '@microsoft/signalr';

import { hideSpinner, showSpinner } from '@syncfusion/ej2-popups';

import { TitleBar } from './title-bar.ts';
import { dataService } from './data-service.ts';

DocumentEditor.Inject(CollaborativeEditingHandler);

const USERS = [
  'Kathryn Fuller',
  'Tamer Fuller',
  'Martin Nancy',
  'Davolio Leverling',
  'Nancy Fuller',
  'Fuller Margaret',
  'Leverling Andrew',
];

export default function EditorPageWrapper() {
  const { fileName, roomId } = useParams<{ fileName: string; roomId: string }>();
  const navigate = useNavigate();

  return (
    <Editor
      fileName={decodeURIComponent(fileName || '')}
      roomId={roomId || ''}
      navigate={navigate}
    />
  );
}

interface EditorProps {
  fileName: string;
  roomId: string;
  navigate: NavigateFunction;
}

interface EditorState {
  showDialog: boolean;
  userName: string;
  isUserNameEntered: boolean;
}

class Editor extends React.Component<EditorProps, EditorState> {
  public serviceUrl = 'http://localhost:5212/';

  public container: DocumentEditorContainerComponent | null = null;
  public titleBar?: TitleBar;
  public collaborativeEditingHandler?: CollaborativeEditingHandler;
  public connectionId: string = '';
  public connection?: HubConnection;
  public currentRoomName: string = '';

  constructor(props: EditorProps) {
    super(props);
    const randomName = USERS[Math.floor(Math.random() * USERS.length)];

    this.state = {
      showDialog: true,
      userName: randomName,
      isUserNameEntered: false,
    };
  }

  private get currentUser(): string {
    return this.state.userName?.trim() || 'Guest user';
  }

  private onUserNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ userName: e.target.value });
  };

  private onOkClick = () => {
    const name = this.state.userName.trim();
    if (!name) return;

    dataService.setAuthorName(name);
    this.setState({ showDialog: false, isUserNameEntered: true });
  };

  private onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') this.onOkClick();
  };

  public componentDidMount(): void {
    window.onbeforeunload = () => 'Want to save your changes?';
  }

  public componentWillUnmount(): void {
    this.titleBar?.destroy();
    window.onbeforeunload = null;

    try {
      if (this.connection) {

        if (this.connection.state === HubConnectionState.Connected && this.currentRoomName) {
          this.connection
            .send('LeaveGroup', {
              roomName: this.currentRoomName,
              currentUser: this.currentUser,
            })
            .finally(() => this.connection?.stop());
        } else {
          this.connection.stop();
        }
      }
    } catch {
      // ignore cleanup errors
    }
  }

  public onContentChange = (args: ContainerContentChangeEventArgs) => {
    const handler = this.container?.documentEditor?.collaborativeEditingHandlerModule;
    if (!handler) {  
      return;
    }

    handler.sendActionToServer(args.operations as Operation[]);
  };

  public onCreated = (): void => {
    if (!this.container) return;

    if (this.props.fileName) {
      this.container.documentEditor.documentName = this.props.fileName;
    }

    this.container.documentEditor.enableCollaborativeEditing = true;
    this.collaborativeEditingHandler =
    this.container.documentEditor.collaborativeEditingHandlerModule;
    this.container.documentEditor.beforeXmlHttpRequestSend = (args: any) => {
      console.log('[beforeXmlHttpRequestSend]', {
        url: args?.url,
        method: args?.httpRequest?.method,
        headers: args?.httpRequest?.getAllResponseHeaders?.(),
        data: args?.data ?? args?.requestData ?? null,
        raw: args,
      });
    };

    // Optional editor settings
    this.container.documentEditor.pageOutline = '#E0E0E0';
    this.container.documentEditor.acceptTab = true;
    this.container.documentEditor.resize();
    this.initializeTitleBar();
    this.initializeSignalR();
    this.loadDocumentFromServer();
    this.titleBar?.updateDocumentTitle();
  };

  private initializeTitleBar(): void {
    this.titleBar = new TitleBar(
      document.getElementById('documenteditor_titlebar') as HTMLElement,
      this.container!.documentEditor,
      true,
      dataService,
      () => this.leaveRoomAndRedirect()
    );
  }

  private leaveRoomAndRedirect(): void {
    const goHome = () => {
      dataService.setIsAuthorOpened(false);
      this.props.navigate('/');
    };

    if (this.connection && this.connection.state === HubConnectionState.Connected) {
      this.connection
        .send('LeaveGroup', {
          roomName: this.currentRoomName,
          currentUser: this.currentUser,
        })
        .then(goHome)
        .catch(goHome);
    } else {
      goHome();
    }
  }

  public initializeSignalR = (): void => {
    if (this.connection) return;

    this.connection = new HubConnectionBuilder()
      .withUrl(this.serviceUrl + 'documenteditorhub', {
        skipNegotiation: true,
        transport: HttpTransportType.WebSockets,
      })
      .configureLogging(LogLevel.Information)
      .withAutomaticReconnect()
      .build();

    this.connection.on('dataReceived', this.onDataReceived);

    this.connection.onclose(() => {
      if (this.connection?.state === HubConnectionState.Disconnected) {
        alert('Connection lost. Please reload the browser to continue.');
      }
    });

    this.connection.onreconnected(() => {
      if (this.connection && this.currentRoomName) {
        this.connection.send('JoinGroup', {
          roomName: this.currentRoomName,
          currentUser: this.currentUser,
        });
      }
    });
  };

  public onDataReceived = (action: string, data: any) => {

    const handler = this.container?.documentEditor?.collaborativeEditingHandlerModule;
    if (!handler) return;

    // Store connectionId locally
    if (action === 'connectionId') {
      this.connectionId = data;
    }

    // Update TitleBar only for messages from other users
    if (this.connectionId && this.connectionId !== data?.connectionId) {
      if (this.titleBar) {
        if (action === 'action' || action === 'addUser') {
          this.titleBar.addUser(data);
        } else if (action === 'removeUser') {
          this.titleBar.removeUser(data);
        }
      }
    }

    // Always forward ALL actions
    handler.applyRemoteAction(action, data);

  };

  public openDocument(responseText: string, roomName: string): void {
    const containerEl = document.getElementById('container') as HTMLElement | null;
    if (containerEl) showSpinner(containerEl);

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      
      if (containerEl) hideSpinner(containerEl);
      alert('ImportFile returned invalid JSON. Check server logs / response.');
      return;
    }

    const version = data?.version;
    const rawSfdt = data?.sfdt;

    if (!rawSfdt) {
      
      if (containerEl) hideSpinner(containerEl);
      alert('SFDT is empty/undefined. Server did not return document content.');
      return;
    }

    // Some servers may return sfdt as object; DocumentEditor expects string
    const sfdt = typeof rawSfdt === 'string' ? rawSfdt : JSON.stringify(rawSfdt);


    // ALWAYS get live handler
    const handler = this.container?.documentEditor?.collaborativeEditingHandlerModule;
    if (!handler) {
      if (containerEl) hideSpinner(containerEl);
      throw new Error("collaborativeEditingHandlerModule is undefined");
    }

    const collabBaseUrl = "http://localhost:5212/api/CollaborativeEditing/";

    handler.updateRoomInfo(roomName, version, collabBaseUrl);
    this.container?.documentEditor.open(sfdt);


    // Connect SignalR + JoinGroup (CRITICAL for real-time collaboration)
    setTimeout(() => {
      this.connectToRoom({
        roomName,
        currentUser: this.currentUser,
      });
    }, 0);

    if (containerEl) hideSpinner(containerEl);
  }

  public loadDocumentFromServer(): void {

    const docName = this.props.fileName || 'Giant Panda.docx';
    let { roomId } = this.props;
    let roomName = roomId;
    if (!roomName) {
      const urlParams = new URLSearchParams(window.location.search);
      roomName = urlParams.get('id') || Math.random().toString(32).slice(2);
      window.history.replaceState({}, '', `?id=${roomName}`);
    }
    const httpRequest = new XMLHttpRequest();
    httpRequest.open('POST', this.serviceUrl + 'api/CollaborativeEditing/ImportFile', true);
    httpRequest.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');

    httpRequest.onreadystatechange = () => {
      if (httpRequest.readyState !== 4) return;

      if (httpRequest.status === 200 || httpRequest.status === 304) {
        this.openDocument(httpRequest.responseText, roomName);
      } else {
        alert(`ImportFile failed: ${httpRequest.status} ${httpRequest.statusText}`);
      }
    };

    httpRequest.send(JSON.stringify({ fileName: docName, documentOwner: roomName }));

  }

  public connectToRoom = async (data: { roomName: string; currentUser: string }) => {
    try {
      this.currentRoomName = data.roomName;
      if (!this.connection) return;

      if (this.connection.state === HubConnectionState.Disconnected) {
        await this.connection.start();
        
      }

      if (this.connection.state === HubConnectionState.Connected) {
        await this.connection.send('JoinGroup', {
          roomName: data.roomName,
          currentUser: data.currentUser,
        });
        
      }
    } catch (err) {
      
      setTimeout(() => this.connectToRoom(data), 5000);
    }
  };

  render() {
    const { showDialog, userName, isUserNameEntered } = this.state;

    return (
      <div className="control-pane">
        {/* Username Dialog */}
        {showDialog && (
          <div id="dialog-container">
            <div className="username-dialog-box">
              <div className="username-dialog-title">Enter your name</div>
              <div className="username-dialog-body">
                <input
                  id="userNameInput"
                  type="text"
                  className="e-input"
                  placeholder="Enter your name"
                  value={userName}
                  onChange={this.onUserNameChange}
                  onKeyDown={this.onKeyDown}
                  autoFocus
                />
              </div>
              <div className="username-dialog-footer">
                <button
                  className="e-btn e-primary"
                  onClick={this.onOkClick}
                  disabled={!userName.trim()}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Editor */}
        {isUserNameEntered && (
          <div>
            {/* Hidden div for Share URL dialog content (if your TitleBar uses it) */}
            <div id="shareDialog" style={{ display: 'none' }}>
              <div className="e-de-para-dlg-heading">
                Share this URL with others for real-time editing
              </div>
              <div className="e-de-container-row" style={{ display: 'flex', marginTop: 8 }}>
                <input
                  type="text"
                  id="share_url"
                  className="e-input"
                  readOnly
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div id="documenteditor_titlebar" className="e-de-ctn-title"></div>

            <div id="documenteditor_container_body">
              <DocumentEditorContainerComponent
                id="container"
                ref={(scope: DocumentEditorContainerComponent | null) => {
                  this.container = scope;
                }}
                created={this.onCreated}
                contentChange={this.onContentChange}
                style={{ display: 'block' }}
                height={'calc(100vh - 51px)'}
                currentUser={this.currentUser}
                serviceUrl={this.serviceUrl + 'api/documenteditor'}

                toolbarMode="Ribbon"
                ribbonLayout="Classic"
                enableToolbar={true}
                locale="en-US"
              >
                <Inject services={[Ribbon]} />
              </DocumentEditorContainerComponent>

            </div>
          </div>
        )}
      </div>
    );
  }
}

export { Editor };