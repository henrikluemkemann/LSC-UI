import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import * as L from 'leaflet';
import { LoggingService } from './logging.service';

/**
 * Service for handling map drawing operations
 *
 * This service makes communication between the query panel and map view components easier
 * for operations like drawing shapes on the map. It uses RxJS Subjects to implement
 * an event-based communication system.
 */
@Injectable({
  providedIn: 'root'
})
export class MapDrawingService {

  /**
   * Subject that emits when circle drawing mode should be activated
   * Used to notify the map component to enter circle drawing mode
   */
  private drawCircleSubject = new Subject<void>();

  /**
   * Subject that emits circle data (center point and radius)
   * Used to update the circle visualization on the map
   */
  private circleDataSubject = new Subject<{center: L.LatLng, radius: number}>();

  /**
   * Subject that emits when drawing mode should be exited
   * Used to notify components to clean up drawing-related state
   */
  private exitDrawingModeSubject = new Subject<void>();

  /**
   * Subject that emits when drawing should be canceled
   * Used to notify components to reset drawing-related state
   */
  private cancelDrawingSubject = new Subject<void>();

  /**
   * BehaviorSubject that tracks whether drawing mode is active
   * Components can subscribe to this to react to drawing mode changes
   */
  private drawingModeActiveSubject = new BehaviorSubject<boolean>(false);

  /**
   * BehaviorSubject that holds the latest circle data
   * This allows components to get the current circle data at any time
   */
  private currentCircleData = new BehaviorSubject<{center: L.LatLng, radius: number} | null>(null);

  /**
   * Observable for circle drawing mode activation
   * Components can subscribe to this to be notified when to enter circle drawing mode
   */
  drawCircle$ = this.drawCircleSubject.asObservable();

  /**
   * Observable for circle data updates
   * Components can subscribe to this to receive circle center and radius updates
   */
  circleData$ = this.circleDataSubject.asObservable();

  /**
   * Observable for drawing mode exit events
   * Components can subscribe to this to be notified when to exit drawing mode
   */
  exitDrawingMode$ = this.exitDrawingModeSubject.asObservable();

  /**
   * Observable for drawing cancellation events
   * Components can subscribe to this to be notified when drawing is canceled
   */
  cancelDrawing$ = this.cancelDrawingSubject.asObservable();

  /**
   * Observable for drawing mode active state
   * Components can subscribe to this to react to drawing mode state changes
   */
  drawingModeActive$ = this.drawingModeActiveSubject.asObservable();

  /**
   * Observable for the current circle data
   * Components can subscribe to this to always have access to the latest circle data
   */
  currentCircleData$ = this.currentCircleData.asObservable();

  /**
   * Stores the most recently used radius value in meters
   * Used to remember the user's preferred radius when drawing new circles
   */
  latestRadius: number = 5000;

  /**
   * Constructor for the MapDrawingService
   *
   * @param loggingService Service for logging status changes
   */
  constructor(private loggingService: LoggingService) { }

  /**
   * Activates circle drawing mode
   *
   * This method:
   * 1. Sets the drawing mode active state to true
   * 2. Emits an event to notify the map component to enter circle drawing mode
   *
   * Components like MapViewComponent subscribe to drawCircle$ to react to this event.
   */
  startDrawCircle(): void {
    this.loggingService.info('MapDrawingService', 'Circle drawing mode activated');
    this.drawingModeActiveSubject.next(true);
    this.drawCircleSubject.next();
  }

  /**
   * Updates the circle data with a new center point and radius
   *
   * This method:
   * 1. Stores the radius value for future use if it's greater than 0
   * 2. Updates the current circle data BehaviorSubject
   * 3. Emits the new circle data to all subscribers
   *
   * If radius is 0 or negative, the circle is cleared from the map.
   *
   * @param center The geographic coordinates (latitude/longitude) for the circle center
   * @param radius The radius of the circle in meters
   */
  setCircleData(center: L.LatLng, radius: number): void {
    if (radius > 0) {
      this.loggingService.info('MapDrawingService', 'Circle data updated', {
        center: { lat: center.lat, lng: center.lng },
        radius: radius
      });
      this.latestRadius = radius;
      this.currentCircleData.next({ center, radius });
    } else {
      this.loggingService.info('MapDrawingService', 'Circle cleared');
      this.currentCircleData.next(null); // Clear the circle
    }
    this.circleDataSubject.next({center, radius});
  }

  /**
   * Exits drawing mode
   *
   * This method:
   * 1. Sets the drawing mode active state to false
   * 2. Emits an event to notify components that drawing mode has ended
   *
   * Components like MapViewComponent and QueryPanelComponent subscribe to
   * exitDrawingMode$ to clean up their drawing-related state.
   */
  exitDrawingMode(): void {
    this.loggingService.info('MapDrawingService', 'Drawing mode exited');
    this.drawingModeActiveSubject.next(false);
    this.exitDrawingModeSubject.next();
  }

  /**
   * Cancels the current drawing operation
   *
   * This method:
   * 1. Sets the drawing mode active state to false
   * 2. Clears any existing circle by setting its radius to 0
   * 3. Emits a cancel event to notify components
   *
   * This is typically called when the user wants to abort a drawing operation,
   * such as when clicking a cancel button or pressing the Escape key.
   */
  cancelDrawing(): void {
    this.loggingService.info('MapDrawingService', 'Drawing canceled');
    this.drawingModeActiveSubject.next(false);
    this.setCircleData(new L.LatLng(0,0), 0); // Clear the circle
    this.cancelDrawingSubject.next();
  }

  /**
   * Checks if drawing mode is currently active
   *
   * @returns true if drawing mode is active, false otherwise
   */
  isDrawingModeActive(): boolean {
    return this.drawingModeActiveSubject.getValue();
  }
}
