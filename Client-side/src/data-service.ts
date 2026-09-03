
export class DataService {
  private authorName: string;
  private isAuthorOpened: boolean;

  private readonly AUTHOR_KEY = 'ce_authorName';
  private readonly AUTHOR_OPENED_KEY = 'ce_isAuthorOpened';

  constructor() {
    // Restore from sessionStorage (if available)
    this.authorName = sessionStorage.getItem(this.AUTHOR_KEY) || '';
    this.isAuthorOpened = sessionStorage.getItem(this.AUTHOR_OPENED_KEY) === 'true';
  }

  /** Store the name typed in the "Enter Your Name" dialog. */
  setAuthorName(name: string): void {
    this.authorName = name;
    sessionStorage.setItem(this.AUTHOR_KEY, name);
  }

  /** Retrieve the stored author name. */
  getAuthorName(): string {
    return this.authorName;
  }

  /**
   * Set true when the user opens a file from the File Manager.
   * TitleBar uses this to decide whether to show the ← back arrow.
   */
  setIsAuthorOpened(isOpened: boolean): void {
    this.isAuthorOpened = isOpened;
    sessionStorage.setItem(this.AUTHOR_OPENED_KEY, String(isOpened));
  }

  /** Whether the current user initiated the session (vs joined via share link). */
  getIsAuthorOpened(): boolean {
    return this.isAuthorOpened;
  }

  /**
   * Select text in an input by id.
   * Uses requestAnimationFrame so it works even if called right after a render/dialog open.
   */
  selectText(inputId: string): void {
    requestAnimationFrame(() => {
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (!input) return;
      input.focus();
      input.select();
    });
  }

  /** Optional helper: clear state (call on logout or app reset). */
  reset(): void {
    this.authorName = '';
    this.isAuthorOpened = false;
    sessionStorage.removeItem(this.AUTHOR_KEY);
    sessionStorage.removeItem(this.AUTHOR_OPENED_KEY);
  }
}

/** Shared singleton instance */
export const dataService = new DataService();