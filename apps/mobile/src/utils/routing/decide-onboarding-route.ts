// Pure routing decision for the onboarding gate cascade. Lives outside the
// _layout.tsx effect so the rules are unit-testable and each gate owns one
// condition (ordering implicitly handles mutual exclusion).

export type OnboardingRoute =
  | '/(auth)/intro'
  | '/(auth)/notice-and-ack'
  | '/(auth)/select-stage'
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
    // GP is the only active specialty today, so we skip the specialty picker and
    // send users straight to the training-year question (select-stage auto-selects
    // GP). To reintroduce the specialty step when >1 specialty is active, change
    // this redirect back to '/(auth)/select-specialty'. The onSpecialtyScreen
    // guard already treats both routes as valid, so no other gate change is needed.
    return onSpecialtyScreen ? { kind: 'stay' } : { kind: 'redirect', to: '/(auth)/select-stage' };
  }
  return inAuthGroup ? { kind: 'redirect', to: '/(tabs)' } : { kind: 'stay' };
}
