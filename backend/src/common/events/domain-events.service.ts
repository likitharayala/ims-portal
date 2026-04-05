import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

@Injectable()
export class DomainEventsService {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(DomainEventsService.name);

  emit<T>(eventName: string, payload: T): void {
    this.logger.debug(`Emitting domain event: ${eventName}`);
    this.emitter.emit(eventName, payload);
  }

  on<T>(eventName: string, listener: (payload: T) => void): () => void {
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }
}
