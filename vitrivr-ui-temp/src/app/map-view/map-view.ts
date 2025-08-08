import {Component, AfterViewInit, OnDestroy, ElementRef, HostListener, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef} from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';
import { MapDrawingService } from '../services/map-drawing.service';
import { MapLayerService, MapLayer } from '../services/map-layer.service';
import { LoggingService } from '../services/logging.service';
import { ImageService } from '../services/image.service';
import { Subscription } from 'rxjs';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import {ProgressSpinnerModule} from 'primeng/progressspinner';
import { CommonModule } from '@angular/common';

// Add leaflet.markercluster typings
declare module 'leaflet' {
  interface MarkerClusterGroupOptions extends L.LayerOptions {
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    spiderfyOnMaxZoom?: boolean;
    removeOutsideVisibleBounds?: boolean;
  }

  interface MarkerClusterGroup extends L.FeatureGroup {
    addLayer(layer: L.Layer): this;
    removeLayer(layer: L.Layer): this;
    addLayers(layers: L.Layer[]): this;
    clearLayers(): this;
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}


/**
 * Interface representing the state of the map
 *
 * This interface is used to save and restore the map state when switching views,
 * ensuring that the user's map position, zoom level, and any drawn circles are preserved.
 */
export interface MapState {
  /** The center coordinates of the map */
  center: L.LatLng;

  /** The zoom level of the map */
  zoom: number;

  /** Information about any circle drawn on the map, or null if no circle is present */
  circle: { center: L.LatLng; radius: number } | null;
}

/**
 * A local interface for image data with location, to avoid complex imports.
 */
interface ImageModel {
  id: string;
  url: string;
  error: boolean;
  isHovering: boolean;
  timestamp?: string;
  location?: { latitude: number; longitude: number };
}

/**
 * Component for displaying and interacting with the map
 *
 * This component uses Leaflet to render an interactive map that allows users to:
 * - Navigate and zoom around the map
 * - Draw circles for spatial searches
 * - View search results in clusters
 *
 * It communicates with other components through the MapDrawingService and
 * emits map state changes to the parent component.
 */
@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [LeafletModule, ToastModule, ProgressSpinnerModule, CommonModule],
  templateUrl: './map-view.html',
  styleUrls: ['./map-view.scss'],
  providers: [MessageService]
})
export class MapViewComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {

  /**
   * Initial state to apply to the map when it's created
   * This allows the map state to be restored when switching back to the map view
   */
  @Input() initialMapState: MapState | null = null;


  /**
   * The query results containing image data to display on the map.
   * This is used to extract image locations directly.
   */
  @Input() queryResults: any;

  /**
   * Event emitter for map state changes
   * Emits the current map state whenever the map is moved, zoomed, or a circle is drawn
   */
  @Output() mapStateChange = new EventEmitter<MapState>();

  /**
   * Host listener for the Escape key
   * Exits drawing mode when the user presses the Escape key
   *
   * @param event The keyboard event
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    if (this.showHighQualityViewer) {
      this.closeHighQualityViewer();
    } else {
      this.mapDrawingService.exitDrawingMode();
    }
  }

  /**
   * Reference to the Leaflet map instance
   * This is set in the onMapReady method when the map is initialized
   */
  map: L.Map | undefined;

  /**
   * Configuration options for the Leaflet map
   * Includes the tile layer, initial zoom level, and center coordinates
   */
  options: L.MapOptions = {
    layers: [],
    zoom: 10,
    maxZoom: 18,
    center: L.latLng(53.3498, -6.2603), // Dublin coordinates for now since LSC dataset has many images there
    zoomAnimation: true
  };

  private tileLayer: L.TileLayer | null = null;

  /**
   * Layer group to hold the markers for image locations.
   */
  private markersLayer: L.MarkerClusterGroup;

  /**
   * A simple, CSS-based marker icon.
   */
  private cssMarker: L.DivIcon;

  /**
   * Flag indicating whether circle drawing mode is active
   */
  drawingCircle: boolean = false;

  /**
   * Reference to the circle layer on the map
   * This is set when a circle is drawn and cleared when it's removed
   */
  circleLayer: L.Circle | null = null;

  /**
   * Flag indicating whether box drawing mode is active
   */
  drawingBox: boolean = false;

