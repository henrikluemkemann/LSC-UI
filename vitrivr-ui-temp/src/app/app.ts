import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './header/header';
import { QueryPanelComponent } from './query-panel/query-panel';
import { MapViewComponent, MapState } from './map-view/map-view';
import { MapDrawingService } from './services/map-drawing.service';
import { LoggingService } from './services/logging.service';
import { SettingsPanelComponent } from './setting-panel/setting-panel';
import {ProgressSpinnerModule} from "primeng/progressspinner";
import {Button} from "primeng/button";

/**
 * Root component of the Vitrivr LSC UI application
 *
 * This component serves as the main container for the application and coordinates
 * the interactions between child components. It manages the current view state
 * (map, gallery or results (if activated)) and preserves the map state when switching views.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    QueryPanelComponent,
    MapViewComponent,
    SettingsPanelComponent,
    ProgressSpinnerModule,
    Button
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent {
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
   * Tracks the visibility of the settings panel.
   */
  isSettingsPanelVisible = false;

  /**
   * Stores the results from a successful query to be displayed in the results view.
   */
  queryResults: any | null = null;

  /**
   * Flag to indicate whether results are currently loading.
   * Used to display the loading spinner in the results view.
   */
  isLoadingResults: boolean = false;

  /**
   * Handles the change in loading state by updating the `isLoadingResults` property.
   *
   * @param {boolean} isLoading Indicates the new loading state. `true` if loading, `false` otherwise.
   */
  onLoadingStateChange(isLoading: boolean): void {
    this.isLoadingResults = isLoading;
  }

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
   * Handles successful query event from the QueryPanelComponent.
   * @param results The results object from the backend API.
   */
  onQueryResults(results: any) {
    this.queryResults = results;
    this.currentView = 'results';
  }

  onBackToMap(): void {
    this.loggingService.info('AppComponent', 'Back to map clicked');
    this.currentView = 'map';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  downloadResultsAsJson(): void {
    if (!this.queryResults) return;

    const jsonBlob = new Blob(
        [JSON.stringify(this.queryResults, null, 2)],
        { type: 'application/json' }
    );

    const url = URL.createObjectURL(jsonBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'query-results.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Toggles the visibility of the settings panel.
   */
  toggleSettingsPanel(): void {
    this.isSettingsPanelVisible = !this.isSettingsPanelVisible;
  }

  /**
   * Explicitly closes the settings panel.
   */
  closeSettingsPanel(): void {
    this.isSettingsPanelVisible = false;
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
