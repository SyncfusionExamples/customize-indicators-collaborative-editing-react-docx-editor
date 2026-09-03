import { createElement } from '@syncfusion/ej2-base';
import { type ActionInfo, DocumentEditor } from '@syncfusion/ej2-documenteditor';
import { Dialog } from '@syncfusion/ej2-popups';
import { DataService } from './data-service';
import type { UserProfile } from './user-types';

// ─────────────────────────────────────────────────────────────────────
//  Domain types
// ─────────────────────────────────────────────────────────────────────

interface AvatarEntry {
  id: string;
  profile: UserProfile;
  el: HTMLElement;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onClick: () => void;
}

interface TemplateSettings {
  showActiveCount: boolean;
  showRoleBreakdown: boolean;
  showRoleBadge: boolean;
  showStatusDot: boolean;
  enablePopup: boolean;
  iconStyle: 'photo' | 'initials';
  /** Per-field toggles for the avatar hover pop-up (mockup-driven). */
  popupFields: {
    photo: boolean;
    name: boolean;
    role: boolean;
    status: boolean;
    email: boolean;
    org: boolean;
  };
}

const DEFAULT_TEMPLATE: TemplateSettings = {
  showActiveCount: true,
  showRoleBreakdown: true,
  showRoleBadge: true,
  showStatusDot: false,
  enablePopup: true,
  iconStyle: 'photo',
  popupFields: {
    photo: true,
    name: true,
    role: true,
    status: true,
    email: true,
    org: true,
  },
};

// Role → ring color, matching the mockup's Tailwind default palette.
const ROLE_COLOR_MAP: Readonly<Record<string, string>> = {
  Owner: '#f59e0b',
  Editor: '#3b82f6',
  Reviewer: '#22c55e',
  Commenter: '#a855f7',
  Viewer: '#64748b',
};

function roleRingColor(role: string | undefined | null): string {
  if (!role) return ROLE_COLOR_MAP.Viewer;
  return ROLE_COLOR_MAP[role] ?? ROLE_COLOR_MAP.Viewer;
}

// ─────────────────────────────────────────────────────────────────────
//  TitleBar
// ─────────────────────────────────────────────────────────────────────

/**
 * Word-style title bar with a hierarchical Avatar Stack + Hover Popup +
 * Share Modal for collaborative editing.
 *
 * Layout (left → right):
 *   [document-title]  [avatar-stack]  [active-count]  [share]  [gear]
 *
 * - Current user is always rendered at index 0 (38px ring).
 * - Peers overlap at -8px (34px ring).
 * - Each avatar carries a role-coloured ring (mockup-driven).
 */
export class TitleBar {
  public showBackwardIcon: boolean = false;

  private tileBarDiv: HTMLElement;
  private dataService: DataService;
  private onBackClick?: () => void;
  private serviceUrl: string;

  private documentTitleContentEditor?: HTMLElement;
  private documentTitle?: HTMLElement;
  private collabBar?: HTMLElement;
  private avatarStack?: HTMLElement;
  private activeCountPill?: HTMLElement;
  private activeCountLabel?: HTMLElement;
  private roleBreakdownPill?: HTMLElement;
  private roleBreakdownLabel?: HTMLElement;
  private backIconEl?: HTMLElement;
  private backClickHandler?: () => void;

  // Share modal — pure CSS toggle (not a Syncfusion Dialog wrapper, to
  // avoid double-modal layering with the username overlay).
  private shareModalHost?: HTMLElement;
  private shareUrlInput?: HTMLInputElement;
  private shareCloseBtn?: HTMLElement;

  // Profile dialog (legacy — click on avatar)
  private profileDialogHost?: HTMLElement;
  private profileDialog?: Dialog;

  // Hover popup
  private hoverPopup?: HTMLElement;
  private hoverPopupTimer: number | null = null;

  // State
  public userMap: Record<string, AvatarEntry> = {};
  private userDirectory: UserProfile[] = [];
  private currentUserProfile: UserProfile | null = null;
  private collaborators: Array<{ profile: UserProfile }> = [];
  private template: TemplateSettings = { ...DEFAULT_TEMPLATE };

  constructor(
    element: HTMLElement,
    _docEditor: DocumentEditor,
    _isShareNeeded: boolean,
    dataService: DataService,
    onBackClick?: () => void,
    serviceUrl?: string
  ) {
    this.tileBarDiv = element;
    this.dataService = dataService;
    this.onBackClick = onBackClick;
    this.serviceUrl = serviceUrl ?? '';

    this.initializeTitleBar();
    setTimeout(() => this.initializeMockupExtras(), 0);
  }

