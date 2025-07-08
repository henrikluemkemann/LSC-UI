/**
 * Map View Component
 *
 * This component displays a Leaflet map for visualization.
 * It will be used for displaying search results (image thumbnails) and allowing users to
 * perform spatial searches by drawing shapes on the map like bounding boxes.
 */
import { Component, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import { LeafletModule } from '@asymmetrik/ngx-leaflet';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [LeafletModule],
  templateUrl: './map-view.html',
  styleUrls: ['./map-view.scss']
})
export class MapViewComponent implements AfterViewInit {

  /**
   * Reference to the Leaflet map instance
   */
  map: L.Map | undefined;

  /**
   * Configuration options for the Leaflet map
   */
  options: L.MapOptions = {
    layers: [
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      })
    ],
    zoom: 10,
    center: L.latLng(53.3498, -6.2603) // Dublin coordinates for now since LSC dataset has many images there
  };

  constructor() {
    console.log('MapViewComponent initialized');
  }

  /**
   * Angular lifecycle hook that runs after the view is initialized
   */
  ngAfterViewInit(): void {
    console.log('MapViewComponent view initialized');
  }

  /**
   * Handler for when the Leaflet map is ready
   * @param map
   */
  onMapReady(map: L.Map) {
    console.log('Map is ready');
    this.map = map;

    // Examples as note to myself: Add a marker
    // L.marker([53.3498, -6.2603]).addTo(this.map)
    //   .bindPopup('A popup here')
    //   .openPopup();
  }
}
