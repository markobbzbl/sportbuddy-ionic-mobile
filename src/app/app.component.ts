import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { ThemeService } from './services/theme.service';
import { SyncService } from './services/sync.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit, OnDestroy {
  private themeSubscription?: Subscription;

  constructor(
    private themeService: ThemeService,
    private syncService: SyncService
  ) {}

  ngOnInit() {
    this.themeSubscription = this.themeService.darkMode$.subscribe(isDark => {
      requestAnimationFrame(() => {
        const ionApp = document.querySelector('ion-app');
        if (ionApp) {
          if (isDark) {
            ionApp.classList.add('ion-palette-dark');
          } else {
            ionApp.classList.remove('ion-palette-dark');
          }
        }
        
        if (isDark) {
          document.body.classList.add('ion-palette-dark');
          document.documentElement.classList.add('ion-palette-dark');
        } else {
          document.body.classList.remove('ion-palette-dark');
          document.documentElement.classList.remove('ion-palette-dark');
        }
      });
    });
    
    setTimeout(() => {
      const isDark = this.themeService.isDarkMode();
      const ionApp = document.querySelector('ion-app');
      if (ionApp) {
        if (isDark) {
          ionApp.classList.add('ion-palette-dark');
        } else {
          ionApp.classList.remove('ion-palette-dark');
        }
      }
      
      if (isDark) {
        document.body.classList.add('ion-palette-dark');
        document.documentElement.classList.add('ion-palette-dark');
      } else {
        document.body.classList.remove('ion-palette-dark');
        document.documentElement.classList.remove('ion-palette-dark');
      }
    }, 300);
  }

  ngOnDestroy() {
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }
}
