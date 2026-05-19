// Pure routing decision for the onboarding gate cascade. Lives outside the
// _layout.tsx effect so the rules are unit-testable and each gate owns one
// condition (ordering implicitly handles mutual exclusion).

export type OnboardingRoute =
  | '/(auth)/intro'
  | '/(auth)/notice-and-ack'
  | '/(auth)/select-specialty'
  | '/(tabs)';

export type RouteDecision = { kind: 'stay' } | { kind: 'redirect'; to: OnboardingRoute };

export interface OnboardingRouteInput {
  isLoggedIn: boolean;
  needsAck: boolean;
  hasSpecialty: boolean;
  segments: string[];
}

export function decideOnboardingRoute(input: OnboardingRouteInput): RouteDecision {
  const inAuthGroup = input.segments[0] === '(auth)';
  const onAckScreen = input.segments[1] === 'notice-and-ack';
  const onSpecialtyScreen =
    input.segments[1] === 'select-specialty' || input.segments[1] === 'select-stage';

  if (!input.isLoggedIn) {
    return inAuthGroup ? { kind: 'stay' } : { kind: 'redirect', to: '/(auth)/intro' };
  }
  if (input.needsAck) {
    return onAckScreen ? { kind: 'stay' } : { kind: 'redirect', to: '/(auth)/notice-and-ack' };
  }
  if (!input.hasSpecialty) {
    return onSpecialtyScreen
      ? { kind: 'stay' }
      : { kind: 'redirect', to: '/(auth)/select-specialty' };
  }
  return inAuthGroup ? { kind: 'redirect', to: '/(tabs)' } : { kind: 'stay' };
}
