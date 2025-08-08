import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'countryFlag',
  standalone: true
})
export class CountryFlagPipe implements PipeTransform {
  /**
   * Transforms a two-letter ISO country code into a flag emoji.
   * @param countryCode The two-letter country code (e.g., "US", "CH").
   * @returns The corresponding flag emoji string.
   */
  transform(countryCode: string | undefined): string {
    if (!countryCode || countryCode.length !== 2) {
      return '🚫'; // Return a default error emoji for invalid codes
    }

    // Unicode offset for regional indicator symbols
    const base = 127397;
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => base + char.charCodeAt(0));

    return String.fromCodePoint(...codePoints);
  }
}
