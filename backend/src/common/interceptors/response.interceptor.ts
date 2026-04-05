import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    pageSize: number;
  };
}

@Injectable()
export class ResponseEnvelopeInterceptor<T>
  implements NestInterceptor<T, ResponseEnvelope<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the handler returns an already-wrapped response, pass through
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        // If the handler returns { data, meta } for paginated responses
        if (data && typeof data === 'object' && 'meta' in data && 'data' in data) {
          return { success: true, data: data.data, meta: data.meta };
        }
        return { success: true, data };
      }),
    );
  }
}
