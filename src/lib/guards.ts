export class ExternalActionRefused extends Error {}

/** Sending is always simulated in this build. Any other mode throws, so a live mode has to be a deliberate change. */
export function assertSimulated(mode: string | undefined = process.env.EXTERNAL_ACTIONS ?? "simulated"): void {
  if (mode !== "simulated") throw new ExternalActionRefused(`EXTERNAL_ACTIONS=${mode} is not supported; only "simulated" exists`);
}
