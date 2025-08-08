import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges, ChangeDetectorRef, Output, EventEmitter, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { SliderModule } from 'primeng/slider';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CommonModule } from '@angular/common';
import { SelectButtonModule, SelectButtonOptionClickEvent } from 'primeng/selectbutton';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { MapDrawingService } from '../services/map-drawing.service';
import { LoggingService } from '../services/logging.service';
import { GeocodingService, City } from '../services/geocoding.service';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { CalendarModule } from 'primeng/calendar';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import {QueryService, SpatialQuery} from '../services/query.service';
import { CountryFlagPipe } from '../pipes/country-flag.pipe';

/**
 * Component for building and managing search queries
 *
 * This component provides a user interface for:
 * - Temporal filtering using a time range slider
 * - Geographical filtering using either city search or map drawing
 * - Managing circle drawing operations including radius adjustment
 *
 * It communicates with the MapViewComponent through the MapDrawingService
 * to coordinate map interactions and drawing operations.
 */
@Component({
  selector: 'app-query-panel',
  standalone: true,
  imports: [
    FormsModule,
    CardModule,
    SliderModule,
    ButtonModule,
    InputTextModule,
    CommonModule,
    SelectButtonModule,
    ToastModule,
    CalendarModule,
    DialogModule,
    TableModule,
    CountryFlagPipe
  ],
  templateUrl: './query-panel.html',
  styleUrls: ['./query-panel.scss'],
  providers: [MessageService]
})
export class QueryPanelComponent implements OnInit, OnDestroy, OnChanges {
  /**
   * Input property to receive the current view from the app component.
   * Used to determine whether to enable or disable interactive components.
   */
  @Input() currentView: string = 'map';

  /**
   * Properties to control the disabled state of all interactive components.
   * These will be used in the template with the [disabled] attribute.
   */
  isCalendarDisabled: boolean = false;
  isApplyTimeButtonDisabled: boolean = false;
  isTabsDisabled: boolean = false;
  isCitySearchDisabled: boolean = false;
  isRadiusScaleDisabled: boolean = false;
  isRadiusSliderDisabled: boolean = false;
  isDrawBoxButtonDisabled: boolean = false;
  isApplySearchButtonDisabled: boolean = true;

  /**
   * Stores the state of interactive components when leaving map view.
   * This allows us to restore the state when returning to map view.
   */
  private savedComponentState: {
    isDrawButtonDisabled: boolean;
    isApplyCircleButtonDisabled: boolean;
  } | null = null;
  /**
   * Consumers can subscribe to this emitter
   * to be notified when a query operation completes successfully.
   *
   * @type {EventEmitter<any>}
   */
  @Output() querySuccess: EventEmitter<any> = new EventEmitter<{results: any; criteria: any}>();

  /**
   * EventEmitter instance that emits a boolean value to indicate a change
   * in the loading state. True represents a loading state, false a non-loading one.
   */
  @Output() loadingStateChange = new EventEmitter<boolean>();

  /**
   * The selected date range from the calendar component.
   */
  dateRange: Date[] | undefined;

  /**
   * The applied date range, used for visual confirmation.
   */
  appliedDateRange: Date[] | undefined;

  /**
   * Controls the visibility of the "Apply Time Range" button.
   */
  showApplyTimeButton: boolean = true;

  /**
   * The city name to search for
   */
  citySearchTerm: string = '';

  /**
   * The default radius for city search in meters
   */
  cityRadius: number = 5000;

  /**
   * The currently active tab in the geographical search section
   */
  activeTab: string = 'city';

  /**
   * The selected point on the map (center of the circle)
   * Set when the user clicks on the map in circle drawing mode
   */
  selectedPoint: L.LatLng | null = null;

  /**
   * The radius of the circle in the current unit (meters or kilometers)
   */
  circleRadius: number = 5000;

  /**
   * Flag to disable the Draw Circle button while drawing is in progress
   */
  isDrawButtonDisabled: boolean = false;

  /**
   * Flag to disable the Apply Circle button until a point is selected
   */
  isApplyCircleButtonDisabled: boolean = true;

