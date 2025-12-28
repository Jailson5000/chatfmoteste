import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MapPin } from 'lucide-react';

interface StateData {
  count: number;
  percentage: number;
}

interface BrazilMapProps {
  clientsByState: Record<string, number>;
  totalClients: number;
}

// Improved SVG paths for Brazilian states with better proportions
const BRAZIL_STATES: Record<string, { path: string; name: string; abbr: string; cx: number; cy: number }> = {
  AC: { abbr: 'AC', name: 'Acre', cx: 78, cy: 180, path: 'M45,165 L95,155 L105,180 L95,205 L55,200 Z' },
  AL: { abbr: 'AL', name: 'Alagoas', cx: 420, cy: 175, path: 'M410,165 L432,160 L438,178 L420,188 Z' },
  AP: { abbr: 'AP', name: 'Amapá', cx: 270, cy: 52, path: 'M250,30 L290,25 L302,60 L268,78 L245,58 Z' },
  AM: { abbr: 'AM', name: 'Amazonas', cx: 150, cy: 118, path: 'M50,70 L245,55 L268,78 L262,118 L248,148 L188,178 L98,182 L88,158 L68,128 L50,92 Z' },
  BA: { abbr: 'BA', name: 'Bahia', cx: 375, cy: 210, path: 'M335,155 L410,165 L420,188 L415,240 L388,288 L340,268 L322,222 L330,185 Z' },
  CE: { abbr: 'CE', name: 'Ceará', cx: 392, cy: 118, path: 'M368,88 L410,82 L425,122 L402,148 L368,138 Z' },
  DF: { abbr: 'DF', name: 'Distrito Federal', cx: 310, cy: 245, path: 'M300,238 L320,238 L320,252 L300,252 Z' },
  ES: { abbr: 'ES', name: 'Espírito Santo', cx: 390, cy: 285, path: 'M378,268 L402,262 L412,288 L392,305 Z' },
  GO: { abbr: 'GO', name: 'Goiás', cx: 295, cy: 255, path: 'M265,212 L335,222 L340,268 L312,298 L275,288 L262,252 Z' },
  MA: { abbr: 'MA', name: 'Maranhão', cx: 328, cy: 105, path: 'M282,72 L352,82 L368,88 L368,138 L335,155 L305,138 L278,118 Z' },
  MT: { abbr: 'MT', name: 'Mato Grosso', cx: 218, cy: 220, path: 'M165,175 L265,170 L265,212 L262,252 L275,288 L248,318 L165,280 L150,215 Z' },
  MS: { abbr: 'MS', name: 'Mato Grosso do Sul', cx: 228, cy: 318, path: 'M165,280 L248,318 L262,358 L228,388 L175,368 L160,320 Z' },
  MG: { abbr: 'MG', name: 'Minas Gerais', cx: 348, cy: 280, path: 'M278,240 L335,222 L340,268 L395,285 L378,325 L322,355 L278,328 Z' },
  PA: { abbr: 'PA', name: 'Pará', cx: 255, cy: 105, path: 'M188,58 L268,78 L282,72 L278,118 L305,138 L335,155 L330,185 L322,222 L265,212 L265,170 L248,148 L262,118 L188,128 Z' },
  PB: { abbr: 'PB', name: 'Paraíba', cx: 418, cy: 140, path: 'M398,130 L435,125 L445,145 L412,155 Z' },
  PR: { abbr: 'PR', name: 'Paraná', cx: 268, cy: 365, path: 'M218,345 L295,338 L315,362 L295,395 L228,388 Z' },
  PE: { abbr: 'PE', name: 'Pernambuco', cx: 405, cy: 158, path: 'M368,138 L402,148 L445,145 L440,168 L410,165 L372,162 Z' },
  PI: { abbr: 'PI', name: 'Piauí', cx: 355, cy: 140, path: 'M322,100 L368,88 L368,138 L335,155 L322,138 Z' },
  RJ: { abbr: 'RJ', name: 'Rio de Janeiro', cx: 365, cy: 335, path: 'M348,322 L378,325 L392,350 L365,362 L342,348 Z' },
  RN: { abbr: 'RN', name: 'Rio Grande do Norte', cx: 418, cy: 112, path: 'M395,95 L432,88 L438,118 L402,128 Z' },
  RS: { abbr: 'RS', name: 'Rio Grande do Sul', cx: 252, cy: 428, path: 'M205,398 L282,408 L305,442 L268,472 L208,462 L192,425 Z' },
  RO: { abbr: 'RO', name: 'Rondônia', cx: 140, cy: 205, path: 'M98,180 L165,175 L165,240 L120,240 L90,220 Z' },
  RR: { abbr: 'RR', name: 'Roraima', cx: 168, cy: 48, path: 'M140,22 L202,18 L218,52 L188,82 L145,72 Z' },
  SC: { abbr: 'SC', name: 'Santa Catarina', cx: 272, cy: 405, path: 'M238,392 L300,402 L305,422 L258,432 L232,418 Z' },
  SP: { abbr: 'SP', name: 'São Paulo', cx: 300, cy: 342, path: 'M262,315 L322,320 L348,322 L342,355 L315,372 L268,362 L252,335 Z' },
  SE: { abbr: 'SE', name: 'Sergipe', cx: 428, cy: 195, path: 'M418,188 L438,182 L442,202 L422,208 Z' },
  TO: { abbr: 'TO', name: 'Tocantins', cx: 310, cy: 178, path: 'M278,118 L322,100 L322,138 L335,155 L330,185 L322,222 L288,205 L278,168 Z' },
};

