import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

export interface ConnectivityStatus {
  internet: boolean;
  backend: boolean;
  isReady: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ConnectivityService {
  private status: ConnectivityStatus = {
    internet: false,
    backend: false,
    isReady: false
  };

  constructor(private supabase: SupabaseService) {}

  async checkConnectivity(): Promise<ConnectivityStatus> {
    // Check internet connectivity
    const internetStatus = await this.checkInternet();
    
    // Check backend connectivity (only if internet is available)
    const backendStatus = internetStatus ? await this.checkBackend() : false;

    this.status = {
      internet: internetStatus,
      backend: backendStatus,
      isReady: internetStatus && backendStatus
    };

    return this.status;
  }

  private async checkInternet(): Promise<boolean> {
    try {
      // Try to fetch a small resource to verify connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      try {
        await fetch('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return true;
      } catch (error: any) {
        clearTimeout(timeoutId);
        // If aborted, it's a timeout - check navigator.onLine
        if (error.name === 'AbortError') {
          return navigator.onLine;
        }
        // Other errors might still mean we have internet
        return navigator.onLine;
      }
    } catch {
      // Fallback to navigator.onLine
      return navigator.onLine;
    }
  }

  private async checkBackend(): Promise<boolean> {
    try {
      // Try to connect to Supabase backend by making a simple request
      // We'll try to get the session which is a lightweight operation
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      try {
        const { error } = await this.supabase.client.auth.getSession();
        clearTimeout(timeoutId);
        
        // If we get a response (even with error), backend is reachable
        // We just need to check if it's a network error or auth error
        if (error) {
          const errorMsg = error.message?.toLowerCase() || '';
          if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('failed to fetch') || errorMsg.includes('networkerror')) {
            return false;
          }
          // Auth errors are OK - backend is reachable
          return true;
        }
        return true;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        // If it's a network error or timeout, backend is not reachable
        const errorMsg = fetchError.message?.toLowerCase() || '';
        if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('failed to fetch') || errorMsg.includes('aborted') || errorMsg.includes('timeout')) {
          return false;
        }
        // Other errors might mean backend is reachable but something else failed
        return true;
      }
    } catch (error: any) {
      // If it's a network error, backend is not reachable
      const errorMsg = error.message?.toLowerCase() || '';
      if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('failed to fetch')) {
        return false;
      }
      // Other errors might mean backend is reachable but auth failed (which is OK for connectivity check)
      return true;
    }
  }

  getStatus(): ConnectivityStatus {
    return { ...this.status };
  }
}

