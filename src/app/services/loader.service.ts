import { Injectable } from '@angular/core';
import { BehaviorSubject, defer, first, finalize, Observable, of, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private _activeCount = 0;
  private _message: string | null = null;
  readonly state$ = new BehaviorSubject<{ active: boolean; count: number; message: string | null }>({ active: false, count: 0, message: null });

  show(message?: string) {
    this._activeCount++;
    this._message = message ?? this._message;
    this.state$.next({ active: this._activeCount > 0, count: this._activeCount, message: this._message });
  }

  hide() {
    this._activeCount = Math.max(0, this._activeCount - 1);
    if (this._activeCount === 0) this._message = null;
    this.state$.next({ active: this._activeCount > 0, count: this._activeCount, message: this._message });
  }

  withLoader<T>(message?: string) {
    return (source$: Observable<T>): Observable<T> => defer(() => {
      this.show(message);
      return source$;
    }).pipe(first(), finalize(() => this.hide()));
  }

  async wrapPromise<T>(promise: Promise<T>, message?: string): Promise<T> {
    this.show(message);
    try {
      const r = await promise;
      return r;
    } finally {
      this.hide();
    }
  }
}