  // ─── Public API ──────────────────────────────────────────────────

  public setUserDirectory(users: UserProfile[]): void {
    this.userDirectory = (users ?? []).map((u) => ({ ...u, profileIcon: this.resolveAvatar(u.profileIcon) }));
  }

  public setCurrentUserProfile(profile: UserProfile): void {
    this.currentUserProfile = { ...profile, profileIcon: this.resolveAvatar(profile.profileIcon) };
    this.refreshCollaborators();
    this.render();
  }

  public updateDocumentTitle = (): void => {
    if (this.documentTitle) this.documentTitle.textContent = 'Collaborative Editing';
  };

  public addUser(actionInfos: ActionInfo | ActionInfo[]): void {
    const list = Array.isArray(actionInfos) ? actionInfos : [actionInfos];
    for (const actionInfo of list) {
      const connectionId = (actionInfo as any)?.connectionId as string;
      if (!connectionId) continue;

      const incomingName = (actionInfo as any)?.currentUser as string;
      const localName = this.dataService?.getAuthorName?.();
      if (incomingName && localName && incomingName === localName) continue;

      const profile = this.resolveProfileFromActionInfo(actionInfo);

      if (this.userMap[connectionId]) {
        this.userMap[connectionId].profile = profile;
        continue;
      }

      const el = this.buildAvatarEl(profile, false);
      const entry: AvatarEntry = {
        id: connectionId,
        profile,
        el,
        onHoverEnter: () => this.showHoverPopup(profile, el),
        onHoverLeave: () => this.hideHoverPopupSoon(),
        onClick: () => this.showProfileDialog(profile),
      };
      el.addEventListener('mouseenter', entry.onHoverEnter);
      el.addEventListener('mouseleave', entry.onHoverLeave);
      el.addEventListener('click', entry.onClick);
      this.userMap[connectionId] = entry;
    }
    this.refreshCollaborators();
    this.render();
  }

  public removeUser(connectionId: string): void {
    const entry = this.userMap[connectionId];
    if (!entry) return;
    entry.el.removeEventListener('mouseenter', entry.onHoverEnter);
    entry.el.removeEventListener('mouseleave', entry.onHoverLeave);
    entry.el.removeEventListener('click', entry.onClick);
    if (entry.el.parentElement) entry.el.parentElement.removeChild(entry.el);
    delete this.userMap[connectionId];
    this.refreshCollaborators();
    this.render();
  }

  public destroy(): void {
    for (const id of Object.keys({ ...this.userMap })) this.removeUser(id);
    try { this.profileDialog?.destroy(); } catch { /* ignore */ }
    try { this.profileDialogHost?.parentElement?.removeChild(this.profileDialogHost); } catch { /* ignore */ }
    try { this.shareModalHost?.parentElement?.removeChild(this.shareModalHost); } catch { /* ignore */ }
    try { this.hoverPopup?.parentElement?.removeChild(this.hoverPopup); } catch { /* ignore */ }
  }

  // ─── DOM scaffolding ─────────────────────────────────────────────

