import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'countryFlag',
  standalone: true
})
export class CountryFlagPipe implements PipeTransform {
  private static isWindows: boolean | null = null;

  constructor(private sanitizer: DomSanitizer) {}

  private static detectWindows(): boolean {
    if (this.isWindows !== null) {
      return this.isWindows;
    }
    try {
      const ua = (typeof navigator !== 'undefined' && (navigator as any).userAgent) ? (navigator as any).userAgent : '';
      this.isWindows = /Windows/i.test(ua);
    } catch {
      this.isWindows = false;
    }
    return this.isWindows;
  }

  /**
   * Transforms a two-letter ISO country code into a flag emoji.
   * On Windows, returns a Twemoji <img> as SafeHtml so that flags render correctly.
   * @param countryCode The two-letter country code (e.g., "US", "CH").
   * @returns The corresponding flag emoji string, or SafeHtml with an <img> on Windows.
   */
  transform(countryCode: string | undefined): string | SafeHtml {
    if (!countryCode || countryCode.length !== 2) {
      return '🚫'; // Return a default error emoji for invalid codes
    }

    const upper = countryCode.toUpperCase();

    // Unicode offset for regional indicator symbols
    const base = 127397;
    const codePoints = upper
      .split('')
      .map(char => base + char.charCodeAt(0));

    // On Windows, return a Twemoji image to ensure consistent rendering
    if (CountryFlagPipe.detectWindows()) {
      const hex = codePoints.map(cp => cp.toString(16)).join('-');
      const src = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${hex}.svg`;
      const html = `<img src="${src}" alt="${upper} flag" class="twemoji-flag" draggable="false" style="height:1em;width:auto;vertical-align:-0.15em;">`;
      return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    // Otherwise, return the native emoji string
    return String.fromCodePoint(...codePoints);
  }
}
