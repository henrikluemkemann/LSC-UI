import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges, ViewChild, AfterViewInit, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageService } from '../services/image.service';
import { LoggingService } from '../services/logging.service';
import { GeocodingService, GeocodingResult } from '../services/geocoding.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Subscription } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { CountryFlagPipe } from '../pipes/country-flag.pipe';

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
  locationName?: string; // for reverse geocoding
  country?: string; // ISO country code
  subdivision1?: string; // State/province
  subdivision2?: string; // County/district
  isHovering: boolean;
}

const IMAGE_DISPLAY_LIMIT = 100000;
const GRID_COLUMNS = 4;

@Component({
  selector: 'app-gallery-view',
  templateUrl: './gallery-view.html',
  styleUrls: ['./gallery-view.scss'],
  standalone: true,
  imports: [CommonModule, ProgressSpinnerModule, ButtonModule, TooltipModule, ScrollingModule, CountryFlagPipe]
})


export class GalleryViewComponent implements OnChanges, OnDestroy, AfterViewInit {
  @ViewChild(CdkVirtualScrollViewport) virtualScroll!: CdkVirtualScrollViewport;
  @ViewChild('galleryContainer') galleryContainer!: ElementRef;
  @Input() queryResults: any;
  @Input() queryCriteria: any;
  @Input() loading = false;
  @Output() imagesLoaded = new EventEmitter<ImageModel[]>();

  images: ImageModel[] = [];
  imageRows: ImageModel[][] = [];
  searchCriteriaSummary: string = '';
  totalResults = 0;
  displayCount = 0;

  showHighQuality = false;
  highQualityImageUrl: string | null = null;
  selectedImage: ImageModel | null = null;
  currentSortDirection: 'asc' | 'desc' = 'desc';

  //path to placeholder image for failed loads
  private brokenImageUrl = '/assets/broken-image.png';

  // Store timeout ID for cleanup
  private timeoutId: number | null = null;
  private scrollTimeoutId: number | null = null;

  // Store subscriptions for cleanup
  private subscriptions: Subscription[] = [];

  constructor(
    private imageService: ImageService,
    private loggingService: LoggingService,
    private geocodingService: GeocodingService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['loading'] && changes['loading'].currentValue) {
      this.images = [];
      this.imageRows = [];
    }

    // Always load images from the backend when query results change
    // Browser caching should make this efficient by not re-downloading unchanged images
    if (changes['queryResults'] && this.queryResults) {
      this.loggingService.info('GalleryViewComponent', 'Query results changed, loading images.');
      this.loadImages();
    }