  /**
   * Reference to the rectangle layer on the map (finalized box)
   */
  rectangleLayer: L.Rectangle | null = null;

  /**
   * Temporary preview rectangle while picking the second corner
   */
  private boxPreviewLayer: L.Rectangle | null = null;

  /**
   * Stores the first corner clicked when drawing a box
   */
  private boxStartPoint: L.LatLng | null = null;

  /**
   * Flag controlling the visibility of the high-quality image viewer modal
   */
  showHighQualityViewer = false;

  /**
   * URL of the high-quality image to display in the viewer
   */
  highQualityImageUrl: string | null = null;

  /**
   * Collection of RxJS subscriptions to be cleaned up on component destruction
   */
  private subscriptions: Subscription[] = [];

  /**
   * Reference to the click handler function for drawing circles
   * Stored so it can be removed when drawing mode is deactivated
   */
  private drawClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;

  /**
   * Handlers for box drawing interactions (click and mousemove)
   */
  private boxClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
  private boxMouseMoveHandler: ((e: L.LeafletMouseEvent) => void) | null = null;

  /**
   * Flag to control the visibility of the map loading spinner.
   * Defaults to true to show the spinner on initialization.
   */
  isMapLoading: boolean = true;

  /**
   * Constructor for the MapViewComponent
   *
   * @param mapDrawingService Service for managing map drawing operations
   * @param elementRef Reference to the component's DOM element
   * @param loggingService Service for logging status changes
   * @param mapLayerService Service for different map representations
   * @param imageService
   * @param cdr
   */
  constructor(
    private mapDrawingService: MapDrawingService,
    private elementRef: ElementRef,
    private loggingService: LoggingService,
    private mapLayerService: MapLayerService,
    private imageService: ImageService,
    private cdr: ChangeDetectorRef
  ) {
    this.markersLayer = L.markerClusterGroup();

    this.cssMarker = L.divIcon({
      html: `<div style="background-color: #4285F4; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.5);"></div>`,
      className: 'css-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  /**
   * Angular lifecycle hook that runs when the component is initialized
   */
  ngOnInit(): void {}

  /**
   * Angular lifecycle hook that handles input changes.
   *
   * @param changes Object containing the changed properties.
   */
  ngOnChanges(changes: SimpleChanges) {
    // Check if we have a map and queryResults has changed
    if (this.map && changes['queryResults']) {
      this.updateMarkers();
    }
  }

  /**
   * Angular lifecycle hook that runs after the view is initialized
   *
   * This method sets up subscriptions to the MapDrawingService observables to:
   * * - drawCircle → Activates circle drawing mode when triggered.
   *  * - circleData → Updates the currently drawn circle when its center or radius changes.
   *  * - drawBox → Activates rectangle drawing mode when triggered.
   *  * - boxData → Updates the currently drawn rectangle when its coordinates change.
   *  * - exitDrawingMode → Deactivates both circle and rectangle drawing modes without clearing shapes.
   *  * - cancelDrawing → Clears all drawn shapes and deactivates all drawing modes.
   *  *
   */
  ngAfterViewInit(): void {
    this.subscriptions.push(
      this.mapDrawingService.drawCircle$.subscribe(() => this.activateCircleDrawingMode()),
      this.mapDrawingService.circleData$.subscribe(data => this.updateCircle(data.center, data.radius)),
      this.mapDrawingService.drawBox$.subscribe(() => this.activateBoxDrawingMode()),
      this.mapDrawingService.boxData$.subscribe(data => this.updateRectangle(data.northEast, data.southWest)),
      this.mapDrawingService.exitDrawingMode$.subscribe(() => {
        this.deactivateCircleDrawingMode();
        this.deactivateBoxDrawingMode();
      }),
      this.mapDrawingService.cancelDrawing$.subscribe(() => {
        this.clearAllDrawings();
        this.deactivateCircleDrawingMode();
        this.deactivateBoxDrawingMode();
      })
    );
  }

  /**
   * Handler for when the Leaflet map is ready
   *
   * This method:
   * 1. Stores the map instance for later use
   * 2. Sets up event listeners for map movement and zoom changes
   * 3. Restores any circle that was present in the initial map state
   *
   * @param map The initialized Leaflet map instance
   */
  onMapReady(map: L.Map) {
    this.map = map;
    this.markersLayer.addTo(this.map);
    // Load map state twice to avoid weird animation from happening (I didn't find a cleaner fix)
    if (this.initialMapState) {
      this.map?.setView(this.initialMapState.center, this.initialMapState.zoom);
    }

    setTimeout(() => {
      this.map?.invalidateSize();

      if (this.initialMapState) {
        this.map?.setView(this.initialMapState.center, this.initialMapState.zoom);
      }
      this.updateMarkers();
      this.isMapLoading = false;
    }, 500);

    // Subscribe to map layer changes
    this.subscriptions.push(
      this.mapLayerService.selectedLayer$.subscribe(layer => {
        this.updateTileLayer(layer);
      })
    );

    this.map.on('moveend', this.onMapMove.bind(this));
    this.map.on('zoomend', this.onMapMove.bind(this));

    // Restore previously stored shape with priority: box (persisted), else circle (persisted), else initial map state's circle
    const persistedBox = this.mapDrawingService.currentBoxData.getValue();
    const persistedCircle = this.mapDrawingService.currentCircleData.getValue();
    if (persistedBox) {
      this.updateRectangle(persistedBox.northEast, persistedBox.southWest);
    } else if (persistedCircle) {
      this.updateCircle(persistedCircle.center, persistedCircle.radius);
    } else if (this.initialMapState?.circle) {
      this.updateCircle(this.initialMapState.circle.center, this.initialMapState.circle.radius);
    }
  }

  /**
   * Updates the markers on the map based on image data extracted from the `queryResults` input.
   */
  private updateMarkers(): void {
    if (!this.map) return;

    this.markersLayer.clearLayers();

    // Extract images from queryResults
    const images = this.extractImagesFromQueryResults();

    if (images && images.length > 0) {
      this.loggingService.info('MapViewComponent', `Updating markers for ${images.length} results.`);
      const markersToAdd: L.Marker[] = [];

      images.forEach(image => {
        if (image.location && image.location.latitude && image.location.longitude) {
          const marker = L.marker([image.location.latitude, image.location.longitude], { icon: this.cssMarker });

          const popupContent = `
            <div style="text-align: center;">
                <img src="${image.url}" alt="ID: ${image.id}" style="width:350px; height: auto; display: block; margin-bottom: 5px;">
                <div style="font-size: 12px;">
                    <strong>Date:</strong> ${image.timestamp ? new Date(image.timestamp).toLocaleString() : 'N/A'}<br>
                    <strong>Coordinates:</strong> ${image.location.latitude.toFixed(4)}, ${image.location.longitude.toFixed(4)}
                </div>
            </div>
          `;
          marker.bindPopup(popupContent, {
            minWidth: 350
          });

          marker.on('mouseover', () => {
            marker.openPopup();
          });
          marker.on('mouseout', () => {
            marker.closePopup();
          });
          marker.on('click', () => {
            this.openHighQualityViewer(image);
          });

          markersToAdd.push(marker);
        }
      });
      this.markersLayer.addLayers(markersToAdd);
      this.loggingService.info('MapViewComponent', `Added ${markersToAdd.length} markers to the map cluster.`);
    }
  }

  /**
   * Extracts image data from query results and converts it to ImageModel objects.
   * @returns An array of ImageModel objects with location data.
   */
  private extractImagesFromQueryResults(): ImageModel[] {
    if (!this.queryResults) return [];

    const resultItems = this.extractResultItems(this.queryResults);
    const images: ImageModel[] = [];

    resultItems.forEach(item => {
      if (!item.id) return;

      const metadata = {
        timestamp: this.parseTimestamp(item.properties?.['lsctimestamp_minuteIdTimestamp']),
        coordinates: this.parseCoordinates(item.properties?.['postgiscoordinates_postgiscoordinates'])
      };

      // Only add images that have location data
      if (metadata.coordinates) {
        const url = this.imageService.getImageUrl('sandbox', 'thumbnail', item.id);

        images.push({
          url,
          id: item.id,
          error: false,
          timestamp: metadata.timestamp,
          location: metadata.coordinates,
          isHovering: false
        });
      }
    });

    return images;
  }

  /**
   * Extracts retrievable items from the query results.
   */
  private extractResultItems(results: any): any[] {
    if (!results || !results.retrievables || !Array.isArray(results.retrievables)) {
      this.loggingService.error('MapViewComponent', 'Could not find retrievable items in the expected structure', {
        availableProperties: results ? Object.keys(results) : 'undefined'
      });
      return [];
    }
    return results.retrievables;
  }

  /**
   * Parses a timestamp string and extracts the value enclosed in the 'DateTime(value=...)' format.
   */
  private parseTimestamp(timestampStr: string | undefined): string | undefined {
    if (!timestampStr) return undefined;
    const match = timestampStr.match(/DateTime\(value=(.*)\)/);
    return match ? match[1] : undefined;
  }

  /**
   * Parses a coordinate string and extracts latitude and longitude.
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
   * Opens the high-quality image viewer with the specified image.
   *
   * @param {ImageModel} image The image model containing the data for the image to be viewed.
   */
  private openHighQualityViewer(image: ImageModel): void {
    // Get direct URL to the high-quality image
    this.highQualityImageUrl = this.imageService.getImageUrl('sandbox', 'original', image.id);
    this.showHighQualityViewer = true;
    this.cdr.detectChanges();
  }

  /**
   * Closes the high-quality image viewer
   *
   * This method:
   * 1. Resets the high-quality image URL to null
   * 2. Hides the viewer by setting showHighQualityViewer to false
   * 3. Triggers change detection to update the UI
   */
  closeHighQualityViewer(): void {
    this.highQualityImageUrl = null;
    this.showHighQualityViewer = false;
    this.cdr.detectChanges();
  }


  /**
   * Updates the tile layer on the map
   *
   * This method:
   * 1. Removes the existing tile layer if one exists
   * 2. Creates and adds a new tile layer with the specified URL and attribution
   *
   * @param layer The new map layer configuration to apply
   */
  updateTileLayer(layer: MapLayer): void {
    if (!this.map) return;

    // Removes the old tile layer if it exists
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    // Create and add the new tile layer
    this.tileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution
    }).addTo(this.map);

    // this.loggingService.info('MapViewComponent', 'Tile layer updated', { layerName: layer.name });
  }

  /**
   * Handler for map movement and zoom changes
   *
   * This method emits the current map state (center, zoom, and circle) to the parent
   * component whenever the map is moved or zoomed. This allows the parent component
   * to save the map state and restore it later.
   */
  onMapMove() {
    if (this.map) {
      const mapState = {
        center: this.map.getCenter(),
        zoom: this.map.getZoom(),
        circle: this.circleLayer ? { center: this.circleLayer.getLatLng(), radius: this.circleLayer.getRadius() } : null
      };
      this.mapStateChange.emit(mapState);
    }
  }

  /**
   * Activates circle drawing mode on the map
   *
   * This method:
   * 1. Sets the drawing mode flag to true
   * 2. Creates and displays an overlay message to guide the user
   * 3. Sets up a click handler on the map to capture the user's selected point
   *
   * When the user clicks on the map, the handler sends the coordinates to the
   * MapDrawingService, which then notifies the QueryPanelComponent to display
   * the radius adjustment interface.
   */
  activateCircleDrawingMode() {
    if (!this.map) return;

    // Ensure box drawing mode is not active simultaneously
    if (this.drawingBox) {
      this.deactivateBoxDrawingMode();
    }

    // this.loggingService.info('MapViewComponent', 'Circle drawing mode activated');
    this.drawingCircle = true;

    // Create an overlay message to guide the user
    const overlay = document.createElement('div');
    overlay.className = 'map-overlay-message';
    overlay.innerText = 'Click to place circle. Press ESC to exit.';
    overlay.style.position = 'absolute';
    overlay.style.top = '20px';
    overlay.style.left = '50%';
    overlay.style.transform = 'translateX(-50%)';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    overlay.style.color = 'white';
    overlay.style.padding = '8px 12px';
    overlay.style.borderRadius = '4px';
    overlay.style.zIndex = '1000';
    overlay.id = 'draw-mode-overlay';
    this.elementRef.nativeElement.appendChild(overlay);

    // Set up a click handler to capture the user's selected point
    this.drawClickHandler = (e: L.LeafletMouseEvent) => {
      this.mapDrawingService.setCircleData(e.latlng, this.mapDrawingService.latestRadius);
    };
    this.map.on('click', this.drawClickHandler);
  }

  /**
   * Deactivates circle drawing mode
   *
   * This method:
   * 1. Sets the drawing mode flag to false
   * 2. Removes the click handler from the map
   * 3. Removes the overlay message
   *
   * This is called when drawing mode is exited, either by the user pressing
   * the Escape key, clicking the cancel button, or completing a drawing operation.
   */
  deactivateCircleDrawingMode() {
    if (!this.map || !this.drawingCircle) return;

    // this.loggingService.info('MapViewComponent', 'Circle drawing mode deactivated');
    this.drawingCircle = false;

    // Remove the click handler
    if (this.drawClickHandler) {
      this.map.off('click', this.drawClickHandler);
      this.drawClickHandler = null;
    }

    // Remove the overlay message
    const overlay = this.elementRef.nativeElement.querySelector('#draw-mode-overlay');
    if (overlay) overlay.remove();
  }

  /**
   * Updates the circle on the map with new center and radius values
   *
   * This method:
   * 1. Clears any existing circle
   * 2. If the radius is 0, just updates the map state without drawing a circle
   * 3. Creates a new circle with the specified center and radius
   * 4. Adjusts the map view to fit the circle if necessary
   * 5. Emits the updated map state
   *
   * @param center The geographic coordinates for the circle center
   * @param radius The radius of the circle in meters
   */
  updateCircle(center: L.LatLng, radius: number) {
    if (!this.map) return;
    this.clearAllDrawings();

    // If radius is 0, don't draw a circle (clearing)
    if (radius === 0) {
      this.onMapMove();
      return;
    }

    // Create and add the circle to the map
    this.circleLayer = L.circle(center, {
      radius: radius,
      color: 'red',
      fillColor: '#f03',
      fillOpacity: 0.3,
      weight: 2
    }).addTo(this.map);

    // Zoom out to fit the circle ONLY if it's too large for the view
    if (this.circleLayer && this.map) {
      const circleBounds = this.circleLayer.getBounds();
      const mapBounds = this.map.getBounds();
      if (!mapBounds.contains(circleBounds)) {
        this.map.fitBounds(circleBounds);
      }
    }

    // Update the map state
    this.onMapMove();
  }

  /**
   * Activates bounding box drawing mode on the map
   *
   * This method:
   * 1. Ensures circle drawing mode is not active simultaneously
   * 2. Sets the drawing box flag to true
   * 3. Creates and displays an overlay message to guide the user
   * 4. Sets up event handlers for:
   *    - Clicks to select the two corners of the box
   *    - Mouse movement to show a preview of the box while drawing
   *
   * The user clicks once for the first corner, moves the mouse to
   * preview the box size and position, then clicks again to finalize.
   */
  activateBoxDrawingMode() {
    if (!this.map) return;

    // Ensure circle drawing mode is not active simultaneously
    if (this.drawingCircle) {
      this.deactivateCircleDrawingMode();
    }

    this.drawingBox = true;
    this.boxStartPoint = null;

    // Create an overlay message to guide the user
    const overlay = document.createElement('div');
    overlay.className = 'map-overlay-message';
    overlay.innerText = 'Click first corner, then second. Press ESC to exit.';
    overlay.style.position = 'absolute';
    overlay.style.top = '20px';
    overlay.style.left = '50%';
    overlay.style.transform = 'translateX(-50%)';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    overlay.style.color = 'white';
    overlay.style.padding = '8px 12px';
    overlay.style.borderRadius = '4px';
    overlay.style.zIndex = '1000';
    overlay.id = 'draw-mode-overlay';
    this.elementRef.nativeElement.appendChild(overlay);

    // Click handler for selecting corners
    this.boxClickHandler = (e: L.LeafletMouseEvent) => {
      if (!this.boxStartPoint) {
        this.boxStartPoint = e.latlng;
      } else {
        const start = this.boxStartPoint;
        const end = e.latlng;
        this.mapDrawingService.setBoxData(start, end);
        // Clear preview and reset for potential next box placement
        if (this.boxPreviewLayer && this.map) {
          this.map.removeLayer(this.boxPreviewLayer);
          this.boxPreviewLayer = null;
        }
        this.boxStartPoint = null;
      }
    };
    this.map.on('click', this.boxClickHandler);

    // Mouse move handler to show preview rectangle while selecting second corner
    this.boxMouseMoveHandler = (e: L.LeafletMouseEvent) => {
      if (!this.map || !this.boxStartPoint) return;
      const sw = L.latLng(
        Math.min(this.boxStartPoint.lat, e.latlng.lat),
        Math.min(this.boxStartPoint.lng, e.latlng.lng)
      );
      const ne = L.latLng(
        Math.max(this.boxStartPoint.lat, e.latlng.lat),
        Math.max(this.boxStartPoint.lng, e.latlng.lng)
      );
      const bounds = L.latLngBounds(sw, ne);
      if (this.boxPreviewLayer) {
        this.boxPreviewLayer.setBounds(bounds);
      } else {
        this.boxPreviewLayer = L.rectangle(bounds, {
          color: '#4285F4',
          weight: 2,
          fillOpacity: 0.2
        });
        this.boxPreviewLayer.addTo(this.map);
      }
    };
    this.map.on('mousemove', this.boxMouseMoveHandler);
  }

  /**
   * Deactivates bounding box drawing mode
   *
   * This method:
   * 1. Sets the drawing box flag to false
   * 2. Removes all event handlers related to box drawing
   * 3. Cleans up the preview box layer if it exists
   * 4. Resets the boxStartPoint to null
   * 5. Removes the overlay message from the DOM
   */
  deactivateBoxDrawingMode() {
    if (!this.map || !this.drawingBox) return;

    this.drawingBox = false;

    if (this.boxClickHandler) {
      this.map.off('click', this.boxClickHandler);
      this.boxClickHandler = null;
    }
    if (this.boxMouseMoveHandler) {
      this.map.off('mousemove', this.boxMouseMoveHandler);
      this.boxMouseMoveHandler = null;
    }

    if (this.boxPreviewLayer) {
      this.map.removeLayer(this.boxPreviewLayer);
      this.boxPreviewLayer = null;
    }

    this.boxStartPoint = null;

    const overlay = this.elementRef.nativeElement.querySelector('#draw-mode-overlay');
    if (overlay) overlay.remove();
  }

  /**
   * Draws/updates the bounding rectangle on the map
   *
   * This method:
   * 1. Clears any existing drawings on the map
   * 2. Creates a rectangle using the provided corner coordinates
   * 3. Adjusts the map view to ensure the rectangle is visible
   * 4. Updates the map state
   *
   * @param northEast The northeast corner coordinates of the rectangle
   * @param southWest The southwest corner coordinates of the rectangle
   */
  updateRectangle(northEast: L.LatLng, southWest: L.LatLng) {
    if (!this.map) return;

    this.clearAllDrawings();

    const bounds = L.latLngBounds(southWest, northEast);
    this.rectangleLayer = L.rectangle(bounds, {
      color: '#4285F4',
      weight: 2,
      fillOpacity: 0.2
    }).addTo(this.map);

    // Ensure rectangle is visible
    const mapBounds = this.map.getBounds();
    if (!mapBounds.contains(bounds)) {
      this.map.fitBounds(bounds);
    }

    this.onMapMove();
  }

  /**
   * Removes all circles from the map
   *
   * This method removes the current circle layer from the map and sets
   * the circleLayer reference to null.
   */
  clearAllDrawings() {
    if (this.map) {
      // Remove circle if exists
      if (this.circleLayer) {
        this.map.removeLayer(this.circleLayer);
        this.circleLayer = null;
      }
      // Remove finalized rectangle if exists
      if (this.rectangleLayer) {
        this.map.removeLayer(this.rectangleLayer);
        this.rectangleLayer = null;
      }
      // Remove preview rectangle if exists
      if (this.boxPreviewLayer) {
        this.map.removeLayer(this.boxPreviewLayer);
        this.boxPreviewLayer = null;
      }
    }
  }

  /**
   * Angular lifecycle hook that runs when the component is being destroyed
   *
   * This method performs cleanup to prevent memory leaks:
   * 1. Unsubscribes from all RxJS subscriptions
   * 2. Deactivates circle and box drawing mode to remove event handlers
   * 3. Clears all drawings from the map
   */
  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.deactivateCircleDrawingMode();
    this.deactivateBoxDrawingMode();
    this.clearAllDrawings();
    if (this.map && this.markersLayer) {
      this.map.removeLayer(this.markersLayer);
    }
  }
}