  /**
   * Options for the radius scale selection buttons
   */
  radiusScaleOptions = [
    { label: 'Meters', value: 'm' },
    { label: 'Kilometers', value: 'km' }
  ];

  /**
   * The currently selected unit for the circle radius
   * Either 'm' for meters or 'km' for kilometers
   */
  selectedRadiusScale: 'm' | 'km' = 'm';

  /**
   * Configuration for the radius slider
   * Includes minimum, maximum, and step values
   */
  radiusSliderConfig = { min: 10, max: 10000, step: 10 };

  /**
   * Flag to control the visibility of the radius slider
   * Used to force re-rendering when the scale changes
   */
  showSlider: boolean = true;

  /**
   * Flag to control the visibility of the city selection dialog
   */
  showCitySelectionDialog: boolean = false;

  /**
   * List of cities that match the search term
   */
  matchingCities: City[] = [];

  /**
   * The city selected from the dialog
   */
  selectedCity: City | null = null;

  /**
   * A boolean flag indicating whether the "Apply City" button is disabled.
   */
  isApplyCityButtonDisabled: boolean = true;

  /**
   * Collection of RxJS subscriptions to be cleaned up on component destruction
   */
  private subscriptions: Subscription[] = [];

  /**
   * Constructor for the QueryPanelComponent
   *
   * @param mapDrawingService Service for managing map drawing operations
   * @param messageService Service for displaying toast messages
   * @param cdr Angular's ChangeDetectorRef for manually triggering change detection
   * @param loggingService Service for logging status changes
   * @param queryService Service for constructing and sending Queries
   */
  constructor(
    private mapDrawingService: MapDrawingService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef,
    private loggingService: LoggingService,
    private queryService: QueryService,
    private geocodingService: GeocodingService
  ) {}

  /**
   * Implements the OnChanges interface to react to changes in the current view.
   *
   * @param changes The changes object containing the current and previous values of the input
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentView']) {
      const currentView = changes['currentView'].currentValue;
      const previousView = changes['currentView'].previousValue;

      this.loggingService.info('QueryPanelComponent', 'View changed', {
        previousView,
        currentView
      });

      if (currentView === 'map' && previousView && previousView !== 'map') {
        // Returning to map view, restore the previous state
        this.restoreComponentState();
      } else if (currentView !== 'map' && (!previousView || previousView === 'map')) {
        // Leaving map view, save the current state and disable all components
        this.saveComponentState();
        this.disableAllComponents();
      }
    }
  }

  /**
   * Saves the current state of interactive components before disabling them.
   * This allows us to restore the state when returning to map view.
   */
  private saveComponentState(): void {
    this.loggingService.info('QueryPanelComponent', 'Saving component state');

    this.savedComponentState = {
      isDrawButtonDisabled: this.isDrawButtonDisabled,
      isApplyCircleButtonDisabled: this.isApplyCircleButtonDisabled
    };
  }

  /**
   * Disables all interactive components when not in map view.
   */
  private disableAllComponents(): void {
    this.loggingService.info('QueryPanelComponent', 'Disabling all components');

    this.isCalendarDisabled = true;
    this.isApplyTimeButtonDisabled = true;
    this.isTabsDisabled = true;
    this.isCitySearchDisabled = true;
    this.isRadiusScaleDisabled = true;
    this.isRadiusSliderDisabled = true;
    this.isDrawButtonDisabled = true;
    this.isApplyCircleButtonDisabled = true;
    this.isDrawBoxButtonDisabled = true;
    this.isApplySearchButtonDisabled = true;
  }

  /**
   * Restores the previous state of interactive components when returning to map view.
   */
  private restoreComponentState(): void {
    this.loggingService.info('QueryPanelComponent', 'Restoring component state');

    this.isCalendarDisabled = false;
    this.isApplyTimeButtonDisabled = false;
    this.isTabsDisabled = false;
    this.isCitySearchDisabled = false;
    this.isRadiusScaleDisabled = false;
    this.isRadiusSliderDisabled = false;
    this.isDrawBoxButtonDisabled = false;
    this.isApplySearchButtonDisabled = false;

    // Restore the saved state of the buttons that already had disabled properties
    if (this.savedComponentState) {
      this.isDrawButtonDisabled = this.savedComponentState.isDrawButtonDisabled;
      this.isApplyCircleButtonDisabled = this.savedComponentState.isApplyCircleButtonDisabled;
      this.savedComponentState = null;
    }
  }

