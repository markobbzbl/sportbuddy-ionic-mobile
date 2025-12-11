import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { QueueService } from './queue.service';
import { QueuedOperation } from './offline.service';
import { OfflineService } from './offline.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { TrainingOffer } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private isSyncing = false;
  private syncCompleteSubject = new BehaviorSubject<boolean>(false);
  public syncComplete$: Observable<boolean> = this.syncCompleteSubject.asObservable();

  constructor(
    private supabase: SupabaseService,
    private queueService: QueueService,
    private offlineService: OfflineService,
    private authService: AuthService,
    private storage: StorageService
  ) {
    // Listen to online status and sync when coming online
    this.offlineService.isOnline$.subscribe(isOnline => {
      if (isOnline && !this.isSyncing) {
        this.syncQueue();
      }
    });
  }

  async syncQueue(): Promise<void> {
    if (this.isSyncing || !this.offlineService.isOnline) {
      return;
    }

    this.isSyncing = true;
    const queue = this.queueService.getQueue();

    for (const operation of queue) {
      try {
        await this.processOperation(operation);
        await this.queueService.removeOperation(operation.id);
      } catch (error) {
        console.error(`Error processing operation ${operation.id}:`, error);
        await this.queueService.updateOperationRetry(operation.id);
        
        // If retry count is too high, remove from queue
        if ((operation.retryCount || 0) >= 5) {
          console.warn(`Removing operation ${operation.id} after too many retries`);
          await this.queueService.removeOperation(operation.id);
        }
      }
    }

    this.isSyncing = false;
    this.syncCompleteSubject.next(true);
    setTimeout(() => this.syncCompleteSubject.next(false), 3);
  }

  private async processOperation(operation: QueuedOperation): Promise<void> {
    const user = this.authService.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    switch (operation.type) {
      case 'create':
        if (operation.entity === 'training_offer') {
          // Remove tempId before sending to server
          const { tempId, ...offerData } = operation.data;
          const result = await this.supabase.createTrainingOffer({
            user_id: user.id,
            ...offerData
          });
          if (result.error) throw result.error;
          
          // Remove from offline-created offers if it was a temp ID
          if (tempId) {
            const offlineCreated = await this.storage.get<TrainingOffer[]>('offline_created_offers') || [];
            const updated = offlineCreated.filter(o => o.id !== tempId);
            await this.storage.set('offline_created_offers', updated);
          }
        } else if (operation.entity === 'profile') {
          const result = await this.supabase.updateProfile(user.id, operation.data);
          if (result.error) throw result.error;
        }
        break;

      case 'update':
        if (operation.entity === 'training_offer') {
          const result = await this.supabase.updateTrainingOffer(operation.data.id, operation.data.updates);
          if (result.error) throw result.error;
        } else if (operation.entity === 'profile') {
          const result = await this.supabase.updateProfile(user.id, operation.data);
          if (result.error) throw result.error;
        }
        break;

      case 'delete':
        if (operation.entity === 'training_offer') {
          const result = await this.supabase.deleteTrainingOffer(operation.data.id);
          if (result.error) throw result.error;
        }
        break;
    }
  }
}

