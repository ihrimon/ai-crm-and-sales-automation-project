import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// A real bug caught building M4: Prisma's Decimal type (Deal.value,
// Lead.budget, any future @db.Decimal field) has a toJSON() that returns a
// STRING, to avoid floating-point precision loss — so without this, every
// Decimal field silently serializes as `"12000"` instead of `12000`, even
// though docs/api/openapi.yaml declares them `type: number`. Caught by a
// strict-equality assertion in deal.integration.spec.ts; Lead.budget had the
// identical bug since M3, just never asserted strictly enough to catch it.
// Converts every Prisma.Decimal in a response body to a plain JS number —
// safe here since these are currency-scale values (2 decimal places), well
// within Number's safe-integer range; not a general-purpose fix for
// arbitrary-precision decimals.
function convertDecimals(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }
  if (Array.isArray(value)) {
    return value.map(convertDecimals);
  }
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, convertDecimals(val)]));
  }
  return value;
}

@Injectable()
export class DecimalSerializationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => convertDecimals(data)));
  }
}