  /**
   * Updates the state of the "Apply Search" button based on user inputs.
   */
  private updateApplySearchButtonState(): void {
    const hasTimeInput = !!this.appliedDateRange;
    let hasGeoInput = false;

    // Only consider the input from the currently active tab
    switch (this.activeTab) {
      case 'city':
        hasGeoInput = !!this.selectedCity && this.isApplyCityButtonDisabled;
        break;
      case 'circle':
        //circle is only valid input if it has been applied
        hasGeoInput = !!this.mapDrawingService.currentCircleData.getValue() && !this.mapDrawingService.isDrawingModeActive();
        break;
      case 'box':
        // TODO: attend when bounding box is implemented :)
        hasGeoInput = false;
        break;
    }

    this.isApplySearchButtonDisabled = !hasTimeInput && !hasGeoInput;
  }

  /**
   * Angular lifecycle hook that runs when the component is initialized
   *
   * This method sets up subscriptions to the MapDrawingService observables to:
   * - Update the circle radius and selected point when circle data changes
   * - Reset button states when drawing mode is exited
   * - Reset button states and selected point when drawing is canceled
   */
  ngOnInit() {
    this.updateApplySearchButtonState();
    this.subscriptions.push(
      // Subscribe to circle data changes
      this.mapDrawingService.circleData$.subscribe(data => {
        if (data && data.radius > 0) {
          // Update the selected point and radius
          this.selectedPoint = data.center;

          // Convert radius to the current unit (m or km)
          if (this.selectedRadiusScale === 'km') {
            this.circleRadius = data.radius / 1000;
          } else {
            this.circleRadius = data.radius;
          }

          // Enable the Apply Circle button
          this.isApplyCircleButtonDisabled = false;
          this.cdr.detectChanges();
        } else {
          // Clear the selected point and disable the Apply Circle button
          this.selectedPoint = null;
          this.isApplyCircleButtonDisabled = true;
          this.updateApplySearchButtonState();
        }
      }),

      // Subscribe to drawing mode exit events
      this.mapDrawingService.exitDrawingMode$.subscribe(() => {
        this.isDrawButtonDisabled = false;
        this.isApplyCircleButtonDisabled = true;
        this.updateApplySearchButtonState();
      }),

      // Subscribe to drawing cancellation events
      this.mapDrawingService.cancelDrawing$.subscribe(() => {
        this.isDrawButtonDisabled = false;
        this.isApplyCircleButtonDisabled = true;
        this.selectedPoint = null;
        this.updateApplySearchButtonState();
      })
    );
  }

  /**
   * Converts the circle radius between meters and kilometers
   *
   * This method:
   * 1. Converts the radius value between meters and kilometers
   * 2. Updates the slider configuration based on the new unit
   * 3. Forces the slider to re-render to apply the new configuration
   * 4. Updates the circle on the map if drawing mode is active
   *
   * @param previousScale The previous unit ('m' or 'km')
   * @param newScale The new unit ('m' or 'km')
   */
  performScaleConversion(previousScale: 'm' | 'km', newScale: 'm' | 'km') {
    const currentRadius = this.circleRadius;
    let newRadius = currentRadius;

    // Update slider config based on the new unit
    if (newScale === 'm') {
      this.radiusSliderConfig = { min: 10, max: 10000, step: 10 };
    } else { // 'km'
      this.radiusSliderConfig = { min: 1, max: 2000, step: 1 };
    }

    // Convert the radius value and constrain to new range
    if (previousScale === 'm' && newScale === 'km') {
      newRadius = currentRadius / 1000;
      // Constrain to km range
      newRadius = Math.max(this.radiusSliderConfig.min, Math.min(newRadius, this.radiusSliderConfig.max));
    } else if (previousScale === 'km' && newScale === 'm') {
      newRadius = currentRadius * 1000;
      // Constrain to m range
      newRadius = Math.max(this.radiusSliderConfig.min, Math.min(newRadius, this.radiusSliderConfig.max));
    }

    this.circleRadius = newRadius;

    // Also update the latestRadius in MapDrawingService (in meters)
    let radiusInMeters = this.circleRadius;
    if (this.selectedRadiusScale === 'km') {
      radiusInMeters = this.circleRadius * 1000;
    }
    this.mapDrawingService.latestRadius = radiusInMeters;

    // Force slider to re-render to apply new config
    this.showSlider = false;
    this.cdr.detectChanges(); // Ensures UI updates before showing slider again
    this.showSlider = true;

    // Update the circle on the map if drawing mode is active
    if (this.mapDrawingService.isDrawingModeActive()) {
      this.updateCircle();
    }
  }

