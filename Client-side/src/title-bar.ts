import { createElement } from '@syncfusion/ej2-base';
import { type ActionInfo, DocumentEditor } from '@syncfusion/ej2-documenteditor';
import { Button } from '@syncfusion/ej2-buttons';
import { Dialog } from '@syncfusion/ej2-popups';
import { DataService } from './data-service';


export class TitleBar {
  public showBackwardIcon: boolean = false;

  private tileBarDiv: HTMLElement;
  private documentTitle?: HTMLElement;
  private documentTitleContentEditor?: HTMLElement;
  private shareButton?: Button;
  private documentEditor: DocumentEditor;
  private userList?: HTMLElement;
  private dialogObj?: Dialog;
  private dataService: DataService;
  private onBackClick?: () => void;

  /** Map of connectionId → avatar HTMLElement */
  public userMap: Record<string, HTMLElement> = {};

  /** Keep references for removing listeners */
  private backIconEl?: HTMLElement;
  private shareClickHandler?: () => void;
  private backClickHandler?: () => void;

  constructor(
    element: HTMLElement,
    docEditor: DocumentEditor,
    isShareNeeded: Boolean,
    dataService: DataService,
    onBackClick?: () => void
  ) {
    this.tileBarDiv = element;
    this.documentEditor = docEditor;
    this.dataService = dataService;
    this.onBackClick = onBackClick;

    this.showBackwardIcon = this.dataService.getIsAuthorOpened();

    this.initializeTitleBar(isShareNeeded);
    this.wireEvents();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UI
  // ──────────────────────────────────────────────────────────────────────────

  private initializeTitleBar = (isShareNeeded: Boolean): void => {
    const shareText = 'Share';
    const shareToolTip = 'Share this link';

    // Container for back arrow + title label
    this.documentTitleContentEditor = createElement('div', {
      id: 'documenteditor_title_contentEditor',
      className: 'single-line',
    });

    // Back arrow
    if (this.showBackwardIcon) {
      const backwardIconToolTip = 'Click to go back to the file manager';

      this.backIconEl = createElement('span', {
        id: 'backward-icon',
        className: 'e-icons e-arrow-left',
        attrs: { title: backwardIconToolTip },
      });

      this.backClickHandler = () => {
        if (this.onBackClick) this.onBackClick();
      };
      this.backIconEl.addEventListener('click', this.backClickHandler);

      this.documentTitleContentEditor.appendChild(this.backIconEl);
    }

    // Document title label
    this.documentTitle = createElement('label', {
      id: 'documenteditor_title_name',
    });

    this.documentTitleContentEditor.appendChild(this.documentTitle);
    this.tileBarDiv.appendChild(this.documentTitleContentEditor);

    // Share button (optional)
    if (isShareNeeded) {
      this.shareButton = this.addButton(shareText, shareToolTip) as Button;
      this.shareButton.element.id = 'share-button';
    }

    // User-avatar container
    this.userList = createElement('div', { id: 'de_userInfo' });
    this.tileBarDiv.appendChild(this.userList);

    // Dialog for sharing
    if (isShareNeeded) {
      this.initDialogSafely();
    }
  };

  private addButton(btnText: string, tooltipText: string): Button {
    const button = createElement('button') as HTMLButtonElement;
    this.tileBarDiv.appendChild(button);
    button.setAttribute('title', tooltipText);
    return new Button({ content: btnText }, button);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Dialog
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Safe dialog init: waits until #shareDialog exists (React conditional render).
   */
  private initDialogSafely(): void {
    const tryInit = () => {
      const host = document.getElementById('shareDialog');
      if (!host) {
        // Try next tick
        requestAnimationFrame(tryInit);
        return;
      }
      this.initDialog();
    };

    tryInit();
  }

  private initDialog(): void {
    this.dialogObj = new Dialog({
      header: 'Share ' + this.documentEditor.documentName,
      animationSettings: { effect: 'None' },
      showCloseIcon: true,
      isModal: true,
      width: '500px',
      visible: false,
      buttons: [
        {
          click: this.copyURL.bind(this),
          buttonModel: { content: 'Copy URL', isPrimary: true },
        },
      ],
      open: () => {
        const urlTextBox = document.getElementById('share_url') as HTMLInputElement;
        if (urlTextBox) {
          urlTextBox.value = window.location.href;
          urlTextBox.select();
        }
      },
      beforeOpen: () => {
        if (this.dialogObj) {
          this.dialogObj.header = 'Share ' + this.documentEditor.documentName;
        }
        const dialogElement = document.getElementById('shareDialog') as HTMLElement;
        if (dialogElement) dialogElement.style.display = 'block';
      },
    });

    this.dialogObj.appendTo('#shareDialog');
  }

  private async copyURL(): Promise<void> {
    const copyText = document.getElementById('share_url') as HTMLInputElement;
    if (!copyText) return;

    copyText.select();

    try {
      // Works in secure contexts (https / localhost)
      await navigator.clipboard.writeText(copyText.value);
    } catch {
      // Fallback for older browsers / permissions
      try {
        document.execCommand('copy');
      } catch {
        // ignore
      }
    }

    this.dialogObj?.hide();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Events
  // ──────────────────────────────────────────────────────────────────────────

  private wireEvents = (): void => {
    if (!this.shareButton) return;

    this.shareClickHandler = () => this.dialogObj?.show();
    this.shareButton.element.addEventListener('click', this.shareClickHandler);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  public updateDocumentTitle = (): void => {
    if (this.documentEditor.documentName === '') {
      this.documentEditor.documentName = 'Untitled';
    }
    if (this.documentTitle) {
      this.documentTitle.textContent = 'Collaborative Editing';
    }
  };

  public addUser(actionInfos: ActionInfo | ActionInfo[]): void {
    const list = Array.isArray(actionInfos) ? actionInfos : [actionInfos];

    for (const actionInfo of list) {
      const connectionId = actionInfo.connectionId as string;
      const currentUser = actionInfo.currentUser as string;

      if (this.userMap[connectionId] || currentUser === this.dataService?.getAuthorName()) {
        continue;
      }

      const avatar = createElement('div', {
        className: 'e-avatar e-avatar-xsmall e-avatar-circle',
        id: `user-avatar-${connectionId}`, // ✅ unique id
        innerHTML: this.constructInitial(currentUser),
      });

      avatar.title = currentUser;
      this.userList?.appendChild(avatar);
      this.userMap[connectionId] = avatar;
    }
  }

  public removeUser(connectionId: string): void {
    const avatar = this.userMap[connectionId];
    if (avatar && this.userList) {
      this.userList.removeChild(avatar);
    }
    delete this.userMap[connectionId];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Call this when the editor page unmounts.
   */
  public destroy(): void {
    // remove share click handler
    if (this.shareButton?.element && this.shareClickHandler) {
      this.shareButton.element.removeEventListener('click', this.shareClickHandler);
    }

    // remove back click handler
    if (this.backIconEl && this.backClickHandler) {
      this.backIconEl.removeEventListener('click', this.backClickHandler);
    }

    // destroy Syncfusion instances
    try {
      this.dialogObj?.destroy();
    } catch {
      /* ignore */
    }
    try {
      this.shareButton?.destroy();
    } catch {
      /* ignore */
    }

    // clear maps
    this.userMap = {};
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private constructInitial(authorName: string): string {
    const parts = authorName.split(' ');
    let initials = '';
    for (const p of parts) {
      if (p && p.length > 0) initials += p[0];
    }
    return initials;
  }
}
