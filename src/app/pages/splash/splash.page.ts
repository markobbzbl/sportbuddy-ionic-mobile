import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonSpinner,
  IonText,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { wifi, cloudOffline, checkmarkCircle, closeCircle } from 'ionicons/icons';
import { ConnectivityService } from '../../services/connectivity.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  imports: [
    CommonModule,
    IonContent,
    IonSpinner,
    IonText,
    IonIcon
  ]
})
export class SplashPage implements OnInit {
  constructor(
    private connectivityService: ConnectivityService,
    private authService: AuthService,
    private router: Router
  ) {
    addIcons({ wifi, cloudOffline, checkmarkCircle, closeCircle });
  }

  async ngOnInit() {
    await this.performChecks();
  }

  async performChecks() {
    // Check connectivity (runs in background)
    this.connectivityService.checkConnectivity();
    
    // Initialize auth (this also checks session)
    await this.authService.initAuth();
    
    // Wait a minimum time for smooth animation (at least 1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Navigate to app
    this.navigateToApp();
  }

  navigateToApp() {
    const isAuthenticated = this.authService.isAuthenticated();
    if (isAuthenticated) {
      this.router.navigate(['/tabs']);
    } else {
      this.router.navigate(['/login']);
    }
  }
}

