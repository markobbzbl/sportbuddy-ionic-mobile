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
  IonBadge,
  IonList,
  IonListHeader,
  IonSearchbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, location, time, person, create, trash, close, cloudOffline, people, checkmarkCircle, addCircleOutline, closeCircle, filter, closeCircleOutline, mic, stop, play, pause } from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { SupabaseService, TrainingOffer, Profile, Participant } from '../services/supabase.service';
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
    IonBadge,
    IonList,
    IonListHeader,
    IonSearchbar
  ]
})
export class Tab1Page implements OnInit, OnDestroy {
  trainingOffers: TrainingOffer[] = [];
  filteredOffers: TrainingOffer[] = [];
  isLoading = false;
  isModalOpen = false;
  isEditMode = false;
  editingOffer: TrainingOffer | null = null;
  offerForm: FormGroup;
  errorMessage = '';
  successMessage = '';
  isOnline = true;
  queueCount = 0;
  participantsModalOpen = false;
  selectedOfferParticipants: Participant[] = [];
  selectedOffer: TrainingOffer | null = null;
  loadingParticipants = false;
  sportTypeFilter: string = '';
  nameFilter: string = '';
  private subscriptions: Subscription[] = [];
  private successMessageTimeout?: any;
  
  // Geolocation properties
  mapModalOpen = false;
  selectedLatitude: number | null = null;
  selectedLongitude: number | null = null;
  selectedAddress: string = '';
  isGettingLocation = false;

  // Voice memo properties
  isRecording = false;
  recordingTime = 0;
  recordingInterval: any = null;
  recordedAudioUrl: string | null = null;
  recordedAudioBlob: Blob | null = null;
  isPlayingAudio = false;
  audioPlayer: HTMLAudioElement | null = null;
  waveformBars: number[] = [];
  playingAudioUrl: string | null = null;
  playingAudioElement: HTMLAudioElement | null = null;
  voiceMemoWaveforms: Map<string, number[]> = new Map();
  waveformAnimationIntervals: Map<string, any> = new Map();

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
    addIcons({ add, location, time, person, create, trash, close, cloudOffline, people, checkmarkCircle, addCircleOutline, closeCircle, filter, closeCircleOutline, mic, stop, play, pause });

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
    // Initialize filteredOffers with all offers
    this.filteredOffers = [...this.trainingOffers];
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
            
            // Apply filters after loading
            this.applyFilters();
            
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
      
