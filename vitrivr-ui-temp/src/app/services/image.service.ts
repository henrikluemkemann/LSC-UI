import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, of, tap, map, finalize } from 'rxjs';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root'
})
export class ImageService {

  private baseUrl = 'http://localhost:7070/api';

  // Counters for tracking image fetch operations (for logging)
  private fetchCounter = {
    total: 0,
    success: 0,
    failure: 0,
    inProgress: 0
  };

  // Flag to track if summary was already logged
  private hasSummaryLogged = false;

  constructor(
    private http: HttpClient,
    private loggingService: LoggingService
  ) {
    this.loggingService.info('ImageService', 'Initialized with base URL', { baseUrl: this.baseUrl });
  }

  /**
   * Fetches an image from the backend.
   * @param schema The schema name (e.g., 'sandbox').
   * @param exporter The exporter name (e.g., 'thumbnail').
   * @param retrievableId The ID of the image to retrieve.
   * @returns An Observable that resolves to a Blob or null if an error occurs.
   */
  getImage(schema: string, exporter: string, retrievableId: string): Observable<Blob | null> {
    const url = `${this.baseUrl}/${schema}/fetch/${exporter}/${retrievableId}`;

    this.fetchCounter.total++;
    this.fetchCounter.inProgress++;

    if (this.fetchCounter.inProgress === 1) {this.hasSummaryLogged = false;}

    const headers = new HttpHeaders({
      'Accept': 'image/*'
    });

    return this.http.get(url, {
      responseType: 'blob',
      headers,
      observe: 'response'
    }).pipe(
      tap(response => {
        if (response && response.body) {
          this.fetchCounter.success++;
        } else {
          this.fetchCounter.failure++;
        }
      }),

      // Map the full response to just the blob body
      map(response => response.body),
      catchError(err => {
        this.fetchCounter.failure++;
        if (err.status === 404) {
          this.loggingService.warn('ImageService', `Image with ID ${retrievableId} not found (404)`);
        } else {
          this.loggingService.error('ImageService', `Failed to fetch image with ID ${retrievableId}`, {
            status: err.status,
            statusText: err.statusText || 'Unknown error'
          });
        }

        return of(null);
      }),
      finalize(() => {
        this.fetchCounter.inProgress--;

        if (this.fetchCounter.inProgress === 0 && !this.hasSummaryLogged) {
          this.hasSummaryLogged = true;

          if (this.fetchCounter.failure === 0) {
            this.loggingService.info('ImageService', `Successfully fetched all ${this.fetchCounter.success} images`);
          } else {
            this.loggingService.warn('ImageService', `Fetched ${this.fetchCounter.success} images with ${this.fetchCounter.failure} failures (total: ${this.fetchCounter.total})`);
          }

          // Reset counters for next batch
          this.fetchCounter.total = 0;
          this.fetchCounter.success = 0;
          this.fetchCounter.failure = 0;
        }
      })
    );
  }

  /**
   * Creates a safe URL from a Blob to be used in <img> tags.
   * @param blob The image blob.
   * @returns A string representing the object URL.
   */
  createImageUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
  }
}