  private initializeTitleBar(): void {
    // Document-title row
    this.documentTitleContentEditor = createElement('div', {
      id: 'documenteditor_title_contentEditor',
      className: 'single-line',
    });

    if (this.showBackwardIcon && this.onBackClick) {
      this.backIconEl = createElement('span', {
        id: 'backward-icon',
        className: 'e-icons e-arrow-left',
        attrs: { title: 'Click to go back to the file manager' },
      });
      this.backClickHandler = () => this.onBackClick?.();
      this.backIconEl.addEventListener('click', this.backClickHandler);
      this.documentTitleContentEditor.appendChild(this.backIconEl);
    }

    this.documentTitle = createElement('label', { id: 'documenteditor_title_name' }) as HTMLElement;
    this.documentTitleContentEditor.appendChild(this.documentTitle);
    this.tileBarDiv.appendChild(this.documentTitleContentEditor);

    // Collaboration bar
    this.collabBar = createElement('div', { id: 'collabBar', className: 'collab-bar' }) as HTMLElement;

    // Avatar stack
    this.avatarStack = createElement('div', { id: 'avatarStack', className: 'avatar-stack' }) as HTMLElement;
    this.collabBar.appendChild(this.avatarStack);

    // Counts block (Active-count pill + Role-breakdown pill, mockup-driven)
    const countsBlock = createElement('div', { id: 'countsBlock', className: 'counts-block' }) as HTMLElement;

    this.activeCountPill = createElement('div', {
      id: 'activeCountPill',
      className: 'count-pill count-pill-active',
    }) as HTMLElement;
    this.activeCountPill.appendChild(createElement('span', { className: 'count-pill-icon' }));
    this.activeCountLabel = createElement('span', { id: 'activeCountLabel' }) as HTMLElement;
    this.activeCountLabel.textContent = '0 Active Collaborators';
    this.activeCountPill.appendChild(this.activeCountLabel);
    countsBlock.appendChild(this.activeCountPill);

    this.roleBreakdownPill = createElement('div', {
      id: 'roleBreakdownPill',
      className: 'count-pill count-pill-breakdown',
    }) as HTMLElement;
    this.roleBreakdownLabel = createElement('span', { id: 'roleBreakdownLabel' }) as HTMLElement;
    this.roleBreakdownLabel.textContent = '—';
    this.roleBreakdownPill.appendChild(this.roleBreakdownLabel);
    countsBlock.appendChild(this.roleBreakdownPill);

    this.collabBar.appendChild(countsBlock);

    // Right-side action buttons
    const right = createElement('div', { className: 'collab-bar-right' }) as HTMLElement;

    const shareBtn = createElement('button', {
      id: 'share-for-editing-button',
      className: 'btn-share-primary',
    }) as HTMLButtonElement;
    shareBtn.textContent = 'Share for collaborative editing';
    shareBtn.addEventListener('click', () => this.openShareModal());
    right.appendChild(shareBtn);

    const gearBtn = createElement('button', {
      id: 'templateBtn',
      className: 'template-btn',
      attrs: { title: 'Template customization' },
    }) as HTMLButtonElement;
    gearBtn.innerHTML = templateGearSVG();
    gearBtn.addEventListener('click', () => this.openTemplateDrawer());
    right.appendChild(gearBtn);

    this.collabBar.appendChild(right);
    this.tileBarDiv.appendChild(this.collabBar);
  }

  private initializeMockupExtras(): void {
    this.buildShareModal();
    this.buildProfileDialog();
    this.buildTemplateDrawer();
    this.buildHoverPopup();
  }

  // ─── Avatar rendering ────────────────────────────────────────────

  private buildAvatarEl(profile: UserProfile, isCurrentUser: boolean): HTMLElement {
    const size = isCurrentUser ? 38 : 34;
    const color = roleRingColor(profile.userRole);

    const wrap = createElement('div', { className: 'avatar-wrap' }) as HTMLElement;
    wrap.style.width = wrap.style.height = `${size}px`;
    wrap.setAttribute('title', profile.name);
    wrap.dataset.userId = profile.id;
    if (isCurrentUser) wrap.classList.add('avatar-wrap-local');

    const inner = createElement('div', {
      className: 'avatar-inner' + (this.template.showRoleBadge ? ' avatar-ring' : ''),
    }) as HTMLElement;
    inner.style.setProperty('--role-color', color);
    if (isCurrentUser) inner.classList.add('avatar-inner-current');

    const useInitials = this.template.iconStyle === 'initials' || !profile.profileIcon;

    if (!useInitials) {
      const img = createElement('img', {
        className: 'avatar-img',
        attrs: { src: profile.profileIcon, alt: profile.name },
      }) as HTMLImageElement;
      img.onerror = () => {
        inner.removeChild(img);
        inner.appendChild(this.makeInitialsSpan(profile, color));
      };
      inner.appendChild(img);
    } else {
      inner.appendChild(this.makeInitialsSpan(profile, color));
    }

    if (this.template.showStatusDot) {
      const dot = createElement('span', {
        className: 'avatar-status-dot online',
        attrs: { title: 'Active Now' },
      }) as HTMLElement;
      inner.appendChild(dot);
    }

    wrap.appendChild(inner);
    return wrap;
  }

  private makeInitialsSpan(profile: UserProfile, color: string): HTMLElement {
    const initials = createElement('span', { className: 'avatar-initials' }) as HTMLElement;
    initials.textContent = profile.initials || this.constructInitial(profile.name);
    initials.style.backgroundColor = color;
    return initials;
  }

  // ─── Render loop ─────────────────────────────────────────────────

  private refreshCollaborators(): void {
    const list: Array<{ profile: UserProfile }> = [];
    if (this.currentUserProfile) list.push({ profile: this.currentUserProfile });
    for (const id of Object.keys(this.userMap)) list.push({ profile: this.userMap[id].profile });
    this.collaborators = list;
  }

