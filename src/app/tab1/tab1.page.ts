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
import { containsLetterValidator } from '../validators/custom-validators';

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
  
  mapModalOpen = false;
  selectedLatitude: number | null = null;
  selectedLongitude: number | null = null;
  selectedAddress: string = '';
  isGettingLocation = false;

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
      location: ['', [Validators.required, containsLetterValidator()]],
      date_time: ['', Validators.required],
      description: ['']
    });
  }

  async ngOnInit() {
    this.isOnline = this.offlineService.isOnline;
    console.log('Initial online status:', this.isOnline);

    const onlineSub = this.offlineService.isOnline$.subscribe(isOnline => {
      console.log('Online status changed:', isOnline);
      this.isOnline = isOnline;
      if (isOnline) {
        this.syncService.syncQueue();
      } else {
        this.loadTrainingOffers();
      }
    });
    this.subscriptions.push(onlineSub);

    const syncSub = this.syncService.syncComplete$.subscribe(synced => {
      if (synced) {
        this.loadTrainingOffers();
      }
    });
    this.subscriptions.push(syncSub);

    const queueSub = this.queueService.queue$.subscribe(queue => {
      this.queueCount = queue.length;
    });
    this.subscriptions.push(queueSub);

    await this.loadTrainingOffers();
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
    if (this.successMessageTimeout) {
      clearTimeout(this.successMessageTimeout);
    }
    this.successMessageTimeout = setTimeout(() => {
      this.successMessage = '';
    }, 3000);
  }

  async loadTrainingOffers() {
    this.isLoading = true;
    this.errorMessage = '';
    
    try {
      if (this.isOnline) {
        try {
          const { data, error } = await this.supabase.getTrainingOffers();
          if (error) throw error;

          if (data) {
            const currentUser = this.authService.getCurrentUser();
            const currentProfile = this.authService.getCurrentProfile();
            
            let serverOffers = data.map(offer => {
              if (!offer.profiles && currentUser && offer.user_id === currentUser.id && currentProfile) {
                return { ...offer, profiles: currentProfile };
              }
              return offer;
            });

            const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
            
            const serverOfferIds = new Set(serverOffers.map(o => o.id));
            const offlineOnly = offlineCreated.filter(o => o.id.startsWith('temp_') && !serverOfferIds.has(o.id));
            
            this.trainingOffers = [...serverOffers, ...offlineOnly].sort((a, b) => {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            
            await this.storage.set('offline_training_offers', this.trainingOffers);
            await this.storage.set('offline_created_offers', offlineOnly);
            
            this.applyFilters();
            
            return;
          }
        } catch (error: any) {
          console.error('Error loading from server:', error);
        }
      }
      
      const offlineOffers = await this.storage.get<TrainingOffer[]>('offline_training_offers') || [];
      const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
      
      console.log('Loading offline offers:', { offlineOffers: offlineOffers.length, offlineCreated: offlineCreated.length });
      
      const offlineOfferIds = new Set(offlineOffers.map(o => o.id));
      const allOfflineCreated = offlineCreated.filter(o => !offlineOfferIds.has(o.id));
      
      this.trainingOffers = [...offlineOffers, ...allOfflineCreated].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      console.log('Final training offers:', this.trainingOffers.length, this.trainingOffers.map(o => ({ id: o.id, sport: o.sport_type, isOffline: this.isOfflineOffer(o) })));
      
      this.applyFilters();
      
      if (this.trainingOffers.length > 0) {
        this.errorMessage = '';
      } else {
        this.errorMessage = '';
      }
    } catch (error: any) {
      console.error('Error loading training offers:', error);
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
      this.applyFilters();
    }
  }

  applyFilters() {
    let filtered = [...this.trainingOffers];

    if (this.sportTypeFilter) {
      filtered = filtered.filter(offer => offer.sport_type === this.sportTypeFilter);
    }

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
      const permissionResult = await VoiceRecorder.requestAudioRecordingPermission();
      if (!permissionResult.value) {
        this.errorMessage = 'Mikrofon-Berechtigung wurde nicht erteilt';
        return;
      }

      await VoiceRecorder.startRecording();
      this.isRecording = true;
      this.recordingTime = 0;
      this.generateWaveformBars();
      
      this.recordingInterval = setInterval(() => {
        this.recordingTime++;
        this.updateWaveformBars();
      }, 1000);
    } catch (error: any) {
      console.error('Error starting recording:', error);
      this.errorMessage = 'Fehler beim Starten der Aufnahme: ' + (error.message || 'Unbekannter Fehler');
      this.isRecording = false;
    }
  }

  generateWaveformBars() {
    this.waveformBars = Array.from({ length: 30 }, () => Math.random() * 25 + 10);
  }

  updateWaveformBars() {
    if (this.isRecording) {
      this.waveformBars = this.waveformBars.map(() => Math.random() * 25 + 10);
    }
  }

  async stopRecording() {
    try {
      if (!this.isRecording) return;

      const result = await VoiceRecorder.stopRecording();
      
      if (result.value && result.value.recordDataBase64) {
        const base64Data = result.value.recordDataBase64;
        const mimeType = result.value.mimeType || 'audio/m4a';
        
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        this.recordedAudioBlob = new Blob([byteArray], { type: mimeType });
        
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
        if (!this.audioPlayer.paused) {
          this.audioPlayer.pause();
          this.isPlayingAudio = false;
          return;
        }
      }

      this.audioPlayer = new Audio(this.recordedAudioUrl);
      this.isPlayingAudio = true;

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

  parseDescription(description: string | undefined): { text: string; voiceMemoUrl: string | null } {
    if (!description) return { text: '', voiceMemoUrl: null };
    
    const voiceMemoRegex = /\[Sprachnachricht:\s*(https?:\/\/[^\]]+)\]/gi;
    
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(voiceMemoRegex.source, voiceMemoRegex.flags);
    
    while ((match = regex.exec(description)) !== null) {
      matches.push(match);
    }
    
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const voiceMemoUrl = lastMatch[1] || null;
      
      let text = description.replace(voiceMemoRegex, '');
      
      text = text
        .replace(/\n\n+/g, '\n')
        .replace(/^\s+|\s+$/g, '')
        .replace(/^\n+|\n+$/g, '')
        .trim();
      
      return { text, voiceMemoUrl };
    }
    
    return { text: description.trim(), voiceMemoUrl: null };
  }

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

      if (!this.voiceMemoWaveforms.has(url)) {
        this.voiceMemoWaveforms.set(url, Array.from({ length: 30 }, () => Math.random() * 20 + 10));
      }

      this.playingAudioElement = new Audio(url);
      this.playingAudioUrl = url;

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
    if (this.voiceMemoWaveforms.has(url)) {
      this.voiceMemoWaveforms.set(url, Array.from({ length: 30 }, () => 15));
    }
  }

  getVoiceMemoWaveform(url: string): number[] {
    if (!this.voiceMemoWaveforms.has(url)) {
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

      if (this.isEditMode && this.editingOffer && this.recordedAudioBlob) {
        const existingVoiceMemo = this.parseDescription(this.editingOffer.description).voiceMemoUrl;
        if (existingVoiceMemo) {
          const confirmed = confirm('Möchten Sie wirklich die Sprachnachricht ersetzen? Die alte Aufnahme wird überschrieben.');
          if (!confirmed) {
            this.isLoading = false;
            return;
          }
        }
      }

      if (this.recordedAudioBlob && this.isOnline) {
        try {
          const fileName = `voice-${Date.now()}.m4a`;
          const file = new File([this.recordedAudioBlob], fileName, { type: 'audio/m4a' });
          const { data: uploadData, error: uploadError } = await this.supabase.uploadVoiceMemo(user.id, file);
          
          if (uploadError) {
            console.error('Error uploading voice memo:', uploadError);
          } else if (uploadData?.publicUrl) {
            const voiceMemoRegex = /\[Sprachnachricht:\s*https?:\/\/[^\]]+\]/gi;
            let cleanDescription = formValue.description ? formValue.description.replace(voiceMemoRegex, '') : '';
            cleanDescription = cleanDescription.replace(/\n\n+/g, '\n').replace(/^\n+|\n+$/g, '').trim();
            formValue.description = cleanDescription 
              ? `${cleanDescription}\n\n[Sprachnachricht: ${uploadData.publicUrl}]`
              : `[Sprachnachricht: ${uploadData.publicUrl}]`;
          }
        } catch (error: any) {
          console.error('Error processing voice memo:', error);
        }
      } else if (this.recordedAudioBlob && !this.isOnline) {
        console.log('Voice memo recorded offline, will need to upload when online');
      } else if (this.isEditMode && this.editingOffer && !this.recordedAudioBlob) {
        const existingVoiceMemo = this.parseDescription(this.editingOffer.description).voiceMemoUrl;
        if (existingVoiceMemo) {
          const cleanDescription = formValue.description ? formValue.description.trim() : '';
          formValue.description = cleanDescription 
            ? `${cleanDescription}\n\n[Sprachnachricht: ${existingVoiceMemo}]`
            : `[Sprachnachricht: ${existingVoiceMemo}]`;
        }
      }

      if (this.isEditMode && this.editingOffer) {
        if (this.isOnline) {
          try {
            const { error } = await this.supabase.updateTrainingOffer(
              this.editingOffer.id,
              formValue
            );
            if (error) throw error;
            this.setSuccessMessage('Trainingsangebot erfolgreich aktualisiert');
          } catch (error: any) {
            if (!this.isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
              if (!this.editingOffer) return;
              
              await this.queueService.addOperation({
                type: 'update',
                entity: 'training_offer',
                data: { id: this.editingOffer.id, updates: formValue }
              });
              
              const updatedOffer: TrainingOffer = {
                ...this.editingOffer,
                ...formValue,
                updated_at: new Date().toISOString()
              };
              
              this.trainingOffers = this.trainingOffers.map(o => 
                o.id === this.editingOffer!.id ? updatedOffer : o
              );
              
              await this.storage.set('offline_training_offers', this.trainingOffers);
              
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
          if (!this.editingOffer) return;
          
          await this.queueService.addOperation({
            type: 'update',
            entity: 'training_offer',
                data: { id: this.editingOffer.id, updates: formValue }
              });
              
              const updatedOffer: TrainingOffer = {
                ...this.editingOffer,
                ...formValue,
                updated_at: new Date().toISOString()
              };
              
              this.trainingOffers = this.trainingOffers.map(o => 
                o.id === this.editingOffer!.id ? updatedOffer : o
              );
              
              await this.storage.set('offline_training_offers', this.trainingOffers);
              
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
        if (this.isOnline) {
          try {
            const { error } = await this.supabase.createTrainingOffer({
              user_id: user.id,
              ...formValue
            });
            if (error) throw error;
            this.setSuccessMessage('Trainingsangebot erfolgreich erstellt');
          } catch (error: any) {
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
          const tempId = `temp_${Date.now()}`;
          await this.queueService.addOperation({
            type: 'create',
            entity: 'training_offer',
            data: { user_id: user.id, ...formValue, tempId }
          });
          this.setSuccessMessage('Trainingsangebot wird synchronisiert, sobald Sie online sind');
          
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
          
          const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
          offlineCreated.push(newOffer);
          await this.storage.set('offline_created_offers', offlineCreated);
          
          this.trainingOffers = [newOffer, ...this.trainingOffers].sort((a, b) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          await this.storage.set('offline_training_offers', this.trainingOffers);
          
          this.errorMessage = '';
          
          console.log('Offline offer created:', newOffer);
          console.log('Current offers:', this.trainingOffers);
        }
      }

      if (this.isOnline) {
        await this.loadTrainingOffers();
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
          if (!this.isOnline || error.message?.includes('network') || error.message?.includes('fetch')) {
            await this.queueService.addOperation({
              type: 'delete',
              entity: 'training_offer',
              data: { id: offer.id }
              });
              
            this.trainingOffers = this.trainingOffers.filter(o => o.id !== offer.id);
            await this.storage.set('offline_training_offers', this.trainingOffers);
            
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
          await this.queueService.addOperation({
          type: 'delete',
          entity: 'training_offer',
          data: { id: offer.id }
        });
        
        this.trainingOffers = this.trainingOffers.filter(o => o.id !== offer.id);
        await this.storage.set('offline_training_offers', this.trainingOffers);
        
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
    
    if (!name && profile.id) {
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
        const { error } = await this.supabase.leaveTrainingOffer(offer.id, user.id);
        if (error) throw error;
        this.setSuccessMessage('Sie haben das Training verlassen');
      } else {
        const { error } = await this.supabase.joinTrainingOffer(offer.id, user.id);
        if (error) throw error;
        this.setSuccessMessage('Sie nehmen jetzt am Training teil');
      }

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
    if (user?.id !== offer.user_id) return false;
    if (participantUserId && user.id === participantUserId) return false;
    return true;
  }

  async removeParticipant(participant: Participant) {
    if (!this.selectedOffer) return;

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
      
      await this.viewParticipants(this.selectedOffer);
      
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
      const permissionStatus = await Geolocation.requestPermissions();
      if (permissionStatus.location !== 'granted') {
        this.errorMessage = 'Standortberechtigung wurde nicht erteilt. Bitte in den Einstellungen aktivieren.';
        this.isGettingLocation = false;
        return;
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      const address = await this.reverseGeocode(lat, lng);
      
      this.selectedLatitude = lat;
      this.selectedLongitude = lng;
      this.selectedAddress = address;
      
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
      
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }

  confirmLocation() {
    if (this.selectedAddress) {
      this.offerForm.patchValue({ location: this.selectedAddress });
      this.mapModalOpen = false;
      this.selectedLatitude = null;
      this.selectedLongitude = null;
      this.selectedAddress = '';
    }
  }

  closeMapModal() {
    this.mapModalOpen = false;
    this.selectedLatitude = null;
    this.selectedLongitude = null;
    this.selectedAddress = '';
  }

}
