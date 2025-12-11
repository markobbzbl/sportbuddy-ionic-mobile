import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService } from './storage.service';
import { QueuedOperation } from './offline.service';

const QUEUE_STORAGE_KEY = 'pending_operations_queue';

@Injectable({
  providedIn: 'root'
})
export class QueueService {
  private queueSubject = new BehaviorSubject<QueuedOperation[]>([]);
  public queue$: Observable<QueuedOperation[]> = this.queueSubject.asObservable();

  constructor(private storage: StorageService) {
    this.loadQueue();
  }

  private async loadQueue() {
    const queue = await this.storage.get<QueuedOperation[]>(QUEUE_STORAGE_KEY);
    this.queueSubject.next(queue || []);
  }

  private async saveQueue(queue: QueuedOperation[]) {
    await this.storage.set(QUEUE_STORAGE_KEY, queue);
    this.queueSubject.next(queue);
  }

  async addOperation(operation: Omit<QueuedOperation, 'id' | 'timestamp'>): Promise<string> {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queuedOp: QueuedOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      retryCount: 0
    };

    const currentQueue = this.queueSubject.value;
    const newQueue = [...currentQueue, queuedOp];
    await this.saveQueue(newQueue);
    return id;
  }

  async removeOperation(operationId: string): Promise<void> {
    const currentQueue = this.queueSubject.value;
    const newQueue = currentQueue.filter(op => op.id !== operationId);
    await this.saveQueue(newQueue);
  }

  async updateOperationRetry(operationId: string): Promise<void> {
    const currentQueue = this.queueSubject.value;
    const newQueue = currentQueue.map(op => {
      if (op.id === operationId) {
        return { ...op, retryCount: (op.retryCount || 0) + 1 };
      }
      return op;
    });
    await this.saveQueue(newQueue);
  }

  getQueue(): QueuedOperation[] {
    return this.queueSubject.value;
  }

  async clearQueue(): Promise<void> {
    await this.storage.remove(QUEUE_STORAGE_KEY);
    this.queueSubject.next([]);
  }

  getQueueCount(): number {
    return this.queueSubject.value.length;
  }
}

