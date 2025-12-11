import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonItem,
  IonLabel,
  IonAvatar,
  IonRefresher,
  IonRefresherContent,
  IonFab,
  IonFabButton,
  IonModal,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonToast,
  IonSpinner,
  IonButtons,
  IonText,
  IonBadge
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, location, time, person, create, trash, close, cloudOffline } from 'ionicons/icons';
import { SupabaseService, TrainingOffer, Profile } from '../services/supabase.service';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { OfflineService } from '../services/offline.service';
import { QueueService } from '../services/queue.service';
import { SyncService } from '../services/sync.service';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
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
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonItem,
    IonLabel,
    IonAvatar,
    IonRefresher,
    IonRefresherContent,
    IonFab,
    IonFabButton,
    IonModal,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonToast,
    IonSpinner,
    IonButtons,
    IonText,
    IonBadge
  ]
})
export class Tab1Page implements OnInit, OnDestroy {
  trainingOffers: TrainingOffer[] = [];
  isLoading = false;
  isModalOpen = false;
  isEditMode = false;
  editingOffer: TrainingOffer | null = null;
  offerForm: FormGroup;
  errorMessage = '';
  successMessage = '';
  isOnline = true;
  queueCount = 0;
  private subscriptions: Subscription[] = [];

  sportTypes = [
    'Fußball',
    'Basketball',
    'Tennis',
    'Joggen',
    'Fahrrad fahren',
    'Schwimmen',
    'Volleyball',
    'Badminton',
    'Tischtennis',
    'Fitness',
    'Yoga',
    'Andere'
  ];

  constructor(
    private supabase: SupabaseService,
    private authService: AuthService,
    private storage: StorageService,
    private offlineService: OfflineService,
    private queueService: QueueService,
    private syncService: SyncService,
    private fb: FormBuilder
  ) {
    addIcons({ add, location, time, person, create, trash, close, cloudOffline });

    this.offerForm = this.fb.group({
      sport_type: ['', Validators.required],
      location: ['', Validators.required],
      date_time: ['', Validators.required],
      description: ['']
    });
  }

