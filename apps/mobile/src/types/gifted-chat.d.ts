// Minimal types for react-native-gifted-chat to avoid RN 0.81 type conflicts
declare module 'react-native-gifted-chat' {
  import { ComponentType } from 'react';

  export interface IMessage {
    _id: string | number;
    text: string;
    createdAt: Date | number;
    user: { _id: string | number; name?: string; avatar?: string };
    [key: string]: any;
  }

  export const GiftedChat: ComponentType<any>;
  export const Bubble: ComponentType<any>;
  export const Message: ComponentType<any>;
}
