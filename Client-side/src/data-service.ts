
export class DataService {
  private authorName: string;

  private readonly AUTHOR_KEY = 'ce_authorName';

  constructor() {
    // Restore from sessionStorage (if available)
    this.authorName = sessionStorage.getItem(this.AUTHOR_KEY) || '';
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
    sessionStorage.removeItem(this.AUTHOR_KEY);
  }
}

/** Shared singleton instance */
export const dataService = new DataService();