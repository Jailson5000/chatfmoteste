import { Megaphone, ExternalLink } from "lucide-react";

interface AdClickBannerProps {
  originMetadata: {
    ad_title?: string | null;
    ad_body?: string | null;
    ad_thumbnail?: string | null;
    ad_source_url?: string | null;
  };
}

export function AdClickBanner({ originMetadata }: AdClickBannerProps) {
  const { ad_title, ad_body, ad_thumbnail, ad_source_url } = originMetadata;
  
  // Don't render if no meaningful ad data
  if (!ad_title && !ad_body && !ad_thumbnail) {
    return null;
  }

  return (
    <div className="mx-auto max-w-[85%] mb-4">
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Megaphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Via Anúncio do Facebook
          </span>
        </div>
        
        {/* Ad Title */}
        {ad_title && (
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {ad_title}
          </p>
        )}
        
        {/* Ad Body */}
        {ad_body && (
          <p className="text-xs text-blue-500 dark:text-blue-400/80 mt-1 line-clamp-2">
            {ad_body}
          </p>
        )}
        
        {/* Thumbnail and Link Row */}
        <div className="flex items-end justify-between mt-2 gap-3">
          {/* Thumbnail */}
          {ad_thumbnail && (
            <img 
              src={ad_thumbnail} 
              alt="Preview do anúncio" 
              className="rounded max-h-16 max-w-[120px] object-cover border border-blue-200 dark:border-blue-700"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          
          {/* Link to Original Ad */}
          {ad_source_url && (
            <a 
              href={ad_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:text-blue-600 hover:underline inline-flex items-center gap-1 ml-auto"
            >
              Ver anúncio original
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
