import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageService } from '../services/image.service';
import { LoggingService } from '../services/logging.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

/**
 * Represents an item in search results that may contain an ID in various formats
 */
interface ResultItem {
  id?: string;
  retrievableId?: string;
  retrievable?: { id: string };
  document?: { id: string };
}

/**
 * Represents the possible structures of search results from the backend
 */
interface SearchResults {
  // Different possible result structures
  content?: ResultItem[];
  results?: ResultItem[];
  items?: ResultItem[];
  retrievables?: (string | ResultItem)[];
}

@Component({
  selector: 'app-gallery-view',
  templateUrl: './gallery-view.html',
  styleUrls: ['./gallery-view.scss'],
  standalone: true,
  imports: [CommonModule, ProgressSpinnerModule]
})


export class GalleryViewComponent implements OnChanges, OnDestroy {
  @Input() queryResults: any;
  @Input() queryCriteria: any;

  images: { url: string; id: string; error: boolean }[] = [];
  loading = false;
  searchCriteriaSummary: string = '';

  //path to placeholder image for failed loads
  private brokenImageUrl = '/assets/broken-image.png';

  // Store timeout ID for cleanup
  private timeoutId: number | null = null;

  constructor(
    private imageService: ImageService,
    private loggingService: LoggingService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['queryResults'] && this.queryResults) {
      this.loggingService.info('GalleryViewComponent', 'Query results changed', {
        hasResults: !!this.queryResults
      });
      this.cleanupImages();
      this.loadImages();
    } else if (!this.queryResults) {
      this.cleanupImages();
    }

    if (changes['queryCriteria']) {
      this.updateCriteriaSummary();
    }
  }

  ngOnDestroy(): void {
    this.cleanupImages(); // Ensure cleanup when component is destroyed

    // Clear any active timeout
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private updateCriteriaSummary(): void {
    if (!this.queryCriteria) {
      this.searchCriteriaSummary = 'No search criteria applied.';
      return;
    }

    const { timeRange, spatialQuery } = this.queryCriteria;
    const parts: string[] = [];

    // format Time Range
    if (timeRange && timeRange.length === 2) {
      const start = new Date(timeRange[0]).toLocaleString();
      const end = new Date(timeRange[1]).toLocaleString();
      parts.push(`from ${start} to ${end}`);
    }

    // Format Spatial Query
    if (spatialQuery) {
      switch (spatialQuery.type) {
        case 'city':
          parts.push(`near the city of '${spatialQuery.data.name}'`);
          break;
        case 'circle':
          const radiusKm = (spatialQuery.data.radius / 1000).toFixed(2);
          const lat = spatialQuery.data.center.lat.toFixed(4);
          const lng = spatialQuery.data.center.lng.toFixed(4);
          parts.push(`within ${radiusKm} km of point (${lat}, ${lng})`);
          break;
        case 'bbox':
          parts.push('within a selected bounding box');
          break;
      }
    }

    if (parts.length > 0) {
      this.searchCriteriaSummary = `Searching for images ${parts.join(' and ')}.`;
    } else {
      this.searchCriteriaSummary = 'No specific search criteria applied, showing all results.';
    }
  }


  /**
   * Revokes all created object URLs.
   */
  private cleanupImages(): void {
    this.loggingService.info('GalleryViewComponent', `Cleaning up ${this.images.length} images`);

    this.images.forEach(image => {
      if (image.url && !image.error) {
        try {
          URL.revokeObjectURL(image.url);
        } catch (error) {
          this.loggingService.error('GalleryViewComponent', `Error revoking URL for image ${image.id}`, { error });
        }
      }
    });

    this.images = [];
  }

  /**
   * Loads images based on the query results.
   * If loading gets stuck, abort after 30 seconds.
   */
  private loadImages(): void {
    this.loggingService.info('GalleryViewComponent', 'Starting to load images from query results');
    this.loading = true;

    try {
      const retrievableIds = this.extractRetrievableIds(this.queryResults);

      this.loggingService.info('GalleryViewComponent', `Extracted ${retrievableIds.length} retrievable IDs`);

      if (retrievableIds.length === 0) {
        this.loggingService.warn('GalleryViewComponent', 'No retrievable IDs found in query results');
        this.loading = false;
        return;
      }

      let processedCount = 0;
      const startTime = Date.now();

      // Set a timeout to check if all images have been processed
      if (this.timeoutId !== null) clearTimeout(this.timeoutId);

      this.timeoutId = window.setTimeout(() => {
        if (processedCount < retrievableIds.length) {
          this.loggingService.warn('GalleryViewComponent', 'Image loading timeout reached', {
            processed: processedCount,
            total: retrievableIds.length,
          });
          this.loading = false;
        }
      }, 30000); // 30 second timeout

      retrievableIds.forEach(id => {
        this.imageService.getImage('sandbox', 'thumbnail', id).subscribe({
          next: (blob) => {
            if (blob) {
              const url = this.imageService.createImageUrl(blob);
              this.images.push({ url, id, error: false });
            } else {
              this.images.push({ url: this.brokenImageUrl, id, error: true });
            }
            if (++processedCount === retrievableIds.length) this.loading = false;
          },
          error: (err) => {
            this.images.push({ url: this.brokenImageUrl, id, error: true });
            if (++processedCount === retrievableIds.length) this.loading = false;
          }
        });
      });

    } catch (error) {
      this.loggingService.error('GalleryViewComponent', 'Error in loadImages method', { error });
      this.loading = false;
    }
  }


  /**
   * Extracts retrievable IDs from the query results.
   */
  private extractRetrievableIds(results: any): string[] {
    if (!results) return [];

    //different result structures
    const items = results.content || results.results || results.items || results.retrievables;
    if (items && Array.isArray(items)) {
      return items.map((item: any) =>
        typeof item === 'string' ? item : (item.id || item.retrievableId || (item.retrievable && item.retrievable.id) || (item.document && item.document.id))
      ).filter((id: any): id is string => !!id);
    }

    if (Array.isArray(results)) {
      return results.map((item: any) =>
        item.id || item.retrievableId || (item.retrievable && item.retrievable.id) || (item.document && item.document.id)
      ).filter((id: any): id is string => !!id);
    }

    this.loggingService.error('GalleryViewComponent', 'Could not find retrievable IDs in any known result structure', {
      availableProperties: Object.keys(results)
    });
    return [];
  }
}
