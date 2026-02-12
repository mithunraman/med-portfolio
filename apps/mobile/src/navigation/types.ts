import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type OnboardingStackParamList = {
  IntroCarousel: undefined;
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  Dashboard: undefined;
  ItemDetail: { id: string };
};

export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type OnboardingStackScreenProps<T extends keyof OnboardingStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<OnboardingStackParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;

export type MainStackScreenProps<T extends keyof MainStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<MainStackParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;
