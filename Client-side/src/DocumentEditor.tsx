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
import type { UserProfile } from './user-types.ts';
import { fetchUserDirectory, findProfileByName } from './user-service.ts';
import { roleColor as computeRoleColor } from './user-types.ts';

DocumentEditor.Inject(CollaborativeEditingHandler);

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
  /** Username dialog visibility. Initially `true` (overlays the editor until the user joins). */
  showDialog: boolean;
  /** True once the document has finished loading — used to gate the dialog. */
  documentLoaded: boolean;
  userName: string;
  /** User directory fetched from the server (`/api/Users`). */
  userDirectory: UserProfile[];
  /** True while the user directory request is in flight. */
  userDirectoryLoading: boolean;
  /** Profile selected from the directory, or `null` when a custom name is typed. */
  selectedProfile: UserProfile | null;
  /** Whether the autocomplete dropdown is currently open. */
  showPicker: boolean;
  /** Index of the highlighted suggestion in the dropdown (-1 = none). */
  highlightedIndex: number;
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

    this.state = {
      showDialog: true,
      documentLoaded: false,
      userName: '',
      userDirectory: [],
      userDirectoryLoading: true,
      selectedProfile: null,
      showPicker: false,
      highlightedIndex: -1,
    };
  }

  private get currentUser(): string {
    return this.state.userName?.trim() || 'Guest user';
  }

  /**
   * Profile representing the current local user (the one whose avatar is shown
   * in the title bar). Falls back to a synthetic profile when the user typed
   * a custom name not present in the directory.
   */
  private get currentUserProfile(): UserProfile {
    if (this.state.selectedProfile) return this.state.selectedProfile;
    const name = this.currentUser;
    return {
      id: 'local',
      name,
      profileIcon: '',
      onlineStatus: 'Online',
      userRole: 'Viewer',
    };
  }

  private onUserNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    // When the user types a name not in the directory we mark it as a custom profile.
    const match = findProfileByName(this.state.userDirectory, name);
    this.setState({
      userName: name,
      selectedProfile: match,
      showPicker: true,
      highlightedIndex: match ? 0 : -1,
    });
  };

  private onUserNameFocus = () => {
    this.setState({ showPicker: true });
  };

  private onUserNameBlur = (_e: React.FocusEvent<HTMLInputElement>) => {
    // Delay closing so a click on a suggestion still registers.
    setTimeout(() => this.setState({ showPicker: false, highlightedIndex: -1 }), 120);
  };

  private onUserNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // If the picker is open and an item is highlighted, select it. Otherwise just submit.
      const suggestions = this.getFilteredSuggestions();
      if (
        this.state.showPicker &&
        this.state.highlightedIndex >= 0 &&
        this.state.highlightedIndex < suggestions.length
      ) {
        e.preventDefault();
        this.pickSuggestion(suggestions[this.state.highlightedIndex]);
        return;
      }
      this.onOkClick();
      return;
    }

    if (!this.state.showPicker && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      this.setState({ showPicker: true });
      return;
    }

    if (!this.state.showPicker) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const suggestions = this.getFilteredSuggestions();
      if (suggestions.length === 0) return;
      this.setState((prev) => ({
        highlightedIndex:
          prev.highlightedIndex < suggestions.length - 1
            ? prev.highlightedIndex + 1
            : 0,
      }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const suggestions = this.getFilteredSuggestions();
      if (suggestions.length === 0) return;
      this.setState((prev) => ({
        highlightedIndex:
          prev.highlightedIndex > 0
            ? prev.highlightedIndex - 1
            : suggestions.length - 1,
      }));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.setState({ showPicker: false, highlightedIndex: -1 });
    }
  };

  /**
   * Returns the directory entries whose name contains the typed value
   * (case-insensitive). When the input is empty, the first few entries are
   * shown as a hint, but only when the directory has finished loading.
   */
  private getFilteredSuggestions = (): UserProfile[] => {
    const { userDirectory, userName, userDirectoryLoading } = this.state;
    if (userDirectoryLoading) return [];
    const needle = userName.trim().toLowerCase();
    if (!needle) {
      return userDirectory.slice(0, 8);
    }
    const matches = userDirectory.filter((u) =>
      (u.name || '').toLowerCase().includes(needle)
    );
    return matches.slice(0, 8);
  };

  /**
   * Called when a user clicks (or keyboard-selects) a suggestion in the
   * autocomplete dropdown. Populates the text input and remembers the full
   * profile so the title bar can render the avatar.
   */
  private pickSuggestion = (profile: UserProfile) => {
    this.setState({
      userName: profile.name,
      selectedProfile: profile,
      showPicker: false,
      highlightedIndex: -1,
    });
  };

  private onOkClick = () => {
    const name = this.state.userName.trim();
    if (!name) return;

    dataService.setAuthorName(name);
    // The editor is already mounted under the dialog. Just hide the dialog.
    this.setState({ showDialog: false });
    // Once the user has entered their name, push the picked profile through
    // to the title bar so it shows *this* user's avatar (not "Guest user" / "GU").
    if (this.titleBar && this.currentUserProfile) {
      this.titleBar.setCurrentUserProfile(this.currentUserProfile);
    }
    // Connect to the hub now that we have a real identity. Doing this only
    // *after* the dialog ensures peers in other tabs receive the actual
    // user record from users.json (avatar, initals, role) — not the
    // synthetic "Guest user" placeholder broadcast by an empty name.
    if (this.currentRoomName) {
      this.connectToRoom({
        roomName: this.currentRoomName,
        currentUser: this.currentUser,
        currentUserProfile: this.currentUserProfile,
      });
    }
  };

  // Close the username dialog if the user clicks the semi-transparent
  // backdrop (outside the dialog box). The dialog never reopens after
  // it has been closed because the user has already joined the session.
  private onUsernameBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (this.state.userName.trim()) {
      this.onOkClick();
    }
  };

  /** First-letter initials for a name (used for fallback avatar text). */
  private constructInitial = (name: string): string => {
    const parts = (name || '').trim().split(/\s+/);
    let initials = '';
    for (const p of parts) {
      if (p && p.length > 0) initials += p[0];
      if (initials.length >= 2) break;
    }
    return initials.toUpperCase() || '?';
  };

  /** Returns a CSS color for the given user role. */
  private roleColor(role: string | undefined | null): string {
    return computeRoleColor(role);
  }

  public componentDidMount(): void {
    window.onbeforeunload = () => 'Want to save your changes?';

    // Load the user directory from the server so the username dialog can
    // offer a "Pick from list" option.
    this.loadUserDirectory();
  }

  private loadUserDirectory = async (): Promise<void> => {
    try {
      const users = await fetchUserDirectory(this.serviceUrl);
      this.setState((prev) => {
        // Preserve any name the user might have typed before the list arrived.
        // We do NOT pre-fill the input with the first directory user anymore —
        // the user explicitly asked for a clean textbox-with-suggestions UX.
        const next: Partial<EditorState> = {
          userDirectory: users,
          userDirectoryLoading: false,
        };
        if (prev.userName) {
          next.selectedProfile = findProfileByName(users, prev.userName);
        }
        return next as Pick<EditorState, keyof EditorState>;
      });
    } catch (err) {
      // Non-fatal: the user can still type a custom name.
      this.setState({ userDirectoryLoading: false });
    }
  };

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
      () => this.leaveRoomAndRedirect(),
      this.serviceUrl // pass so /UserPictures/X.png is resolved against the API host
    );
    // The title bar needs to look up profile details (icon, id, online status)
    // for both the current user and remote users.
    this.titleBar.setUserDirectory(this.state.userDirectory);
    this.titleBar.setCurrentUserProfile(this.currentUserProfile);
  }

  private leaveRoomAndRedirect(): void {
    const goHome = () => {
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
          userId: this.currentUserProfile.id,
          profileIcon: this.currentUserProfile.profileIcon,
          onlineStatus: this.currentUserProfile.onlineStatus,
          userRole: this.currentUserProfile.userRole,
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
          // The server forwards profile fields alongside the ActionInfo payload.
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

    const collabBaseUrl = this.serviceUrl +'api/CollaborativeEditing/';

    handler.updateRoomInfo(roomName, version, collabBaseUrl);
    this.container?.documentEditor.open(sfdt);
    // The document is now rendered, so the initial-name dialog can show
    // (it overlays the editor rather than blocking it).
    this.setState({ documentLoaded: true });
    // Remember the room the user will join. Connecting to the signalR hub is
    // deferred until the user picks/enters a real name and clicks Join — that
    // way the hub never broadcasts the synthetic "Guest user" placeholder to
    // other tabs in the same room, which was the root cause of the GU bug.
    this.currentRoomName = roomName;

    if (containerEl) hideSpinner(containerEl);
  }

  public loadDocumentFromServer(): void {
    const containerEl = document.getElementById('container') as HTMLElement | null;
    if (containerEl) showSpinner(containerEl);

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
        if (containerEl) hideSpinner(containerEl);
      } else {
        if (containerEl) hideSpinner(containerEl);
        alert('Fail to load the document');
      }
    };

    // Always load the default document shipped with the server (wwwroot/Giant Panda.docx).
    httpRequest.send(JSON.stringify({ fileName: 'Giant Panda.docx', documentOwner: roomId }));
  }

  public connectToRoom = async (data: {
    roomName: string;
    currentUser: string;
    currentUserProfile: UserProfile;
  }) => {
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
          // Send the profile so other peers can render the user's avatar.
          userId: data.currentUserProfile.id,
          profileIcon: data.currentUserProfile.profileIcon,
          onlineStatus: data.currentUserProfile.onlineStatus,
          userRole: data.currentUserProfile.userRole,
        });

      }
    } catch (err) {

      setTimeout(() => this.connectToRoom(data), 5000);
    }
  };

  render() {
    const {
      showDialog,
      documentLoaded,
      userName,
      userDirectoryLoading,
      selectedProfile,
      showPicker,
      highlightedIndex,
    } = this.state;

    const suggestions = this.getFilteredSuggestions();
    const showSuggestions =
      showPicker && !userDirectoryLoading && suggestions.length > 0;

    // The dialog only appears AFTER the document finishes loading, then
    // overlays the editor so the user can see the rendered document
    // behind the name-picker.
    const dialogVisible = showDialog && documentLoaded;

    return (
      <div className="control-pane">
        {/* Username Dialog (renders on top of the editor once the document is loaded) */}
        {dialogVisible && (
          <div id="dialog-container" onClick={this.onUsernameBackdropClick}>
            <div className="username-dialog-box">
              <div className="username-dialog-title">Enter your name</div>
              <div className="username-dialog-body">
                {/* Label */}
                <label className="user-picker-label" htmlFor="userNameInput">
                  User name
                </label>
                <p className="user-picker-hint">
                  Start typing to pick from the list, or type any name to join as a guest.
                </p>

                {/* Autocomplete combobox */}
                <div className="user-combobox">
                  <input
                    id="userNameInput"
                    type="text"
                    className="e-input user-combobox-input"
                    placeholder="Type a name…"
                    value={userName}
                    onChange={this.onUserNameChange}
                    onFocus={this.onUserNameFocus}
                    onBlur={this.onUserNameBlur}
                    onKeyDown={this.onUserNameKeyDown}
                    autoFocus
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showSuggestions}
                    aria-controls="user-combobox-listbox"
                  />
                  <span
                    className={`user-combobox-caret ${showSuggestions ? 'open' : ''}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>

                  {showSuggestions && (
                    <ul
                      id="user-combobox-listbox"
                      className="user-combobox-list"
                      role="listbox"
                    >
                      {suggestions.map((u, idx) => (
                        <li
                          key={u.id}
                          id={`user-combobox-opt-${u.id}`}
                          role="option"
                          aria-selected={idx === highlightedIndex}
                          className={
                            'user-combobox-option' +
                            (idx === highlightedIndex ? ' is-active' : '')
                          }
                          // Use mousedown so the click registers before the
                          // input's blur handler closes the dropdown.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            this.pickSuggestion(u);
                          }}
                          onMouseEnter={() =>
                            this.setState({ highlightedIndex: idx })
                          }
                        >
                          {u.profileIcon ? (
                            <img
                              className="user-combobox-option-avatar"
                              src={u.profileIcon}
                              alt=""
                            />
                          ) : (
                            <span className="user-combobox-option-avatar user-combobox-option-fallback">
                              {this.constructInitial(u.name)}
                            </span>
                          )}
                          <span className="user-combobox-option-name">
                            {u.name}
                          </span>
                          <span
                            className="user-combobox-option-role"
                            style={{
                              backgroundColor: this.roleColor(u.userRole),
                            }}
                          >
                            {u.userRole || 'Viewer'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Live preview of the picked profile (avatar + name + role) */}
                {selectedProfile && (
                  <div className="user-picker-preview">
                    {selectedProfile.profileIcon ? (
                      <img
                        src={selectedProfile.profileIcon}
                        alt=""
                        className="user-picker-preview-icon"
                      />
                    ) : (
                      <div className="user-picker-preview-icon user-picker-preview-fallback">
                        {this.constructInitial(selectedProfile.name)}
                      </div>
                    )}
                    <div className="user-picker-preview-text">
                      <div className="user-picker-preview-name">
                        {selectedProfile.name}
                      </div>
                      <div className="user-picker-preview-meta">
                        <span className={`status-dot status-${selectedProfile.onlineStatus.toLowerCase()}`} />
                        {selectedProfile.onlineStatus} · {selectedProfile.id}
                      </div>
                    </div>
                    {selectedProfile.userRole && (
                      <span
                        className="user-picker-preview-role"
                        style={{
                          backgroundColor: this.roleColor(selectedProfile.userRole),
                        }}
                      >
                        {selectedProfile.userRole}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="username-dialog-footer">
                <button
                  className="e-btn e-primary"
                  onClick={this.onOkClick}
                  disabled={!userName.trim()}
                >
                  Join session
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Document Editor — always mounted, dialog overlays it once the doc is loaded */}
        <div
          className={
            'document-editor-shell' + (dialogVisible ? ' is-behind-dialog' : '')
          }
        >
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
              height={'990px'}
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
      </div>
    );
  }
}

export { Editor };