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
      // Try to get session, but don't fail if offline
      const { data: { session }, error } = await this.supabase.getSession();
      if (error) {
        console.warn('Error getting session (might be offline):', error);
        // Try to load user from storage
        const storedUser = await this.storage.get<any>('offline_user');
        if (storedUser) {
          this.currentUserSubject.next(storedUser);
          await this.loadProfile(storedUser.id);
        }
        return;
      }

      if (session?.user) {
        this.currentUserSubject.next(session.user);
        // Store user for offline use
        await this.storage.set('offline_user', session.user);
        await this.loadProfile(session.user.id);
      } else {
        // No session, try to load from storage
        const storedUser = await this.storage.get<any>('offline_user');
        if (storedUser) {
          this.currentUserSubject.next(storedUser);
          await this.loadProfile(storedUser.id);
        }
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      // Don't block app startup if auth init fails
      // Try to load from storage
      try {
        const storedUser = await this.storage.get<any>('offline_user');
        if (storedUser) {
          this.currentUserSubject.next(storedUser);
        }
      } catch (storageError) {
        console.error('Error loading user from storage:', storageError);
      }
    }
  }

  async signUp(email: string, password: string, firstName: string, lastName: string) {
    const { data, error } = await this.supabase.signUp(email, password, firstName, lastName);
    if (error) {
      throw error;
    }
    if (data.user) {
      this.currentUserSubject.next(data.user);
      // Ensure profile is created/updated with first_name and last_name
      // The trigger might create it, but we need to ensure it has the correct fields
      try {
        const existingProfile = await this.supabase.getProfile(data.user.id);
        if (existingProfile) {
          // Update existing profile with name fields if they're missing
          if (!existingProfile.first_name || !existingProfile.last_name) {
            await this.supabase.updateProfile(data.user.id, {
              first_name: firstName,
              last_name: lastName
            });
          }
        } else {
          // Create profile if it doesn't exist (shouldn't happen with trigger, but just in case)
          await this.supabase.updateProfile(data.user.id, {
            first_name: firstName,
            last_name: lastName
          });
        }
      } catch (profileError) {
        console.error('Error ensuring profile:', profileError);
        // Continue anyway - profile might be created by trigger
      }
      await this.loadProfile(data.user.id);
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
      await this.storage.remove('offline_profile');
      await this.storage.remove('offline_training_offers');
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
