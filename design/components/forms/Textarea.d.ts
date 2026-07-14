import React from 'react';
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  containerStyle?: React.CSSProperties;
}
/** Multi-line text field for notes, comments and message bodies. */
export function Textarea(props: TextareaProps): JSX.Element;
