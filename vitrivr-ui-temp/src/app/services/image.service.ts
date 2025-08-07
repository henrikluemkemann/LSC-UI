import { Injectable } from '@angular/core';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root'
})
export class ImageService {

  private baseUrl = 'http://localhost:7070/api';

  constructor(
    private loggingService: LoggingService
  ) {
    this.loggingService.info('ImageService', 'Initialized with base URL', { baseUrl: this.baseUrl });
  }

  /**
   * Returns the direct URL to an image without fetching it.
   *
   * @param schema The schema name (e.g., 'sandbox').
   * @param exporter The exporter name (e.g., 'thumbnail').
   * @param retrievableId The ID of the image to retrieve.
   * @returns A string representing the direct URL to the image.
   */
  getImageUrl(schema: string, exporter: string, retrievableId: string): string {
    return `${this.baseUrl}/${schema}/fetch/${exporter}/${retrievableId}`;
  }
}
