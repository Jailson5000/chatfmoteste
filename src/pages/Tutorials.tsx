import { useState } from "react";
import { useTutorials, Tutorial } from "@/hooks/useTutorials";
import { Card, CardContent } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayCircle, BookOpen, Search, Clock, Star, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function TutorialCard({ 
  tutorial, 
  onClick 
}: { 
  tutorial: Tutorial; 
  onClick: () => void;
}) {
  const thumbnailUrl = `https://img.youtube.com/vi/${tutorial.youtube_id}/maxresdefault.jpg`;
  
  return (
    <Card 
      className="overflow-hidden cursor-pointer group hover:ring-2 hover:ring-primary/50 transition-all"
      onClick={onClick}
    >
      <div className="relative">
        <AspectRatio ratio={16 / 9}>
          <img
            src={thumbnailUrl}
            alt={tutorial.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to medium quality if maxres doesn't exist
              (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${tutorial.youtube_id}/mqdefault.jpg`;
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-primary/90 rounded-full p-4">
              <PlayCircle className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          
          {/* Featured badge */}
          {tutorial.is_featured && (
            <Badge className="absolute top-2 right-2 bg-primary">
              <Star className="h-3 w-3 mr-1 fill-current" />
              Destaque
            </Badge>
          )}
          
          {/* Duration */}
          {tutorial.duration && (
            <Badge variant="secondary" className="absolute bottom-2 right-2 bg-black/70 text-white border-0">
              <Clock className="h-3 w-3 mr-1" />
              {tutorial.duration}
            </Badge>
          )}
          
          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="font-semibold text-white line-clamp-2 text-lg">
              {tutorial.title}
            </h3>
          </div>
        </AspectRatio>
      </div>
      
      <CardContent className="p-4">
        <Badge variant="outline" className="mb-2">{tutorial.category}</Badge>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {tutorial.description}
        </p>
      </CardContent>
    </Card>
  );
}

function TutorialModal({ 
  tutorial, 
  isOpen, 
  onClose 
}: { 
  tutorial: Tutorial | null; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  if (!tutorial) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-start justify-between">
            <div className="pr-8">
              <Badge variant="outline" className="mb-2">{tutorial.category}</Badge>
              <DialogTitle className="text-xl">{tutorial.title}</DialogTitle>
              {tutorial.description && (
                <p className="text-muted-foreground mt-1">{tutorial.description}</p>
              )}
            </div>
          </div>
        </DialogHeader>
        
        <div className="px-6">
          <AspectRatio ratio={16 / 9} className="bg-muted rounded-lg overflow-hidden">
            <iframe
              src={`https://www.youtube.com/embed/${tutorial.youtube_id}?autoplay=1`}
              title={tutorial.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </AspectRatio>
        </div>
        
        <div className="p-6 space-y-4">
          {tutorial.context && (
            <div>
              <h4 className="font-semibold mb-2">Contexto</h4>
              <p className="text-muted-foreground">{tutorial.context}</p>
            </div>
          )}
          
          {tutorial.prerequisites && tutorial.prerequisites.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Pré-requisitos</h4>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                {tutorial.prerequisites.map((prereq, index) => (
                  <li key={index}>{prereq}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Tutorials() {
  const { data: tutorials, isLoading } = useTutorials(true);
  const [search, setSearch] = useState("");
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter tutorials by search
  const filteredTutorials = tutorials?.filter((tutorial) => {
    const searchLower = search.toLowerCase();
    return (
      tutorial.title.toLowerCase().includes(searchLower) ||
      tutorial.description?.toLowerCase().includes(searchLower) ||
      tutorial.category.toLowerCase().includes(searchLower)
    );
  });

  // Group by category
  const categories = [...new Set(filteredTutorials?.map((t) => t.category) || [])];
  
  // Featured tutorials
  const featuredTutorials = filteredTutorials?.filter((t) => t.is_featured) || [];

  const handleOpenTutorial = (tutorial: Tutorial) => {
    setSelectedTutorial(tutorial);
    setIsModalOpen(true);
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Central de Tutoriais</h1>
            <p className="text-muted-foreground">
              Aprenda a usar todas as funcionalidades da plataforma
            </p>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tutoriais..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-video rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredTutorials?.length === 0 ? (
        <div className="text-center py-12">
          <PlayCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">
            {search ? "Nenhum tutorial encontrado" : "Nenhum tutorial disponível"}
          </h3>
          <p className="text-muted-foreground">
            {search ? "Tente buscar por outro termo" : "Em breve novos tutoriais serão adicionados"}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Featured Section */}
          {!search && featuredTutorials.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-primary fill-primary" />
                Destaques
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {featuredTutorials.map((tutorial) => (
                  <TutorialCard
                    key={tutorial.id}
                    tutorial={tutorial}
                    onClick={() => handleOpenTutorial(tutorial)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Tutorials by Category */}
          {categories.map((category) => {
            const categoryTutorials = filteredTutorials?.filter(
              (t) => t.category === category && (!t.is_featured || search)
            );
            
            if (!categoryTutorials?.length) return null;
            
            return (
              <section key={category}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-primary" />
                  {category}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {categoryTutorials.map((tutorial) => (
                    <TutorialCard
                      key={tutorial.id}
                      tutorial={tutorial}
                      onClick={() => handleOpenTutorial(tutorial)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Tutorial Modal */}
      <TutorialModal
        tutorial={selectedTutorial}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTutorial(null);
        }}
      />
    </div>
  );
}