  public render(): void {
    this.refreshCollaborators();
    if (!this.avatarStack) return;

    this.avatarStack.innerHTML = '';
    this.collaborators.forEach(({ profile }, idx) => {
      const isLocal = idx === 0 && this.currentUserProfile?.id === profile.id;
      const el = this.buildAvatarEl(profile, isLocal);
      el.addEventListener('mouseenter', () => this.showHoverPopup(profile, el));
      el.addEventListener('mouseleave', () => this.hideHoverPopupSoon());
      el.addEventListener('click', () => this.showProfileDialog(profile));
      this.avatarStack!.appendChild(el);
    });

    const activeCount = this.collaborators.length;
    if (this.activeCountLabel) {
      this.activeCountLabel.textContent = `${activeCount} Active Collaborator${activeCount !== 1 ? 's' : ''}`;
    }
    if (this.activeCountPill) {
      this.activeCountPill.classList.toggle('is-hidden', !this.template.showActiveCount);
    }
    if (this.roleBreakdownPill) {
      this.roleBreakdownPill.classList.toggle('is-hidden', !this.template.showRoleBreakdown);
    }
    if (this.roleBreakdownLabel) {
      const byRole: Record<string, number> = {};
      const canonical: Array<{ key: string; singular: string; plural: string }> = [
        { key: 'Owner', singular: 'Owner', plural: 'Owners' },
        { key: 'Editor', singular: 'Editor', plural: 'Editors' },
        { key: 'Reviewer', singular: 'Reviewer', plural: 'Reviewers' },
        { key: 'Commenter', singular: 'Commenter', plural: 'Commenters' },
        { key: 'Viewer', singular: 'Viewer', plural: 'Viewers' },
      ];
      this.collaborators.forEach(({ profile }) => {
        const r = profile.userRole || 'Viewer';
        byRole[r] = (byRole[r] ?? 0) + 1;
      });
      const parts = canonical
        .filter((c) => (byRole[c.key] ?? 0) > 0)
        .map((c) => `${byRole[c.key]} ${byRole[c.key] === 1 ? c.singular : c.plural}`);
      this.roleBreakdownLabel.textContent = parts.length > 0 ? parts.join(' | ') : '—';
    }
  }

  // ─── Share modal ─────────────────────────────────────────────────

  private buildShareModal(): void {
    if (document.getElementById('shareModal')) return;
    this.shareModalHost = createElement('div', {
      id: 'shareModal',
      className: 'share-modal popup-hidden',
    }) as HTMLElement;

    const card = createElement('div', { className: 'share-modal-card' }) as HTMLElement;
    this.shareCloseBtn = createElement('button', {
      id: 'shareCloseX',
      className: 'share-close-x',
      attrs: { 'aria-label': 'Close' },
    }) as HTMLElement;
    this.shareCloseBtn.textContent = '×';
    card.appendChild(this.shareCloseBtn);

    const h = createElement('h3') as HTMLElement;
    h.textContent = 'Share for collaborative editing';
    card.appendChild(h);

    const sub = createElement('p', { className: 'share-modal-sub' }) as HTMLElement;
    sub.textContent = 'Send this URL or open the session in a new tab.';
    card.appendChild(sub);

    const label = createElement('label', { className: 'share-modal-label' }) as HTMLElement;
    label.textContent = 'Session URL';
    card.appendChild(label);

    this.shareUrlInput = createElement('input', {
      id: 'shareUrlInput',
      attrs: { type: 'text', readonly: 'readonly' },
      className: 'share-modal-input',
    }) as HTMLInputElement;
    card.appendChild(this.shareUrlInput);

    const actions = createElement('div', { className: 'share-modal-actions' }) as HTMLElement;
    const copyBtn = createElement('button', { id: 'shareCopyUrl', className: 'btn-secondary' }) as HTMLButtonElement;
    copyBtn.textContent = '📋 Copy URL';
    const openBtn = createElement('button', { id: 'shareOpenTab', className: 'btn-primary' }) as HTMLButtonElement;
    openBtn.textContent = '↗ Open in new tab';
    actions.appendChild(copyBtn);
    actions.appendChild(openBtn);
    card.appendChild(actions);

    const hint = createElement('p', { className: 'share-modal-hint' }) as HTMLElement;
    hint.textContent =
      'Anyone with this URL will land here and be asked to enter their name before joining the session.';
    card.appendChild(hint);

    this.shareModalHost.appendChild(card);
    document.body.appendChild(this.shareModalHost);

    const close = () => this.shareModalHost?.classList.add('popup-hidden');
    copyBtn.addEventListener('click', async () => {
      if (!this.shareUrlInput) return;
      this.shareUrlInput.select();
      try { await navigator.clipboard.writeText(this.shareUrlInput.value); } catch { /* ignore */ }
      close();
    });
    openBtn.addEventListener('click', () => {
      if (!this.shareUrlInput) return;
      window.open(this.shareUrlInput.value, '_blank', 'noopener,noreferrer');
      close();
    });
    this.shareCloseBtn.addEventListener('click', close);
    this.shareModalHost.addEventListener('click', (e) => { if (e.target === this.shareModalHost) close(); });
  }

