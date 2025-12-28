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

// Realistic SVG paths for Brazilian states with smooth curves
const BRAZIL_STATES: Record<string, { path: string; name: string; abbr: string; cx: number; cy: number }> = {
  RR: { 
    abbr: 'RR', name: 'Roraima', cx: 115, cy: 45,
    path: 'M85,15 Q100,10 120,15 Q145,20 155,45 Q160,65 150,80 Q135,90 115,85 Q95,80 85,60 Q80,40 85,15 Z'
  },
  AP: { 
    abbr: 'AP', name: 'Amapá', cx: 210, cy: 50,
    path: 'M195,20 Q215,15 230,25 Q245,40 240,60 Q235,80 215,90 Q195,85 185,65 Q180,45 195,20 Z'
  },
  AM: { 
    abbr: 'AM', name: 'Amazonas', cx: 110, cy: 120,
    path: 'M25,70 Q50,55 90,50 Q130,45 170,55 Q195,60 195,85 Q200,110 190,135 Q180,160 150,175 Q120,185 85,180 Q55,175 40,155 Q25,135 25,105 Q25,85 25,70 Z'
  },
  PA: { 
    abbr: 'PA', name: 'Pará', cx: 230, cy: 115,
    path: 'M170,55 Q200,50 230,55 Q260,60 275,75 Q285,90 280,110 Q275,130 285,150 Q290,165 280,185 Q265,200 245,195 Q225,190 210,175 Q195,165 190,145 Q185,125 190,105 Q195,85 190,70 Q185,60 170,55 Z'
  },
  MA: { 
    abbr: 'MA', name: 'Maranhão', cx: 295, cy: 100,
    path: 'M260,65 Q280,60 300,65 Q320,70 335,85 Q345,100 340,120 Q335,140 320,150 Q300,160 280,155 Q265,150 255,135 Q250,115 255,95 Q258,80 260,65 Z'
  },
  PI: { 
    abbr: 'PI', name: 'Piauí', cx: 320, cy: 145,
    path: 'M300,105 Q320,100 335,110 Q350,120 355,140 Q358,160 350,180 Q340,195 320,195 Q300,195 290,180 Q282,165 285,145 Q290,125 300,105 Z'
  },
  CE: { 
    abbr: 'CE', name: 'Ceará', cx: 355, cy: 115,
    path: 'M335,85 Q355,80 375,90 Q390,100 395,120 Q395,140 380,155 Q365,165 345,160 Q330,155 325,140 Q320,120 330,100 Q332,90 335,85 Z'
  },
  RN: { 
    abbr: 'RN', name: 'Rio Grande do Norte', cx: 385, cy: 105,
    path: 'M365,90 Q380,85 400,90 Q415,95 420,110 Q420,125 405,135 Q390,140 375,135 Q360,130 360,115 Q360,100 365,90 Z'
  },
  PB: { 
    abbr: 'PB', name: 'Paraíba', cx: 390, cy: 135,
    path: 'M365,125 Q380,120 400,125 Q415,130 418,145 Q418,158 400,162 Q380,165 365,158 Q355,150 360,138 Q362,130 365,125 Z'
  },
  PE: { 
    abbr: 'PE', name: 'Pernambuco', cx: 375, cy: 160,
    path: 'M320,150 Q340,145 360,150 Q380,155 400,158 Q415,162 420,175 Q418,188 400,190 Q375,192 350,188 Q330,185 320,175 Q315,165 320,150 Z'
  },
  AL: { 
    abbr: 'AL', name: 'Alagoas', cx: 395, cy: 195,
    path: 'M380,185 Q395,182 410,188 Q420,195 418,210 Q412,220 395,220 Q378,218 375,205 Q375,192 380,185 Z'
  },
  SE: { 
    abbr: 'SE', name: 'Sergipe', cx: 385, cy: 220,
    path: 'M372,210 Q385,205 398,212 Q408,220 405,235 Q398,245 382,242 Q368,238 368,225 Q370,215 372,210 Z'
  },
  BA: { 
    abbr: 'BA', name: 'Bahia', cx: 340, cy: 230,
    path: 'M290,175 Q310,165 335,170 Q360,175 375,190 Q388,205 385,230 Q380,255 370,280 Q358,305 335,315 Q310,320 290,305 Q275,290 270,265 Q268,240 275,215 Q280,195 290,175 Z'
  },
  TO: { 
    abbr: 'TO', name: 'Tocantins', cx: 280, cy: 180,
    path: 'M260,140 Q280,135 295,145 Q310,155 315,175 Q318,195 310,215 Q302,235 285,245 Q268,250 255,235 Q245,220 248,195 Q252,170 260,140 Z'
  },
  GO: { 
    abbr: 'GO', name: 'Goiás', cx: 275, cy: 275,
    path: 'M245,235 Q265,225 290,235 Q312,245 325,265 Q335,285 325,310 Q315,330 290,340 Q265,345 250,325 Q235,305 240,280 Q242,255 245,235 Z'
  },
  DF: { 
    abbr: 'DF', name: 'Distrito Federal', cx: 300, cy: 275,
    path: 'M292,268 Q302,265 312,270 Q320,278 318,288 Q312,296 300,295 Q288,292 286,282 Q288,272 292,268 Z'
  },
  MT: { 
    abbr: 'MT', name: 'Mato Grosso', cx: 185, cy: 220,
    path: 'M120,165 Q150,155 185,160 Q220,165 240,185 Q255,205 250,235 Q245,265 230,290 Q215,310 185,315 Q155,318 130,300 Q110,280 115,250 Q118,220 115,195 Q115,175 120,165 Z'
  },
  RO: { 
    abbr: 'RO', name: 'Rondônia', cx: 95, cy: 195,
    path: 'M60,165 Q80,160 100,168 Q120,175 125,195 Q128,215 118,235 Q105,250 85,248 Q65,245 55,225 Q48,205 55,185 Q58,172 60,165 Z'
  },
  AC: { 
    abbr: 'AC', name: 'Acre', cx: 55, cy: 185,
    path: 'M20,165 Q40,158 60,165 Q75,172 78,190 Q78,210 65,225 Q50,238 30,232 Q15,225 12,205 Q12,185 20,165 Z'
  },
  MS: { 
    abbr: 'MS', name: 'Mato Grosso do Sul', cx: 200, cy: 340,
    path: 'M155,300 Q180,295 210,305 Q235,315 245,340 Q252,365 240,390 Q225,410 195,415 Q165,418 150,395 Q138,372 145,345 Q152,320 155,300 Z'
  },
  MG: { 
    abbr: 'MG', name: 'Minas Gerais', cx: 320, cy: 315,
    path: 'M270,275 Q295,265 325,275 Q355,285 375,310 Q390,335 380,365 Q368,390 340,400 Q310,408 280,395 Q255,380 250,350 Q248,320 260,295 Q265,280 270,275 Z'
  },
  ES: { 
    abbr: 'ES', name: 'Espírito Santo', cx: 375, cy: 340,
    path: 'M360,315 Q375,310 390,320 Q402,332 400,350 Q395,368 378,375 Q360,378 352,362 Q348,345 355,328 Q358,320 360,315 Z'
  },
  RJ: { 
    abbr: 'RJ', name: 'Rio de Janeiro', cx: 355, cy: 385,
    path: 'M330,370 Q350,365 370,375 Q388,385 390,405 Q388,420 368,428 Q348,432 332,420 Q318,408 322,390 Q326,378 330,370 Z'
  },
  SP: { 
    abbr: 'SP', name: 'São Paulo', cx: 285, cy: 375,
    path: 'M235,350 Q260,342 290,350 Q320,358 340,380 Q352,400 342,425 Q328,445 298,450 Q268,452 245,435 Q225,418 228,390 Q232,365 235,350 Z'
  },
  PR: { 
    abbr: 'PR', name: 'Paraná', cx: 250, cy: 420,
    path: 'M205,395 Q230,388 260,395 Q288,402 305,425 Q315,448 302,470 Q285,488 255,490 Q225,490 208,470 Q195,450 200,425 Q203,405 205,395 Z'
  },
  SC: { 
    abbr: 'SC', name: 'Santa Catarina', cx: 265, cy: 475,
    path: 'M225,458 Q250,452 278,460 Q302,468 310,490 Q312,510 295,525 Q275,535 250,530 Q228,525 218,505 Q212,485 220,468 Q222,462 225,458 Z'
  },
  RS: { 
    abbr: 'RS', name: 'Rio Grande do Sul', cx: 245, cy: 530,
    path: 'M195,500 Q225,492 260,500 Q290,510 305,540 Q315,570 298,600 Q275,625 240,630 Q205,632 180,608 Q160,585 168,552 Q178,520 195,500 Z'
  },
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
    if (!data || data.count === 0) return 'hsl(var(--muted) / 0.3)';
    
    const intensity = data.count / maxCount;
    
    // Gradient from soft to vibrant primary colors
    if (intensity > 0.8) return 'hsl(var(--primary))';
    if (intensity > 0.6) return 'hsl(var(--primary) / 0.85)';
    if (intensity > 0.4) return 'hsl(var(--primary) / 0.7)';
    if (intensity > 0.2) return 'hsl(var(--primary) / 0.55)';
    return 'hsl(var(--primary) / 0.4)';
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
                viewBox="0 0 430 650"
                className="w-full h-auto max-h-[280px]"
                style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.1))' }}
              >
                <defs>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                  <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.2"/>
                  </filter>
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
                        >
                          <path
                            d={state.path}
                            fill={getStateColor(abbr)}
                            stroke={isHovered ? 'hsl(var(--primary))' : 'hsl(var(--border) / 0.6)'}
                            strokeWidth={isHovered ? 2 : 0.5}
                            filter={isHovered ? 'url(#glow)' : 'url(#shadow)'}
                            style={{
                              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                              transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                              transformOrigin: `${state.cx}px ${state.cy}px`,
                            }}
                          />
                          {isHovered && (
                            <text
                              x={state.cx}
                              y={state.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="pointer-events-none font-bold"
                              fill={hasClients ? 'white' : 'hsl(var(--foreground))'}
                              fontSize={12}
                              style={{ 
                                textShadow: hasClients ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
                              }}
                            >
                              {abbr}
                            </text>
                          )}
                        </g>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="top" 
                        className="bg-popover/95 backdrop-blur-sm border-border shadow-xl px-3 py-2"
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">{state.name}</p>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-bold text-primary">{data.count}</span>
                            <span className="text-sm text-muted-foreground">
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
          <div className="w-32 space-y-3 py-2">
            <div className="space-y-1">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Top Estados
              </h4>
              {topStates.length === 0 ? (
                <p className="text-xs text-muted-foreground/70 italic">
                  Sem dados
                </p>
              ) : (
                <div className="space-y-1">
                  {topStates.map(([abbr, count]) => {
                    const percentage = totalWithState > 0 ? ((count / totalWithState) * 100).toFixed(0) : 0;
                    return (
                      <div
                        key={abbr}
                        className="flex items-center justify-between text-xs group hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors cursor-pointer"
                        onMouseEnter={() => setHoveredState(abbr)}
                        onMouseLeave={() => setHoveredState(null)}
                      >
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getStateColor(abbr) }}
                          />
                          <span className="font-medium text-foreground">
                            {abbr}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-foreground">{count}</span>
                          <span className="text-[10px] text-muted-foreground">({percentage}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Color Scale */}
            {topStates.length > 0 && (
              <div className="pt-2 border-t border-border/40">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Menos</span>
                  <span>Mais</span>
                </div>
                <div 
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{
                    background: 'linear-gradient(to right, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.5), hsl(var(--primary) / 0.7), hsl(var(--primary)))',
                  }}
                />
              </div>
            )}

            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Total</span>
                <span className="text-base font-bold text-foreground">{totalClients}</span>
              </div>
              {totalWithState > 0 && totalWithState < totalClients && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
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
