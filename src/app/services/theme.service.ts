import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private darkModeSubject = new BehaviorSubject<boolean>(false);
  public darkMode$: Observable<boolean> = this.darkModeSubject.asObservable();

  constructor(private storage: StorageService) {
    // Initialize theme asynchronously
    this.initTheme();
    
    // Also apply initial theme state immediately if available in localStorage (synchronous fallback)
    try {
      const savedThemeStr = localStorage.getItem('darkMode');
      if (savedThemeStr !== null) {
        const savedTheme = savedThemeStr === 'true';
        this.darkModeSubject.next(savedTheme);
        this.applyDarkClassSync(savedTheme);
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  private applyDarkClassSync(enabled: boolean) {
    const ionApp = document.querySelector('ion-app');
    if (ionApp) {
      if (enabled) {
        console.log('Adding ion-palette-dark class to ion-app');
        ionApp.classList.add('ion-palette-dark');
      } else {
        console.log('Removing ion-palette-dark class from ion-app');
        ionApp.classList.remove('ion-palette-dark');
      }
    }
    
    // Also apply to body and html for complete coverage
    if (enabled) {
      document.body.classList.add('ion-palette-dark');
      document.documentElement.classList.add('ion-palette-dark');
    } else {
      document.body.classList.remove('ion-palette-dark');
      document.documentElement.classList.remove('ion-palette-dark');
    }
  }

  async initTheme() {
    try {
      const savedTheme = await this.storage.get<boolean>('darkMode');
      if (savedTheme !== null) {
        await this.setDarkMode(savedTheme);
      } else {
        // Check system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        await this.setDarkMode(prefersDark);
      }
    } catch (error) {
      console.error('Error initializing theme:', error);
      // Fallback to light mode
      await this.setDarkMode(false);
    }
  }

  async toggleDarkMode() {
    const current = this.darkModeSubject.value;
    await this.setDarkMode(!current);
  }

  async setDarkMode(enabled: boolean) {
    this.darkModeSubject.next(enabled);
    
    // Apply dark mode class - Ionic requires it on ion-app
    // Use a helper function that we can call multiple times
    const applyDarkClass = () => {
      this.applyDarkClassSync(enabled);
    };
    
    // Apply immediately
    applyDarkClass();
    
    // Use multiple strategies to ensure it's applied
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(applyDarkClass);
    }
    
    // Also try with setTimeout as fallback
    setTimeout(applyDarkClass, 0);
    setTimeout(applyDarkClass, 100);
    setTimeout(applyDarkClass, 300);
    
    // Also store in localStorage for synchronous access
    try {
      localStorage.setItem('darkMode', enabled.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
    
    await this.storage.set('darkMode', enabled);
  }

  isDarkMode(): boolean {
    return this.darkModeSubject.value;
  }
}