    if (changes['queryCriteria']) {
      this.updateCriteriaSummary();
    }
  }

  ngAfterViewInit(): void {
    // Set up scroll detection once the view is initialized
    if (this.virtualScroll) {
      // Add a subscription to detect when scrolling starts
      this.subscriptions.push(
        this.virtualScroll.elementScrolled().pipe(
          throttleTime(100) // Limitfrequency of scroll events
        ).subscribe(() => {
          // Remove the no-scroll class during scrolling
          this.galleryContainer.nativeElement.classList.remove('no-scroll');

          // Clear any existing timeout
          if (this.scrollTimeoutId !== null) {
            clearTimeout(this.scrollTimeoutId);
          }

          // Set a timeout to add the no-scroll class back after scrolling stops
          this.scrollTimeoutId = window.setTimeout(() => {
            this.galleryContainer.nativeElement.classList.add('no-scroll');
            this.scrollTimeoutId = null;
          }, 200);
        })
      );
    }
  }

  ngOnDestroy(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.scrollTimeoutId !== null) {
      clearTimeout(this.scrollTimeoutId);
      this.scrollTimeoutId = null;
    }

    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private chunkImagesIntoRows(images: ImageModel[]): void {
    this.imageRows = [];
    for (let i = 0; i < images.length; i += GRID_COLUMNS) {
      this.imageRows.push(images.slice(i, i + GRID_COLUMNS));
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
      // Check for the displayData property first
      if (spatialQuery.displayData && spatialQuery.displayData.locationName) {
        const name = spatialQuery.displayData.locationName;
        const subdivision2 = spatialQuery.displayData.subdivision2;
        const subdivision1 = spatialQuery.displayData.subdivision1;
        const country = spatialQuery.displayData.countryCode;

        // Build location string with available subdivisions
        let locationStr = name;
        if (subdivision2) {
          locationStr += `, ${subdivision2}`;
        }
        if (subdivision1) {
          locationStr += `, ${subdivision1}`;
        }
        locationStr += ` (${country})`;

        const radiusKm = (spatialQuery.data.radius / 1000).toFixed(2);
        parts.push(`within ${radiusKm} km of ${locationStr}`);
      } else if (spatialQuery.type === 'circle') {
        // Fallback to coordinates if no display name is available
        const radiusKm = (spatialQuery.data.radius / 1000).toFixed(2);
        const lat = spatialQuery.data.center.lat.toFixed(4);
        const lng = spatialQuery.data.center.lng.toFixed(4);
        parts.push(`within ${radiusKm} km of point (${lat}, ${lng})`);
      } else if (spatialQuery.type === 'bbox') {
        parts.push('within a selected bounding box');
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

      const metadata = {
        timestamp: this.parseTimestamp(item.properties?.['lsctimestamp_minuteIdTimestamp']),
        coordinates: this.parseCoordinates(item.properties?.['postgiscoordinates_postgiscoordinates'])
      };

      // Get direct URL to the image instead of fetching the blob (thanks Ralph for the tip :) )
      const url = this.imageService.getImageUrl('sandbox', 'thumbnail', item.id);

      // Add the image to the array with the direct URL
      this.images.push({
        url,
        id: item.id!,
        error: false,
        timestamp: metadata.timestamp,
        location: metadata.coordinates,
        isHovering: false
      });

      // Update processed count
      processedCount++;
      if (processedCount === totalToProcess) {
        this.loading = false;
        clearTimeout(this.timeoutId as number);
        this.sortImages('desc'); // Default sort: newest first
        this.imagesLoaded.emit(this.images); // All images processed, emit the final array
        this.loggingService.info('GalleryViewComponent', 'Finished loading all images and metadata.');
      }
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
    this.currentSortDirection = direction;
    this.images.sort((a, b) => {
      // Push images without a timestamp to the end
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return direction === 'asc' ? dateA - dateB : dateB - dateA;
    });
    this.chunkImagesIntoRows(this.images); // Re-chunk the sorted images
    this.loggingService.info('GalleryViewComponent', `Images sorted by date ${direction === 'asc' ? 'ascending' : 'descending'}.`);
  }


  /**
   * Handles the click event on an image in the gallery. Updates the selected image,
   * gets the direct URL to the high-quality version of the image, and prepares it for display.
   * Also performs reverse geocoding to get the location name if coordinates are available.
   *
   * @param {ImageModel} image The image object that was clicked.
   */
  onImageClick(image: ImageModel): void {
    this.loggingService.info('GalleryViewComponent', `Image clicked, preparing high-quality view for ID: ${image.id}`);
    this.selectedImage = image;

    // Get direct URL to the high-quality image
    this.highQualityImageUrl = this.imageService.getImageUrl('sandbox', 'original', image.id);
    this.showHighQuality = true;

    // Perform reverse geocoding if location coordinates are available
    if (image.location && !image.locationName) {
      this.geocodingService.waitForLoad().subscribe(loaded => {
        if (loaded && image.location) {
          const result = this.geocodingService.findNearestCity(
            image.location.latitude,
            image.location.longitude
          );

          if (result) {
            // Update the image model with the location name, country, and subdivisions
            image.locationName = result.city.name;
            image.country = result.city.country ?? 'N/A';
            image.subdivision1 = result.city.subdivision1 ?? 'N/A';
            image.subdivision2 = result.city.subdivision2 ?? 'N/A';

            // If this is the selected image, update the reference
            if (this.selectedImage && this.selectedImage.id === image.id) {
              this.selectedImage = { ...image };
            }

            this.loggingService.info('GalleryViewComponent', `Reverse geocoded location for ${image.id}`, {
              coordinates: `${image.location.latitude}, ${image.location.longitude}`,
              locationName: image.locationName,
              country: image.country,
              subdivision1: image.subdivision1,
              subdivision2: image.subdivision2,
              distance: result.distance
            });
          }
        }
      });
    }

    this.loggingService.info('GalleryViewComponent', `Set high-quality image URL for ${image.id}`);
  }

  /**
   * Closes the high-quality view of the gallery component by performing necessary cleanup operations.
   * Resets the `showHighQuality` flag and clears the high-quality image URL.
   */
  closeHighQualityView(): void {
    this.loggingService.info('GalleryViewComponent', 'Closing high-quality view');
    this.showHighQuality = false;
    this.highQualityImageUrl = null;
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

  /**
   * Track function for the virtual scroll to optimize rendering performance.
   * This helps Angular identify which rows have changed and only re-render those.
   *
   * @param index The index of the row in the imageRows array
   * @param row The row of images
   * @returns The index as a unique identifier for the row
   */
  trackByRowIndex(index: number, row: ImageModel[]): number {
    return index;
  }

  /**
   * Track function for the images within a row to optimize rendering performance.
   * This helps Angular identify which images have changed and only re-render those.
   *
   * @param index The index of the image in the row
   * @param image The image model
   * @returns The image ID as a unique identifier for the image
   */
  trackByImageId(index: number, image: ImageModel): string {
    return image.id;
  }
}