  async ngOnInit() {
    // Initialize online status immediately
    this.isOnline = this.offlineService.isOnline;
    console.log('Initial online status:', this.isOnline);

    // Subscribe to online status - this will update immediately when WiFi is turned off
    const onlineSub = this.offlineService.isOnline$.subscribe(isOnline => {
      console.log('Online status changed:', isOnline);
      this.isOnline = isOnline;
      if (isOnline) {
        this.syncService.syncQueue();
      } else {
        // When going offline, reload from storage to show offline-created items
        this.loadTrainingOffers();
      }
    });
    this.subscriptions.push(onlineSub);

    // Subscribe to sync completion to reload data
    const syncSub = this.syncService.syncComplete$.subscribe(synced => {
      if (synced) {
        this.loadTrainingOffers();
      }
    });
    this.subscriptions.push(syncSub);

    // Subscribe to queue changes
    const queueSub = this.queueService.queue$.subscribe(queue => {
      this.queueCount = queue.length;
    });
    this.subscriptions.push(queueSub);

    await this.loadTrainingOffers();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async loadTrainingOffers() {
    this.isLoading = true;
    this.errorMessage = '';
    
    try {
      // Always try to load from server first if online
      if (this.isOnline) {
        try {
          const { data, error } = await this.supabase.getTrainingOffers();
          if (error) throw error;

          if (data) {
            // Ensure profiles are loaded for all offers
            const currentUser = this.authService.getCurrentUser();
            const currentProfile = this.authService.getCurrentProfile();
            
            // If any offer is missing profile data and it's the current user's offer, add it
            let serverOffers = data.map(offer => {
              if (!offer.profiles && currentUser && offer.user_id === currentUser.id && currentProfile) {
                return { ...offer, profiles: currentProfile };
              }
              return offer;
            });

            // Merge with offline-created offers (those with temp IDs)
            const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
            
            // Combine: server offers + offline created offers (filter out any that might have been synced)
            const serverOfferIds = new Set(serverOffers.map(o => o.id));
            const offlineOnly = offlineCreated.filter(o => o.id.startsWith('temp_') && !serverOfferIds.has(o.id));
            
            this.trainingOffers = [...serverOffers, ...offlineOnly].sort((a, b) => {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            
            // Store combined list for offline use
            await this.storage.set('offline_training_offers', this.trainingOffers);
            // Keep offline-created offers separate
            await this.storage.set('offline_created_offers', offlineOnly);
            return; // Success, exit early
          }
        } catch (error: any) {
          // If online but request failed, fall through to offline loading
          console.error('Error loading from server:', error);
          // Don't throw, fall through to offline loading
        }
      }
      
      // Load from offline storage (either offline mode or server failed)
      const offlineOffers = await this.storage.get<TrainingOffer[]>('offline_training_offers') || [];
      const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
      
      console.log('Loading offline offers:', { offlineOffers: offlineOffers.length, offlineCreated: offlineCreated.length });
      
      // Merge offline offers
      const offlineOfferIds = new Set(offlineOffers.map(o => o.id));
      const allOfflineCreated = offlineCreated.filter(o => !offlineOfferIds.has(o.id));
      
      this.trainingOffers = [...offlineOffers, ...allOfflineCreated].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      console.log('Final training offers:', this.trainingOffers.length, this.trainingOffers.map(o => ({ id: o.id, sport: o.sport_type, isOffline: this.isOfflineOffer(o) })));
      
      if (this.trainingOffers.length > 0) {
        this.errorMessage = '';
      } else {
        this.errorMessage = '';
      }
    } catch (error: any) {
      console.error('Error loading training offers:', error);
      // Last resort: try to load from storage
      try {
        const offlineOffers = await this.storage.get<TrainingOffer[]>('offline_training_offers') || [];
        this.trainingOffers = offlineOffers;
        if (offlineOffers.length === 0) {
          this.errorMessage = 'Keine gespeicherten Angebote verfügbar';
        }
      } catch (storageError) {
        console.error('Error loading from storage:', storageError);
        this.trainingOffers = [];
        this.errorMessage = 'Fehler beim Laden der Trainingsangebote';
      }
    } finally {
      this.isLoading = false;
    }
  }

  async handleRefresh(event: any) {
    await this.loadTrainingOffers();
    event.target.complete();
  }

  openCreateModal() {
    this.isEditMode = false;
    this.editingOffer = null;
    this.offerForm.reset();
    this.isModalOpen = true;
  }

  async onSubmitOffer() {
    if (this.offerForm.invalid) {
      this.markFormGroupTouched(this.offerForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const user = this.authService.getCurrentUser();
      if (!user) {
        throw new Error('Nicht angemeldet');
      }

      const formValue = this.offerForm.value;

      if (this.isEditMode && this.editingOffer) {
        // Update existing offer
        if (this.isOnline) {
          // Online: try to update directly
          try {
            const { error } = await this.supabase.updateTrainingOffer(
              this.editingOffer.id,
              formValue
            );
            if (error) throw error;
            this.successMessage = 'Trainingsangebot erfolgreich aktualisiert';
          } catch (error: any) {
            // If online but failed, queue it
            if (!this.isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
              if (!this.editingOffer) return;
              
              await this.queueService.addOperation({
                type: 'update',
                entity: 'training_offer',
                data: { id: this.editingOffer.id, updates: formValue }
              });
              
              // Update local display immediately
              const updatedOffer: TrainingOffer = {
                ...this.editingOffer,
                ...formValue,
                updated_at: new Date().toISOString()
              };
              
              // Update in the list
              this.trainingOffers = this.trainingOffers.map(o => 
                o.id === this.editingOffer!.id ? updatedOffer : o
              );
              
              // Update storage
              await this.storage.set('offline_training_offers', this.trainingOffers);
              
              // If it's an offline-created offer, update it in offline_created_offers too
              if (this.editingOffer.id.startsWith('temp_')) {
                const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
                const updatedOfflineCreated = offlineCreated.map(o => 
                  o.id === this.editingOffer!.id ? updatedOffer : o
                );
                await this.storage.set('offline_created_offers', updatedOfflineCreated);
              }
              
              this.successMessage = 'Trainingsangebot wird synchronisiert, sobald Sie online sind';
            } else {
              throw error;
            }
          }
        } else {
          // Offline: queue the update
          if (!this.editingOffer) return;
          
          await this.queueService.addOperation({
            type: 'update',
            entity: 'training_offer',
            data: { id: this.editingOffer.id, updates: formValue }
          });
          
          // Update local display immediately
          const updatedOffer: TrainingOffer = {
            ...this.editingOffer,
            ...formValue,
            updated_at: new Date().toISOString()
          };
          
          // Update in the list
          this.trainingOffers = this.trainingOffers.map(o => 
            o.id === this.editingOffer!.id ? updatedOffer : o
          );
          
          // Update storage
          await this.storage.set('offline_training_offers', this.trainingOffers);
          
          // If it's an offline-created offer, update it in offline_created_offers too
          if (this.editingOffer.id.startsWith('temp_')) {
            const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
            const updatedOfflineCreated = offlineCreated.map(o => 
              o.id === this.editingOffer!.id ? updatedOffer : o
            );
            await this.storage.set('offline_created_offers', updatedOfflineCreated);
          }
          
          this.successMessage = 'Trainingsangebot wird synchronisiert, sobald Sie online sind';
        }
      } else {
        // Create new offer
        if (this.isOnline) {
          // Online: try to create directly
          try {
            const { error } = await this.supabase.createTrainingOffer({
              user_id: user.id,
              ...formValue
            });
            if (error) throw error;
            this.successMessage = 'Trainingsangebot erfolgreich erstellt';
          } catch (error: any) {
            // If online but failed, queue it
            if (!this.isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
              await this.queueService.addOperation({
                type: 'create',
                entity: 'training_offer',
                data: { user_id: user.id, ...formValue }
              });
              this.successMessage = 'Trainingsangebot wird synchronisiert, sobald Sie online sind';
            } else {
              throw error;
            }
          }
        } else {
          // Offline: queue the create
          const tempId = `temp_${Date.now()}`;
          await this.queueService.addOperation({
            type: 'create',
            entity: 'training_offer',
            data: { user_id: user.id, ...formValue, tempId }
          });
          this.successMessage = 'Trainingsangebot wird synchronisiert, sobald Sie online sind';
          
          // Add to local display immediately
          const currentProfile = this.authService.getCurrentProfile();
          const newOffer: TrainingOffer = {
            id: tempId,
            user_id: user.id,
            sport_type: formValue.sport_type,
            location: formValue.location,
            date_time: formValue.date_time,
            description: formValue.description || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            profiles: currentProfile || undefined
          };
          
          // Add to offline-created offers storage
          const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
          offlineCreated.push(newOffer);
          await this.storage.set('offline_created_offers', offlineCreated);
          
          // Update display immediately - add to beginning of list
          this.trainingOffers = [newOffer, ...this.trainingOffers].sort((a, b) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          // Also update main offline storage
          await this.storage.set('offline_training_offers', this.trainingOffers);
          
          // Clear error message since we successfully created it offline
          this.errorMessage = '';
          
          // Force UI update
          console.log('Offline offer created:', newOffer);
          console.log('Current offers:', this.trainingOffers);
        }
      }

      // Always reload to ensure consistency, but don't wait if offline
      if (this.isOnline) {
        await this.loadTrainingOffers();
      } else {
        // When offline, just ensure the list is updated
        // The offer is already added above
      }
      
      this.isModalOpen = false;
      this.offerForm.reset();
    } catch (error: any) {
      this.errorMessage = error.message || 'Fehler beim Speichern des Trainingsangebots';
    } finally {
      this.isLoading = false;
    }
  }

  openEditModal(offer: TrainingOffer) {
    this.isEditMode = true;
    this.editingOffer = offer;
    this.offerForm.patchValue({
      sport_type: offer.sport_type,
      location: offer.location,
      date_time: offer.date_time ? new Date(offer.date_time).toISOString().slice(0, 16) : '',
      description: offer.description || ''
    });
    this.isModalOpen = true;
  }

  async deleteOffer(offer: TrainingOffer) {
    if (!confirm('Möchten Sie dieses Trainingsangebot wirklich löschen?')) {
      return;
    }

    this.isLoading = true;
    try {
      if (this.isOnline) {
        try {
          const { error } = await this.supabase.deleteTrainingOffer(offer.id);
          if (error) throw error;
          this.successMessage = 'Trainingsangebot erfolgreich gelöscht';
          await this.loadTrainingOffers();
        } catch (error: any) {
          // If online but failed, queue it
          if (!this.isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
            await this.queueService.addOperation({
              type: 'delete',
              entity: 'training_offer',
              data: { id: offer.id }
            });
            
            // Remove from local display
            this.trainingOffers = this.trainingOffers.filter(o => o.id !== offer.id);
            await this.storage.set('offline_training_offers', this.trainingOffers);
            
            // If it's an offline-created offer, remove it from offline_created_offers too
            if (offer.id.startsWith('temp_')) {
              const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
              const updatedOfflineCreated = offlineCreated.filter(o => o.id !== offer.id);
              await this.storage.set('offline_created_offers', updatedOfflineCreated);
            }
            
            this.successMessage = 'Löschung wird synchronisiert, sobald Sie online sind';
          } else {
            throw error;
          }
        }
      } else {
        // Offline: queue the delete
        await this.queueService.addOperation({
          type: 'delete',
          entity: 'training_offer',
          data: { id: offer.id }
        });
        
        // Remove from local display
        this.trainingOffers = this.trainingOffers.filter(o => o.id !== offer.id);
        await this.storage.set('offline_training_offers', this.trainingOffers);
        
        // If it's an offline-created offer, remove it from offline_created_offers too
        if (offer.id.startsWith('temp_')) {
          const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
          const updatedOfflineCreated = offlineCreated.filter(o => o.id !== offer.id);
          await this.storage.set('offline_created_offers', updatedOfflineCreated);
        }
        
        this.successMessage = 'Löschung wird synchronisiert, sobald Sie online sind';
      }
    } catch (error: any) {
      this.errorMessage = error.message || 'Fehler beim Löschen des Trainingsangebots';
    } finally {
      this.isLoading = false;
    }
  }

  canEditOrDelete(offer: TrainingOffer): boolean {
    const user = this.authService.getCurrentUser();
    return user?.id === offer.user_id;
  }

  isOfflineOffer(offer: TrainingOffer): boolean {
    return offer.id.startsWith('temp_');
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getProfileName(profile?: Profile, offerUserId?: string): string {
    // If no profile provided, try to get current user's profile for their own offers
    if (!profile && offerUserId) {
      const currentUser = this.authService.getCurrentUser();
      if (currentUser?.id === offerUserId) {
        const currentProfile = this.authService.getCurrentProfile();
        if (currentProfile) {
          const firstName = currentProfile.first_name || '';
          const lastName = currentProfile.last_name || '';
          const name = `${firstName} ${lastName}`.trim();
          if (name) return name;
        }
      }
    }
    
    if (!profile) return 'Unbekannt';
    const firstName = profile.first_name || '';
    const lastName = profile.last_name || '';
    const name = `${firstName} ${lastName}`.trim();
    
    // If profile exists but name is empty, try to fetch from database
    if (!name && profile.id) {
      // Return a placeholder, but ideally we'd fetch it here
      // For now, return 'Unbekannt' but log for debugging
      console.warn('Profile exists but name is empty:', profile.id);
      return 'Unbekannt';
    }
    
    return name || 'Unbekannt';
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getMinDateTime(): string {
    return new Date().toISOString().slice(0, 16);
  }

  closeModal() {
    this.isModalOpen = false;
    this.offerForm.reset();
    this.editingOffer = null;
    this.isEditMode = false;
  }
}
