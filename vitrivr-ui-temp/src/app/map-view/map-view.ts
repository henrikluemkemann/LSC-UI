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
   * An array of image data with locations to be marked on the map.
   */
  @Input() imageLocations: ImageModel[] | null = null;

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
    center: L.latLng(53.3498, -6.2603) // Dublin coordinates for now since LSC dataset has many images there
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

  showHighQualityViewer = false;
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
    if (changes['imageLocations'] && this.map) {
      this.updateMarkers();
    }
  }

  /**
   * Angular lifecycle hook that runs after the view is initialized
   *
   * This method sets up subscriptions to the MapDrawingService observables to:
   * - Activate circle drawing mode when requested
   * - Update the circle when its data changes
   * - Deactivate drawing mode when requested
   * - Clear all drawings and deactivate drawing mode when drawing is canceled
   */
  ngAfterViewInit(): void {
    this.subscriptions.push(
      this.mapDrawingService.drawCircle$.subscribe(() => this.activateCircleDrawingMode()),
      this.mapDrawingService.circleData$.subscribe(data => this.updateCircle(data.center, data.radius)),
      this.mapDrawingService.exitDrawingMode$.subscribe(() => this.deactivateCircleDrawingMode()),
      this.mapDrawingService.cancelDrawing$.subscribe(() => {
        this.clearAllDrawings();
        this.deactivateCircleDrawingMode();
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

    // Restore the circle if it exists in the initial state
    if (this.initialMapState?.circle) {
      this.updateCircle(this.initialMapState.circle.center, this.initialMapState.circle.radius);
    }
  }

  /**
   * Updates the markers on the map based on the `imageLocations` input.
   */
  private updateMarkers(): void {
    if (!this.map) return;

    this.markersLayer.clearLayers();

    if (this.imageLocations) {
      this.loggingService.info('MapViewComponent', `Updating markers for ${this.imageLocations.length} results.`);
      const markersToAdd: L.Marker[] = [];
      this.imageLocations.forEach(image => {
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

  private openHighQualityViewer(image: ImageModel): void {
    this.imageService.getImage('sandbox', 'original', image.id).subscribe(blob => {
      if (blob) {
        this.highQualityImageUrl = this.imageService.createImageUrl(blob);
        this.showHighQualityViewer = true;
        this.cdr.detectChanges();
      }
    });
  }

  closeHighQualityViewer(): void {
    if (this.highQualityImageUrl) {
      URL.revokeObjectURL(this.highQualityImageUrl);
    }
    this.highQualityImageUrl = null;
    this.showHighQualityViewer = false;
    this.cdr.detectChanges();
  }


  /**
   * Updates the tile layer on the map.
   * @param layer The new map layer to apply.
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
   * Removes all circles from the map
   *
   * This method removes the current circle layer from the map and sets
   * the circleLayer reference to null.
   */
  clearAllDrawings() {
    if (this.circleLayer && this.map) {
      // this.loggingService.info('MapViewComponent', 'All drawings cleared from map');
      this.map.removeLayer(this.circleLayer);
      this.circleLayer = null;
    }
  }

  /**
   * Angular lifecycle hook that runs when the component is being destroyed
   *
   * This method performs cleanup to prevent memory leaks:
   * 1. Unsubscribes from all RxJS subscriptions
   * 2. Deactivates circle drawing mode to remove event handlers
   * 3. Clears all drawings from the map
   */
  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.deactivateCircleDrawingMode();
    this.clearAllDrawings();
    if (this.map && this.markersLayer) {
      this.map.removeLayer(this.markersLayer);
    }
  }
}
