import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageService } from '../services/image.service';
import { LoggingService } from '../services/logging.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

/**
 * Represents an item in search results that may contain an ID in various formats
 */
interface ResultItem {
  id?: string;
  properties?: {
    'postgiscoordinates_postgiscoordinates'?: string;
    'lsctimestamp_minuteIdTimestamp'?: string;
  }
}

/**
 * Represents the possible structures of search results from the backend
 */
interface SearchResults {
  // Different possible result structures
  retrievables?: ResultItem[];
}

interface ImageModel {
  url: string;
  id: string;
  error: boolean;
  timestamp?: string;
  location?: { latitude: number; longitude: number };
  isHovering: boolean;
}

const IMAGE_DISPLAY_LIMIT = 1000;

@Component({
  selector: 'app-gallery-view',
  templateUrl: './gallery-view.html',
  styleUrls: ['./gallery-view.scss'],
  standalone: true,
  imports: [CommonModule, ProgressSpinnerModule, ButtonModule, TooltipModule]
})


export class GalleryViewComponent implements OnChanges, OnDestroy {
  @Input() queryResults: any;
  @Input() queryCriteria: any;
  @Input() cachedImages: ImageModel[] | null = null;
  @Input() loading = false;
  @Output() imagesLoaded = new EventEmitter<ImageModel[]>();

  images: ImageModel[] = [];
  searchCriteriaSummary: string = '';
  totalResults = 0;
  displayCount = 0;

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
    if (changes['loading'] && changes['loading'].currentValue) {
      this.images = [];
    }
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

    const resultItems = this.extractResultItems(this.queryResults);
    this.totalResults = resultItems.length;

    // Limit the number of images to be loaded for performance reasons
    const itemsToLoad = resultItems.slice(0, IMAGE_DISPLAY_LIMIT);
    this.displayCount = itemsToLoad.length;


    if (itemsToLoad.length === 0) {
      this.loggingService.warn('GalleryViewComponent', 'No retrievable IDs found in query results');
      this.loading = false;
      this.imagesLoaded.emit([]);
      return;
    }

    let processedCount = 0;
    const totalToProcess = itemsToLoad.length;

    // Set a timeout forb entire loading operation
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    this.timeoutId = window.setTimeout(() => {
      if (this.loading) {
        this.loggingService.warn('GalleryViewComponent', 'Image loading timeout reached.');
        this.loading = false;
        this.imagesLoaded.emit(this.images); // Emit whatever has been loaded
      }
    }, 30000); // 30-second timeout

    itemsToLoad.forEach(item => {
      if (!item.id) {
        processedCount++;
        return;
      }

      const imageRequest = this.imageService.getImage('sandbox', 'thumbnail', item.id);

      const metadata = {
        timestamp: this.parseTimestamp(item.properties?.['lsctimestamp_minuteIdTimestamp']),
        coordinates: this.parseCoordinates(item.properties?.['postgiscoordinates_postgiscoordinates'])
      };

      //this.loggingService.info('GalleryViewComponent', `Successfully parsed metadata for ID ${item.id}`, metadata);

      imageRequest.subscribe({
        next: (blob) => {
          if (blob) {
            // image was fetched successfully
            const url = this.imageService.createImageUrl(blob);
            this.images.push({
              url,
              id: item.id!,
              error: false,
              timestamp: metadata.timestamp,
              location: metadata.coordinates,
              isHovering: false
            });
          } else {
            // The image blob was null, which is maybe a fetch failure
            this.images.push({ url: this.brokenImageUrl, id: item.id!, error: true, isHovering: false });
          }
        },
        error: (err: any) => {
          this.loggingService.error('GalleryViewComponent', `An unexpected error occurred for ID ${item.id}`, err);
          this.images.push({ url: this.brokenImageUrl, id: item.id!, error: true, isHovering: false });
        },
        complete: () => {
          // This block runs after next() or error()
          processedCount++;
          if (processedCount === totalToProcess) {
            this.loading = false;
            clearTimeout(this.timeoutId as number);
            this.sortImages('desc'); // Default sort: newest first
            this.imagesLoaded.emit(this.images); // All images processed, emit the final array
            this.loggingService.info('GalleryViewComponent', 'Finished loading all images and metadata.');
          }
        }
      });
    });
  }

  /**
   * Parses a timestamp string and extracts the value enclosed in the 'DateTime(value=...)' format from the query results.
   *
   * @param {string | undefined} timestampStr The timestamp string to parse. This is expected to be in the format 'DateTime(value=...)' or undefined.
   * @return {string | undefined} The extracted timestamp value as a string if parsing is successful, or undefined if the input is undefined or not in the expected format.
   */
  private parseTimestamp(timestampStr: string | undefined): string | undefined {
    if (!timestampStr) return undefined;
    const match = timestampStr.match(/DateTime\(value=(.*)\)/);
    return match ? match[1] : undefined;
  }

  /**
   * Parses a coordinate string and extracts latitude and longitude.
   *
   * @param coordStr The coordinate string to be parsed. Expected in a specific hexadecimal format. If undefined, the method returns undefined.
   * @return An object containing latitude and longitude as numbers if parsing is successful, or undefined if the input is invalid or undefined.
   */
  private parseCoordinates(coordStr: string | undefined): { latitude: number; longitude: number } | undefined {
    if (!coordStr) return undefined;
    const match = coordStr.match(/0101000020E6100000([0-9A-F]{16})([0-9A-F]{16})/);
    if (match) {
      const lonHex = match[1];
      const latHex = match[2];
      const lon = this.hexToDouble(lonHex);
      const lat = this.hexToDouble(latHex);
      return { latitude: lat, longitude: lon };
    }
    return undefined;
  }

  /**
   * Converts a hexadecimal string representation of a double-precision
   * floating-point number to its numeric value.
   *
   * @param hex The hexadecimal string to be converted. Must represent
   *            a valid 64-bit floating-point number in little-endian format.
   * @return The double-precision floating-point number represented by the input hexadecimal string.
   */
  private hexToDouble(hex: string): number {
    const buffer = new ArrayBuffer(8);
    const dataView = new DataView(buffer);
    for (let i = 0; i < 8; i++) {
      dataView.setUint8(i, parseInt(hex.substring(i * 2, i * 2 + 2), 16));
    }
    return dataView.getFloat64(0, true); // Little-endian
  }


  /**
   * Extracts retrievable items from the query results.
   */
  private extractResultItems(results: SearchResults | undefined): ResultItem[] {
    if (!results || !results.retrievables || !Array.isArray(results.retrievables)) {
      this.loggingService.error('GalleryViewComponent', 'Could not find retrievable items in the expected structure', {
        availableProperties: results ? Object.keys(results) : 'undefined'
      });
      return [];
    }
    return results.retrievables;
  }

  /**
   * Sorts the images by timestamp.
   * @param direction The sort direction: 'asc' for ascending, 'desc' for descending.
   */
  sortImages(direction: 'asc' | 'desc'): void {
    this.images.sort((a, b) => {
      // Push images without a timestamp to the end
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;

      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();

      return direction === 'asc' ? dateA - dateB : dateB - dateA;
    });
    this.loggingService.info('GalleryViewComponent', `Images sorted by date ${direction === 'asc' ? 'ascending' : 'descending'}.`);
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
