import { Component, EventEmitter, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import {SelectItem} from 'primeng/api';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [ButtonModule, SelectButtonModule, FormsModule],
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class HeaderComponent {
  @Output() viewChange = new EventEmitter<string>();

  viewOptions: SelectItem[] = [
    { label: 'Map', value: 'map' },
    { label: 'Gallery', value: 'gallery' }
  ];

  selectedView: string = 'map';

  onViewChange() {
    this.viewChange.emit(this.selectedView);
  }
}
