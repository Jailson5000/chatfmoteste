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

// SVG paths for Brazilian states
const BRAZIL_STATES: Record<string, { path: string; name: string; abbr: string; cx: number; cy: number }> = {
  AC: { abbr: 'AC', name: 'Acre', cx: 95, cy: 195, path: 'M50,180 L100,170 L110,195 L100,220 L60,215 Z' },
  AL: { abbr: 'AL', name: 'Alagoas', cx: 455, cy: 195, path: 'M445,185 L465,180 L470,195 L455,205 Z' },
  AP: { abbr: 'AP', name: 'Amapá', cx: 285, cy: 55, path: 'M265,35 L305,30 L315,70 L280,85 L260,65 Z' },
  AM: { abbr: 'AM', name: 'Amazonas', cx: 165, cy: 130, path: 'M60,80 L260,65 L280,85 L275,130 L260,160 L200,190 L110,195 L100,170 L80,140 L60,100 Z' },
  BA: { abbr: 'BA', name: 'Bahia', cx: 400, cy: 235, path: 'M355,170 L445,185 L455,205 L450,260 L420,310 L360,290 L340,240 L350,200 Z' },
  CE: { abbr: 'CE', name: 'Ceará', cx: 420, cy: 130, path: 'M395,100 L440,95 L455,140 L430,165 L395,155 Z' },
  DF: { abbr: 'DF', name: 'Distrito Federal', cx: 330, cy: 265, path: 'M320,255 L340,255 L340,275 L320,275 Z' },
  ES: { abbr: 'ES', name: 'Espírito Santo', cx: 415, cy: 310, path: 'M400,290 L425,285 L435,315 L415,330 Z' },
  GO: { abbr: 'GO', name: 'Goiás', cx: 310, cy: 275, path: 'M280,230 L355,240 L360,290 L330,320 L290,310 L275,270 Z' },
  MA: { abbr: 'MA', name: 'Maranhão', cx: 345, cy: 115, path: 'M295,80 L370,90 L395,100 L395,155 L355,170 L320,150 L290,130 Z' },
  MT: { abbr: 'MT', name: 'Mato Grosso', cx: 230, cy: 240, path: 'M175,190 L280,185 L280,230 L275,270 L290,310 L260,340 L175,300 L160,230 Z' },
  MS: { abbr: 'MS', name: 'Mato Grosso do Sul', cx: 240, cy: 340, path: 'M175,300 L260,340 L275,380 L240,410 L185,390 L170,340 Z' },
  MG: { abbr: 'MG', name: 'Minas Gerais', cx: 365, cy: 305, path: 'M290,260 L355,240 L360,290 L420,310 L400,350 L340,380 L290,350 Z' },
  PA: { abbr: 'PA', name: 'Pará', cx: 270, cy: 115, path: 'M200,65 L280,85 L295,80 L290,130 L320,150 L355,170 L350,200 L340,240 L280,230 L280,185 L260,160 L275,130 L200,140 Z' },
  PB: { abbr: 'PB', name: 'Paraíba', cx: 445, cy: 155, path: 'M425,145 L465,140 L475,160 L440,170 Z' },
  PR: { abbr: 'PR', name: 'Paraná', cx: 280, cy: 390, path: 'M230,365 L310,360 L330,385 L310,420 L240,410 Z' },
  PE: { abbr: 'PE', name: 'Pernambuco', cx: 435, cy: 175, path: 'M395,155 L430,165 L475,160 L470,185 L445,185 L400,180 Z' },
  PI: { abbr: 'PI', name: 'Piauí', cx: 375, cy: 155, path: 'M340,110 L395,100 L395,155 L355,170 L340,150 Z' },
  RJ: { abbr: 'RJ', name: 'Rio de Janeiro', cx: 385, cy: 360, path: 'M365,345 L400,350 L415,375 L385,385 L360,370 Z' },
  RN: { abbr: 'RN', name: 'Rio Grande do Norte', cx: 445, cy: 125, path: 'M420,105 L460,100 L465,130 L430,140 Z' },
  RS: { abbr: 'RS', name: 'Rio Grande do Sul', cx: 265, cy: 455, path: 'M215,420 L295,430 L320,470 L280,500 L220,490 L200,450 Z' },
  RO: { abbr: 'RO', name: 'Rondônia', cx: 150, cy: 225, path: 'M110,195 L175,190 L175,260 L130,260 L100,240 Z' },
  RR: { abbr: 'RR', name: 'Roraima', cx: 180, cy: 55, path: 'M150,25 L215,20 L230,60 L200,90 L155,80 Z' },
  SC: { abbr: 'SC', name: 'Santa Catarina', cx: 285, cy: 430, path: 'M250,415 L315,425 L320,445 L270,455 L245,440 Z' },
  SP: { abbr: 'SP', name: 'São Paulo', cx: 315, cy: 365, path: 'M275,335 L340,340 L365,345 L360,380 L330,395 L280,385 L265,355 Z' },
  SE: { abbr: 'SE', name: 'Sergipe', cx: 460, cy: 215, path: 'M450,205 L470,200 L475,220 L455,225 Z' },
  TO: { abbr: 'TO', name: 'Tocantins', cx: 325, cy: 195, path: 'M290,130 L340,110 L340,150 L355,170 L350,200 L340,240 L300,220 L290,180 Z' },
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

  const getStateColor = (abbr: string) => {
    const data = stateData[abbr];
    if (!data || data.count === 0) return 'hsl(var(--muted))';
    
    const maxCount = Math.max(...Object.values(clientsByState), 1);
    const intensity = data.count / maxCount;
    
    // Gradient from light to dark primary
    if (intensity > 0.7) return 'hsl(var(--primary))';
    if (intensity > 0.4) return 'hsl(var(--primary) / 0.7)';
    if (intensity > 0.2) return 'hsl(var(--primary) / 0.5)';
    return 'hsl(var(--primary) / 0.3)';
  };

  const topStates = useMemo(() => {
    return Object.entries(clientsByState)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [clientsByState]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Distribuição por Estado
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          {/* Map */}
          <div className="flex-1">
            <TooltipProvider>
              <svg
                viewBox="0 0 500 520"
                className="w-full h-auto max-h-[300px]"
              >
                {Object.entries(BRAZIL_STATES).map(([abbr, state]) => {
                  const data = stateData[abbr];
                  const isHovered = hoveredState === abbr;
                  
                  return (
                    <Tooltip key={abbr}>
                      <TooltipTrigger asChild>
                        <g
                          onMouseEnter={() => setHoveredState(abbr)}
                          onMouseLeave={() => setHoveredState(null)}
                          className="cursor-pointer transition-all"
                        >
                          <path
                            d={state.path}
                            fill={getStateColor(abbr)}
                            stroke="hsl(var(--border))"
                            strokeWidth={isHovered ? 2 : 1}
                            className="transition-all duration-200"
                            style={{
                              transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                              transformOrigin: `${state.cx}px ${state.cy}px`,
                            }}
                          />
                          <text
                            x={state.cx}
                            y={state.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="text-[8px] font-medium fill-foreground pointer-events-none"
                          >
                            {abbr}
                          </text>
                        </g>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-sm">
                          <p className="font-semibold">{state.name}</p>
                          <p>{data.count} cliente{data.count !== 1 ? 's' : ''}</p>
                          <p className="text-muted-foreground">
                            {data.percentage.toFixed(1)}% do total
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </svg>
            </TooltipProvider>
          </div>

          {/* Legend */}
          <div className="w-40 space-y-3">
            <h4 className="text-sm font-medium">Top Estados</h4>
            {topStates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum cliente com estado definido
              </p>
            ) : (
              <div className="space-y-2">
                {topStates.map(([abbr, count]) => (
                  <div
                    key={abbr}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: getStateColor(abbr) }}
                      />
                      <span>{BRAZIL_STATES[abbr]?.name || abbr}</span>
                    </div>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{totalClients}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
