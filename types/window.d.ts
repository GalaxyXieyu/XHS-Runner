export {};

declare global {
  interface Window {
    themes?: {
      list: () => Promise<any[]>;
      create: (payload: any) => Promise<any>;
      update: (payload: any) => Promise<any>;
      remove: (payload: any) => Promise<any>;
      setStatus: (payload: any) => Promise<any>;
    };
    capture?: {
      run: (payload: { keywordId: number; limit?: number }) => Promise<any>;
    };
    auth?: {
      login: (options?: { timeout?: number }) => Promise<any>;
      logout: () => Promise<any>;
      checkStatus: () => Promise<any>;
      getQRCode: () => Promise<any>;
      pollLoginStatus: () => Promise<any>;
      cancelQRCodeSession: () => Promise<void>;
    };
    settings?: {
      get: () => Promise<Record<string, any>>;
      set: (update: Record<string, any>) => Promise<void>;
    };
    llmProviders?: {
      list: () => Promise<any[]>;
      create: (payload: any) => Promise<any>;
      update: (payload: any) => Promise<any>;
      delete: (id: number) => Promise<boolean>;
    };
    promptProfiles?: {
      list: () => Promise<any[]>;
      create: (payload: any) => Promise<any>;
      update: (payload: any) => Promise<any>;
      delete: (id: number) => Promise<boolean>;
    };
    extensionServices?: {
      list: () => Promise<any[]>;
      create: (payload: any) => Promise<any>;
      update: (payload: any) => Promise<any>;
      delete: (id: number) => Promise<boolean>;
    };
  }
}
