import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Interface representing a map layer configuration
 *
 * @property name The display name of the map layer
 * @property url The tile URL template for the map layer
 * @property attribution HTML attribution text required by the map provider
 * @property icon PrimeNG icon class to represent this layer in the UI
 */
export interface MapLayer {
  name: string;
  url: string;
  attribution: string;
  icon: string;
}

/**
 * Service for managing map layers in the application
 *
 * This service provides access to available map layers with different language options
 * and manages the currently selected layer. Components can subscribe to layer changes
 * through the selectedLayer$ observable.
 */
@Injectable({
  providedIn: 'root'
})
export class MapLayerService {

  /**
   * Collection of available map layers with different language options
   *
   * Includes:
   * - Multilingual: Default OpenStreetMap layer
   * - English: CARTO Voyager layer with English labels
   * - German: OpenStreetMap.de layer with German labels
   */
  private readonly layers: MapLayer[] = [
    {
      name: 'Multilingual',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      icon: 'pi pi-globe'
    },
    {
      name: 'English',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      icon: 'pi pi-language'
    },
    {
      name: 'German',
      url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.openstreetmap.de/impressum.html">OSM.de</a>',
      icon: 'pi pi-map-marker'
    }
  ];

  /**
   * BehaviorSubject that tracks the currently selected map layer
   * Initialized with the first layer (Multilingual) as default
   */
  private readonly selectedLayerSubject = new BehaviorSubject<MapLayer>(this.layers[0]);

  /**
   * Observable that components can subscribe to for layer change notifications
   */
  public readonly selectedLayer$ = this.selectedLayerSubject.asObservable();

  constructor() {}

  /**
   * Returns all available map layers
   *
   * @returns An array of MapLayer objects
   */
  getLayers(): MapLayer[] {
    return this.layers;
  }

  /**
   * Sets the currently selected map layer by name
   *
   * @param layerName The name of the layer to select
   */
  setSelectedLayer(layerName: string): void {
    const layer = this.layers.find(l => l.name === layerName);
    if (layer) {
      this.selectedLayerSubject.next(layer);
    }
  }

  /**
   * Gets the currently selected map layer
   *
   * @returns The currently selected MapLayer object
   */
  getSelectedLayer(): MapLayer {
    return this.selectedLayerSubject.getValue();
  }
}
