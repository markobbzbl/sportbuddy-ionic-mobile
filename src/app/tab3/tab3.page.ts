import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonInput,
  IonAvatar,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonToast,
  IonSpinner,
  IonText,
  IonToggle
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { person, camera, logOut, save, create, moon, sunny, images } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { AuthService } from '../services/auth.service';
import { SupabaseService, Profile } from '../services/supabase.service';
import { StorageService } from '../services/storage.service';
import { ThemeService } from '../services/theme.service';
import { OfflineService } from '../services/offline.service';
import { QueueService } from '../services/queue.service';
import { SyncService } from '../services/sync.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    IonItem,
    IonLabel,
    IonInput,
    IonAvatar,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonToast,
    IonSpinner,
    IonText,
    IonToggle
  ]
})
export class Tab3Page implements OnInit, OnDestroy {
  profile: Profile | null = null;
  profileForm: FormGroup;
  isLoading = false;
  isEditing = false;
  avatarUrl: string | null = null;
  errorMessage = '';
  successMessage = '';
  isDarkMode = false;
  userEmail: string = '';
  isOnline = true;
  private subscriptions: Subscription[] = [];
  private successMessageTimeout?: any;

  constructor(
    private authService: AuthService,
    private supabase: SupabaseService,
    private storage: StorageService,
    private themeService: ThemeService,
    private offlineService: OfflineService,
    private queueService: QueueService,
    private syncService: SyncService,
    private router: Router,
    private fb: FormBuilder
  ) {
    addIcons({ person, camera, logOut, save, create, moon, sunny, images });

    this.profileForm = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(1)]],
      last_name: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  async ngOnInit() {
    // Subscribe to online status
    const onlineSub = this.offlineService.isOnline$.subscribe(isOnline => {
      this.isOnline = isOnline;
      if (isOnline) {
        this.syncService.syncQueue();
      }
    });
    this.subscriptions.push(onlineSub);

    const themeSub = this.themeService.darkMode$.subscribe(dark => {
      this.isDarkMode = dark;
    });
    this.subscriptions.push(themeSub);

    // Subscribe to user changes to clear profile when user changes
    const userSub = this.authService.currentUser$.subscribe(user => {
      if (!user) {
        // User logged out - clear profile state
        this.profile = null;
        this.avatarUrl = null;
        this.userEmail = '';
        this.profileForm.reset();
      } else {
        // User changed - reload profile
        this.loadProfile();
      }
    });
    this.subscriptions.push(userSub);

    await this.loadProfile();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.successMessageTimeout) {
      clearTimeout(this.successMessageTimeout);
    }
  }

  private setSuccessMessage(message: string) {
    this.successMessage = message;
    // Clear any existing timeout
    if (this.successMessageTimeout) {
      clearTimeout(this.successMessageTimeout);
    }
    // Auto-dismiss after 3 seconds
    this.successMessageTimeout = setTimeout(() => {
      this.successMessage = '';
    }, 3000);
  }

  async loadProfile() {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    this.userEmail = user.email || '';

    this.isLoading = true;
    try {
      // Try to load from server if online
      if (this.isOnline) {
        try {
          const profile = await this.supabase.getProfile(user.id);
          if (profile) {
            this.profile = profile;
            this.avatarUrl = profile.avatar_url || null;
            this.profileForm.patchValue({
              first_name: profile.first_name || '',
              last_name: profile.last_name || ''
            });
            // Store offline
            await this.storage.set('offline_profile', profile);
            return;
          }
        } catch (error: any) {
          // If online but request failed, fall through to offline loading
          console.error('Error loading profile from server:', error);
        }
      }

      // Load from offline storage, but ONLY if it belongs to the current user
      const offlineProfile = await this.storage.get<Profile>('offline_profile');
      if (offlineProfile && offlineProfile.id === user.id) {
        // Only use offline profile if it belongs to the current user
        this.profile = offlineProfile;
        this.avatarUrl = offlineProfile.avatar_url || null;
        this.profileForm.patchValue({
          first_name: offlineProfile.first_name || '',
          last_name: offlineProfile.last_name || ''
        });
      } else {
        // Profile doesn't belong to current user or doesn't exist - clear it
        if (offlineProfile && offlineProfile.id !== user.id) {
          await this.storage.remove('offline_profile');
        }
        // No profile found, create empty one
        this.profile = {
          id: user.id,
          first_name: '',
          last_name: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
      // Try offline storage as last resort, but ONLY if it belongs to the current user
      try {
        const offlineProfile = await this.storage.get<Profile>('offline_profile');
        if (offlineProfile && offlineProfile.id === user.id) {
          // Only use offline profile if it belongs to the current user
          this.profile = offlineProfile;
          this.avatarUrl = offlineProfile.avatar_url || null;
          this.profileForm.patchValue({
            first_name: offlineProfile.first_name || '',
            last_name: offlineProfile.last_name || ''
          });
        } else if (offlineProfile && offlineProfile.id !== user.id) {
          // Profile doesn't belong to current user - clear it
          await this.storage.remove('offline_profile');
        }
      } catch (storageError) {
        console.error('Error loading from storage:', storageError);
      }
    } finally {
      this.isLoading = false;
    }
  }

  async takePicture() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });

      if (image.dataUrl) {
        this.avatarUrl = image.dataUrl;
        await this.uploadAvatar(image.dataUrl);
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled photos app') {
        this.errorMessage = 'Fehler beim Aufnehmen des Fotos';
      }
    }
  }

  async selectPicture() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });

      if (image.dataUrl) {
        this.avatarUrl = image.dataUrl;
        await this.uploadAvatar(image.dataUrl);
      }
    } catch (error: any) {
      if (error.message !== 'User cancelled photos app') {
        this.errorMessage = 'Fehler beim Auswählen des Fotos';
      }
    }
  }

  async uploadAvatar(dataUrl: string) {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    this.isLoading = true;
    try {
      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

      if (this.isOnline) {
        try {
          const { data, error } = await this.supabase.uploadAvatar(user.id, file);
          if (error) throw error;

          if (data?.publicUrl) {
            // Update profile with new avatar URL
            const { data: updatedProfile, error: updateError } = await this.supabase.updateProfile(user.id, { avatar_url: data.publicUrl });
            if (updateError) throw updateError;
            
            // Update local state immediately
            if (updatedProfile) {
              this.profile = updatedProfile;
              this.avatarUrl = updatedProfile.avatar_url || data.publicUrl;
              await this.storage.set('offline_profile', updatedProfile);
            } else {
              this.avatarUrl = data.publicUrl;
            }
            
            this.setSuccessMessage('Profilbild erfolgreich aktualisiert');
            // Reload profile to ensure everything is in sync
            await this.loadProfile();
          }
        } catch (error: any) {
          // If online but failed, save locally and queue
          if (!this.isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
            // Save avatar URL locally
            this.avatarUrl = dataUrl;
            await this.queueService.addOperation({
              type: 'update',
              entity: 'profile',
              data: { avatar_url: dataUrl } // Will need to upload when online
            });
            this.setSuccessMessage('Profilbild wird synchronisiert, sobald Sie online sind');
          } else {
            throw error;
          }
        }
      } else {
        // Offline: save locally and queue
        this.avatarUrl = dataUrl;
        await this.queueService.addOperation({
          type: 'update',
          entity: 'profile',
          data: { avatar_url: dataUrl } // Will need to upload when online
        });
        this.setSuccessMessage('Profilbild wird synchronisiert, sobald Sie online sind');
      }
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      this.errorMessage = 'Fehler beim Hochladen des Profilbilds';
    } finally {
      this.isLoading = false;
    }
  }

  toggleEdit() {
    this.isEditing = !this.isEditing;
    if (!this.isEditing && this.profile) {
      this.profileForm.patchValue({
        first_name: this.profile.first_name || '',
        last_name: this.profile.last_name || ''
      });
    }
  }

  async saveProfile() {
    if (this.profileForm.invalid) {
      this.markFormGroupTouched(this.profileForm);
      return;
    }

    const user = this.authService.getCurrentUser();
    if (!user) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const profileUpdates = this.profileForm.value;

      if (this.isOnline) {
        // Online: try to update directly
        try {
          const { data, error } = await this.supabase.updateProfile(user.id, profileUpdates);
          if (error) throw error;

          if (data) {
            this.profile = data;
            await this.storage.set('offline_profile', data);
            this.setSuccessMessage('Profil erfolgreich aktualisiert');
            this.isEditing = false;
          }
        } catch (error: any) {
          // If online but failed, queue it
          if (!this.isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
            await this.queueService.addOperation({
              type: 'update',
              entity: 'profile',
              data: profileUpdates
            });
            // Update local profile immediately
            this.profile = { ...this.profile!, ...profileUpdates };
            await this.storage.set('offline_profile', this.profile);
            this.setSuccessMessage('Profil wird synchronisiert, sobald Sie online sind');
            this.isEditing = false;
          } else {
            throw error;
          }
        }
      } else {
        // Offline: queue the update
        await this.queueService.addOperation({
          type: 'update',
          entity: 'profile',
          data: profileUpdates
        });
        // Update local profile immediately
        this.profile = { ...this.profile!, ...profileUpdates };
        await this.storage.set('offline_profile', this.profile);
        this.successMessage = 'Profil wird synchronisiert, sobald Sie online sind';
        this.isEditing = false;
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Fehler beim Aktualisieren des Profils';
    } finally {
      this.isLoading = false;
    }
  }

  async signOut() {
    if (!confirm('Möchten Sie sich wirklich abmelden?')) {
      return;
    }

    this.isLoading = true;
    try {
      // Clear local profile state before signing out
      this.profile = null;
      this.avatarUrl = null;
      this.userEmail = '';
      this.profileForm.reset();
      
      await this.authService.signOut();
      this.router.navigate(['/login']);
    } catch (error: any) {
      this.errorMessage = 'Fehler beim Abmelden';
    } finally {
      this.isLoading = false;
    }
  }

  async toggleDarkMode() {
    await this.themeService.toggleDarkMode();
  }

  getProfileName(): string {
    if (!this.profile) return 'Kein Name';
    const firstName = this.profile.first_name || '';
    const lastName = this.profile.last_name || '';
    return `${firstName} ${lastName}`.trim() || 'Kein Name';
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}
