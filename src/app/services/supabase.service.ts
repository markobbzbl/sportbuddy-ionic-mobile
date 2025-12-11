import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface Profile {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface TrainingOffer {
  id: string;
  user_id: string;
  sport_type: string;
  location: string;
  latitude?: number;
  longitude?: number;
  date_time: string;
  description?: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  participant_count?: number;
  is_participating?: boolean;
}

export interface Participant {
  id: string;
  training_offer_id?: string;
  user_id: string;
  created_at: string;
  profiles?: Profile;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    try {
      this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    } catch (error) {
      console.error('Error initializing Supabase client:', error);
      throw error;
    }
  }

  get client() {
    return this.supabase;
  }

  // Auth methods
  async signUp(email: string, password: string, firstName: string, lastName: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName
        }
      }
    });
    return { data, error };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    return { error };
  }

  getCurrentUser() {
    return this.supabase.auth.getUser();
  }

  getSession() {
    return this.supabase.auth.getSession();
  }

  // Profile methods
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
    return data;
  }

  async createProfile(userId: string, email: string, firstName: string, lastName: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .insert({
        id: userId,
        email: email,
        first_name: firstName,
        last_name: lastName
      })
      .select()
      .single();

    return { data, error };
  }

  async updateProfile(userId: string, updates: Partial<Profile>) {
    const { data, error } = await this.supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    return { data, error };
  }

  async uploadAvatar(userId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Math.random()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        upsert: true
      });

    if (uploadError) {
      return { data: null, error: uploadError };
    }

    const { data: urlData } = this.supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return { data: { publicUrl: urlData.publicUrl }, error: null };
  }

  // Training offers methods
  async getTrainingOffers() {
    const currentUser = await this.supabase.auth.getUser();
    const userId = currentUser.data.user?.id;

    // Get offers with profiles
    const { data, error } = await this.supabase
      .from('training_offers')
      .select(`
        *,
        profiles:user_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error };
    }

    // Get participant counts and participation status for each offer
    const transformedData = await Promise.all(
      (data || []).map(async (offer) => {
        const { count } = await this.getParticipantCount(offer.id);
        const isParticipating = userId ? await this.isUserParticipating(offer.id, userId) : false;
        
        return {
          ...offer,
          participant_count: count,
          is_participating: isParticipating
        };
      })
    );

    return { data: transformedData, error: null };
  }

  async getTrainingOffer(id: string) {
    const { data, error } = await this.supabase
      .from('training_offers')
      .select(`
        *,
        profiles:user_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('id', id)
      .single();

    return { data, error };
  }

  async createTrainingOffer(offer: Omit<TrainingOffer, 'id' | 'created_at' | 'updated_at' | 'profiles'>) {
    const { data, error } = await this.supabase
      .from('training_offers')
      .insert([offer])
      .select(`
        *,
        profiles:user_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .single();

    return { data, error };
  }

  async updateTrainingOffer(id: string, updates: Partial<TrainingOffer>) {
    const { data, error } = await this.supabase
      .from('training_offers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`
        *,
        profiles:user_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .single();

    return { data, error };
  }

  async deleteTrainingOffer(id: string) {
    const { error } = await this.supabase
      .from('training_offers')
      .delete()
      .eq('id', id);

    return { error };
  }

  // Participant methods
  async joinTrainingOffer(trainingOfferId: string, userId: string) {
    // Check if already participating
    const { data: existing } = await this.supabase
      .from('training_offer_participants')
      .select('id')
      .eq('training_offer_id', trainingOfferId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      return { data: existing, error: null }; // Already participating
    }

    const { data, error } = await this.supabase
      .from('training_offer_participants')
      .insert([{
        training_offer_id: trainingOfferId,
        user_id: userId
      }])
      .select()
      .single();

    return { data, error };
  }

  async leaveTrainingOffer(trainingOfferId: string, userId: string) {
    const { error } = await this.supabase
      .from('training_offer_participants')
      .delete()
      .eq('training_offer_id', trainingOfferId)
      .eq('user_id', userId);

    return { error };
  }

  async getTrainingOfferParticipants(trainingOfferId: string, limit: number = 10) {
    const { data, error } = await this.supabase
      .from('training_offer_participants')
      .select(`
        id,
        user_id,
        created_at,
        profiles:user_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('training_offer_id', trainingOfferId)
      .order('created_at', { ascending: true })
      .limit(limit);

    return { data, error };
  }

  async getParticipantCount(trainingOfferId: string) {
    const { count, error } = await this.supabase
      .from('training_offer_participants')
      .select('*', { count: 'exact', head: true })
      .eq('training_offer_id', trainingOfferId);

    return { count: count || 0, error };
  }

  async isUserParticipating(trainingOfferId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('training_offer_participants')
      .select('id')
      .eq('training_offer_id', trainingOfferId)
      .eq('user_id', userId)
      .single();

    return !!data && !error;
  }

  async removeParticipant(trainingOfferId: string, participantUserId: string) {
    const { error } = await this.supabase
      .from('training_offer_participants')
      .delete()
      .eq('training_offer_id', trainingOfferId)
      .eq('user_id', participantUserId);

    return { error };
  }

}
