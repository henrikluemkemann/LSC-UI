/**
 * Query Panel Component
 *
 * This component provides the interface for users to build search queries.
 * It includes controls for:
 * - Time range selection
 * - Spatial search (drawing shapes on the map)
 * - City search by name
 * -> features not implemented yet (no functionality)
 */
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { SliderModule } from 'primeng/slider';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'app-query-panel',
  standalone: true,
  imports: [FormsModule, CardModule, SliderModule, ButtonModule, InputTextModule, CommonModule],
  templateUrl: './query-panel.html',
  styleUrls: ['./query-panel.scss']
})
export class QueryPanelComponent implements OnInit {

  /**
   * The selected time range for filtering results
   * [min, max] values between 0 and 100 (for now) TODO: find better values here
   */
  timeRange: number[] = [0, 100];

  /**
   * The city name to search for
   */
  citySearchTerm: string = '';

  /**
   * Flag to track if spatial search (drawing on map) is active
   */
  spatialSearchActive: boolean = false;

  ngOnInit() {
    console.log('QueryPanelComponent initialized');
    console.log(`Initial time range: ${this.timeRange[0]} - ${this.timeRange[1]}`);
    console.log(`Initial city search term: ${this.citySearchTerm}`);
  }

  /**
   * Handles the time range change event
   */
  onTimeRangeChange() {
    console.log(`Time range changed: ${this.timeRange[0]} - ${this.timeRange[1]}`);
  }

  /**
   * Handles the city search term change event
   */
  onCitySearchChange() {
    console.log(`City search term changed: ${this.citySearchTerm}`);
  }

  /**
   * Handles the apply search button click
   */
  onApplySearch() {
    console.log('Apply search clicked');
    console.log(`Search parameters: Time range: ${this.timeRange[0]} - ${this.timeRange[1]}, City: ${this.citySearchTerm}`);
  }
}
