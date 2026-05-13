import { CloudApp } from "./CloudApp";
import { LocalApp } from "./LocalApp";
import { isSupabaseConfigured } from "./supabaseClient";

export function App() {
  if (isSupabaseConfigured) {
    return <CloudApp />;
  }
  return <LocalApp />;
}
