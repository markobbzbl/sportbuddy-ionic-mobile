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
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonText,
  IonModal,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonButtons,
  IonBadge,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonAvatar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { create, trash, time, people, checkmarkCircle, close, play, pause } from 'ionicons/icons';
import { SupabaseService, TrainingOffer, Participant } from '../services/supabase.service';
import { AuthService } from '../services/auth.service';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
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
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonText,
    IonModal,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonButtons,
    IonBadge,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonAvatar
  ]
})
export class Tab2Page implements OnInit, OnDestroy {
  myOffers: TrainingOffer[] = [];
  isLoading = false;
  isModalOpen = false;
  isEditMode = false;
  editingOffer: TrainingOffer | null = null;
  offerForm: FormGroup;
  errorMessage = '';
  successMessage = '';
  participantsModalOpen = false;
  selectedOfferParticipants: Participant[] = [];
  selectedOffer: TrainingOffer | null = null;
  loadingParticipants = false;
  private subscriptions: Subscription[] = [];
  private successMessageTimeout?: any;
  
  // Voice memo playback properties
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
    private fb: FormBuilder
  ) {
    addIcons({ create, trash, time, people, checkmarkCircle, close, play, pause });
    
    this.offerForm = this.fb.group({
      sport_type: ['', Validators.required],
      location: ['', Validators.required],
      date_time: ['', Validators.required],
      description: ['']
    });
  }

  async ngOnInit() {
    await this.loadMyOffers();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.successMessageTimeout) {
      clearTimeout(this.successMessageTimeout);
    }
  }

  async loadMyOffers() {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const user = await this.authService.getCurrentUser();
      if (!user) {
        this.errorMessage = 'Nicht angemeldet';
        this.isLoading = false;
        return;
      }

      const { data, error } = await this.supabase.getTrainingOffers();
      if (error) throw error;

      if (data) {
        // Filter to show only current user's offers
        this.myOffers = data.filter(offer => offer.user_id === user.id);
        // Sort by date (upcoming first)
        this.myOffers.sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
      }
    } catch (error: any) {
      console.error('Error loading my offers:', error);
      this.errorMessage = 'Fehler beim Laden Ihrer Angebote';
    } finally {
      this.isLoading = false;
    }
  }

  async handleRefresh(event: any) {
    await this.loadMyOffers();
    event.target.complete();
  }

  openEditModal(offer: TrainingOffer) {
    this.isEditMode = true;
    this.editingOffer = offer;
    
    // Parse description to remove voice memo URL for editing
    const parsedDescription = this.parseDescription(offer.description);
    
    this.offerForm.patchValue({
      sport_type: offer.sport_type,
      location: offer.location,
      date_time: new Date(offer.date_time).toISOString().slice(0, 16),
      description: parsedDescription.text || ''
    });
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
    this.isEditMode = false;
    this.editingOffer = null;
    this.offerForm.reset();
  }

  async onSubmitOffer() {
    if (this.offerForm.invalid) {
      this.errorMessage = 'Bitte füllen Sie alle Pflichtfelder aus';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const user = await this.authService.getCurrentUser();
      if (!user) {
        this.errorMessage = 'Nicht angemeldet';
        this.isLoading = false;
        return;
      }

      let formValue = { ...this.offerForm.value };

      // Preserve existing voice memo if no new one was recorded
      if (this.isEditMode && this.editingOffer) {
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
        const { error } = await this.supabase.updateTrainingOffer(
          this.editingOffer.id,
          {
            sport_type: formValue.sport_type,
            location: formValue.location,
            date_time: formValue.date_time,
            description: formValue.description || null
          }
        );

        if (error) throw error;
        this.setSuccessMessage('Trainingsangebot erfolgreich aktualisiert');
      }

      this.closeModal();
      await this.loadMyOffers();
    } catch (error: any) {
      console.error('Error saving offer:', error);
      this.errorMessage = error.message || 'Fehler beim Speichern des Angebots';
    } finally {
      this.isLoading = false;
    }
  }

  async deleteOffer(offer: TrainingOffer) {
    if (!confirm('Möchten Sie dieses Trainingsangebot wirklich löschen?')) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { error } = await this.supabase.deleteTrainingOffer(offer.id);
      if (error) throw error;

      this.setSuccessMessage('Trainingsangebot erfolgreich gelöscht');
      await this.loadMyOffers();
    } catch (error: any) {
      console.error('Error deleting offer:', error);
      this.errorMessage = error.message || 'Fehler beim Löschen des Angebots';
    } finally {
      this.isLoading = false;
    }
  }

  async viewParticipants(offer: TrainingOffer) {
    this.selectedOffer = offer;
    this.participantsModalOpen = true;
    this.loadingParticipants = true;

    try {
      const { data, error } = await this.supabase.getTrainingOfferParticipants(offer.id, 10);
      if (error) throw error;

      // Transform data to match Participant interface (profiles is returned as array from Supabase)
      this.selectedOfferParticipants = (data || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        created_at: p.created_at,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
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

  async removeParticipant(participant: Participant) {
    if (!this.selectedOffer) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { error } = await this.supabase.removeParticipant(
        this.selectedOffer.id,
        participant.user_id
      );

      if (error) throw error;

      this.setSuccessMessage('Teilnehmer entfernt');
      await this.viewParticipants(this.selectedOffer);
    } catch (error: any) {
      console.error('Error removing participant:', error);
      this.errorMessage = error.message || 'Fehler beim Entfernen des Teilnehmers';
    } finally {
      this.isLoading = false;
    }
  }

  getParticipantName(participant: Participant): string {
    if (!participant.profiles) return 'Unbekannt';
    const firstName = participant.profiles.first_name || '';
    const lastName = participant.profiles.last_name || '';
    return `${firstName} ${lastName}`.trim() || 'Unbekannt';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const isPast = date < now;

    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + (isPast ? ' (Vergangen)' : '');
  }

  isUpcoming(offer: TrainingOffer): boolean {
    return new Date(offer.date_time) > new Date();
  }

  setSuccessMessage(message: string) {
    this.successMessage = message;
    if (this.successMessageTimeout) {
      clearTimeout(this.successMessageTimeout);
    }
    this.successMessageTimeout = setTimeout(() => {
      this.successMessage = '';
    }, 3000);
  }

  // Parse description to extract text and voice memo URLs
  parseDescription(description: string | undefined): { text: string; voiceMemoUrl: string | null } {
    if (!description) return { text: '', voiceMemoUrl: null };
    
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
}
