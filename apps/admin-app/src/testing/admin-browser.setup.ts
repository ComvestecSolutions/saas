type AdminBrowserTestGlobals = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const adminBrowserTestGlobals = globalThis as AdminBrowserTestGlobals;

adminBrowserTestGlobals.IS_REACT_ACT_ENVIRONMENT = true;
