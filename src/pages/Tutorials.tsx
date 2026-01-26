import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { PlayCircle, BookOpen } from "lucide-react";

interface Tutorial {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  category: string;
}

// Configure seus tutoriais aqui - basta adicionar o ID do vídeo do YouTube
// O ID é a parte após "v=" na URL: youtube.com/watch?v=ESTE_ID_AQUI
const tutorials: Tutorial[] = [
  {
    id: "1",
    title: "Bem-vindo ao MiauChat",
    description: "Aprenda os conceitos básicos da plataforma e como começar a usar.",
    youtubeId: "dQw4w9WgXcQ", // Substitua pelo ID real do seu vídeo
    category: "Introdução",
  },
  {
    id: "2",
    title: "Configurando seu primeiro Agente de IA",
    description: "Passo a passo para criar e configurar um agente de atendimento automático.",
    youtubeId: "dQw4w9WgXcQ", // Substitua pelo ID real do seu vídeo
    category: "Agentes",
  },
  {
    id: "3",
    title: "Gerenciando Conversas",
    description: "Como organizar, filtrar e responder conversas de forma eficiente.",
    youtubeId: "dQw4w9WgXcQ", // Substitua pelo ID real do seu vídeo
    category: "Conversas",
  },
  {
    id: "4",
    title: "Conectando o WhatsApp",
    description: "Tutorial completo para conectar sua instância do WhatsApp.",
    youtubeId: "dQw4w9WgXcQ", // Substitua pelo ID real do seu vídeo
    category: "Conexões",
  },
];

function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  return (
    <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
      />
    </AspectRatio>
  );
}

export default function Tutorials() {
  // Agrupa tutoriais por categoria
  const categories = [...new Set(tutorials.map((t) => t.category))];

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-primary/10 rounded-lg">
          <BookOpen className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Tutoriais</h1>
          <p className="text-muted-foreground">
            Aprenda a usar todas as funcionalidades da plataforma
          </p>
        </div>
      </div>

      {/* Tutorials Grid by Category */}
      {categories.map((category) => (
        <div key={category} className="mb-10">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" />
            {category}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tutorials
              .filter((t) => t.category === category)
              .map((tutorial) => (
                <Card key={tutorial.id} className="overflow-hidden">
                  <YouTubeEmbed videoId={tutorial.youtubeId} title={tutorial.title} />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{tutorial.title}</CardTitle>
                    <CardDescription>{tutorial.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
          </div>
        </div>
      ))}

      {/* Empty State */}
      {tutorials.length === 0 && (
        <Card className="p-12 text-center">
          <PlayCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum tutorial disponível</h3>
          <p className="text-muted-foreground">
            Em breve novos tutoriais serão adicionados aqui.
          </p>
        </Card>
      )}
    </div>
  );
}
