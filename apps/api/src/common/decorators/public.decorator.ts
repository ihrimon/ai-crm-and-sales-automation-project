import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as not requiring the global JwtAuthGuard. Routes opt OUT of
// auth, never opt in — the default is "requires a valid access token"
// (NFR-006), matching architecture/README.md §6.1's Auth Guard as the first
// gate every request passes through.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
