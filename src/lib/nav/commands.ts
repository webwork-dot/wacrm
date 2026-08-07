/** Ctrl+K command registry — architecture hook; full palette later. */



export interface AppCommand {

  id: string;

  label: string;

  href?: string;

  action?: "impersonate" | "open";

}



export const COMMAND_REGISTRY: AppCommand[] = [

  { id: "goto-inbox", label: "Open Inbox", href: "/inbox" },

  { id: "goto-automation", label: "Open Automation Studio", href: "/flows" },

  { id: "goto-ai", label: "Open AI Studio", href: "/agents" },

  { id: "goto-settings", label: "Go to Settings", href: "/settings" },

  { id: "goto-console", label: "Open Platform Console", href: "/console" },

  { id: "goto-clients", label: "Search Clients", href: "/console/clients" },

  { id: "view-as", label: "View As Client", action: "impersonate" },

];



/**

 * Minimal Ctrl+K listener — logs available commands.

 * Full command palette UI ships in a later wave.

 */

export function installCommandHook(): () => void {

  if (typeof window === "undefined") return () => undefined;



  const onKeyDown = (e: KeyboardEvent) => {

    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;

    e.preventDefault();

    if (process.env.NODE_ENV === "development") {

      console.info(

        "[convexa] Command palette reserved. Commands:",

        COMMAND_REGISTRY.map((c) => c.label),

      );

    }

  };



  window.addEventListener("keydown", onKeyDown);

  return () => window.removeEventListener("keydown", onKeyDown);

}


