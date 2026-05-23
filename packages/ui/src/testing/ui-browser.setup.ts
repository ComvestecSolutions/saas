type ReactActGlobals = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
(globalThis as ReactActGlobals).IS_REACT_ACT_ENVIRONMENT = true;
