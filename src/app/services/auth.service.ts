import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService, Profile } from './supabase.service';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$: Observable<any> = this.currentUserSubject.asObservable();

  private currentProfileSubject = new BehaviorSubject<Profile | null>(null);
  public currentProfile$: Observable<Profile | null> = this.currentProfileSubject.asObservable();

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private storage: StorageService
  ) {
    this.initAuth();
  }

  async initAuth() {
    try {
      // Try to get session from Supabase
      const { data: { session }, error } = await this.supabase.getSession();
      
      if (error) {
        console.warn('Error getting session (might be offline):', error);
        // If there's an error getting session, don't auto-login from storage
        // This prevents auto-login after logout
        // Clear stored data to ensure clean state
        await this.storage.remove('offline_user');
        await this.storage.remove('offline_profile');
        this.currentUserSubject.next(null);
        this.currentProfileSubject.next(null);
        return;
      }

      if (session?.user) {
        // Valid session exists
        this.currentUserSubject.next(session.user);
        // Store user for offline use
        await this.storage.set('offline_user', session.user);
        await this.loadProfile(session.user.id);
      } else {
        // No valid session - clear any stored user data
        await this.storage.remove('offline_user');
        await this.storage.remove('offline_profile');
        this.currentUserSubject.next(null);
        this.currentProfileSubject.next(null);
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      // On error, clear stored data to prevent auto-login
      await this.storage.remove('offline_user');
      await this.storage.remove('offline_profile');
      this.currentUserSubject.next(null);
      this.currentProfileSubject.next(null);
    }
  }

  async signUp(email: string, password: string, firstName: string, lastName: string) {
    const { data, error } = await this.supabase.signUp(email, password, firstName, lastName);
    if (error) {
      throw error;
    }
    if (data.user) {
      this.currentUserSubject.next(data.user);
      // Profile should be created by trigger automatically
      // Just wait a moment and try to load it
      // Don't throw errors if profile creation fails - user is already created
      try {
        // Wait for trigger to execute
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.loadProfile(data.user.id);
      } catch (profileError: any) {
        console.error('Error loading profile after signup:', profileError);
        // Don't throw - user is created successfully
      }
    }
    return { data, error };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.signIn(email, password);
    if (error) {
      throw error;
    }
    if (data.user) {
      this.currentUserSubject.next(data.user);
      await this.loadProfile(data.user.id);
    }
    return { data, error };
  }

  async signOut() {
    const { error } = await this.supabase.signOut();
    if (!error) {
      this.currentUserSubject.next(null);
      this.currentProfileSubject.next(null);
      // Clear all stored user data
      await this.storage.remove('offline_user');
      await this.storage.remove('offline_profile');
      await this.storage.remove('offline_training_offers');
      await this.storage.remove('offline_created_offers');
    }
    return { error };
  }

  getCurrentUser() {
    return this.currentUserSubject.value;
  }

  getCurrentProfile() {
    return this.currentProfileSubject.value;
  }

  isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  private async loadProfile(userId: string) {
    try {
      const profile = await this.supabase.getProfile(userId);
      if (profile) {
        this.currentProfileSubject.next(profile);
        await this.storage.set('offline_profile', profile);
      }
    } catch (error) {
      // Try to load from offline storage
      const offlineProfile = await this.storage.get<Profile>('offline_profile');
      if (offlineProfile) {
        this.currentProfileSubject.next(offlineProfile);
      }
    }
  }
}