      // Apply filters after loading
      this.applyFilters();
      
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
      // Apply filters after loading completes
      this.applyFilters();
    }
  }

  applyFilters() {
    let filtered = [...this.trainingOffers];

    // Filter by sport type
    if (this.sportTypeFilter) {
      filtered = filtered.filter(offer => offer.sport_type === this.sportTypeFilter);
    }

    // Filter by name (username)
    if (this.nameFilter && this.nameFilter.trim()) {
      const searchTerm = this.nameFilter.trim().toLowerCase();
      filtered = filtered.filter(offer => {
        const profileName = this.getProfileName(offer.profiles, offer.user_id).toLowerCase();
        return profileName.includes(searchTerm);
      });
    }

    this.filteredOffers = filtered;
  }

  onSportFilterChange(event: any) {
    this.sportTypeFilter = event.detail.value || '';
    this.applyFilters();
  }

  onNameFilterChange(event: any) {
    this.nameFilter = event.detail.value || '';
    this.applyFilters();
  }

  clearFilters() {
    this.sportTypeFilter = '';
    this.nameFilter = '';
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return !!(this.sportTypeFilter || (this.nameFilter && this.nameFilter.trim()));
  }

  async handleRefresh(event: any) {
    await this.loadTrainingOffers();
    event.target.complete();
  }

  openCreateModal() {
    this.isEditMode = false;
    this.editingOffer = null;
    this.offerForm.reset();
    this.resetVoiceMemo();
    this.isModalOpen = true;
  }

  async startRecording() {
    try {
      // Request permissions
      const permissionResult = await VoiceRecorder.requestAudioRecordingPermission();
      if (!permissionResult.value) {
        this.errorMessage = 'Mikrofon-Berechtigung wurde nicht erteilt';
        return;
      }

      // Start recording
      await VoiceRecorder.startRecording();
      this.isRecording = true;
      this.recordingTime = 0;
      this.generateWaveformBars();
      
      // Start timer
      this.recordingInterval = setInterval(() => {
        this.recordingTime++;
        // Update waveform during recording
        this.updateWaveformBars();
      }, 1000);
    } catch (error: any) {
      console.error('Error starting recording:', error);
      this.errorMessage = 'Fehler beim Starten der Aufnahme: ' + (error.message || 'Unbekannter Fehler');
      this.isRecording = false;
    }
  }

  generateWaveformBars() {
    // Generate random heights for waveform bars (simulating audio levels) - max 30px to fit container
    this.waveformBars = Array.from({ length: 30 }, () => Math.random() * 25 + 10);
  }

  updateWaveformBars() {
    // Update waveform bars with new random values during recording - max 30px to fit container
    if (this.isRecording) {
      this.waveformBars = this.waveformBars.map(() => Math.random() * 25 + 10);
    }
  }

  async stopRecording() {
    try {
      if (!this.isRecording) return;

      const result = await VoiceRecorder.stopRecording();
      
      if (result.value && result.value.recordDataBase64) {
        // Convert base64 to blob
        const base64Data = result.value.recordDataBase64;
        const mimeType = result.value.mimeType || 'audio/m4a';
        
        // Convert base64 to blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        this.recordedAudioBlob = new Blob([byteArray], { type: mimeType });
        
        // Create URL for playback
        this.recordedAudioUrl = URL.createObjectURL(this.recordedAudioBlob);
      }

      this.isRecording = false;
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }
    } catch (error: any) {
      console.error('Error stopping recording:', error);
      this.errorMessage = 'Fehler beim Stoppen der Aufnahme: ' + (error.message || 'Unbekannter Fehler');
      this.isRecording = false;
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }
    }
  }

  async playRecordedAudio() {
    if (!this.recordedAudioUrl) return;

    try {
      if (this.audioPlayer) {
        // If already playing, pause it
        if (!this.audioPlayer.paused) {
          this.audioPlayer.pause();
          this.isPlayingAudio = false;
          return;
        }
      }

      this.audioPlayer = new Audio(this.recordedAudioUrl);
      this.isPlayingAudio = true;

      // Animate waveform during playback
      this.animateWaveformDuringPlayback();

      this.audioPlayer.onended = () => {
        this.isPlayingAudio = false;
        this.audioPlayer = null;
        this.stopWaveformAnimation();
      };

      this.audioPlayer.onerror = () => {
        this.errorMessage = 'Fehler beim Abspielen der Aufnahme';
        this.isPlayingAudio = false;
        this.audioPlayer = null;
        this.stopWaveformAnimation();
      };

      await this.audioPlayer.play();
    } catch (error: any) {
      console.error('Error playing audio:', error);
      this.errorMessage = 'Fehler beim Abspielen der Aufnahme';
      this.isPlayingAudio = false;
      this.audioPlayer = null;
    }
  }

  animateWaveformDuringPlayback() {
    if (!this.isPlayingAudio) return;
    const animationInterval = setInterval(() => {
      if (!this.isPlayingAudio || !this.audioPlayer || this.audioPlayer.paused) {
        clearInterval(animationInterval);
        return;
      }
      this.updateWaveformBars();
    }, 100);
  }

  stopWaveformAnimation() {
    // Reset waveform to static state
    if (this.recordedAudioUrl) {
      this.generateWaveformBars();
    }
  }

  deleteRecordedAudio() {
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
    }
    if (this.recordedAudioUrl) {
      URL.revokeObjectURL(this.recordedAudioUrl);
    }
    this.recordedAudioUrl = null;
    this.recordedAudioBlob = null;
    this.isPlayingAudio = false;
    this.recordingTime = 0;
  }

  resetVoiceMemo() {
    this.deleteRecordedAudio();
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    this.isRecording = false;
    this.recordingTime = 0;
    this.waveformBars = [];
  }

  formatRecordingTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Parse description to extract text and voice memo URLs
  parseDescription(description: string | undefined): { text: string; voiceMemoUrl: string | null } {
    if (!description) return { text: '', voiceMemoUrl: null };
    
    // More robust regex to match voice memo pattern - handles any whitespace, newlines, etc.
    // Pattern: [Sprachnachricht: URL] with flexible spacing
    const voiceMemoRegex = /\[Sprachnachricht:\s*(https?:\/\/[^\]]+)\]/gi;
    
    // Use exec to find all matches (compatible with older TypeScript)
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(voiceMemoRegex.source, voiceMemoRegex.flags);
    
    while ((match = regex.exec(description)) !== null) {
      matches.push(match);
    }
    
    if (matches.length > 0) {
      // Extract URL from the last match (most recent voice memo)
      const lastMatch = matches[matches.length - 1];
      const voiceMemoUrl = lastMatch[1] || null;
      
      // Remove ALL voice memo patterns from description
      let text = description.replace(voiceMemoRegex, '');
      
      // Clean up extra whitespace and newlines
      text = text
        .replace(/\n\n+/g, '\n') // Replace multiple newlines with single
        .replace(/^\s+|\s+$/g, '') // Remove leading/trailing whitespace
        .replace(/^\n+|\n+$/g, '') // Remove leading/trailing newlines
        .trim();
      
      return { text, voiceMemoUrl };
    }
    
    return { text: description.trim(), voiceMemoUrl: null };
  }

  // Play voice memo from URL
  async playVoiceMemo(url: string) {
    try {
      if (this.playingAudioElement && this.playingAudioUrl === url) {
        if (!this.playingAudioElement.paused) {
          this.playingAudioElement.pause();
          this.playingAudioUrl = null;
          this.playingAudioElement = null;
          this.stopVoiceMemoWaveformAnimation(url);
          return;
        }
      }

      // Initialize waveform if not exists - max 30px to fit container
      if (!this.voiceMemoWaveforms.has(url)) {
        this.voiceMemoWaveforms.set(url, Array.from({ length: 30 }, () => Math.random() * 20 + 10));
      }

      this.playingAudioElement = new Audio(url);
      this.playingAudioUrl = url;

      // Start waveform animation
      this.startVoiceMemoWaveformAnimation(url);

      this.playingAudioElement.onended = () => {
        this.playingAudioUrl = null;
        this.playingAudioElement = null;
        this.stopVoiceMemoWaveformAnimation(url);
      };

      this.playingAudioElement.onerror = () => {
        this.errorMessage = 'Fehler beim Abspielen der Sprachnachricht';
        this.playingAudioUrl = null;
        this.playingAudioElement = null;
        this.stopVoiceMemoWaveformAnimation(url);
      };

      await this.playingAudioElement.play();
    } catch (error: any) {
      console.error('Error playing voice memo:', error);
      this.errorMessage = 'Fehler beim Abspielen der Sprachnachricht';
      this.playingAudioUrl = null;
      this.playingAudioElement = null;
      this.stopVoiceMemoWaveformAnimation(url);
    }
  }

  startVoiceMemoWaveformAnimation(url: string) {
    const interval = setInterval(() => {
      if (this.playingAudioUrl === url && this.playingAudioElement && !this.playingAudioElement.paused) {
        const currentWaveform = this.voiceMemoWaveforms.get(url) || [];
        // Max 30px to fit container
        const newWaveform = currentWaveform.map(() => Math.random() * 20 + 10);
        this.voiceMemoWaveforms.set(url, newWaveform);
      } else {
        this.stopVoiceMemoWaveformAnimation(url);
      }
    }, 150);
    this.waveformAnimationIntervals.set(url, interval);
  }

  stopVoiceMemoWaveformAnimation(url: string) {
    const interval = this.waveformAnimationIntervals.get(url);
    if (interval) {
      clearInterval(interval);
      this.waveformAnimationIntervals.delete(url);
    }
    // Reset to static waveform - max 30px to fit container
    if (this.voiceMemoWaveforms.has(url)) {
      this.voiceMemoWaveforms.set(url, Array.from({ length: 30 }, () => 15));
    }
  }

  getVoiceMemoWaveform(url: string): number[] {
    if (!this.voiceMemoWaveforms.has(url)) {
      // Default static waveform - max 30px to fit container
      this.voiceMemoWaveforms.set(url, Array.from({ length: 30 }, () => 15));
    }
    return this.voiceMemoWaveforms.get(url) || Array.from({ length: 30 }, () => 15);
  }

  isPlayingVoiceMemo(url: string): boolean {
    return this.playingAudioUrl === url && 
           this.playingAudioElement !== null && 
           this.playingAudioElement.paused === false;
  }

  getRandomWaveformHeight(): number {
    return Math.random() * 40 + 10;
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

      let formValue = { ...this.offerForm.value };

      // Check if we need to show confirmation dialog for voice memo replacement
      if (this.isEditMode && this.editingOffer && this.recordedAudioBlob) {
        const existingVoiceMemo = this.parseDescription(this.editingOffer.description).voiceMemoUrl;
        if (existingVoiceMemo) {
          const confirmed = confirm('Möchten Sie wirklich die Sprachnachricht ersetzen? Die alte Aufnahme wird überschrieben.');
          if (!confirmed) {
            this.isLoading = false;
            return; // User cancelled
          }
        }
      }

      // Handle voice memo upload if recorded
      if (this.recordedAudioBlob && this.isOnline) {
        try {
          const fileName = `voice-${Date.now()}.m4a`;
          const file = new File([this.recordedAudioBlob], fileName, { type: 'audio/m4a' });
          const { data: uploadData, error: uploadError } = await this.supabase.uploadVoiceMemo(user.id, file);
          
          if (uploadError) {
            console.error('Error uploading voice memo:', uploadError);
            // Continue without voice memo if upload fails
          } else if (uploadData?.publicUrl) {
            // Remove any existing voice memo URL from description and add new one
            // Match pattern with any whitespace/newlines
            const voiceMemoRegex = /\[Sprachnachricht:\s*https?:\/\/[^\]]+\]/gi;
            let cleanDescription = formValue.description ? formValue.description.replace(voiceMemoRegex, '') : '';
            // Clean up extra newlines
            cleanDescription = cleanDescription.replace(/\n\n+/g, '\n').replace(/^\n+|\n+$/g, '').trim();
            // Add new voice memo URL at the end
            formValue.description = cleanDescription 
              ? `${cleanDescription}\n\n[Sprachnachricht: ${uploadData.publicUrl}]`
              : `[Sprachnachricht: ${uploadData.publicUrl}]`;
          }
        } catch (error: any) {
          console.error('Error processing voice memo:', error);
          // Continue without voice memo if processing fails
        }
      } else if (this.recordedAudioBlob && !this.isOnline) {
        // Offline: store blob reference for later upload
        // For now, we'll just note that there's a voice memo to upload later
        // This could be enhanced to store the blob in IndexedDB
        console.log('Voice memo recorded offline, will need to upload when online');
      } else if (this.isEditMode && this.editingOffer && !this.recordedAudioBlob) {
        // No new voice memo recorded, preserve existing one if it exists
        const existingVoiceMemo = this.parseDescription(this.editingOffer.description).voiceMemoUrl;
        if (existingVoiceMemo) {
          // Preserve the existing voice memo by appending it to the description
          const cleanDescription = formValue.description ? formValue.description.trim() : '';
          formValue.description = cleanDescription 
            ? `${cleanDescription}\n\n[Sprachnachricht: ${existingVoiceMemo}]`
            : `[Sprachnachricht: ${existingVoiceMemo}]`;
        }
      }

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
            this.setSuccessMessage('Trainingsangebot erfolgreich aktualisiert');
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
              
              this.setSuccessMessage('Trainingsangebot wird synchronisiert, sobald Sie online sind');
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
          
          this.setSuccessMessage('Trainingsangebot wird synchronisiert, sobald Sie online sind');
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
            this.setSuccessMessage('Trainingsangebot erfolgreich erstellt');
          } catch (error: any) {
            // If online but failed, queue it
            if (!this.isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
              await this.queueService.addOperation({
                type: 'create',
                entity: 'training_offer',
                data: { user_id: user.id, ...formValue }
              });
              this.setSuccessMessage('Trainingsangebot wird synchronisiert, sobald Sie online sind');
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
          this.setSuccessMessage('Trainingsangebot wird synchronisiert, sobald Sie online sind');
          
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
      this.resetVoiceMemo();
    } catch (error: any) {
      this.errorMessage = error.message || 'Fehler beim Speichern des Trainingsangebots';
    } finally {
      this.isLoading = false;
    }
  }

  openEditModal(offer: TrainingOffer) {
    this.isEditMode = true;
    this.editingOffer = offer;
    this.resetVoiceMemo();
    
    // Parse description to remove voice memo URL for editing
    const parsedDescription = this.parseDescription(offer.description);
    
    this.offerForm.patchValue({
      sport_type: offer.sport_type,
      location: offer.location,
      date_time: offer.date_time ? new Date(offer.date_time).toISOString().slice(0, 16) : '',
      description: parsedDescription.text || ''
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
          this.setSuccessMessage('Trainingsangebot erfolgreich gelöscht');
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
            
            this.setSuccessMessage('Löschung wird synchronisiert, sobald Sie online sind');
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
        
        this.setSuccessMessage('Löschung wird synchronisiert, sobald Sie online sind');
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
    this.resetVoiceMemo();
  }

  async toggleParticipation(offer: TrainingOffer) {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.errorMessage = 'Bitte melden Sie sich an';
      return;
    }

    if (!this.isOnline) {
      this.errorMessage = 'Sie können dies nicht tun, während Sie offline sind';
      return;
    }

    this.isLoading = true;
    try {
      if (offer.is_participating) {
        // Leave
        const { error } = await this.supabase.leaveTrainingOffer(offer.id, user.id);
        if (error) throw error;
        this.setSuccessMessage('Sie haben das Training verlassen');
      } else {
        // Join
        const { error } = await this.supabase.joinTrainingOffer(offer.id, user.id);
        if (error) throw error;
        this.setSuccessMessage('Sie nehmen jetzt am Training teil');
      }

      // Reload offers to get fresh data from server
      await this.loadTrainingOffers();
    } catch (error: any) {
      this.errorMessage = error.message || 'Fehler beim Aktualisieren der Teilnahme';
    } finally {
      this.isLoading = false;
    }
  }

  async viewParticipants(offer: TrainingOffer) {
    this.selectedOffer = offer;
    this.loadingParticipants = true;
    this.participantsModalOpen = true;
    this.selectedOfferParticipants = [];

    try {
      if (!this.isOnline) {
        this.errorMessage = 'Sie können dies nicht tun, während Sie offline sind';
        this.loadingParticipants = false;
        return;
      }

      const { data, error } = await this.supabase.getTrainingOfferParticipants(offer.id, 10);
      if (error) throw error;
      // Map data to Participant interface
      this.selectedOfferParticipants = (data || []).map((p: any) => ({
        id: p.id,
        training_offer_id: offer.id,
        user_id: p.user_id,
        created_at: p.created_at,
        profiles: p.profiles
      }));
    } catch (error: any) {
      console.error('Error loading participants:', error);
      this.errorMessage = 'Fehler beim Laden der Teilnehmer';
    } finally {
      this.loadingParticipants = false;
    }
  }

  closeParticipantsModal() {
    this.participantsModalOpen = false;
    this.selectedOffer = null;
    this.selectedOfferParticipants = [];
  }

  getParticipantName(participant: Participant): string {
    if (!participant.profiles) return 'Unbekannt';
    const firstName = participant.profiles.first_name || '';
    const lastName = participant.profiles.last_name || '';
    const name = `${firstName} ${lastName}`.trim();
    return name || 'Unbekannt';
  }

  canRemoveParticipant(offer: TrainingOffer | null, participantUserId?: string): boolean {
    if (!offer) return false;
    const user = this.authService.getCurrentUser();
    // Only owner can remove, but not themselves
    if (user?.id !== offer.user_id) return false;
    // Don't allow removing yourself
    if (participantUserId && user.id === participantUserId) return false;
    return true;
  }

  async removeParticipant(participant: Participant) {
    if (!this.selectedOffer) return;

    // Prevent removing yourself
    const user = this.authService.getCurrentUser();
    if (user?.id === participant.user_id) {
      this.errorMessage = 'Sie können sich nicht selbst entfernen';
      return;
    }

    if (!confirm(`Möchten Sie ${this.getParticipantName(participant)} wirklich entfernen?`)) {
      return;
    }

    this.isLoading = true;
    try {
      if (!this.isOnline) {
        this.errorMessage = 'Sie können dies nicht tun, während Sie offline sind';
        return;
      }

      const { error } = await this.supabase.removeParticipant(
        this.selectedOffer.id,
        participant.user_id
      );
      
      if (error) {
        console.error('Error removing participant:', error);
        this.errorMessage = error.message || 'Fehler beim Entfernen des Teilnehmers. Möglicherweise fehlen die Berechtigungen.';
        return;
      }
      
      // Reload participants list to get fresh data from server
      await this.viewParticipants(this.selectedOffer);
      
      // Reload training offers to update participant count
      await this.loadTrainingOffers();
      
      this.setSuccessMessage('Teilnehmer erfolgreich entfernt');
    } catch (error: any) {
      this.errorMessage = error.message || 'Fehler beim Entfernen des Teilnehmers';
    } finally {
      this.isLoading = false;
    }
  }

  async useMyLocation() {
    this.isGettingLocation = true;
    this.errorMessage = '';
    
    try {
      // Request permissions
      const permissionStatus = await Geolocation.requestPermissions();
      if (permissionStatus.location !== 'granted') {
        this.errorMessage = 'Standortberechtigung wurde nicht erteilt. Bitte in den Einstellungen aktivieren.';
        this.isGettingLocation = false;
        return;
      }

      // Get current position
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      // Reverse geocode to get address
      const address = await this.reverseGeocode(lat, lng);
      
      // Store coordinates and address
      this.selectedLatitude = lat;
      this.selectedLongitude = lng;
      this.selectedAddress = address;
      
      // Open map modal for confirmation
      this.mapModalOpen = true;
    } catch (error: any) {
      console.error('Error getting location:', error);
      this.errorMessage = 'Fehler beim Abrufen des Standorts: ' + (error.message || 'Unbekannter Fehler');
    } finally {
      this.isGettingLocation = false;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      // Use OpenStreetMap Nominatim API (free, no API key required)
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Sportbuddy App'
        }
      });
      
      if (!response.ok) {
        throw new Error('Reverse geocoding failed');
      }
      
      const data = await response.json();
      
      if (data.address) {
        const addr = data.address;
        // Build address string from components
        const parts: string[] = [];
        
        if (addr.road) parts.push(addr.road);
        if (addr.house_number) parts.push(addr.house_number);
        if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
        if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
        if (addr.postcode) parts.push(addr.postcode);
        
        if (parts.length > 0) {
          return parts.join(', ');
        }
      }
      
      // Fallback: return coordinates if address not found
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      // Fallback: return coordinates
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }

  confirmLocation() {
    if (this.selectedAddress) {
      this.offerForm.patchValue({ location: this.selectedAddress });
      this.mapModalOpen = false;
      // Clear selected location data
      this.selectedLatitude = null;
      this.selectedLongitude = null;
      this.selectedAddress = '';
    }
  }

  closeMapModal() {
    this.mapModalOpen = false;
    // Clear selected location data
    this.selectedLatitude = null;
    this.selectedLongitude = null;
    this.selectedAddress = '';
  }

}