export function BrazilMap({ clientsByState, totalClients }: BrazilMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const stateData = useMemo(() => {
    const data: Record<string, StateData> = {};
    Object.keys(BRAZIL_STATES).forEach((abbr) => {
      const count = clientsByState[abbr] || 0;
      data[abbr] = {
        count,
        percentage: totalClients > 0 ? (count / totalClients) * 100 : 0,
      };
    });
    return data;
  }, [clientsByState, totalClients]);

  const maxCount = useMemo(() => Math.max(...Object.values(clientsByState), 1), [clientsByState]);

  const getStateColor = (abbr: string) => {
    const data = stateData[abbr];
    if (!data || data.count === 0) return 'hsl(var(--muted) / 0.4)';
    
    const intensity = data.count / maxCount;
    
    // Gradient from light to vibrant colors
    if (intensity > 0.8) return 'hsl(142, 76%, 46%)'; // Bright green
    if (intensity > 0.6) return 'hsl(142, 70%, 52%)';
    if (intensity > 0.4) return 'hsl(152, 65%, 48%)'; // Teal-ish
    if (intensity > 0.2) return 'hsl(162, 60%, 45%)';
    return 'hsl(172, 55%, 42%)'; // Cyan-ish for lowest values
  };

  const topStates = useMemo(() => {
    return Object.entries(clientsByState)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [clientsByState]);

  const totalWithState = useMemo(() => {
    return Object.values(clientsByState).reduce((a, b) => a + b, 0);
  }, [clientsByState]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Distribuição por Estado
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-4">
          {/* Map */}
          <div className="flex-1 relative">
            <TooltipProvider delayDuration={0}>
              <svg
                viewBox="0 0 480 500"
                className="w-full h-auto max-h-[260px]"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
              >
                {/* Background glow for active states */}
                <defs>
                  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                  <linearGradient id="stateGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(142, 76%, 46%)" />
                    <stop offset="100%" stopColor="hsl(172, 55%, 42%)" />
                  </linearGradient>
                </defs>
                
                {Object.entries(BRAZIL_STATES).map(([abbr, state]) => {
                  const data = stateData[abbr];
                  const isHovered = hoveredState === abbr;
                  const hasClients = data.count > 0;
                  
                  return (
                    <Tooltip key={abbr}>
                      <TooltipTrigger asChild>
                        <g
                          onMouseEnter={() => setHoveredState(abbr)}
                          onMouseLeave={() => setHoveredState(null)}
                          className="cursor-pointer"
                          style={{ transition: 'all 0.2s ease' }}
                        >
                          <path
                            d={state.path}
                            fill={getStateColor(abbr)}
                            stroke={isHovered ? 'hsl(var(--primary))' : 'hsl(var(--border) / 0.5)'}
                            strokeWidth={isHovered ? 2.5 : 0.8}
                            filter={isHovered && hasClients ? 'url(#glow)' : undefined}
                            style={{
                              transition: 'all 0.2s ease',
                              transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                              transformOrigin: `${state.cx}px ${state.cy}px`,
                            }}
                          />
                          {/* State label - only show on hover or if has significant data */}
                          {(isHovered || (hasClients && data.percentage > 5)) && (
                            <text
                              x={state.cx}
                              y={state.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="pointer-events-none font-semibold"
                              fill={hasClients ? 'white' : 'hsl(var(--muted-foreground))'}
                              fontSize={isHovered ? 11 : 9}
                              style={{ 
                                textShadow: hasClients ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              {abbr}
                            </text>
                          )}
                        </g>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="top" 
                        className="bg-popover/95 backdrop-blur-sm border-border shadow-xl"
                      >
                        <div className="text-sm space-y-1">
                          <p className="font-semibold text-foreground">{state.name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-primary">{data.count}</span>
                            <span className="text-muted-foreground">
                              cliente{data.count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {data.count > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {data.percentage.toFixed(1)}% do total
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </svg>
            </TooltipProvider>
          </div>

          {/* Legend */}
          <div className="w-36 space-y-3 py-2">
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Top Estados
              </h4>
              {topStates.length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic">
                  Sem dados
                </p>
              ) : (
                <div className="space-y-1.5">
                  {topStates.map(([abbr, count], index) => {
                    const percentage = totalWithState > 0 ? ((count / totalWithState) * 100).toFixed(0) : 0;
                    return (
                      <div
                        key={abbr}
                        className="flex items-center justify-between text-sm group hover:bg-muted/50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
                        onMouseEnter={() => setHoveredState(abbr)}
                        onMouseLeave={() => setHoveredState(null)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shadow-sm"
                            style={{ backgroundColor: getStateColor(abbr) }}
                          />
                          <span className="font-medium text-foreground">
                            {BRAZIL_STATES[abbr]?.abbr || abbr}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-foreground">{count}</span>
                          <span className="text-xs text-muted-foreground">({percentage}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Gradient Legend */}
            {topStates.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Menos</span>
                  <span>Mais</span>
                </div>
                <div 
                  className="h-2 rounded-full"
                  style={{
                    background: 'linear-gradient(to right, hsl(172, 55%, 42%), hsl(162, 60%, 45%), hsl(152, 65%, 48%), hsl(142, 70%, 52%), hsl(142, 76%, 46%))',
                  }}
                />
              </div>
            )}

            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total geral</span>
                <span className="text-lg font-bold text-foreground">{totalClients}</span>
              </div>
              {totalWithState > 0 && totalWithState < totalClients && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {totalClients - totalWithState} sem estado
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