  private openShareModal(): void {
    if (!this.shareModalHost) this.buildShareModal();
    if (this.shareUrlInput) this.shareUrlInput.value = window.location.href;
    this.shareModalHost?.classList.remove('popup-hidden');
    setTimeout(() => this.shareUrlInput?.select(), 50);
  }

  // ─── Profile dialog (click on avatar) ────────────────────────────

  private buildProfileDialog(): void {
    if (document.getElementById('profileDialogHost')) return;
    this.profileDialogHost = createElement('div', {
      id: 'profileDialogHost',
      attrs: { style: 'display:none' },
    }) as HTMLElement;
    document.body.appendChild(this.profileDialogHost);

    /**
     * Syncfusion's Dialog caches state in persistent overlay elements.
     * We defeat that by tearing it down to bare DOM before every show,
     * then recreating the `Dialog` instance — this guarantees the close
     * icon reliably works on the second click of the dialog.
     */
    this.profileDialog = new Dialog({
      header: 'User profile',
      animationSettings: { effect: 'FadeZoom', duration: 150 },
      showCloseIcon: true,
      isModal: true,
      width: '360px',
      visible: false,
      target: document.body,
    });
    // @ts-ignore — appendTo accepts an HTMLElement
    this.profileDialog.appendTo(this.profileDialogHost);
  }

  private showProfileDialog(profile: UserProfile): void {
    if (!this.profileDialog) this.buildProfileDialog();

    // Always tear down any leftover Syncfusion overlays from prior shows.
    document.querySelectorAll('.e-dlg-container, .e-dlg-overlay').forEach((el) => {
      if (el.parentElement) el.parentElement.removeChild(el);
    });
    try { this.profileDialog?.destroy(); } catch { /* ignore */ }

    // Build fresh
    this.profileDialog = new Dialog({
      header: 'User profile',
      animationSettings: { effect: 'FadeZoom', duration: 150 },
      showCloseIcon: true,
      isModal: true,
      width: '360px',
      visible: false,
      target: document.body,
    });

    const dialogHost = this.profileDialogHost!;
    dialogHost.innerHTML = '';
    const root = createElement('div', { className: 'udp-root' }) as HTMLElement;

    const header = createElement('div', { className: 'udp-header' }) as HTMLElement;
    if (profile.profileIcon) {
      const img = createElement('img', {
        className: 'udp-avatar',
        attrs: { src: profile.profileIcon, alt: profile.name },
      }) as HTMLImageElement;
      img.style.setProperty('--role-color', roleRingColor(profile.userRole));
      header.appendChild(img);
    } else {
      const fallback = createElement('span', { className: 'udp-avatar udp-avatar-fallback' }) as HTMLElement;
      fallback.textContent = profile.initials || this.constructInitial(profile.name);
      fallback.style.setProperty('--role-color', roleRingColor(profile.userRole));
      header.appendChild(fallback);
    }
    const headerText = createElement('div', { className: 'udp-header-text' }) as HTMLElement;
    const nameEl = createElement('span', { className: 'udp-name' }) as HTMLElement;
    nameEl.textContent = profile.name;
    headerText.appendChild(nameEl);
    const statusEl = createElement('span', { className: 'udp-status' }) as HTMLElement;
    const dot = createElement('span', { className: 'status-dot status-online' }) as HTMLElement;
    statusEl.appendChild(dot);
    statusEl.appendChild(document.createTextNode('Online'));
    headerText.appendChild(statusEl);
    header.appendChild(headerText);
    root.appendChild(header);

    const roleRow = createElement('div', { className: 'udp-row' }) as HTMLElement;
    const roleLabel = createElement('span', { className: 'udp-label' }) as HTMLElement;
    roleLabel.textContent = 'Role';
    roleRow.appendChild(roleLabel);
    const roleChip = createElement('span', {
      className: 'udp-role-chip udp-role-chip-strong',
      attrs: { style: `background:${roleRingColor(profile.userRole)}` },
    }) as HTMLElement;
    roleChip.textContent = profile.userRole || 'Viewer';
    roleRow.appendChild(roleChip);
    root.appendChild(roleRow);

    if (profile.email) {
      const row = createElement('div', { className: 'udp-row' }) as HTMLElement;
      const label = createElement('span', { className: 'udp-label' }) as HTMLElement;
      label.textContent = 'Email';
      row.appendChild(label);
      const value = createElement('span', { className: 'udp-value udp-mono' }) as HTMLElement;
      value.textContent = profile.email;
      row.appendChild(value);
      root.appendChild(row);
    }
    if (profile.organization) {
      const row = createElement('div', { className: 'udp-row' }) as HTMLElement;
      const label = createElement('span', { className: 'udp-label' }) as HTMLElement;
      label.textContent = 'Org';
      row.appendChild(label);
      const value = createElement('span', { className: 'udp-value' }) as HTMLElement;
      value.textContent = profile.organization;
      row.appendChild(value);
      root.appendChild(row);
    }

    dialogHost.appendChild(root);
    // @ts-ignore — appendTo accepts an HTMLElement
    this.profileDialog.appendTo(dialogHost);
    this.profileDialog.show();
  }