  /**
   * Updates the circle on the map with the current radius
   *
   * This method:
   * 1. Checks if a point has been selected
   * 2. Converts the radius to meters if necessary
   * 3. Sends the updated circle data to the MapDrawingService
   *
   * The MapDrawingService then notifies the MapViewComponent to update
   * the circle visualization on the map.
   */
  updateCircle() {
    if (this.selectedPoint) {
      // Convert radius to meters (the standard unit for Leaflet)
      let radiusInMeters = this.circleRadius;
      if (this.selectedRadiusScale === 'km') {
        radiusInMeters = this.circleRadius * 1000;
      }

      // Send the updated circle data to the MapDrawingService
      this.mapDrawingService.setCircleData(this.selectedPoint, radiusInMeters);
    }
  }

  /**
   * Applies the selected time frame and provides visual confirmation.
   */
  onApplyTimeFrame() {
    if (this.dateRange && this.dateRange[0] && this.dateRange[1]) {
      this.appliedDateRange = this.dateRange;
      this.showApplyTimeButton = false;
      this.loggingService.info('QueryPanelComponent', 'Time frame applied', { range: this.appliedDateRange });
      this.messageService.add({
        severity: 'success',
        summary: 'Time Range Set',
        detail: 'The Time range has been applied successfully.',
        life: 3000
      });
      this.updateApplySearchButtonState();
    } else {
      this.loggingService.warn('QueryPanelComponent', 'Attempted to apply an invalid time frame.');
    }
  }

  /**
   * Shows the apply button and clears the visual confirmation when the user changes the date.
   */
  onDateSelect() {
    this.showApplyTimeButton = true;
    this.appliedDateRange = undefined;
    this.updateApplySearchButtonState();
    this.loggingService.info('QueryPanelComponent', 'Date range selection changed by user.');
  }

  /**
   * Handles model changes from the PrimeNG calendar component.
   *
   * This method is triggered whenever the user selects a new date range or clears
   * the selection. It ensures the component's state is updated correctly in response.
   *
   * If the user selects a valid new date range, this method resets the currently
   * applied time range (appliedDateRange), forcing them to re-apply the new selection.
   *
   * If the user clears the selection, the newRange will be invalid, and this method
   * will clear the appliedDateRange to ensure no time filter is used in later
   * queries.
   *
   * @param newRange The new date range value from the calendar model. Can be an array of dates or null if cleared.
   */
  onDateChange(newRange: Date[] | null) {
    this.dateRange = newRange ?? undefined;

    if (!this.dateRange || this.dateRange.length !== 2 || !this.dateRange[0] || !this.dateRange[1]) {
      this.appliedDateRange = undefined;
      this.showApplyTimeButton = true;
      this.loggingService.info('QueryPanelComponent', 'Date range cleared via ngModelChange');
      return;
    }

    this.showApplyTimeButton = true;
    this.appliedDateRange = undefined;
    this.updateApplySearchButtonState();
  }

  /**
   * Handles changes to the city search input
   */
  onCitySearchChange() {
    this.selectedCity = null;
    this.isApplyCityButtonDisabled = true;
    this.mapDrawingService.cancelDrawing();
    this.updateApplySearchButtonState();
    this.loggingService.info('QueryPanelComponent', 'City search term changed', {term: this.citySearchTerm});
  }

