import { AIVoiceSettings } from "@/components/settings/AIVoiceSettings";

export default function AIVoice() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Voz IA</h1>
        <p className="text-muted-foreground">
          Configure as respostas por áudio da inteligência artificial
        </p>
      </div>
      <AIVoiceSettings />
    </div>
  );
}
