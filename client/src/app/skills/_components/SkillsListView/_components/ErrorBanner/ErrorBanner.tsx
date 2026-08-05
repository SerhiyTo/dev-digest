"use client";

import React from "react";
import { s } from "./styles";

export function ErrorBanner({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" style={s.banner}>
      <div style={s.title}>{title}</div>
      <div style={s.message}>{message}</div>
    </div>
  );
}