  /**
   * Handles the city search button click
   *
   * This method:
   * 1. Looks up cities with the partial name using the geocoding service
   * 2. If at least one city is found, show the selection dialog
   * 3. If no cities are found, displays an error message
   */
  onCitySearch() {
    if (!this.citySearchTerm) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Missing City',
        detail: 'Please enter a city name to search.',
        life: 3000
      });
      return;
    }

    this.loggingService.info('QueryPanelComponent', 'City search button clicked', {cityName: this.citySearchTerm});

    // Look up cities using the geocoding service
    this.geocodingService.waitForLoad().subscribe(loaded => {
      if (loaded) {
        const cities = this.geocodingService.findCitiesByPartialName(this.citySearchTerm);

        if (cities.length === 1) {
          this.matchingCities = cities;
          this.showCitySelectionDialog = true;
        } else if (cities.length > 1) {
          // Multiple cities found, show selection dialog
          this.matchingCities = cities;
          this.showCitySelectionDialog = true;
        } else {
          // No cities found, display error message
          this.messageService.add({
            severity: 'error',
            summary: 'City Not Found',
            detail: `Could not find "${this.citySearchTerm}" in the database.`,
            life: 5000
          });
        }
      } else {
        // Geocoding service not loaded, display error message
        this.messageService.add({
          severity: 'error',
          summary: 'Service Unavailable',
          detail: 'The geocoding service is not available. Please try again later.',
          life: 5000
        });
      }
    });
  }

  /**
   * Handles city selection from the dialog
   *
   * @param city The selected city
   */
  onSelectCity(city: City) {
    this.loggingService.info('QueryPanelComponent', 'City selected', city);
    this.selectedCity = city;

    this.citySearchTerm = this.geocodingService.getFormattedCityName(city);
    this.showCitySelectionDialog = false;
    this.matchingCities = [];
    this.isApplyCityButtonDisabled = false;

    this.updateCityCircleOnMap();
    this.updateApplySearchButtonState();
    this.applyCitySelection();
  }

  /**
   * Applies the selected city to the map
   */
  private applyCitySelection() {
    if (!this.selectedCity) return;

    // Create a circle at the city's location
    const cityLocation = new L.LatLng(this.selectedCity.latitude, this.selectedCity.longitude);

    // Update the map with the city location and radius (should also cause map to zoom to desired city)
    this.mapDrawingService.setCircleData(cityLocation, this.cityRadius);

    // Get formatted city name with subdivisions
    const formattedCityName = this.geocodingService.getFormattedCityName(this.selectedCity);

    this.messageService.add({
      severity: 'success',
      summary: 'Location Found',
      detail: `Located ${formattedCityName} and applied a ${this.cityRadius}m radius.`,
      life: 3000
    });

    this.updateApplySearchButtonState();
  }

  /**
   * Handles changes to the city radius slider
   */
  onCityRadiusChange() {
    if (this.selectedCity) {
      this.isApplyCityButtonDisabled = false;
      this.cdr.detectChanges();
    }
    this.updateCityCircleOnMap();
    this.loggingService.info('QueryPanelComponent', 'City radius changed', { radius: this.cityRadius });
    this.updateApplySearchButtonState();
  }

  private updateCityCircleOnMap() {
    if (this.selectedCity) {
      const cityLocation = new L.LatLng(this.selectedCity.latitude, this.selectedCity.longitude);
      this.mapDrawingService.setCircleData(cityLocation, this.cityRadius);
    }
  }

  /**
   * Handles the Apply Search button click
   *
   * This method checks the active geographical search tab and constructs
   * the appropriate SpatialQuery object to be sent to the QueryService.
   */
  onApplySearch() {
    this.loadingStateChange.emit(true);
    let spatialQuery: SpatialQuery = null;

    switch (this.activeTab) {
      case 'circle':
        const currentCircleData = this.mapDrawingService.currentCircleData.getValue();
        if (currentCircleData) {
          spatialQuery = { type: 'circle', data: currentCircleData };
        }
        break;

      case 'city':
        if (this.selectedCity) {
          spatialQuery = {
            type: 'circle',
            data: {
              center: new L.LatLng(this.selectedCity.latitude, this.selectedCity.longitude),
              radius: this.cityRadius
            },
            displayData: {
              locationName: this.selectedCity.name,
              countryCode: this.selectedCity.country ?? 'N/A',
              subdivision1: this.selectedCity.subdivision1 ?? 'N/A',
              subdivision2: this.selectedCity.subdivision2 ?? 'N/A'
            }
          };
        }
        break;

      case 'box':
        // TODO: Implement bounding box drawing and data capture.
        // For now, this case will do nothing.
        this.loggingService.warn('QueryPanelComponent', 'Bounding box search is not yet implemented.');
        this.messageService.add({
          severity: 'warn',
          summary: 'Not Implemented',
          detail: 'Drawing a bounding box is not yet supported.',
          life: 3000
        });
        this.loadingStateChange.emit(false);
        return;
    }

    this.loggingService.info('QueryPanelComponent', 'Search applied', {
      timeRange: this.appliedDateRange,
      spatialQuery: spatialQuery
    });

    this.queryService.buildAndExecuteQuery(this.appliedDateRange, spatialQuery).subscribe({
      next: (results) => {
        this.loggingService.info('QueryPanelComponent', 'Query successful', results);

        // Emit both the results and the criteria used for the search
        this.querySuccess.emit({
          results,
          criteria: {
            timeRange: this.appliedDateRange,
            spatialQuery: spatialQuery
          }
        });
        this.loadingStateChange.emit(false);
      },
      error: (error) => {
        this.loggingService.error('QueryPanelComponent', 'Query failed', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Search Failed',
          detail: 'An error occurred while performing the search.',
          life: 4000
        });
        this.loadingStateChange.emit(false);
      }
    });

    if (this.mapDrawingService.isDrawingModeActive()) {
      this.mapDrawingService.exitDrawingMode();
    }

  }


  /**
   * Sets the active tab in the geographical search section
   *
   * @param tab The tab to activate ('city', 'circle', or 'box')
   */
  setActiveTab(tab: string) {
    this.loggingService.info('QueryPanelComponent', 'Active tab changed', {
      previousTab: this.activeTab,
      newTab: tab
    });
    this.activeTab = tab;
    this.updateApplySearchButtonState(); // Update Apply Search button state when tab changes
  }

  /**
   * Handles the Draw Circle button click
   *
   * This method:
   * 1. Disables the Draw Circle button to prevent multiple clicks
   * 2. Disables the Apply Circle button until a point is selected
   * 3. Activates the circle tab
   * 4. Notifies the MapDrawingService to start circle drawing mode
   * 5. Displays a toast message to guide the user
   */
  onDrawCircleClick() {
    this.loggingService.info('QueryPanelComponent', 'Draw Circle button clicked');
    this.isDrawButtonDisabled = true;
    this.isApplyCircleButtonDisabled = true; // Stay disabled until map click
    this.activeTab = 'circle';
    this.isApplySearchButtonDisabled = true;
    this.mapDrawingService.startDrawCircle();
    this.messageService.add({
      severity: 'info',
      summary: 'Draw Circle',
      detail: 'Click on the map and adjust the radius. Apply Circle when finished.',
      life: 5000
    });
  }

  /**
   * Handles the Apply Circle button click
   *
   * This method exits drawing mode, which finalizes the circle
   * and makes it available for search operations.
   */
  onApplyCircle() {
    this.loggingService.info('QueryPanelComponent', 'Apply Circle button clicked', {
      center: this.selectedPoint ? { lat: this.selectedPoint.lat, lng: this.selectedPoint.lng } : null,
      radius: this.circleRadius,
      unit: this.selectedRadiusScale
    });
    this.updateApplySearchButtonState();
    this.mapDrawingService.exitDrawingMode();
  }

  /**
   * Handles the "Apply Circle" button click in the city search tab.
   * This method finalizes the user's choice of city and radius, making it ready for the main search.
   */
  onApplyCityCircle() {
    if (!this.selectedCity) {
      this.loggingService.warn('QueryPanelComponent', 'onApplyCityCircle called without a selected city.');
      return;
    }

    this.loggingService.info('QueryPanelComponent', 'Apply City Circle clicked', {
      city: this.selectedCity.name,
      radius: this.cityRadius
    });

    const cityLocation = new L.LatLng(this.selectedCity.latitude, this.selectedCity.longitude);
    this.mapDrawingService.setCircleData(cityLocation, this.cityRadius);

    // The button should be re enabled if the user changes the search term or radius.
    this.isApplyCityButtonDisabled = true;
    this.updateApplySearchButtonState();

    this.messageService.add({
      severity: 'success',
      summary: 'Location Set',
      detail: `Set location to ${this.selectedCity.name} with a ${this.cityRadius}m radius.`,
      life: 3000
    });
  }

  /**
   * Handles changes to the circle radius
   *
   * This method updates the circle on the map when the radius changes,
   * but only if drawing mode is active.
   */
  onRadiusChange() {
    this.loggingService.info('QueryPanelComponent', 'Circle radius changed', {
      radius: this.circleRadius,
      unit: this.selectedRadiusScale
    });

    // Convert radius to meters (the standard unit for Leaflet)
    let radiusInMeters = this.circleRadius;
    if (this.selectedRadiusScale === 'km') {
      radiusInMeters = this.circleRadius * 1000;
    }

    // Update the latestRadius in MapDrawingService immediately
    this.mapDrawingService.latestRadius = radiusInMeters;

    if (this.mapDrawingService.isDrawingModeActive()) {
      this.updateCircle();
    }
  }

  /**
   * Gets the formatted radius string with the appropriate unit
   *
   * @returns A string representing the radius with its unit (e.g., "5000 m" or "5 km")
   */
  getFormattedRadius(): string {
    if (this.selectedRadiusScale === 'm') {
      return `${this.circleRadius} m`;
    } else {
      return `${this.circleRadius} km`;
    }
  }

  /**
   * Gets the formatted city radius string
   *
   * @returns A string representing the city radius in meters (e.g., "5000 m")
   */
  getFormattedCityRadius(): string {
    return `${this.cityRadius} m`;
  }

  /**
   * Handles the Draw Box button click
   *
   * This method:
   * 1. Activates the box tab
   * 2. Displays a toast message informing the user that the feature is not yet implemented
   * TODO: implement box drawing
   */
  onDrawBoxClick() {
    this.loggingService.info('QueryPanelComponent', 'Draw Box button clicked');
    this.activeTab = 'box';
    this.isApplySearchButtonDisabled = true; // Disable Apply Search button when box drawing is started
    this.messageService.add({
      severity: 'info',
      summary: 'Draw Box',
      detail: 'This feature is not yet implemented.',
      life: 5000
    });
  }

  /**
   * Angular lifecycle hook that runs when the component is being destroyed
   *
   * This method unsubscribes from all RxJS subscriptions to prevent memory leaks.
   */
  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Handles clicks on the radius scale selection buttons
   *
   * This method:
   * 1. Determines which button was clicked
   * 2. Determines the new scale based on the clicked button
   * 3. If the scale has changed, updates the selected scale and converts the radius
   *
   * The method implements a toggle behavior: if the user clicks the already
   * active button, it will toggle to the other scale.
   *
   * @param event The SelectButtonOptionClickEvent containing information about the clicked option
   */
  handleScaleOptionClick(event: SelectButtonOptionClickEvent) {
    if (!event.option) {
      return;
    }
    const clickedValue = event.option.value;
    const previousScale = this.selectedRadiusScale;
    let newScale: 'm' | 'km';

    if (clickedValue === previousScale) {
      // User clicked the active button, so toggle
      newScale = previousScale === 'm' ? 'km' : 'm';
    } else {
      // User clicked an inactive button ->switch to it
      newScale = clickedValue;
    }

    if (newScale !== previousScale) {
      this.loggingService.info('QueryPanelComponent', 'Radius scale changed', {
        previousScale: previousScale,
        newScale: newScale
      });
      this.selectedRadiusScale = newScale;
      this.performScaleConversion(previousScale, newScale);
    }
  }
}