  // ─── Hover popup (mockup) ─────────────────────────────────────

  private buildHoverPopup(): void {
    if (document.getElementById('userPopup')) return;
    this.hoverPopup = createElement('div', { id: 'userPopup', className: 'user-popup popup-hidden' }) as HTMLElement;
    document.body.appendChild(this.hoverPopup);
  }

  private showHoverPopup(profile: UserProfile, anchor: HTMLElement): void {
    if (!this.template.enablePopup || !this.hoverPopup) return;
    if (this.hoverPopupTimer !== null) {
      clearTimeout(this.hoverPopupTimer);
      this.hoverPopupTimer = null;
    }
    const ring = roleRingColor(profile.userRole);
    const F = this.template.popupFields;
    this.hoverPopup.innerHTML = '';

    // photo
    if (F.photo) {
      if (profile.profileIcon) {
        const img = createElement('img', {
          className: 'udp-avatar',
          attrs: { src: profile.profileIcon, alt: profile.name },
        }) as HTMLImageElement;
        img.style.setProperty('--role-color', ring);
        img.onerror = () => {
          // Swap to initials fallback if image fails to load
          if (img.parentElement) img.remove();
          const fallback = createElement('span', {
            className: 'udp-avatar udp-avatar-fallback',
          }) as HTMLElement;
          fallback.textContent = profile.initials || this.constructInitial(profile.name);
          fallback.style.setProperty('--role-color', ring);
          this.hoverPopup!.insertBefore(fallback, this.hoverPopup!.firstChild);
        };
        this.hoverPopup.appendChild(img);
      } else {
        const fallback = createElement('span', {
          className: 'udp-avatar udp-avatar-fallback',
        }) as HTMLElement;
        fallback.textContent = profile.initials || this.constructInitial(profile.name);
        fallback.style.setProperty('--role-color', ring);
        this.hoverPopup.appendChild(fallback);
      }
    }

    // name
    if (F.name) {
      const nameP = createElement('p', { className: 'udp-name' }) as HTMLElement;
      nameP.textContent = profile.name;
      this.hoverPopup.appendChild(nameP);
    }

    // role badge
    if (F.role) {
      const roleP = createElement('p', { className: 'udp-row-line' }) as HTMLElement;
      const chip = createElement('span', {
        className: 'udp-role-chip',
        attrs: { style: `background:${ring}` },
      }) as HTMLElement;
      // Mockup pattern: "<role> <initials>"
      chip.textContent = `${profile.userRole || 'Viewer'} ${profile.initials || ''}`.trim();
      roleP.appendChild(chip);
      this.hoverPopup.appendChild(roleP);
    }

    // status
    if (F.status) {
      const statusP = createElement('p', {
        className: 'udp-status udp-status-active',
      }) as HTMLElement;
      statusP.textContent = '🟢 Active Now';
      this.hoverPopup.appendChild(statusP);
    }

    // email
    if (F.email && profile.email) {
      const emailP = createElement('p', { className: 'udp-meta' }) as HTMLElement;
      emailP.textContent = profile.email;
      this.hoverPopup.appendChild(emailP);
    }

    // organization
    if (F.org && profile.organization) {
      const orgP = createElement('p', { className: 'udp-meta udp-meta-org' }) as HTMLElement;
      orgP.textContent = profile.organization;
      this.hoverPopup.appendChild(orgP);
    }

    this.hoverPopup.classList.remove('popup-hidden');
    const rect = anchor.getBoundingClientRect();
    const popupW = 240;
    let left = rect.left - popupW / 2 + rect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));
    this.hoverPopup.style.left = `${left}px`;
    this.hoverPopup.style.top = `${rect.bottom + 8}px`;
  }

  private hideHoverPopupSoon(): void {
    this.hoverPopupTimer = window.setTimeout(() => this.hoverPopup?.classList.add('popup-hidden'), 120);
  }

  // ─── Template drawer ─────────────────────────────────────────────

  private buildTemplateDrawer(): void {
    if (document.getElementById('templateDrawer')) return;
    const drawer = createElement('div', {
      id: 'templateDrawer',
      className: 'template-drawer popup-hidden',
    }) as HTMLElement;

    const header = createElement('div', { className: 'template-drawer-header' }) as HTMLElement;
    const titleBlock = createElement('div') as HTMLElement;
    const title = createElement('h3') as HTMLElement;
    title.textContent = 'Template Customization';
    const sub = createElement('p', { className: 'template-drawer-sub' }) as HTMLElement;
    sub.textContent = 'Configure how collaborators appear.';
    titleBlock.appendChild(title);
    titleBlock.appendChild(sub);
    header.appendChild(titleBlock);
    const closeX = createElement('button', {
      id: 'templateClose',
      className: 'template-close-btn',
      attrs: { 'aria-label': 'Close' },
    }) as HTMLElement;
    closeX.textContent = '×';
    header.appendChild(closeX);
    drawer.appendChild(header);

    const body = createElement('div', { className: 'template-drawer-body' }) as HTMLElement;

    // ─── Title bar section (showActiveCount + showRoleBreakdown) ──
    const titleSec = createElement('p', { className: 'template-section-title' }) as HTMLElement;
    titleSec.textContent = 'Title bar';
    body.appendChild(titleSec);
    const titleGrp = createElement('div', { id: 'grpTitle' }) as HTMLElement;
    body.appendChild(titleGrp);

    // ─── User icon section (iconStyle + showRoleBadge / showStatusDot / enablePopup) ──
    const iconSec = createElement('p', { className: 'template-section-title' }) as HTMLElement;
    iconSec.textContent = 'User icon';
    body.appendChild(iconSec);
    const iconStyleLabel = createElement('label', { className: 'template-row-label' }) as HTMLElement;
    iconStyleLabel.textContent = 'Icon style';
    body.appendChild(iconStyleLabel);
    const iconStyle = createElement('select', { id: 'iconStyle', className: 'template-select' }) as HTMLSelectElement;
    const optPhoto = createElement('option', { attrs: { value: 'photo' } }) as HTMLElement;
    optPhoto.textContent = 'Profile photo';
    const optInit = createElement('option', { attrs: { value: 'initials' } }) as HTMLElement;
    optInit.textContent = 'Initials only';
    iconStyle.appendChild(optPhoto);
    iconStyle.appendChild(optInit);
    iconStyle.value = this.template.iconStyle;
    iconStyle.onchange = () => {
      this.template.iconStyle = iconStyle.value as 'photo' | 'initials';
      this.render();
    };
    body.appendChild(iconStyle);
    const iconGrp = createElement('div', { id: 'grpIcon' }) as HTMLElement;
    body.appendChild(iconGrp);

    // ─── Pop-up fields section (popupFields[photo|name|role|status|email|org]) ──
    const popupSec = createElement('p', { className: 'template-section-title' }) as HTMLElement;
    popupSec.textContent = 'Pop-up (hover) fields';
    body.appendChild(popupSec);
    const popupGrp = createElement('div', { id: 'grpPopup' }) as HTMLElement;
    body.appendChild(popupGrp);

    drawer.appendChild(body);
    document.body.appendChild(drawer);

    closeX.addEventListener('click', () => drawer.classList.add('popup-hidden'));

    // ─────────── Toggles ───────────
    const refresh = () => this.render();

    // Title-bar toggles
    const titleToggles: Array<{ key: keyof TemplateSettings; label: string }> = [
      { key: 'showActiveCount',   label: 'Show total active collaborator count' },
      { key: 'showRoleBreakdown', label: 'Show role breakdown counts' },
    ];
    titleToggles.forEach((t) => {
      titleGrp.appendChild(this.makeTemplateToggle(t.label, () => this.template[t.key] as boolean, (v) => {
        (this.template as unknown as Record<string, unknown>)[t.key as string] = v;
        refresh();
      }));
    });

    // Icon toggles
    const iconToggles: Array<{ key: keyof TemplateSettings; label: string }> = [
      { key: 'showRoleBadge', label: 'Color-coded role ring on icon' },
      { key: 'showStatusDot', label: 'Show online status dot' },
      { key: 'enablePopup',   label: 'Enable hover pop-up' },
    ];
    iconToggles.forEach((t) => {
      iconGrp.appendChild(this.makeTemplateToggle(t.label, () => this.template[t.key] as boolean, (v) => {
        (this.template as unknown as Record<string, unknown>)[t.key as string] = v;
        refresh();
      }));
    });

    // Pop-up field toggles (all 6, from the mockup)
    const popupToggles: Array<{ key: keyof TemplateSettings['popupFields']; label: string }> = [
      { key: 'photo',  label: 'Profile photo'   },
      { key: 'name',   label: 'Name'            },
      { key: 'role',   label: 'Role badge'      },
      { key: 'status', label: 'Online status'   },
      { key: 'email',  label: 'Email'           },
      { key: 'org',    label: 'Organization'    },
    ];
    popupToggles.forEach((t) => {
      popupGrp.appendChild(this.makeTemplateToggle(
        t.label,
        () => this.template.popupFields[t.key],
        (v) => {
          this.template.popupFields[t.key] = v;
          refresh();
        }
      ));
    });
  }

  /** Build a single drawer toggle row (label + checkbox wired to `read`/`save`). */
  private makeTemplateToggle(
    label: string,
    read: () => boolean,
    save: (v: boolean) => void
  ): HTMLElement {
    const row = createElement('label', { className: 'template-toggle-row' }) as HTMLElement;
    const txt = createElement('span') as HTMLElement;
    txt.textContent = label;
    const input = createElement('input', {
      attrs: { type: 'checkbox' },
      className: 'template-checkbox',
    }) as HTMLInputElement;
    input.checked = read();
    input.onchange = () => save(input.checked);
    row.appendChild(txt);
    row.appendChild(input);
    return row;
  }

  private openTemplateDrawer(): void {
    if (!document.getElementById('templateDrawer')) this.buildTemplateDrawer();
    document.getElementById('templateDrawer')?.classList.remove('popup-hidden');
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private resolveProfileFromActionInfo(input: ActionInfo | any): UserProfile {
    const name = (input?.currentUser as string) || 'Unknown user';
    const id = (input?.userId as string) || (input?.connectionId as string) || 'remote';
    const fromDir =
      this.userDirectory.find((u) => u.name?.trim().toLowerCase() === name.trim().toLowerCase()) ||
      this.userDirectory.find((u) => u.id === id);
    return {
      id: fromDir?.id || id,
      name: fromDir?.name || name,
      initials: fromDir?.initials || (input?.initials as string) || this.constructInitial(name),
      profileIcon: this.resolveAvatar((input?.profileIcon as string) || fromDir?.profileIcon || ''),
      onlineStatus: (input?.onlineStatus as string) || fromDir?.onlineStatus || 'Online',
      userRole: (input?.userRole as string) || fromDir?.userRole || 'Viewer',
      email: fromDir?.email || '',
      organization: fromDir?.organization || '',
    };
  }

  private resolveAvatar(icon: string | null | undefined): string {
    if (!icon) return '';
    if (icon.startsWith('data:') || /^[a-z][a-z0-9+.-]*:/i.test(icon)) return icon;
    if (icon.startsWith('/')) return this.serviceUrl.replace(/\/$/, '') + icon;
    if (!this.serviceUrl) return `/${icon}`;
    return this.serviceUrl.replace(/\/$/, '') + '/' + icon;
  }

  private constructInitial(authorName: string): string {
    const parts = (authorName || '').trim().split(/\s+/);
    let out = '';
    for (const p of parts) if (p) { out += p[0]; if (out.length >= 2) break; }
    return (out || '?').toUpperCase();
  }
}

function templateGearSVG(): string {
  return (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.6.67 1.03 1.29 1.06h.04a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
    '</svg>'
  );
}
