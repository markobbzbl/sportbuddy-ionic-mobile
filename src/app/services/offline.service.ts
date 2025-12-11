import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent, merge, of } from 'rxjs';
import { map } from 'rxjs/operators';

export interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: 'training_offer' | 'profile';
  data: any;
  timestamp: number;
  retryCount?: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineService {
  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  public isOnline$: Observable<boolean> = this.isOnlineSubject.asObservable();
  private checkInterval: any;

  constructor() {
    // Initialize with current status
    this.updateOnlineStatus(navigator.onLine);

    // Listen to online/offline events
    if (typeof window !== 'undefined') {
      // Listen to browser events
      window.addEventListener('online', () => {
        this.updateOnlineStatus(true);
      });

      window.addEventListener('offline', () => {
        this.updateOnlineStatus(false);
      });

      // Also check periodically (every 2 seconds) to catch cases where events might not fire
      this.checkInterval = setInterval(() => {
        const currentStatus = navigator.onLine;
        if (currentStatus !== this.isOnlineSubject.value) {
          this.updateOnlineStatus(currentStatus);
        }
      }, 2000);
    }
  }

  private updateOnlineStatus(isOnline: boolean) {
    this.isOnlineSubject.next(isOnline);
  }

  get isOnline(): boolean {
    return this.isOnlineSubject.value;
  }

  async checkOnlineStatus(): Promise<boolean> {
    try {
      // Try to fetch a small resource to verify connectivity
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      return true;
    } catch {
      return navigator.onLine;
    }
  }

  ngOnDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

