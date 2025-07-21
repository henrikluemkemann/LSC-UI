import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { CalendarModule } from 'primeng/calendar';

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
    CalendarModule
  ],
  templateUrl: './query-panel.html',
  styleUrls: ['./query-panel.scss'],
  providers: [MessageService]
})
export class QueryPanelComponent implements OnInit, OnDestroy {

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
   * The currently active tab in the geographical search section
   * Possible values: 'city', 'circle', or 'box'
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
   */
  constructor(
      private mapDrawingService: MapDrawingService,
      private messageService: MessageService,
      private cdr: ChangeDetectorRef,
      private loggingService: LoggingService
  ) {}

  /**
   * Angular lifecycle hook that runs when the component is initialized
   *
   * This method sets up subscriptions to the MapDrawingService observables to:
   * - Update the circle radius and selected point when circle data changes
   * - Reset button states when drawing mode is exited
   * - Reset button states and selected point when drawing is canceled
   */
  ngOnInit() {
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
          }
        }),

        // Subscribe to drawing mode exit events
        this.mapDrawingService.exitDrawingMode$.subscribe(() => {
          this.isDrawButtonDisabled = false;
          this.isApplyCircleButtonDisabled = true;
        }),

        // Subscribe to drawing cancellation events
        this.mapDrawingService.cancelDrawing$.subscribe(() => {
          this.isDrawButtonDisabled = false;
          this.isApplyCircleButtonDisabled = true;
          this.selectedPoint = null;
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

    // Convert the radius value
    if (previousScale === 'm' && newScale === 'km') {
      newRadius = currentRadius / 1000;
    } else if (previousScale === 'km' && newScale === 'm') {
      newRadius = currentRadius * 1000;
    }

    // Update slider config based on the new unit
    if (newScale === 'm') {
      this.radiusSliderConfig = { min: 10, max: 10000, step: 10 };
    } else { // 'km'
      this.radiusSliderConfig = { min: 1, max: 2000, step: 1 };
    }

    this.circleRadius = newRadius;

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
    this.loggingService.info('QueryPanelComponent', 'Date range selection changed by user.');
  }

  /**
   * Handles changes to the city search input
   *  TODO: placeholder for future implementation
   */
  onCitySearchChange() {
    this.loggingService.info('QueryPanelComponent', 'City search term changed', { term: this.citySearchTerm });
  }

  /**
   * Handles the Apply Search button click
   *
   * This method: TODO
   * 1. Exits drawing mode if it's active
   * 2. Will eventually execute the search with the selected criteria
   */
  onApplySearch() {
    this.loggingService.info('QueryPanelComponent', 'Search applied', {
      timeRange: this.appliedDateRange,
      citySearchTerm: this.citySearchTerm,
      activeTab: this.activeTab,
      hasCircle: !!this.selectedPoint
    });

    if (this.mapDrawingService.isDrawingModeActive()) {
      this.mapDrawingService.exitDrawingMode();
    }
    // Future implementation: Execute search with selected criteria
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
    this.mapDrawingService.exitDrawingMode();
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
