import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarModule } from 'primeng/sidebar';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ButtonModule } from 'primeng/button';
import { MapLayerService, MapLayer } from '../services/map-layer.service';
import { FieldsetModule } from 'primeng/fieldset';

/**
 * Settings Panel Component
 *
 * This component provides a sidebar panel for application settings.
 * It allows users to select the map layer/style to be used
 * in the map view and select the UI-Language (TODO).
 * The panel can be closed by the user, which emits
 * an event to the parent component.
 */
@Component({
  selector: 'app-setting-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarModule, RadioButtonModule, ButtonModule, FieldsetModule],
  templateUrl: './setting-panel.html',
  styleUrls: ['./setting-panel.scss']
})
export class SettingsPanelComponent implements OnInit {

  /**
   * Event emitter that notifies the parent component when the panel is closed
   */
  @Output() closePanel = new EventEmitter<void>();

  /**
   * Collection of available map layers from MapLayerService
   */
  layers: MapLayer[] = [];

  /**
   * Name of the currently selected map layer
   */
  selectedLayerName: string;

  /**
   * Controls the visibility of the settings panel
   */
  isVisible: boolean = true;

  /**
   * Constructor for the SettingsPanelComponent
   *
   * Initializes the component by fetching available map layers and
   * setting the initially selected layer from the MapLayerService.
   *
   * @param mapLayerService Service that provides map layer configurations
   */
  constructor(private mapLayerService: MapLayerService) {
    this.layers = this.mapLayerService.getLayers();
    this.selectedLayerName = this.mapLayerService.getSelectedLayer().name;
  }

  /**
   * Angular lifecycle hook that is called after component initialization
   */
  ngOnInit(): void {}

  /**
   * Handles layer selection changes
   *
   * Updates the selected map layer in the MapLayerService when the user
   * selects a different layer in the settings panel.
   */
  onLayerChange(): void {
    this.mapLayerService.setSelectedLayer(this.selectedLayerName);
  }

  /**
   * Handles panel hide events
   *
   * Emits the closePanel event when the panel is hidden, notifying
   * the parent component that the panel has been closed.
   */
  onHide(): void {
    this.closePanel.emit();
  }
}
