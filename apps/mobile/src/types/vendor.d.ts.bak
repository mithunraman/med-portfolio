// Type declarations to suppress type errors from third-party libraries
// that have incompatible TypeScript definitions with React Native 0.81

declare module 'react-native-gifted-chat' {
  import { ComponentType } from 'react';
  import { ViewStyle, TextStyle } from 'react-native';

  export interface IMessage {
    _id: string | number;
    text: string;
    createdAt: Date | number;
    user: User;
    image?: string;
    video?: string;
    audio?: string;
    system?: boolean;
    sent?: boolean;
    received?: boolean;
    pending?: boolean;
  }

  export interface User {
    _id: string | number;
    name?: string;
    avatar?: string | number;
  }

  export interface BubbleProps<TMessage extends IMessage = IMessage> {
    currentMessage?: TMessage;
    nextMessage?: TMessage;
    previousMessage?: TMessage;
    user?: User;
    position?: 'left' | 'right';
    wrapperStyle?: {
      left?: ViewStyle;
      right?: ViewStyle;
    };
    textStyle?: {
      left?: TextStyle;
      right?: TextStyle;
    };
  }

  export interface GiftedChatProps<TMessage extends IMessage = IMessage> {
    messages?: TMessage[];
    text?: string;
    onInputTextChanged?: (text: string) => void;
    onSend?: (messages: TMessage[]) => void;
    user?: User;
    renderBubble?: (props: BubbleProps<TMessage>) => React.ReactNode;
    renderInputToolbar?: (props: any) => React.ReactNode | null;
    renderComposer?: (props: any) => React.ReactNode;
    renderSend?: (props: any) => React.ReactNode;
    renderLoading?: () => React.ReactNode;
    minInputToolbarHeight?: number;
    inverted?: boolean;
    isLoadingEarlier?: boolean;
    loadEarlier?: boolean;
    onLoadEarlier?: () => void;
    listViewProps?: object;
    textInputProps?: object;
    keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
    onLongPress?: (context: any, message: TMessage) => void;
    onPress?: (context: any, message: TMessage) => void;
    onPressAvatar?: (user: User) => void;
    renderAvatar?: ((props: any) => React.ReactNode) | null;
    renderMessageImage?: (props: any) => React.ReactNode;
    renderMessageVideo?: (props: any) => React.ReactNode;
    renderMessageAudio?: (props: any) => React.ReactNode;
    renderMessageText?: (props: any) => React.ReactNode;
    renderCustomView?: (props: any) => React.ReactNode;
    renderDay?: (props: any) => React.ReactNode;
    renderTime?: (props: any) => React.ReactNode;
    renderFooter?: () => React.ReactNode;
    renderChatEmpty?: () => React.ReactNode;
    renderChatFooter?: () => React.ReactNode;
    renderAccessory?: (props: any) => React.ReactNode;
    renderActions?: (props: any) => React.ReactNode;
    messagesContainerStyle?: ViewStyle;
    parsePatterns?: (linkStyle: TextStyle) => any[];
    extraData?: any;
  }

  export const GiftedChat: ComponentType<GiftedChatProps>;
  export const Bubble: ComponentType<BubbleProps>;
  export const Composer: ComponentType<any>;
  export const InputToolbar: ComponentType<any>;
  export const Send: ComponentType<any>;
  export const MessageText: ComponentType<any>;
  export const MessageImage: ComponentType<any>;
  export const Time: ComponentType<any>;
  export const Day: ComponentType<any>;
  export const Avatar: ComponentType<any>;
  export const Actions: ComponentType<any>;
  export const SystemMessage: ComponentType<any>;
}
