import type {
  CreativeDirectorPort,
  CreativeIntent,
} from "../contracts/creativity";

/** Offline reference adapter. Reserved for a later Director integration. */
export class LocalRuleBasedAdapter implements CreativeDirectorPort {
  async interpret(
    request: string,
    signal?: AbortSignal,
  ): Promise<CreativeIntent> {
    if (signal?.aborted) throw new Error("Creative request aborted");
    const presets: Readonly<Record<string, CreativeIntent>> = {
      calm: { mood: "calm", energyTarget: 0.3, groove: "straight" },
      bright: { mood: "bright", energyTarget: 0.65, groove: "straight" },
    };
    return { ...presets[request.trim().toLowerCase()] };
  }
}
