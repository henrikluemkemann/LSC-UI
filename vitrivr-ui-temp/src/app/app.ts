import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './header/header';
import { QueryPanelComponent } from './query-panel/query-panel';
import { MapViewComponent, MapState } from './map-view/map-view';
import { MapDrawingService } from './services/map-drawing.service';
import { LoggingService } from './services/logging.service';

/**
 * Root component of the Vitrivr LSC UI application
 *
 * This component serves as the main container for the application and coordinates
 * the interactions between child components. It manages the current view state
 * (map or gallery) and preserves the map state when switching views.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    QueryPanelComponent,
    MapViewComponent
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent {
  title = 'LSC-UI'; // this shows up in the browser

  /**
   * Tracks the current view mode of the application.
   * Possible values: map or gallery
   */
  currentView: string = 'map';

  /**
   * Stores the current state of the map (center, zoom level, and any active circle)
   * This allows the map state to be preserved when switching between views
   */
  mapState: MapState | null = null;

  /**
   * Constructor for the AppComponent
   *
   * @param mapDrawingService Service for managing map drawing operations
   * @param loggingService Service for logging status changes
   */
  constructor(
    private mapDrawingService: MapDrawingService,
    private loggingService: LoggingService
  ) {
    this.loggingService.info('AppComponent', 'Application initialized');
  }

  /**
   * Handles view change events from the header component
   *
   * This method:
   * 1. Exits drawing mode if it's active to prevent drawing operations
   *    from continuing when the view changes
   * 2. Updates the current view to the selected view
   *
   * @param view The new view to display (map or gallery)
   */
  onViewChange(view: string) {
    this.loggingService.info('AppComponent', 'View changed', {
      previousView: this.currentView,
      newView: view
    });

    if (this.mapDrawingService.isDrawingModeActive()) {
      this.mapDrawingService.exitDrawingMode();
    }
    this.currentView = view;
  }

  /**
   * Handles map state change events from the map view component
   *
   * This method stores the current map state (center, zoom level, and any active circle)
   * so it can be restored when switching back to the map view.
   *
   * @param newState The new map state to store
   */
  onMapStateChange(newState: MapState) {
    this.loggingService.info('AppComponent', 'Map state updated', {
      center: { lat: newState.center.lat, lng: newState.center.lng },
      zoom: newState.zoom,
      hasCircle: !!newState.circle
    });
    this.mapState = newState;
  }
}
