/**
 * Main application component for the LSC UI.
 *
 * This component manages the overall layout.
 * It contains the header, query panel, and view components (map or gallery).
 * The current view can be switched between map and gallery views.
 */

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from './header/header';
import { QueryPanelComponent } from './query-panel/query-panel';
import { MapViewComponent } from './map-view/map-view'; // Map component

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    QueryPanelComponent,
    MapViewComponent
  ],
  templateUrl: './app.html', // HTML template
  styleUrls: ['./app.scss']  // SCSS styles path
})
export class AppComponent {
  title = 'LSC-UI'; // this shows up in the browser

  /**
   * Tracks the current view mode of the application.
   * Possible values: map or gallery
   */
  currentView: string = 'map';

  /**
   * Handles view change events from the header component.
   * @param view The new view to display (map or gallery)
   */
  onViewChange(view: string) {
    console.log(`View changed to: ${view}`);
    this.currentView = view;
  }
}
