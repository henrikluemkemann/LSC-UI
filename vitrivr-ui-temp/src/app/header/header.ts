import {Component, EventEmitter, Output, OnDestroy, Input} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectButtonChangeEvent } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import { SelectItem } from 'primeng/api';
import { MapDrawingService } from '../services/map-drawing.service';
import { LoggingService } from '../services/logging.service';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

/**
 * Component for the application header
 *
 * This component provides:
 * - A view selector to switch between Map, Gallery and Results views
 * - A cancel drawing button that appears when drawing mode is active
 * - Settings button (TODO: more functionality to be added)
 *
 * It communicates with the parent component through the viewChange event
 * and with the MapDrawingService to track and control drawing mode.
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [ButtonModule, SelectButtonModule, FormsModule, CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class HeaderComponent implements OnDestroy {
  /**
   * Event emitter for view changes
   * Emits the selected view (map, gallery or results) when the user changes the view
   */
  @Output() viewChange = new EventEmitter<string>();
  @Output() settingsClick = new EventEmitter<void>();

  /**
   * Options for the view selection buttons
   * Each option has a label for display and a value for identification
   */
  viewOptions: SelectItem[] = [
    { label: 'Map', value: 'map' },
    { label: 'Gallery', value: 'gallery' },
    {label: 'Results', value: 'results'}
  ];

  /**
   * The currently selected view
   * Default is map
   */
  @Input() selectedView: string = 'map';

  /**
   * Flag indicating whether drawing mode is active
   * Used to show/hide the cancel drawing button
   */
  isDrawingModeActive: boolean = false;

  /**
   * Collection of RxJS subscriptions to be cleaned up on component destruction
   */
  private subscriptions: Subscription[] = [];

  /**
   * Constructor for the HeaderComponent
   *
   * @param mapDrawingService Service for managing map drawing operations
   * @param loggingService Service for logging status changes
   */
  constructor(
    private mapDrawingService: MapDrawingService,
    private loggingService: LoggingService
  ) {
    // Subscribe to drawing mode active state changes
    this.subscriptions.push(
        this.mapDrawingService.drawingModeActive$.subscribe(isActive => {
          this.isDrawingModeActive = isActive;
          this.loggingService.info('HeaderComponent', 'Drawing mode active state changed', { isActive });
        })
    );
  }

  /**
   * Handles view change events from the view selection buttons
   *
   * @param {SelectButtonChangeEvent} event The event object triggered by the view change, containing the new view value.
   */
  onViewChange(event: SelectButtonChangeEvent) {
    const newView = event.value as string | undefined;
    if (newView === this.selectedView) {
      return; // Do nothing
    }
    if (newView) {
      this.selectedView = newView;
      if (newView === 'results') {
        setTimeout(() => {
          const container = document.querySelector('.results-container');
          container?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      }
      this.loggingService.info('HeaderComponent', 'View changed', { view: newView });
      this.viewChange.emit(newView);
    }
  }

  /**
   * Handles clicks on the Settings button
   */
  onSettingsClick() {
    this.loggingService.info('HeaderComponent', 'Settings button clicked');
    this.settingsClick.emit();
  }

  /**
   * Handles clicks on the Cancel Drawing button
   *
   * This method notifies the MapDrawingService to cancel the current
   * drawing operation, which clears any in-progress drawings and
   * exits drawing mode.
   */
  onCancelDrawingClick() {
    this.loggingService.info('HeaderComponent', 'Cancel Drawing button clicked');
    this.mapDrawingService.cancelDrawing();
  }

  /**
   * Angular lifecycle hook that runs when the component is being destroyed
   *
   * This method unsubscribes from all RxJS subscriptions to prevent memory leaks.
   */
  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
