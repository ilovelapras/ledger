/// <reference types="nativewind/types" />

import 'react-native';

declare global {
  namespace ReactNative {
    interface ViewProps {
      className?: string;
    }
    interface TextProps {
      className?: string;
    }
    interface TextInputProps {
      className?: string;
    }
    interface ScrollViewProps {
      className?: string;
    }
    interface TouchableOpacityProps {
      className?: string;
    }
    interface ImageProps {
      className?: string;
    }
    interface PressableProps {
      className?: string;
    }
  }
}

declare module 'expo-router' {
  interface LinkProps {
    as?: React.ComponentType<any>;
    variant?: string;
    size?: string;
    flex?: number;
    className?: string;
  }
}

declare module '*.css' {
  const content: string;
  export default content;
}