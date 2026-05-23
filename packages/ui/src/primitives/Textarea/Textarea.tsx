import {
  forwardRef,
  useEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "../../utils/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly invalid?: boolean;
  readonly autoResize?: boolean;
  readonly minRows?: number;
  readonly maxRows?: number;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      invalid = false,
      autoResize = false,
      minRows = 3,
      maxRows = 12,
      className,
      style,
      onChange,
      value,
      defaultValue,
      ...rest
    },
    forwardedRef,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const setRef = (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (
          forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>
        ).current = node;
      }
    };

    useEffect(() => {
      if (!autoResize) return;
      const node = localRef.current;
      if (!node) return;
      const lineHeight = 20;
      node.style.height = "auto";
      const desired = Math.min(
        Math.max(node.scrollHeight, minRows * lineHeight),
        maxRows * lineHeight,
      );
      node.style.height = `${desired}px`;
    }, [autoResize, value, defaultValue, minRows, maxRows]);

    return (
      <textarea
        ref={setRef}
        rows={minRows}
        aria-invalid={invalid ? true : undefined}
        data-invalid={invalid ? "" : undefined}
        className={cn("ops-textarea", className)}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        style={{
          width: "100%",
          minHeight: 32,
          padding: 8,
          background: "color-mix(in oklab, var(--slate-800) 55%, transparent)",
          border: `1px solid ${
            invalid
              ? "var(--status-error-border)"
              : "color-mix(in oklab, white 8%, transparent)"
          }`,
          borderRadius: 4,
          color: "var(--fg-default)",
          font: "inherit",
          resize: autoResize ? "none" : "vertical",
          ...style,
        }}
        {...rest}
      />
    );
  },
);
