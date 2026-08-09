import { AIProvider } from "@/lib/ai/provider";
import { ClaudeProvider } from "@/lib/ai/claudeProvider";

// Thin router mapping task type -> provider, per architecture doc Section 3.
// The MVP only wires up "interpret" (Claude). analyzeImage/generateInspirationImage
// would map to an OpenAIProvider in a future phase — adding that is additive
// here, not a rewrite.
let claudeProvider: AIProvider | null = null;

export function getInterpretProvider(): AIProvider {
  if (!claudeProvider) {
    claudeProvider = new ClaudeProvider();
  }
  return claudeProvider;
}
