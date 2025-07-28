import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageService } from '../services/image.service';
import { LoggingService } from '../services/logging.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {forkJoin} from 'rxjs';

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

interface ImageModel {
  url: string;
  id: string;
  error: boolean;
  timestamp?: string;
  location?: { latitude: number; longitude: number };
  isHovering: boolean;
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
  @Input() cachedImages: ImageModel[] | null = null;
  @Output() imagesLoaded = new EventEmitter<ImageModel[]>();

  images: ImageModel[] = [];
  loading = false;
  searchCriteriaSummary: string = '';

  showHighQuality = false;
  highQualityImageUrl: string | null = null;
  selectedImage: ImageModel | null = null;

  //path to placeholder image for failed loads
  private brokenImageUrl = '/assets/broken-image.png';

  // Store timeout ID for cleanup
  private timeoutId: number | null = null;

  constructor(
    private imageService: ImageService,
    private loggingService: LoggingService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.cachedImages) {
      // If we have cached images, use them and don't load.
      this.loggingService.info('GalleryViewComponent', `Loading ${this.cachedImages.length} images from cache.`);
      this.images = this.cachedImages;
      this.loading = false;
    } else if (changes['queryResults'] && this.queryResults) {
      // If there's no cache and new results arrive, load them.
      this.loggingService.info('GalleryViewComponent', 'Query results changed, loading new images.');
      this.loadImages();
    }

    if (changes['queryCriteria']) {
      this.updateCriteriaSummary();
    }
  }

  ngOnDestroy(): void {
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
   * Loads images based on the query results.
   * If loading gets stuck, abort after 30 seconds.
   */
  private loadImages(): void {
    this.loggingService.info('GalleryViewComponent', 'Starting to load images from query results');
    this.loading = true;
    this.images = []; // Clear current images

    const retrievableIds = this.extractRetrievableIds(this.queryResults);
    if (retrievableIds.length === 0) {
      this.loggingService.warn('GalleryViewComponent', 'No retrievable IDs found in query results');
      this.loading = false;
      this.imagesLoaded.emit([]);
      return;
    }

    let processedCount = 0;
    const totalToProcess = retrievableIds.length;

    // Set a timeout forb entire loading operation
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    this.timeoutId = window.setTimeout(() => {
      if (this.loading) {
        this.loggingService.warn('GalleryViewComponent', 'Image loading timeout reached.');
        this.loading = false;
        this.imagesLoaded.emit(this.images); // Emit whatever has been loaded
      }
    }, 30000); // 30-second timeout

    retrievableIds.forEach(id => {
      //forkJoin to fetch the image blob and its metadata in parallel
      const imageRequest = this.imageService.getImage('sandbox', 'thumbnail', id);
      const metadataRequest = this.imageService.getMetadata('sandbox', id);

      forkJoin({
        blob: imageRequest,
        metadata: metadataRequest
      }).subscribe({
        next: ({ blob, metadata }) => {
          if (blob) {
            // Both image and metadata were fetched successfully
            const url = this.imageService.createImageUrl(blob);
            this.images.push({
              url,
              id,
              error: false,
              timestamp: metadata.timestamp,
              location: metadata.coordinates,
              isHovering: false
            });
          } else {
            // The image blob was null, which is maybe a fetch failure
            this.images.push({ url: this.brokenImageUrl, id, error: true, isHovering: false });
          }
        },
        error: (err: any) => {
          this.loggingService.error('GalleryViewComponent', `An unexpected error occurred for ID ${id}`, err);
          this.images.push({ url: this.brokenImageUrl, id, error: true, isHovering: false });
        },
        complete: () => {
          // This block runs after next() or error()
          processedCount++;
          if (processedCount === totalToProcess) {
            this.loading = false;
            clearTimeout(this.timeoutId as number);
            this.imagesLoaded.emit(this.images); // All images processed, emit the final array
            this.loggingService.info('GalleryViewComponent', 'Finished loading all images and metadata.');
          }
        }
      });
    });
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

  /**
   * Handles the click event on an image in the gallery. Updates the selected image,
   * retrieves the high-quality version of the image, and prepares it for display.
   *
   * @param {ImageModel} image The image object that was clicked.
   */
  onImageClick(image: ImageModel): void {
    this.loggingService.info('GalleryViewComponent', `Image clicked, attempting to load high-quality for ID: ${image.id}`);
    this.selectedImage = image;
    this.imageService.getImage('sandbox', 'original', image.id).subscribe({ // I added a new exporter in the backend
      next: (blob) => {
        if (blob) {
          this.loggingService.info('GalleryViewComponent', `Successfully received blob for high-quality image ${image.id}`);
          this.highQualityImageUrl = this.imageService.createImageUrl(blob);
          this.showHighQuality = true;
        } else {
          this.loggingService.warn('GalleryViewComponent', `Received null blob for high-quality image ${image.id}`);
        }
      },
      error: (err) => {
        this.loggingService.error('GalleryViewComponent', `Error fetching high-quality image for ID: ${image.id}`, { error: err });
      }
    });
  }

  /**
   * Closes the high-quality view of the gallery component by performing necessary cleanup operations.
   * Resets the `showHighQuality` flag and revokes the object URL for the high-quality image if it exists.
   */
  closeHighQualityView(): void {
    this.loggingService.info('GalleryViewComponent', 'Closing high-quality view');
    this.showHighQuality = false;
    if (this.highQualityImageUrl) {
      URL.revokeObjectURL(this.highQualityImageUrl);
      this.highQualityImageUrl = null;
    }
    this.selectedImage = null;
  }

  /**
   * Generates the alt text for an image based on its state.
   * @param image The image object.
   * @returns The appropriate alt text string.
   */
  getAltText(image: ImageModel): string {
    if (image.error) {
      return `Failed to load image with ID: ${image.id}`;
    }
    return `Image with ID: ${image.id}`;
  }

  /**
   * Formats a timestamp into a readable date and time string.
   * If the timestamp is undefined, returns 'Unknown date'.
   *
   * @param {string | undefined} timestamp - The timestamp to format, or undefined if not provided.
   * @return {string} The formatted date and time string, or 'Unknown date' if the timestamp is undefined.
   */
  formatTimestamp(timestamp: string | undefined): string {
    if (!timestamp) {
      return 'Unknown date';
    }
    return new Date(timestamp).toLocaleString();
  }

}
